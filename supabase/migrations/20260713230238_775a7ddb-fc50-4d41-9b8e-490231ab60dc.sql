CREATE OR REPLACE FUNCTION public.ensure_my_employee()
RETURNS TABLE(id uuid, token text, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    IF NOT (SELECT e2.active FROM public.employees e2 WHERE e2.id = _emp_id) THEN
      UPDATE public.employees SET active = true WHERE public.employees.id = _emp_id;
    END IF;
    RETURN QUERY SELECT _emp_id, _emp_token, _emp_name; RETURN;
  END IF;
  SELECT u.email, COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email,'@',1))
    INTO _email, _display FROM auth.users u WHERE u.id = _uid;
  INSERT INTO public.employees (name, active, token, user_id, role, created_by)
  VALUES (COALESCE(NULLIF(_display,''), _email, 'Admin'), true, encode(gen_random_bytes(16),'hex'), _uid, 'Administrador', _uid)
  RETURNING public.employees.id, public.employees.token, public.employees.name INTO _emp_id, _emp_token, _emp_name;
  RETURN QUERY SELECT _emp_id, _emp_token, _emp_name;
END; $function$;