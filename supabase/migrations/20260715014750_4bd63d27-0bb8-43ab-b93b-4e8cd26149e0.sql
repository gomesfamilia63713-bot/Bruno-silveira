
DROP VIEW IF EXISTS public.items_in_use;
DROP VIEW IF EXISTS public.item_current_location;

ALTER TABLE public.items ALTER COLUMN quantity TYPE numeric(10,2) USING quantity::numeric;
ALTER TABLE public.items ALTER COLUMN quantity SET DEFAULT 0;
ALTER TABLE public.obra_items ALTER COLUMN quantity TYPE numeric(10,2) USING quantity::numeric;

CREATE VIEW public.items_in_use AS
SELECT oi.item_id, COALESCE(sum(oi.quantity), 0::numeric) AS in_use
  FROM public.obra_items oi
  JOIN public.obras o ON o.id = oi.obra_id AND o.status = 'ativa'
 GROUP BY oi.item_id;
GRANT SELECT ON public.items_in_use TO authenticated, anon;

CREATE VIEW public.item_current_location AS
SELECT i.id AS item_id,
  ( SELECT string_agg(DISTINCT o.name, ', ')
      FROM public.obra_items oi JOIN public.obras o ON o.id = oi.obra_id
     WHERE oi.item_id = i.id AND oi.quantity > 0 AND o.status <> 'concluida') AS allocated_obras
  FROM public.items i;
GRANT SELECT ON public.item_current_location TO authenticated, anon;

-- RPCs preservando decimais

CREATE OR REPLACE FUNCTION public.allocate_stock_to_obra(_item_id uuid, _obra_id uuid, _quantity numeric, _notes text DEFAULT NULL::text, _holder_employee_id uuid DEFAULT NULL::uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  avail numeric; new_id uuid; obra_name text; item_name text;
  r record; total_transferred numeric := 0;
BEGIN
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
  SELECT i.name INTO item_name FROM public.items i WHERE i.id = _item_id;
  IF item_name IS NULL THEN RAISE EXCEPTION 'Item não encontrado'; END IF;
  SELECT o.name INTO obra_name FROM public.obras o WHERE o.id = _obra_id;
  IF obra_name IS NULL THEN RAISE EXCEPTION 'Obra não encontrada'; END IF;

  FOR r IN
    SELECT oi.id AS alloc_id, oi.quantity AS alloc_qty, oi.obra_id AS old_obra
      FROM public.obra_items oi
      JOIN public.obras o ON o.id = oi.obra_id
     WHERE oi.item_id = _item_id AND oi.obra_id <> _obra_id AND oi.quantity > 0 AND o.status <> 'concluida'
     ORDER BY oi.created_at ASC FOR UPDATE
  LOOP
    UPDATE public.obra_items oi
       SET obra_id = _obra_id,
           holder_employee_id = COALESCE(_holder_employee_id, oi.holder_employee_id),
           notes = COALESCE(_notes, oi.notes)
     WHERE oi.id = r.alloc_id;
    INSERT INTO public.stock_movement_log (item_id, kind, quantity, obra_id, destination, notes, actor_id)
    VALUES (_item_id, 'transfer', r.alloc_qty, _obra_id, obra_name,
            format('Transferência automática (obra anterior: %s)', r.old_obra), auth.uid());
    total_transferred := total_transferred + r.alloc_qty;
    new_id := r.alloc_id;
  END LOOP;

  IF _quantity > total_transferred THEN
    DECLARE qty_from_stock numeric := _quantity - total_transferred;
    BEGIN
      SELECT i.quantity INTO avail FROM public.items i WHERE i.id = _item_id FOR UPDATE;
      IF qty_from_stock > avail THEN RAISE EXCEPTION 'Saldo insuficiente. Disponível: %', avail; END IF;
      UPDATE public.items SET quantity = quantity - qty_from_stock WHERE id = _item_id;
      INSERT INTO public.obra_items (obra_id, item_id, quantity, notes, created_by, holder_employee_id)
      VALUES (_obra_id, _item_id, qty_from_stock, _notes, auth.uid(), _holder_employee_id)
      RETURNING id INTO new_id;
      INSERT INTO public.stock_movement_log (item_id, kind, quantity, obra_id, destination, notes, actor_id)
      VALUES (_item_id, 'out', qty_from_stock, _obra_id, obra_name, _notes, auth.uid());
    END;
  END IF;

  INSERT INTO public.system_logs (category, message, item_id, obra_id, quantity, actor_id)
  VALUES ('stock', format('Item "%s" alocado/transferido (%s) para obra "%s"', item_name, _quantity, obra_name),
          _item_id, _obra_id, _quantity, auth.uid());
  RETURN new_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.return_stock_from_obra_item(_obra_item_id uuid, _quantity numeric)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE alloc_qty numeric; alloc_item uuid; alloc_obra uuid; obra_name text;
BEGIN
  IF _quantity IS NULL OR _quantity < 0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
  SELECT oi.quantity, oi.item_id, oi.obra_id INTO alloc_qty, alloc_item, alloc_obra
    FROM public.obra_items oi WHERE oi.id = _obra_item_id FOR UPDATE;
  IF alloc_item IS NULL THEN RAISE EXCEPTION 'Alocação não encontrada'; END IF;
  IF _quantity > alloc_qty THEN RAISE EXCEPTION 'Quantidade maior que alocado (%). ', alloc_qty; END IF;
  IF _quantity > 0 THEN
    UPDATE public.items SET quantity = quantity + _quantity WHERE id = alloc_item;
    SELECT o.name INTO obra_name FROM public.obras o WHERE o.id = alloc_obra;
    INSERT INTO public.stock_movement_log (item_id, kind, quantity, obra_id, destination, notes, actor_id)
    VALUES (alloc_item, 'in', _quantity, alloc_obra, obra_name, 'Devolução parcial/total', auth.uid());
  END IF;
  IF _quantity >= alloc_qty THEN
    UPDATE public.obra_items SET quantity = 0 WHERE id = _obra_item_id;
    DELETE FROM public.obra_items WHERE id = _obra_item_id;
  ELSE
    UPDATE public.obra_items SET quantity = alloc_qty - _quantity WHERE id = _obra_item_id;
  END IF;
END; $function$;

CREATE OR REPLACE FUNCTION public.receive_stock_from_obra(_obra_id uuid, _item_id uuid, _quantity numeric DEFAULT NULL::numeric)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; remaining numeric; take numeric; obra_name text; item_name text; returned numeric := 0;
BEGIN
  SELECT o.name INTO obra_name FROM public.obras o WHERE o.id = _obra_id;
  IF obra_name IS NULL THEN RAISE EXCEPTION 'Obra não encontrada'; END IF;
  SELECT i.name INTO item_name FROM public.items i WHERE i.id = _item_id;
  IF item_name IS NULL THEN RAISE EXCEPTION 'Item não encontrado'; END IF;
  remaining := COALESCE(_quantity, (SELECT COALESCE(SUM(oi.quantity),0) FROM public.obra_items oi WHERE oi.obra_id=_obra_id AND oi.item_id=_item_id));
  IF remaining <= 0 THEN RAISE EXCEPTION 'Nada a receber'; END IF;
  FOR r IN SELECT oi.id, oi.quantity FROM public.obra_items oi
           WHERE oi.obra_id=_obra_id AND oi.item_id=_item_id AND oi.quantity > 0
           ORDER BY oi.created_at ASC FOR UPDATE
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
    UPDATE public.items SET quantity = quantity + returned WHERE id = _item_id;
    INSERT INTO public.stock_movement_log (item_id, kind, quantity, obra_id, destination, notes, actor_id)
    VALUES (_item_id, 'in', returned, _obra_id, obra_name, 'Recebimento de obra', auth.uid());
    INSERT INTO public.system_logs (category, message, item_id, obra_id, quantity, actor_id)
    VALUES ('stock', format('Item "%s" recebido de obra "%s" (%s)', item_name, obra_name, returned),
            _item_id, _obra_id, returned, auth.uid());
  END IF;
END; $function$;

CREATE OR REPLACE FUNCTION public.finalize_obra(_obra_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; obra_name text;
BEGIN
  SELECT o.name INTO obra_name FROM public.obras o WHERE o.id = _obra_id FOR UPDATE;
  IF obra_name IS NULL THEN RAISE EXCEPTION 'Obra não encontrada'; END IF;
  FOR r IN SELECT oi.id, oi.item_id, oi.quantity, i.name AS item_name
           FROM public.obra_items oi JOIN public.items i ON i.id = oi.item_id
           WHERE oi.obra_id = _obra_id AND oi.quantity > 0 FOR UPDATE
  LOOP
    UPDATE public.items SET quantity = quantity + r.quantity WHERE id = r.item_id;
    INSERT INTO public.stock_movement_log (item_id, kind, quantity, obra_id, destination, notes, actor_id)
    VALUES (r.item_id, 'in', r.quantity, _obra_id, obra_name, 'Encerramento de obra', auth.uid());
    INSERT INTO public.system_logs (category, message, item_id, obra_id, quantity, actor_id)
    VALUES ('stock', format('Item "%s" devolvido via Encerramento de Obra "%s"', r.item_name, obra_name),
            r.item_id, _obra_id, r.quantity, auth.uid());
    UPDATE public.obra_items SET quantity = 0 WHERE id = r.id;
    DELETE FROM public.obra_items WHERE id = r.id;
  END LOOP;
  UPDATE public.obras SET status = 'concluida', updated_at = now() WHERE id = _obra_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.return_stock_by_employee_token(_token text, _obra_item_id uuid, _quantity numeric)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _emp_id uuid; _emp_name text;
  alloc_qty numeric; alloc_item uuid; alloc_obra uuid; alloc_holder uuid;
  obra_name text; item_name text;
BEGIN
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
  SELECT e.id, e.name INTO _emp_id, _emp_name FROM public.employees e WHERE e.token = _token AND e.active = true;
  IF _emp_id IS NULL THEN RAISE EXCEPTION 'Token inválido'; END IF;
  SELECT oi.quantity, oi.item_id, oi.obra_id, oi.holder_employee_id INTO alloc_qty, alloc_item, alloc_obra, alloc_holder
    FROM public.obra_items oi WHERE oi.id = _obra_item_id FOR UPDATE;
  IF alloc_item IS NULL THEN RAISE EXCEPTION 'Alocação não encontrada'; END IF;
  IF alloc_holder IS DISTINCT FROM _emp_id THEN RAISE EXCEPTION 'Item não está sob sua responsabilidade'; END IF;
  IF _quantity > alloc_qty THEN RAISE EXCEPTION 'Quantidade maior que alocado (%). ', alloc_qty; END IF;
  SELECT o.name INTO obra_name FROM public.obras o WHERE o.id = alloc_obra;
  SELECT i.name INTO item_name FROM public.items i WHERE i.id = alloc_item;
  IF _quantity > 0 THEN
    UPDATE public.items SET quantity = quantity + _quantity WHERE id = alloc_item;
    INSERT INTO public.stock_movement_log (item_id, kind, quantity, obra_id, destination, notes, actor_id)
    VALUES (alloc_item, 'in', _quantity, alloc_obra, obra_name, format('Devolução self-service por %s', _emp_name), NULL);
    INSERT INTO public.system_logs (category, message, item_id, obra_id, quantity, actor_id)
    VALUES ('stock', format('Item "%s" devolvido por "%s" (self-service) da obra "%s"', item_name, _emp_name, obra_name),
            alloc_item, alloc_obra, _quantity, NULL);
  END IF;
  IF _quantity >= alloc_qty THEN
    UPDATE public.obra_items SET quantity = 0 WHERE id = _obra_item_id;
    DELETE FROM public.obra_items WHERE id = _obra_item_id;
  ELSE
    UPDATE public.obra_items SET quantity = alloc_qty - _quantity WHERE id = _obra_item_id;
  END IF;
END; $function$;

CREATE OR REPLACE FUNCTION public.transfer_item_between_obras(_item_id uuid, _new_obra_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; new_obra_name text; item_name text; moved_total numeric := 0;
BEGIN
  IF _item_id IS NULL THEN RAISE EXCEPTION 'Item obrigatório'; END IF;
  SELECT i.name INTO item_name FROM public.items i WHERE i.id = _item_id;
  IF item_name IS NULL THEN RAISE EXCEPTION 'Item não encontrado'; END IF;
  IF _new_obra_id IS NOT NULL THEN
    SELECT o.name INTO new_obra_name FROM public.obras o WHERE o.id = _new_obra_id;
    IF new_obra_name IS NULL THEN RAISE EXCEPTION 'Obra destino não encontrada'; END IF;
  END IF;
  FOR r IN
    SELECT oi.id, oi.item_id, oi.obra_id, oi.quantity, oi.holder_employee_id, oi.notes, o.name AS old_obra_name
      FROM public.obra_items oi JOIN public.obras o ON o.id = oi.obra_id
     WHERE oi.item_id = _item_id AND oi.quantity > 0 AND o.status <> 'concluida'
     ORDER BY oi.created_at ASC FOR UPDATE
  LOOP
    IF _new_obra_id IS NOT NULL AND r.obra_id = _new_obra_id THEN CONTINUE; END IF;
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
END; $function$;

CREATE OR REPLACE FUNCTION public.set_item_holder(_item_id uuid, _new_holder_employee_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record; item_name text; emp_name text;
BEGIN
  IF _item_id IS NULL THEN RAISE EXCEPTION 'Item obrigatório'; END IF;
  SELECT i.name INTO item_name FROM public.items i WHERE i.id = _item_id;
  IF item_name IS NULL THEN RAISE EXCEPTION 'Item não encontrado'; END IF;
  IF _new_holder_employee_id IS NOT NULL THEN
    SELECT e.name INTO emp_name FROM public.employees e WHERE e.id = _new_holder_employee_id;
    IF emp_name IS NULL THEN RAISE EXCEPTION 'Funcionário não encontrado'; END IF;
  END IF;
  FOR r IN SELECT oi.id FROM public.obra_items oi
           JOIN public.obras o ON o.id = oi.obra_id
           WHERE oi.item_id = _item_id AND oi.quantity > 0 AND o.status <> 'concluida'
           FOR UPDATE
  LOOP
    UPDATE public.obra_items SET holder_employee_id = _new_holder_employee_id WHERE id = r.id;
  END LOOP;
  INSERT INTO public.system_logs (category, message, item_id, quantity, actor_id)
  VALUES ('stock', format('Responsável do item "%s" alterado para "%s"', item_name, COALESCE(emp_name,'—')),
          _item_id, 0, auth.uid());
END; $function$;
