ALTER TABLE public.obra_items ADD COLUMN IF NOT EXISTS origin_label text;

-- Backfill: alocações existentes vieram do estoque (não há como reconstruir outra origem)
UPDATE public.obra_items SET origin_label = 'Estoque Central' WHERE origin_label IS NULL;

-- 1) Alocação a partir do estoque: origem = Estoque Central
CREATE OR REPLACE FUNCTION public.allocate_stock_to_obra(_item_id uuid, _obra_id uuid, _quantity numeric, _notes text DEFAULT NULL::text, _holder_employee_id uuid DEFAULT NULL::uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  avail numeric; new_id uuid; obra_name text; item_name text;
BEGIN
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
  SELECT i.name, i.quantity INTO item_name, avail FROM public.items i WHERE i.id = _item_id FOR UPDATE;
  IF item_name IS NULL THEN RAISE EXCEPTION 'Item não encontrado'; END IF;
  IF _obra_id IS NOT NULL THEN
    SELECT o.name INTO obra_name FROM public.obras o WHERE o.id = _obra_id;
    IF obra_name IS NULL THEN RAISE EXCEPTION 'Obra não encontrada'; END IF;
  ELSE
    obra_name := 'Sem obra';
  END IF;
  IF _quantity > avail THEN RAISE EXCEPTION 'Saldo insuficiente no estoque. Disponível: %', avail; END IF;

  UPDATE public.items SET quantity = quantity - _quantity WHERE id = _item_id;

  INSERT INTO public.obra_items (obra_id, item_id, quantity, notes, created_by, holder_employee_id, origin_label)
  VALUES (_obra_id, _item_id, _quantity, _notes, auth.uid(), _holder_employee_id, 'Estoque Central')
  RETURNING id INTO new_id;

  INSERT INTO public.stock_movement_log (item_id, kind, quantity, obra_id, destination, notes, actor_id)
  VALUES (_item_id, 'out', _quantity, _obra_id, obra_name, _notes, auth.uid());

  INSERT INTO public.system_logs (category, message, item_id, obra_id, quantity, actor_id)
  VALUES ('stock', format('Item "%s" alocado (%s) para "%s"', item_name, _quantity, obra_name),
          _item_id, _obra_id, _quantity, auth.uid());
  RETURN new_id;
END; $function$;

-- 2) Atribuição direta de responsável: origem = Estoque Central
CREATE OR REPLACE FUNCTION public.set_item_holder(_item_id uuid, _new_holder_employee_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; item_name text; emp_name text; avail numeric; touched int := 0; take numeric;
BEGIN
  IF _item_id IS NULL THEN RAISE EXCEPTION 'Item obrigatório'; END IF;
  SELECT i.name, i.quantity INTO item_name, avail FROM public.items i WHERE i.id = _item_id FOR UPDATE;
  IF item_name IS NULL THEN RAISE EXCEPTION 'Item não encontrado'; END IF;
  IF _new_holder_employee_id IS NOT NULL THEN
    SELECT e.name INTO emp_name FROM public.employees e WHERE e.id = _new_holder_employee_id;
    IF emp_name IS NULL THEN RAISE EXCEPTION 'Funcionário não encontrado'; END IF;
  END IF;

  FOR r IN SELECT oi.id FROM public.obra_items oi
           LEFT JOIN public.obras o ON o.id = oi.obra_id
           WHERE oi.item_id = _item_id AND oi.quantity > 0
             AND (o.status IS NULL OR o.status <> 'concluida')
           FOR UPDATE
  LOOP
    UPDATE public.obra_items SET holder_employee_id = _new_holder_employee_id WHERE id = r.id;
    touched := touched + 1;
  END LOOP;

  IF touched = 0 AND _new_holder_employee_id IS NOT NULL THEN
    IF COALESCE(avail, 0) <= 0 THEN
      RAISE EXCEPTION 'Sem saldo em estoque para atribuir responsável';
    END IF;
    take := LEAST(avail, 1);
    UPDATE public.items SET quantity = quantity - take WHERE id = _item_id;
    INSERT INTO public.obra_items (obra_id, item_id, quantity, notes, created_by, holder_employee_id, origin_label)
    VALUES (NULL, _item_id, take, 'Atribuição direta de responsável', auth.uid(), _new_holder_employee_id, 'Estoque Central');
    INSERT INTO public.stock_movement_log (item_id, kind, quantity, obra_id, destination, notes, actor_id)
    VALUES (_item_id, 'out', take, NULL, emp_name, 'Atribuição direta de responsável', auth.uid());
  END IF;

  INSERT INTO public.system_logs (category, message, item_id, quantity, actor_id)
  VALUES ('stock', format('Responsável do item "%s" alterado para "%s"', item_name, COALESCE(emp_name,'—')),
          _item_id, 0, auth.uid());
END; $function$;

-- 3) Transferência entre obras: origem = nome da obra anterior
CREATE OR REPLACE FUNCTION public.transfer_item_between_obras(_item_id uuid, _new_obra_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; new_obra_name text; item_name text; moved_total numeric := 0; avail numeric; take numeric;
BEGIN
  IF _item_id IS NULL THEN RAISE EXCEPTION 'Item obrigatório'; END IF;
  SELECT i.name, i.quantity INTO item_name, avail FROM public.items i WHERE i.id = _item_id FOR UPDATE;
  IF item_name IS NULL THEN RAISE EXCEPTION 'Item não encontrado'; END IF;
  IF _new_obra_id IS NOT NULL THEN
    SELECT o.name INTO new_obra_name FROM public.obras o WHERE o.id = _new_obra_id;
    IF new_obra_name IS NULL THEN RAISE EXCEPTION 'Obra destino não encontrada'; END IF;
  END IF;

  FOR r IN
    SELECT oi.id, oi.item_id, oi.obra_id, oi.quantity, oi.holder_employee_id, oi.notes,
           COALESCE(o.name, 'Sem obra') AS old_obra_name
      FROM public.obra_items oi LEFT JOIN public.obras o ON o.id = oi.obra_id
     WHERE oi.item_id = _item_id AND oi.quantity > 0
       AND (o.status IS NULL OR o.status <> 'concluida')
     ORDER BY oi.created_at ASC FOR UPDATE
  LOOP
    IF _new_obra_id IS NOT NULL AND r.obra_id IS NOT DISTINCT FROM _new_obra_id THEN CONTINUE; END IF;
    UPDATE public.items SET quantity = quantity + r.quantity WHERE id = r.item_id;
    INSERT INTO public.stock_movement_log (item_id, kind, quantity, obra_id, destination, notes, actor_id)
    VALUES (r.item_id, 'in', r.quantity, r.obra_id, r.old_obra_name,
            CASE WHEN _new_obra_id IS NULL THEN 'Retorno ao estoque (edição inline)'
                 ELSE format('Transferência: saindo de %s', r.old_obra_name) END, auth.uid());
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
      UPDATE public.items SET quantity = quantity - r.quantity WHERE id = r.item_id;
      INSERT INTO public.obra_items (obra_id, item_id, quantity, notes, created_by, holder_employee_id, origin_label)
      VALUES (_new_obra_id, r.item_id, r.quantity,
              COALESCE(r.notes, '') || CASE WHEN r.notes IS NULL THEN '' ELSE ' | ' END || 'Transferido de ' || r.old_obra_name,
              auth.uid(), r.holder_employee_id, r.old_obra_name);
      INSERT INTO public.stock_movement_log (item_id, kind, quantity, obra_id, destination, notes, actor_id)
      VALUES (r.item_id, 'out', r.quantity, _new_obra_id, new_obra_name,
              format('Transferência: entrando em %s', new_obra_name), auth.uid());
    END IF;
  END LOOP;

  IF moved_total = 0 AND _new_obra_id IS NOT NULL THEN
    SELECT i.quantity INTO avail FROM public.items i WHERE i.id = _item_id FOR UPDATE;
    IF COALESCE(avail, 0) <= 0 THEN
      RAISE EXCEPTION 'Sem saldo em estoque para alocar nesta obra';
    END IF;
    take := LEAST(avail, 1);
    UPDATE public.items SET quantity = quantity - take WHERE id = _item_id;
    INSERT INTO public.obra_items (obra_id, item_id, quantity, notes, created_by, origin_label)
    VALUES (_new_obra_id, _item_id, take, 'Alocação direta (edição inline)', auth.uid(), 'Estoque Central');
    INSERT INTO public.stock_movement_log (item_id, kind, quantity, obra_id, destination, notes, actor_id)
    VALUES (_item_id, 'out', take, _new_obra_id, new_obra_name, 'Alocação direta (edição inline)', auth.uid());
    INSERT INTO public.system_logs (category, message, item_id, obra_id, quantity, actor_id)
    VALUES ('stock', format('Item "%s" alocado direto do estoque para "%s"', item_name, new_obra_name),
            _item_id, _new_obra_id, take, auth.uid());
  END IF;
END; $function$;