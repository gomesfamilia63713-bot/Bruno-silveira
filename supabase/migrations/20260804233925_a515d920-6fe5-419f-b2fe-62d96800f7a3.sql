CREATE OR REPLACE FUNCTION public.allocate_stock_to_obra(_item_id uuid, _obra_id uuid, _quantity numeric, _notes text DEFAULT NULL::text, _holder_employee_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  avail numeric; new_id uuid; obra_name text; item_name text;
BEGIN
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
  SELECT i.name, i.quantity INTO item_name, avail FROM public.items i WHERE i.id = _item_id FOR UPDATE;
  IF item_name IS NULL THEN RAISE EXCEPTION 'Item não encontrado'; END IF;
  SELECT o.name INTO obra_name FROM public.obras o WHERE o.id = _obra_id;
  IF obra_name IS NULL THEN RAISE EXCEPTION 'Obra não encontrada'; END IF;
  IF _quantity > avail THEN RAISE EXCEPTION 'Saldo insuficiente no estoque. Disponível: %', avail; END IF;

  UPDATE public.items SET quantity = quantity - _quantity WHERE id = _item_id;

  INSERT INTO public.obra_items (obra_id, item_id, quantity, notes, created_by, holder_employee_id)
  VALUES (_obra_id, _item_id, _quantity, _notes, auth.uid(), _holder_employee_id)
  RETURNING id INTO new_id;

  INSERT INTO public.stock_movement_log (item_id, kind, quantity, obra_id, destination, notes, actor_id)
  VALUES (_item_id, 'out', _quantity, _obra_id, obra_name, _notes, auth.uid());

  INSERT INTO public.system_logs (category, message, item_id, obra_id, quantity, actor_id)
  VALUES ('stock', format('Item "%s" alocado (%s) para obra "%s"', item_name, _quantity, obra_name),
          _item_id, _obra_id, _quantity, auth.uid());
  RETURN new_id;
END; $function$;