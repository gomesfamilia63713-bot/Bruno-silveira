ALTER TABLE public.obra_items
  ADD COLUMN IF NOT EXISTS allocation_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS pause_justification text;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'obra_items_allocation_status_valid'
  ) THEN
    ALTER TABLE public.obra_items
      ADD CONSTRAINT obra_items_allocation_status_valid
      CHECK (allocation_status IN ('active', 'obra_parada'));
  END IF;
END
$do$;

CREATE OR REPLACE FUNCTION public.update_item_assignment(
  _item_id uuid,
  _new_obra_id uuid,
  _new_holder_employee_id uuid,
  _allocation_status text,
  _pause_justification text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  item_name text;
  obra_name text;
  employee_name text;
  current_obra_id uuid;
  current_obra_name text;
  affected_count integer;
  moved_quantity numeric;
  normalized_justification text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem remanejar itens';
  END IF;

  IF _item_id IS NULL THEN RAISE EXCEPTION 'Item é obrigatório'; END IF;
  IF _allocation_status NOT IN ('active', 'obra_parada') THEN RAISE EXCEPTION 'Condição da alocação inválida'; END IF;

  normalized_justification := NULLIF(btrim(COALESCE(_pause_justification, '')), '');
  IF _allocation_status = 'obra_parada' AND normalized_justification IS NULL THEN
    RAISE EXCEPTION 'A justificativa da obra parada é obrigatória';
  END IF;
  IF _allocation_status = 'active' AND (_new_obra_id IS NULL OR _new_holder_employee_id IS NULL) THEN
    RAISE EXCEPTION 'Obra e responsável são obrigatórios';
  END IF;

  SELECT name INTO item_name FROM public.items WHERE id = _item_id FOR UPDATE;
  IF item_name IS NULL THEN RAISE EXCEPTION 'Item não encontrado'; END IF;

  PERFORM id FROM public.obra_items WHERE item_id = _item_id AND quantity > 0 FOR UPDATE;
  SELECT oi.obra_id, o.name INTO current_obra_id, current_obra_name
    FROM public.obra_items oi
    LEFT JOIN public.obras o ON o.id = oi.obra_id
   WHERE oi.item_id = _item_id AND oi.quantity > 0
   ORDER BY oi.created_at DESC LIMIT 1;
  SELECT COALESCE(sum(quantity), 0) INTO moved_quantity
    FROM public.obra_items WHERE item_id = _item_id AND quantity > 0;
  IF moved_quantity <= 0 THEN RAISE EXCEPTION 'Este item não possui alocação ativa para remanejar'; END IF;

  IF _allocation_status = 'active' THEN
    SELECT name INTO obra_name FROM public.obras WHERE id = _new_obra_id AND status <> 'concluida';
    IF obra_name IS NULL THEN RAISE EXCEPTION 'Obra não encontrada ou concluída'; END IF;
    SELECT name INTO employee_name FROM public.employees WHERE id = _new_holder_employee_id AND active = true;
    IF employee_name IS NULL THEN RAISE EXCEPTION 'Responsável não encontrado ou inativo'; END IF;
    UPDATE public.obra_items
       SET obra_id = _new_obra_id, holder_employee_id = _new_holder_employee_id,
           allocation_status = 'active', pause_justification = NULL,
           notes = concat_ws(' | ', NULLIF(notes, ''), 'Remanejamento mobile')
     WHERE item_id = _item_id AND quantity > 0;
  ELSE
    obra_name := COALESCE(current_obra_name, 'Sem obra definida');
    UPDATE public.obra_items
       SET holder_employee_id = NULL, allocation_status = 'obra_parada',
           pause_justification = normalized_justification,
           notes = concat_ws(' | ', NULLIF(notes, ''), 'Obra parada: ' || normalized_justification)
     WHERE item_id = _item_id AND quantity > 0;
  END IF;

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count = 0 THEN RAISE EXCEPTION 'Este item não possui alocação ativa para remanejar'; END IF;

  INSERT INTO public.stock_movement_log (item_id, kind, quantity, obra_id, destination, notes, actor_id)
  VALUES (_item_id, 'out', moved_quantity,
    CASE WHEN _allocation_status = 'active' THEN _new_obra_id ELSE current_obra_id END,
    CASE WHEN _allocation_status = 'active' THEN obra_name ELSE 'Obra Parada / Sem expediente no local' END,
    CASE WHEN _allocation_status = 'active'
      THEN format('Remanejamento mobile para %s — responsável %s', obra_name, employee_name)
      ELSE format('Obra parada em %s — justificativa: %s', obra_name, normalized_justification) END,
    auth.uid());

  INSERT INTO public.system_logs (category, message, item_id, obra_id, quantity, actor_id, metadata)
  VALUES ('stock',
    CASE WHEN _allocation_status = 'active'
      THEN format('Item "%s" remanejado para "%s" — responsável "%s"', item_name, obra_name, employee_name)
      ELSE format('Item "%s" marcado como obra parada em "%s" — justificativa: %s', item_name, obra_name, normalized_justification) END,
    _item_id, CASE WHEN _allocation_status = 'active' THEN _new_obra_id ELSE current_obra_id END,
    moved_quantity, auth.uid(),
    jsonb_build_object('holder_employee_id', CASE WHEN _allocation_status = 'active' THEN _new_holder_employee_id ELSE NULL END,
      'allocation_status', _allocation_status,
      'pause_justification', CASE WHEN _allocation_status = 'obra_parada' THEN normalized_justification ELSE NULL END,
      'source', 'mobile_inventory'));
END;
$function$;

REVOKE ALL ON FUNCTION public.update_item_assignment(uuid, uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_item_assignment(uuid, uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_item_assignment(uuid, uuid, uuid, text, text) TO service_role;