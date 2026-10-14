ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS maintenance_exit_justification text,
  ADD COLUMN IF NOT EXISTS discarded_at timestamptz;

CREATE TABLE IF NOT EXISTS public.item_lifecycle_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE RESTRICT,
  item_name text NOT NULL,
  item_code text,
  event_type text NOT NULL,
  operation_started_at timestamptz,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  quantity numeric NOT NULL DEFAULT 1,
  justification text,
  obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  actor_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT item_lifecycle_event_valid CHECK (event_type IN ('maintenance_in', 'maintenance_out', 'discarded', 'obra_transfer')),
  CONSTRAINT item_lifecycle_quantity_positive CHECK (quantity > 0)
);
GRANT SELECT, INSERT ON public.item_lifecycle_history TO authenticated;
GRANT ALL ON public.item_lifecycle_history TO service_role;
ALTER TABLE public.item_lifecycle_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read item lifecycle history"
ON public.item_lifecycle_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert item lifecycle history"
ON public.item_lifecycle_history FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS item_lifecycle_history_item_idx
  ON public.item_lifecycle_history(item_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS item_lifecycle_history_event_idx
  ON public.item_lifecycle_history(event_type, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.enforce_item_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_started_at timestamptz;
BEGIN
  IF coalesce(OLD.condition, '') <> 'Manutenção' AND NEW.condition = 'Manutenção' THEN
    INSERT INTO public.item_lifecycle_history (
      item_id, item_name, item_code, event_type, quantity, justification, actor_id
    ) VALUES (
      NEW.id, NEW.name, NEW.codigo, 'maintenance_in', greatest(NEW.quantity, 1), NEW.notes, auth.uid()
    );
  END IF;

  IF OLD.condition = 'Manutenção' AND coalesce(NEW.condition, '') <> 'Manutenção' THEN
    IF nullif(btrim(NEW.maintenance_exit_justification), '') IS NULL THEN
      RAISE EXCEPTION 'Informe a justificativa do conserto antes de retirar o item da manutenção.';
    END IF;
    INSERT INTO public.item_lifecycle_history (
      item_id, item_name, item_code, event_type, quantity, justification, actor_id
    ) VALUES (
      NEW.id, NEW.name, NEW.codigo, 'maintenance_out', greatest(NEW.quantity, 1), NEW.maintenance_exit_justification, auth.uid()
    );
  END IF;

  IF coalesce(OLD.condition, '') <> 'Descarte' AND NEW.condition = 'Descarte' THEN
    SELECT min(created_at) INTO v_started_at
    FROM public.stock_movement_log
    WHERE item_id = NEW.id AND obra_id IS NOT NULL;

    NEW.discarded_at := now();
    INSERT INTO public.item_lifecycle_history (
      item_id, item_name, item_code, event_type, operation_started_at,
      occurred_at, quantity, justification, obra_id, actor_id
    ) VALUES (
      NEW.id, NEW.name, NEW.codigo, 'discarded', v_started_at,
      NEW.discarded_at, greatest(NEW.quantity, 1), NEW.notes, NULL, auth.uid()
    );
    NEW.codigo := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS items_enforce_lifecycle ON public.items;
CREATE TRIGGER items_enforce_lifecycle
BEFORE UPDATE OF condition ON public.items
FOR EACH ROW EXECUTE FUNCTION public.enforce_item_lifecycle();

CREATE OR REPLACE FUNCTION public.transfer_obra_resources(
  _source_obra_id uuid,
  _target_obra_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_count integer := 0;
  v_target_name text := 'Estoque Central';
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem transferir recursos de uma obra.';
  END IF;
  IF _target_obra_id = _source_obra_id THEN
    RAISE EXCEPTION 'Selecione uma obra de destino diferente.';
  END IF;
  IF _target_obra_id IS NOT NULL THEN
    SELECT name INTO v_target_name FROM public.obras
    WHERE id = _target_obra_id AND lower(status) NOT IN ('concluida', 'concluída');
    IF v_target_name IS NULL THEN RAISE EXCEPTION 'Obra de destino inválida ou concluída.'; END IF;
  END IF;

  FOR v_row IN
    SELECT oi.id, oi.item_id, oi.quantity, oi.holder_employee_id,
           i.name, i.codigo,
           (SELECT min(sml.created_at) FROM public.stock_movement_log sml
            WHERE sml.item_id = oi.item_id AND sml.obra_id = _source_obra_id) AS operation_started_at
    FROM public.obra_items oi
    JOIN public.items i ON i.id = oi.item_id
    WHERE oi.obra_id = _source_obra_id AND oi.quantity > 0
    FOR UPDATE OF oi
  LOOP
    IF _target_obra_id IS NULL THEN
      PERFORM public.receive_stock_from_obra(_source_obra_id, v_row.item_id, v_row.quantity);
    ELSE
      UPDATE public.obra_items
      SET obra_id = _target_obra_id,
          notes = concat_ws(' · ', nullif(notes, ''), 'Transferência integral entre obras'),
          allocation_status = 'active',
          pause_justification = NULL
      WHERE id = v_row.id;

      INSERT INTO public.stock_movement_log(item_id, kind, quantity, obra_id, destination, notes, actor_id)
      VALUES (v_row.item_id, 'out', v_row.quantity, _target_obra_id, v_target_name,
              'Transferência da obra de origem para ' || v_target_name, auth.uid());
    END IF;

    INSERT INTO public.item_lifecycle_history(
      item_id, item_name, item_code, event_type, operation_started_at,
      quantity, justification, obra_id, actor_id, metadata
    ) VALUES (
      v_row.item_id, v_row.name, v_row.codigo, 'obra_transfer', v_row.operation_started_at,
      v_row.quantity, 'Transferência integral de recursos', _target_obra_id, auth.uid(),
      jsonb_build_object('source_obra_id', _source_obra_id, 'target_obra_id', _target_obra_id)
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.transfer_obra_resources(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_obra_resources(uuid, uuid) TO authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'items'
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.items; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'obra_items'
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.obra_items; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'item_lifecycle_history'
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.item_lifecycle_history; END IF;
END $$;