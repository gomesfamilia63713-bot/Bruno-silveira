
CREATE OR REPLACE FUNCTION public.transfer_item_between_obras(
  _item_id uuid,
  _new_obra_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  new_obra_name text;
  item_name text;
  moved_total numeric := 0;
BEGIN
  IF _item_id IS NULL THEN RAISE EXCEPTION 'Item obrigatório'; END IF;

  SELECT name INTO item_name FROM public.items WHERE id = _item_id;
  IF item_name IS NULL THEN RAISE EXCEPTION 'Item não encontrado'; END IF;

  IF _new_obra_id IS NOT NULL THEN
    SELECT name INTO new_obra_name FROM public.obras WHERE id = _new_obra_id;
    IF new_obra_name IS NULL THEN RAISE EXCEPTION 'Obra destino não encontrada'; END IF;
  END IF;

  -- para cada alocação ativa do item, devolve e (se _new_obra_id) realoca com mesmo holder
  FOR r IN
    SELECT oi.id, oi.item_id, oi.obra_id, oi.quantity, oi.holder_employee_id, oi.notes, o.name AS old_obra_name
      FROM public.obra_items oi
      JOIN public.obras o ON o.id = oi.obra_id
     WHERE oi.item_id = _item_id
       AND oi.quantity > 0
       AND o.status <> 'concluida'
     ORDER BY oi.created_at ASC
     FOR UPDATE
  LOOP
    IF _new_obra_id IS NOT NULL AND r.obra_id = _new_obra_id THEN
      CONTINUE; -- já está na obra destino
    END IF;

    -- devolve ao estoque
    UPDATE public.items SET quantity = quantity + ROUND(r.quantity)::int WHERE id = r.item_id;
    INSERT INTO public.stock_movement_log (item_id, kind, quantity, obra_id, destination, notes, actor_id)
    VALUES (r.item_id, 'in', r.quantity, r.obra_id, r.old_obra_name,
            CASE WHEN _new_obra_id IS NULL THEN 'Retorno ao estoque (edição inline)'
                 ELSE format('Transferência: saindo de %s', r.old_obra_name) END,
            auth.uid());
    INSERT INTO public.system_logs (category, message, item_id, obra_id, quantity, actor_id)
    VALUES ('stock',
            CASE WHEN _new_obra_id IS NULL
                 THEN format('Item "%s" devolvido ao estoque (edição inline) da obra "%s"', item_name, r.old_obra_name)
                 ELSE format('Item "%s" transferido de "%s" para "%s"', item_name, r.old_obra_name, new_obra_name) END,
            r.item_id, r.obra_id, r.quantity, auth.uid());

    UPDATE public.obra_items SET quantity = 0 WHERE id = r.id;
    DELETE FROM public.obra_items WHERE id = r.id;
    moved_total := moved_total + r.quantity;

    IF _new_obra_id IS NOT NULL THEN
      UPDATE public.items SET quantity = quantity - ROUND(r.quantity)::int WHERE id = r.item_id;
      INSERT INTO public.obra_items (obra_id, item_id, quantity, notes, created_by, holder_employee_id)
      VALUES (_new_obra_id, r.item_id, r.quantity,
              COALESCE(r.notes, '') || CASE WHEN r.notes IS NULL THEN '' ELSE ' | ' END || 'Transferido de ' || r.old_obra_name,
              auth.uid(), r.holder_employee_id);
      INSERT INTO public.stock_movement_log (item_id, kind, quantity, obra_id, destination, notes, actor_id)
      VALUES (r.item_id, 'out', r.quantity, _new_obra_id, new_obra_name,
              format('Transferência: entrando em %s', new_obra_name), auth.uid());
    END IF;
  END LOOP;

  IF moved_total = 0 AND _new_obra_id IS NOT NULL THEN
    RAISE EXCEPTION 'Nenhuma alocação ativa para transferir. Use "Saída" para alocar do estoque.';
  END IF;
END; $$;

GRANT EXECUTE ON FUNCTION public.transfer_item_between_obras(uuid, uuid) TO authenticated;
