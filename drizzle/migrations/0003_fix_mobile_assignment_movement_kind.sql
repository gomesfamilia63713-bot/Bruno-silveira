CREATE OR REPLACE FUNCTION public.update_item_assignment(
  _item_id uuid,
  _new_obra_id uuid,
  _new_holder_employee_id uuid
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
  affected_count integer;
  moved_quantity numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Apenas administradores podem remanejar itens';
  END IF;
  IF _item_id IS NULL OR _new_obra_id IS NULL OR _new_holder_employee_id IS NULL THEN
    RAISE EXCEPTION 'Item, obra e responsável são obrigatórios';
  END IF;

  SELECT name INTO item_name FROM public.items WHERE id = _item_id FOR UPDATE;
  IF item_name IS NULL THEN RAISE EXCEPTION 'Item não encontrado'; END IF;

  SELECT name INTO obra_name FROM public.obras WHERE id = _new_obra_id AND status <> 'concluida';
  IF obra_name IS NULL THEN RAISE EXCEPTION 'Obra não encontrada ou concluída'; END IF;

  SELECT name INTO employee_name FROM public.employees WHERE id = _new_holder_employee_id AND active = true;
  IF employee_name IS NULL THEN RAISE EXCEPTION 'Responsável não encontrado ou inativo'; END IF;

  PERFORM id FROM public.obra_items WHERE item_id = _item_id AND quantity > 0 FOR UPDATE;
  SELECT COALESCE(sum(quantity), 0) INTO moved_quantity
    FROM public.obra_items WHERE item_id = _item_id AND quantity > 0;

  UPDATE public.obra_items
     SET obra_id = _new_obra_id,
         holder_employee_id = _new_holder_employee_id,
         notes = concat_ws(' | ', NULLIF(notes, ''), 'Remanejamento mobile')
   WHERE item_id = _item_id AND quantity > 0;

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count = 0 THEN
    RAISE EXCEPTION 'Este item não possui alocação ativa para remanejar';
  END IF;

  INSERT INTO public.stock_movement_log (item_id, kind, quantity, obra_id, destination, notes, actor_id)
  VALUES (_item_id, 'out', moved_quantity, _new_obra_id, obra_name,
          format('Remanejamento mobile para %s — responsável %s', obra_name, employee_name), auth.uid());

  INSERT INTO public.system_logs (category, message, item_id, obra_id, quantity, actor_id, metadata)
  VALUES ('stock', format('Item "%s" remanejado para "%s" — responsável "%s"', item_name, obra_name, employee_name),
          _item_id, _new_obra_id, moved_quantity, auth.uid(),
          jsonb_build_object('holder_employee_id', _new_holder_employee_id, 'source', 'mobile_inventory'));
END;
$function$;

REVOKE ALL ON FUNCTION public.update_item_assignment(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_item_assignment(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_item_assignment(uuid, uuid, uuid) TO service_role;