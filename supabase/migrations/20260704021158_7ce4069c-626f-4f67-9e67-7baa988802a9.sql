
-- 1) Bloqueio de integridade em obras
CREATE OR REPLACE FUNCTION public.prevent_obra_delete_when_linked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_prod int;
  n_items int;
BEGIN
  SELECT COUNT(*) INTO n_prod FROM public.production_entries WHERE obra_id = OLD.id;
  SELECT COUNT(*) INTO n_items FROM public.obra_items WHERE obra_id = OLD.id;
  IF n_prod > 0 OR n_items > 0 THEN
    RAISE EXCEPTION 'Obra possui % produção(ões) e % material(is) vinculado(s). Remova-os antes de excluir a obra.', n_prod, n_items
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_obra_delete ON public.obras;
CREATE TRIGGER trg_prevent_obra_delete
BEFORE DELETE ON public.obras
FOR EACH ROW EXECUTE FUNCTION public.prevent_obra_delete_when_linked();

-- 2) RPC: soma horas trabalhadas do dia (pares in/out) para um funcionário
CREATE OR REPLACE FUNCTION public.worked_hours_for_day(_employee_id uuid, _day date)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_seconds bigint := 0;
  r record;
  open_ts timestamptz := NULL;
BEGIN
  FOR r IN
    SELECT type, punched_at
      FROM public.time_punches
     WHERE employee_id = _employee_id
       AND (punched_at AT TIME ZONE 'America/Sao_Paulo')::date = _day
     ORDER BY punched_at ASC
  LOOP
    IF r.type = 'in' THEN
      IF open_ts IS NULL THEN
        open_ts := r.punched_at;
      END IF;
    ELSIF r.type = 'out' THEN
      IF open_ts IS NOT NULL THEN
        total_seconds := total_seconds + EXTRACT(EPOCH FROM (r.punched_at - open_ts))::bigint;
        open_ts := NULL;
      END IF;
    END IF;
  END LOOP;
  RETURN ROUND((total_seconds::numeric) / 3600.0, 2);
END;
$$;

GRANT EXECUTE ON FUNCTION public.worked_hours_for_day(uuid, date) TO authenticated, service_role;
