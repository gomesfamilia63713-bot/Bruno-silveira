
CREATE OR REPLACE FUNCTION public.employee_journey_summary(_employee_id uuid, _from date, _to date)
RETURNS TABLE(day date, worked_hours numeric, regular_hours numeric, extra_hours numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d date;
  hrs numeric;
BEGIN
  IF _from IS NULL OR _to IS NULL THEN
    RAISE EXCEPTION 'Período inválido';
  END IF;
  FOR d IN SELECT generate_series(_from, _to, interval '1 day')::date LOOP
    SELECT public.worked_hours_for_day(_employee_id, d) INTO hrs;
    hrs := COALESCE(hrs, 0);
    IF hrs > 0 THEN
      day := d;
      worked_hours := hrs;
      regular_hours := LEAST(hrs, 8);
      extra_hours := GREATEST(hrs - 8, 0);
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.employee_journey_summary(uuid, date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.employee_journey_by_token(_token text, _from date, _to date)
RETURNS TABLE(day date, worked_hours numeric, regular_hours numeric, extra_hours numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _emp_id uuid;
BEGIN
  SELECT id INTO _emp_id FROM public.employees WHERE token = _token AND active = true;
  IF _emp_id IS NULL THEN RAISE EXCEPTION 'Token inválido'; END IF;
  RETURN QUERY SELECT * FROM public.employee_journey_summary(_emp_id, _from, _to);
END;
$$;

GRANT EXECUTE ON FUNCTION public.employee_journey_by_token(text, date, date) TO anon, authenticated, service_role;

-- Enable realtime on time_punches for reactive UI updates
ALTER TABLE public.time_punches REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.time_punches;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
