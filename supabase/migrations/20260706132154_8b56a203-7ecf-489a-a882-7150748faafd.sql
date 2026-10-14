
-- Stock movement log (admin-only visibility)
CREATE TABLE IF NOT EXISTS public.stock_movement_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('out','in')),
  quantity numeric NOT NULL CHECK (quantity > 0),
  obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  destination text,
  notes text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.stock_movement_log TO authenticated;
GRANT ALL ON public.stock_movement_log TO service_role;

ALTER TABLE public.stock_movement_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins can read log" ON public.stock_movement_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "authed can insert log" ON public.stock_movement_log
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_stock_log_item ON public.stock_movement_log(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_log_obra ON public.stock_movement_log(obra_id, created_at DESC);

-- Atomic allocation: decrement stock, insert obra_items, log
CREATE OR REPLACE FUNCTION public.allocate_stock_to_obra(
  _item_id uuid, _obra_id uuid, _quantity numeric, _notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  avail numeric;
  new_id uuid;
  obra_name text;
BEGIN
  IF _quantity IS NULL OR _quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade inválida';
  END IF;

  SELECT quantity INTO avail FROM public.items WHERE id = _item_id FOR UPDATE;
  IF avail IS NULL THEN RAISE EXCEPTION 'Item não encontrado'; END IF;
  IF _quantity > avail THEN
    RAISE EXCEPTION 'Saldo insuficiente. Disponível: %', avail;
  END IF;

  UPDATE public.items SET quantity = quantity - _quantity::int WHERE id = _item_id;

  SELECT name INTO obra_name FROM public.obras WHERE id = _obra_id;

  INSERT INTO public.obra_items (obra_id, item_id, quantity, notes, created_by)
  VALUES (_obra_id, _item_id, _quantity, _notes, auth.uid())
  RETURNING id INTO new_id;

  INSERT INTO public.stock_movement_log (item_id, kind, quantity, obra_id, destination, notes, actor_id)
  VALUES (_item_id, 'out', _quantity, _obra_id, obra_name, _notes, auth.uid());

  RETURN new_id;
END;
$$;

-- Atomic partial/full return from an obra allocation
CREATE OR REPLACE FUNCTION public.return_stock_from_obra_item(
  _obra_item_id uuid, _quantity numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  alloc_qty numeric;
  alloc_item uuid;
  alloc_obra uuid;
  obra_name text;
  qty_int int;
BEGIN
  IF _quantity IS NULL OR _quantity < 0 THEN
    RAISE EXCEPTION 'Quantidade inválida';
  END IF;

  SELECT quantity, item_id, obra_id INTO alloc_qty, alloc_item, alloc_obra
    FROM public.obra_items WHERE id = _obra_item_id FOR UPDATE;
  IF alloc_item IS NULL THEN RAISE EXCEPTION 'Alocação não encontrada'; END IF;
  IF _quantity > alloc_qty THEN
    RAISE EXCEPTION 'Quantidade maior que alocado (%). ', alloc_qty;
  END IF;

  qty_int := GREATEST(ROUND(_quantity)::int, 0);

  IF qty_int > 0 THEN
    UPDATE public.items SET quantity = quantity + qty_int WHERE id = alloc_item;
    SELECT name INTO obra_name FROM public.obras WHERE id = alloc_obra;
    INSERT INTO public.stock_movement_log (item_id, kind, quantity, obra_id, destination, notes, actor_id)
    VALUES (alloc_item, 'in', qty_int, alloc_obra, obra_name, 'Devolução parcial/total', auth.uid());
  END IF;

  IF _quantity >= alloc_qty THEN
    -- zero out so the existing DELETE trigger short-circuits, then delete
    UPDATE public.obra_items SET quantity = 0 WHERE id = _obra_item_id;
    DELETE FROM public.obra_items WHERE id = _obra_item_id;
  ELSE
    UPDATE public.obra_items SET quantity = alloc_qty - _quantity WHERE id = _obra_item_id;
  END IF;
END;
$$;

-- Update the existing return trigger to skip when quantity=0 (already the case) — nothing to change.

-- Em-uso aggregate per item (only from active obras)
CREATE OR REPLACE VIEW public.items_in_use AS
  SELECT oi.item_id, COALESCE(SUM(oi.quantity), 0)::numeric AS in_use
  FROM public.obra_items oi
  JOIN public.obras o ON o.id = oi.obra_id AND o.status = 'ativa'
  GROUP BY oi.item_id;

GRANT SELECT ON public.items_in_use TO authenticated, anon;
