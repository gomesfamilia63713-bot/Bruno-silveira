
-- 1) system_logs (admin-only)
CREATE TABLE IF NOT EXISTS public.system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  message text NOT NULL,
  item_id uuid,
  obra_id uuid,
  quantity numeric,
  actor_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.system_logs TO authenticated;
GRANT ALL ON public.system_logs TO service_role;
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS system_logs_admin_select ON public.system_logs;
CREATE POLICY system_logs_admin_select ON public.system_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS system_logs_authenticated_insert ON public.system_logs;
CREATE POLICY system_logs_authenticated_insert ON public.system_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- 2) Lock: item can only be allocated to one obra at a time.
-- Enforced via trigger on obra_items INSERT
CREATE OR REPLACE FUNCTION public.enforce_single_obra_allocation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  other_obra text;
BEGIN
  SELECT o.name INTO other_obra
    FROM public.obra_items oi
    JOIN public.obras o ON o.id = oi.obra_id
   WHERE oi.item_id = NEW.item_id
     AND oi.obra_id <> NEW.obra_id
     AND oi.quantity > 0
     AND o.status <> 'concluida'
   LIMIT 1;
  IF other_obra IS NOT NULL THEN
    RAISE EXCEPTION 'Item já em uso na obra "%". Faça o retorno antes de nova saída.', other_obra
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_single_obra_alloc ON public.obra_items;
CREATE TRIGGER trg_single_obra_alloc
  BEFORE INSERT ON public.obra_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_obra_allocation();

-- 3) Update allocate_stock_to_obra to pre-check and log
CREATE OR REPLACE FUNCTION public.allocate_stock_to_obra(_item_id uuid, _obra_id uuid, _quantity numeric, _notes text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  avail numeric; new_id uuid; obra_name text; other_obra text; item_name text;
BEGIN
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;

  SELECT o.name INTO other_obra FROM public.obra_items oi
    JOIN public.obras o ON o.id = oi.obra_id
    WHERE oi.item_id = _item_id AND oi.obra_id <> _obra_id
      AND oi.quantity > 0 AND o.status <> 'concluida' LIMIT 1;
  IF other_obra IS NOT NULL THEN
    RAISE EXCEPTION 'Item já em uso na obra "%". Faça o retorno antes de nova saída.', other_obra;
  END IF;

  SELECT quantity, name INTO avail, item_name FROM public.items WHERE id = _item_id FOR UPDATE;
  IF avail IS NULL THEN RAISE EXCEPTION 'Item não encontrado'; END IF;
  IF _quantity > avail THEN RAISE EXCEPTION 'Saldo insuficiente. Disponível: %', avail; END IF;

  UPDATE public.items SET quantity = quantity - _quantity::int WHERE id = _item_id;
  SELECT name INTO obra_name FROM public.obras WHERE id = _obra_id;

  INSERT INTO public.obra_items (obra_id, item_id, quantity, notes, created_by)
  VALUES (_obra_id, _item_id, _quantity, _notes, auth.uid())
  RETURNING id INTO new_id;

  INSERT INTO public.stock_movement_log (item_id, kind, quantity, obra_id, destination, notes, actor_id)
  VALUES (_item_id, 'out', _quantity, _obra_id, obra_name, _notes, auth.uid());

  INSERT INTO public.system_logs (category, message, item_id, obra_id, quantity, actor_id)
  VALUES ('stock', format('Item "%s" alocado (%s) para obra "%s"', item_name, _quantity, obra_name),
          _item_id, _obra_id, _quantity, auth.uid());
  RETURN new_id;
END; $$;

-- 4) Direct movement 'out' also enforces the lock and logs system_logs
CREATE OR REPLACE FUNCTION public.enforce_movement_lock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  found_obra_id uuid; other_obra text; item_name text;
BEGIN
  IF NEW.type <> 'out' OR NEW.obra IS NULL OR length(trim(NEW.obra)) = 0 THEN
    RETURN NEW;
  END IF;
  SELECT id INTO found_obra_id FROM public.obras
    WHERE lower(name) = lower(trim(NEW.obra)) ORDER BY created_at DESC LIMIT 1;

  SELECT o.name INTO other_obra FROM public.obra_items oi
    JOIN public.obras o ON o.id = oi.obra_id
    WHERE oi.item_id = NEW.item_id
      AND (found_obra_id IS NULL OR oi.obra_id <> found_obra_id)
      AND oi.quantity > 0 AND o.status <> 'concluida' LIMIT 1;
  IF other_obra IS NOT NULL THEN
    RAISE EXCEPTION 'Item já em uso na obra "%". Faça o retorno antes de nova saída.', other_obra;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_movement_lock ON public.movements;
CREATE TRIGGER trg_movement_lock
  BEFORE INSERT ON public.movements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_movement_lock();

-- 5) Receive from obra RPC
CREATE OR REPLACE FUNCTION public.receive_stock_from_obra(_obra_id uuid, _item_id uuid, _quantity numeric DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record; remaining numeric; take numeric; obra_name text; item_name text; returned numeric := 0;
BEGIN
  SELECT name INTO obra_name FROM public.obras WHERE id = _obra_id;
  IF obra_name IS NULL THEN RAISE EXCEPTION 'Obra não encontrada'; END IF;
  SELECT name INTO item_name FROM public.items WHERE id = _item_id;
  IF item_name IS NULL THEN RAISE EXCEPTION 'Item não encontrado'; END IF;

  remaining := COALESCE(_quantity, (SELECT COALESCE(SUM(quantity),0) FROM public.obra_items WHERE obra_id=_obra_id AND item_id=_item_id));
  IF remaining <= 0 THEN RAISE EXCEPTION 'Nada a receber'; END IF;

  FOR r IN SELECT id, quantity FROM public.obra_items
           WHERE obra_id=_obra_id AND item_id=_item_id AND quantity > 0
           ORDER BY created_at ASC FOR UPDATE
  LOOP
    EXIT WHEN remaining <= 0;
    take := LEAST(remaining, r.quantity);
    IF take >= r.quantity THEN
      UPDATE public.obra_items SET quantity = 0 WHERE id = r.id;
      DELETE FROM public.obra_items WHERE id = r.id;
    ELSE
      UPDATE public.obra_items SET quantity = quantity - take WHERE id = r.id;
    END IF;
    remaining := remaining - take;
    returned := returned + take;
  END LOOP;

  IF returned > 0 THEN
    UPDATE public.items SET quantity = quantity + ROUND(returned)::int WHERE id = _item_id;
    INSERT INTO public.stock_movement_log (item_id, kind, quantity, obra_id, destination, notes, actor_id)
    VALUES (_item_id, 'in', returned, _obra_id, obra_name, 'Recebimento de obra', auth.uid());
    INSERT INTO public.system_logs (category, message, item_id, obra_id, quantity, actor_id)
    VALUES ('stock', format('Item "%s" recebido de obra "%s" (%s)', item_name, obra_name, returned),
            _item_id, _obra_id, returned, auth.uid());
  END IF;
END; $$;

-- 6) Finalize obra: return everything to stock, then set status.
CREATE OR REPLACE FUNCTION public.finalize_obra(_obra_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record; obra_name text; item_name text;
BEGIN
  SELECT name INTO obra_name FROM public.obras WHERE id = _obra_id FOR UPDATE;
  IF obra_name IS NULL THEN RAISE EXCEPTION 'Obra não encontrada'; END IF;

  FOR r IN SELECT oi.id, oi.item_id, oi.quantity, i.name AS item_name
           FROM public.obra_items oi JOIN public.items i ON i.id = oi.item_id
           WHERE oi.obra_id = _obra_id AND oi.quantity > 0
           FOR UPDATE
  LOOP
    UPDATE public.items SET quantity = quantity + ROUND(r.quantity)::int WHERE id = r.item_id;
    INSERT INTO public.stock_movement_log (item_id, kind, quantity, obra_id, destination, notes, actor_id)
    VALUES (r.item_id, 'in', r.quantity, _obra_id, obra_name, 'Encerramento de obra', auth.uid());
    INSERT INTO public.system_logs (category, message, item_id, obra_id, quantity, actor_id)
    VALUES ('stock', format('Item "%s" devolvido via Encerramento de Obra "%s"', r.item_name, obra_name),
            r.item_id, _obra_id, r.quantity, auth.uid());
    UPDATE public.obra_items SET quantity = 0 WHERE id = r.id;
    DELETE FROM public.obra_items WHERE id = r.id;
  END LOOP;

  UPDATE public.obras SET status = 'concluida', updated_at = now() WHERE id = _obra_id;
END; $$;

-- 7) Location view: expose 'current_location' via computed helper column (no schema change to items).
-- We create a view for the UI:
DROP VIEW IF EXISTS public.item_current_location;
CREATE VIEW public.item_current_location
WITH (security_invoker = true) AS
SELECT i.id AS item_id,
       COALESCE(
         (SELECT string_agg(DISTINCT o.name, ', ')
            FROM public.obra_items oi
            JOIN public.obras o ON o.id = oi.obra_id
           WHERE oi.item_id = i.id AND oi.quantity > 0 AND o.status <> 'concluida'),
         NULL
       ) AS allocated_obras
FROM public.items i;
GRANT SELECT ON public.item_current_location TO authenticated;
