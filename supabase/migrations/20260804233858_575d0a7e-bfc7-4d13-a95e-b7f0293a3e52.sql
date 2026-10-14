DROP TRIGGER IF EXISTS trg_single_obra_alloc ON public.obra_items;
DROP TRIGGER IF EXISTS trg_movement_lock ON public.movements;

CREATE OR REPLACE FUNCTION public.allocate_stock_to_obra(_item_id uuid, _obra_id uuid, _quantity numeric, _notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  avail numeric; new_id uuid; obra_name text; item_name text;
BEGIN
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;

  SELECT quantity, name INTO avail, item_name FROM public.items WHERE id = _item_id FOR UPDATE;
  IF avail IS NULL THEN RAISE EXCEPTION 'Item não encontrado'; END IF;
  IF _quantity > avail THEN RAISE EXCEPTION 'Saldo insuficiente. Disponível: %', avail; END IF;

  UPDATE public.items SET quantity = quantity - _quantity WHERE id = _item_id;
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
END; $function$;