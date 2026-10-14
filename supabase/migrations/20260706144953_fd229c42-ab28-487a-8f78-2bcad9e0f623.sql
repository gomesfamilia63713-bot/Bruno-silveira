
-- 1) Owner link + admin flag on employees
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS employees_user_id_uidx ON public.employees(user_id) WHERE user_id IS NOT NULL;

-- 2) Holder tracking on obra_items
ALTER TABLE public.obra_items ADD COLUMN IF NOT EXISTS holder_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS obra_items_holder_idx ON public.obra_items(holder_employee_id);

-- 3) Realtime for material_requests
ALTER TABLE public.material_requests REPLICA IDENTITY FULL;
DO $$ BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='material_requests';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.material_requests';
  END IF;
END $$;

-- 4) Extend allocate to accept holder
CREATE OR REPLACE FUNCTION public.allocate_stock_to_obra(_item_id uuid, _obra_id uuid, _quantity numeric, _notes text DEFAULT NULL, _holder_employee_id uuid DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
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
  INSERT INTO public.obra_items (obra_id, item_id, quantity, notes, created_by, holder_employee_id)
  VALUES (_obra_id, _item_id, _quantity, _notes, auth.uid(), _holder_employee_id)
  RETURNING id INTO new_id;
  INSERT INTO public.stock_movement_log (item_id, kind, quantity, obra_id, destination, notes, actor_id)
  VALUES (_item_id, 'out', _quantity, _obra_id, obra_name, _notes, auth.uid());
  INSERT INTO public.system_logs (category, message, item_id, obra_id, quantity, actor_id)
  VALUES ('stock', format('Item "%s" alocado (%s) para obra "%s"', item_name, _quantity, obra_name),
          _item_id, _obra_id, _quantity, auth.uid());
  RETURN new_id;
END; $$;

-- 5) Ensure current auth user has an employees row (admin's own timecard)
CREATE OR REPLACE FUNCTION public.ensure_my_employee()
 RETURNS TABLE(id uuid, token text, name text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text;
  _display text;
  _emp_id uuid; _emp_token text; _emp_name text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Sem sessão'; END IF;
  SELECT e.id, e.token, e.name INTO _emp_id, _emp_token, _emp_name
    FROM public.employees e WHERE e.user_id = _uid LIMIT 1;
  IF _emp_id IS NOT NULL THEN
    IF NOT (SELECT active FROM public.employees WHERE id = _emp_id) THEN
      UPDATE public.employees SET active = true WHERE id = _emp_id;
    END IF;
    RETURN QUERY SELECT _emp_id, _emp_token, _emp_name; RETURN;
  END IF;
  SELECT email, COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email,'@',1))
    INTO _email, _display FROM auth.users WHERE id = _uid;
  INSERT INTO public.employees (name, active, token, user_id, role, created_by)
  VALUES (COALESCE(NULLIF(_display,''), _email, 'Admin'), true, encode(gen_random_bytes(16),'hex'), _uid, 'Administrador', _uid)
  RETURNING employees.id, employees.token, employees.name INTO _emp_id, _emp_token, _emp_name;
  RETURN QUERY SELECT _emp_id, _emp_token, _emp_name;
END; $$;
GRANT EXECUTE ON FUNCTION public.ensure_my_employee() TO authenticated;

-- 6) Self-service return by employee token (public, token-authenticated)
CREATE OR REPLACE FUNCTION public.return_stock_by_employee_token(_token text, _obra_item_id uuid, _quantity numeric)
 RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _emp_id uuid; _emp_name text;
  alloc_qty numeric; alloc_item uuid; alloc_obra uuid; alloc_holder uuid;
  obra_name text; item_name text; qty_int int;
BEGIN
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
  SELECT id, name INTO _emp_id, _emp_name FROM public.employees WHERE token = _token AND active = true;
  IF _emp_id IS NULL THEN RAISE EXCEPTION 'Token inválido'; END IF;

  SELECT quantity, item_id, obra_id, holder_employee_id INTO alloc_qty, alloc_item, alloc_obra, alloc_holder
    FROM public.obra_items WHERE id = _obra_item_id FOR UPDATE;
  IF alloc_item IS NULL THEN RAISE EXCEPTION 'Alocação não encontrada'; END IF;
  IF alloc_holder IS DISTINCT FROM _emp_id THEN
    RAISE EXCEPTION 'Item não está sob sua responsabilidade';
  END IF;
  IF _quantity > alloc_qty THEN RAISE EXCEPTION 'Quantidade maior que alocado (%). ', alloc_qty; END IF;

  qty_int := GREATEST(ROUND(_quantity)::int, 0);
  SELECT name INTO obra_name FROM public.obras WHERE id = alloc_obra;
  SELECT name INTO item_name FROM public.items WHERE id = alloc_item;

  IF qty_int > 0 THEN
    UPDATE public.items SET quantity = quantity + qty_int WHERE id = alloc_item;
    INSERT INTO public.stock_movement_log (item_id, kind, quantity, obra_id, destination, notes, actor_id)
    VALUES (alloc_item, 'in', qty_int, alloc_obra, obra_name, format('Devolução self-service por %s', _emp_name), NULL);
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
END; $$;
-- executed via supabaseAdmin from a public server route; no GRANT needed for anon.
