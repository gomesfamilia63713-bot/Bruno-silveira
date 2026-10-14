ALTER TABLE public.time_punches
  ADD COLUMN IF NOT EXISTS justification_audio_path text,
  ADD COLUMN IF NOT EXISTS justification_audio_transcript text,
  ADD COLUMN IF NOT EXISTS justification_audio_duration_s integer;

DROP POLICY IF EXISTS "Admins can read punch audio" ON storage.objects;
CREATE POLICY "Admins can read punch audio"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'time-punch-audio'
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE OR REPLACE FUNCTION public.register_punch_by_token(
  _token text,
  _type text,
  _punched_at timestamp with time zone,
  _photo_path text DEFAULT NULL::text,
  _latitude double precision DEFAULT NULL::double precision,
  _longitude double precision DEFAULT NULL::double precision,
  _cep text DEFAULT NULL::text,
  _street text DEFAULT NULL::text,
  _neighborhood text DEFAULT NULL::text,
  _city text DEFAULT NULL::text,
  _justification text DEFAULT NULL::text,
  _client_id text DEFAULT NULL::text,
  _justification_audio_path text DEFAULT NULL::text,
  _justification_audio_transcript text DEFAULT NULL::text,
  _justification_audio_duration_s integer DEFAULT NULL::integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _emp uuid;
  _id uuid;
BEGIN
  SELECT e.id INTO _emp
  FROM public.employees e
  WHERE e.token = _token AND e.active
  LIMIT 1;

  IF _emp IS NULL THEN
    RAISE EXCEPTION 'Link inválido ou funcionário inativo';
  END IF;
  IF _type NOT IN ('in', 'out') THEN
    RAISE EXCEPTION 'Tipo de ponto inválido';
  END IF;
  IF _justification_audio_duration_s IS NOT NULL
     AND (_justification_audio_duration_s < 0 OR _justification_audio_duration_s > 900) THEN
    RAISE EXCEPTION 'Duração do áudio inválida';
  END IF;
  IF _justification_audio_path IS NOT NULL
     AND _justification_audio_path <> (_token || '/' || _client_id || '.wav') THEN
    RAISE EXCEPTION 'Caminho de áudio inválido';
  END IF;
  IF _justification_audio_path IS NOT NULL
     AND NULLIF(trim(COALESCE(_justification_audio_transcript, _justification)), '') IS NULL THEN
    RAISE EXCEPTION 'Justificativa obrigatória para registro com áudio';
  END IF;

  IF _client_id IS NOT NULL THEN
    SELECT tp.id INTO _id
    FROM public.time_punches tp
    WHERE tp.client_id = _client_id
    LIMIT 1;
    IF _id IS NOT NULL THEN
      RETURN _id;
    END IF;
  END IF;

  INSERT INTO public.time_punches (
    employee_id, type, punched_at, photo_path, latitude, longitude,
    cep, street, neighborhood, city, justification, client_id,
    justification_audio_path, justification_audio_transcript,
    justification_audio_duration_s
  ) VALUES (
    _emp, _type, COALESCE(_punched_at, now()), _photo_path, _latitude, _longitude,
    _cep, _street, _neighborhood, _city,
    NULLIF(trim(COALESCE(_justification, _justification_audio_transcript)), ''), _client_id,
    _justification_audio_path, NULLIF(trim(_justification_audio_transcript), ''),
    _justification_audio_duration_s
  ) RETURNING id INTO _id;

  RETURN _id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.register_punch_by_token(text, text, timestamptz, text, double precision, double precision, text, text, text, text, text, text, text, text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_punch_by_token(text, text, timestamptz, text, double precision, double precision, text, text, text, text, text, text, text, text, integer) TO service_role;