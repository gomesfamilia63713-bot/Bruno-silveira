
-- Employees
CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view employees" ON public.employees
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert employees" ON public.employees
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update employees" ON public.employees
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete employees" ON public.employees
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Time punches
CREATE TABLE public.time_punches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('in','out')),
  punched_at timestamptz NOT NULL DEFAULT now(),
  photo_path text,
  latitude double precision,
  longitude double precision,
  cep text,
  street text,
  neighborhood text,
  city text,
  justification text,
  client_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_punches TO authenticated;
GRANT ALL ON public.time_punches TO service_role;
ALTER TABLE public.time_punches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view punches" ON public.time_punches
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage punches" ON public.time_punches
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_time_punches_employee_date ON public.time_punches(employee_id, punched_at DESC);
CREATE UNIQUE INDEX idx_time_punches_client_id ON public.time_punches(client_id) WHERE client_id IS NOT NULL;
