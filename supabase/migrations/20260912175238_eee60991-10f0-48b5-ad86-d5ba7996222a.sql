CREATE OR REPLACE FUNCTION public.open_obras_by_employee_token(_token text)
RETURNS TABLE(id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.name
  FROM public.obras o
  WHERE EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.token = _token AND e.active
  )
    AND lower(coalesce(o.status, '')) NOT IN ('concluida', 'concluída', 'finalizada')
  ORDER BY o.name;
$$;

REVOKE ALL ON FUNCTION public.open_obras_by_employee_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_obras_by_employee_token(text) TO anon, authenticated;