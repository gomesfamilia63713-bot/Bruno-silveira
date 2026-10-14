CREATE TABLE public.whatsapp_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL DEFAULT '',
  target text NOT NULL,
  is_group boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_recipients TO authenticated;
GRANT ALL ON public.whatsapp_recipients TO service_role;

ALTER TABLE public.whatsapp_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage whatsapp recipients"
ON public.whatsapp_recipients FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_whatsapp_recipients_updated_at
BEFORE UPDATE ON public.whatsapp_recipients
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();