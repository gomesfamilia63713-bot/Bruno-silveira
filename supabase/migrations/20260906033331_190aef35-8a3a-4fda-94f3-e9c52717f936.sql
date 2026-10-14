
CREATE UNIQUE INDEX IF NOT EXISTS time_punches_client_id_uidx ON public.time_punches (client_id) WHERE client_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.employee_by_token(_token text)
RETURNS TABLE(id uuid, name text, active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.name, e.active FROM public.employees e WHERE e.token = _token LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.register_punch_by_token(
  _token text,
  _type text,
  _punched_at timestamptz,
  _photo_path text DEFAULT NULL,
  _latitude double precision DEFAULT NULL,
  _longitude double precision DEFAULT NULL,
  _cep text DEFAULT NULL,
  _street text DEFAULT NULL,
  _neighborhood text DEFAULT NULL,
  _city text DEFAULT NULL,
  _justification text DEFAULT NULL,
  _client_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _emp uuid;
  _id uuid;
BEGIN
  SELECT e.id INTO _emp FROM public.employees e WHERE e.token = _token AND e.active LIMIT 1;
  IF _emp IS NULL THEN
    RAISE EXCEPTION 'Link inválido ou funcionário inativo';
  END IF;

  IF _client_id IS NOT NULL THEN
    SELECT tp.id INTO _id FROM public.time_punches tp WHERE tp.client_id = _client_id LIMIT 1;
    IF _id IS NOT NULL THEN
      RETURN _id;
    END IF;
  END IF;

  INSERT INTO public.time_punches (
    employee_id, type, punched_at, photo_path, latitude, longitude,
    cep, street, neighborhood, city, justification, client_id
  ) VALUES (
    _emp, _type, COALESCE(_punched_at, now()), _photo_path, _latitude, _longitude,
    _cep, _street, _neighborhood, _city, _justification, _client_id
  ) RETURNING id INTO _id;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.employee_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_punch_by_token(text, text, timestamptz, text, double precision, double precision, text, text, text, text, text, text) TO anon, authenticated;
