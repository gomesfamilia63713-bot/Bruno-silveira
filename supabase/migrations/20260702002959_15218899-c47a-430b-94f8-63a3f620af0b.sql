CREATE TABLE public.production_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  category text NOT NULL,
  unit text NOT NULL DEFAULT 'm2',
  quantity numeric NOT NULL CHECK (quantity >= 0),
  entry_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_entries TO authenticated;
GRANT ALL ON public.production_entries TO service_role;

ALTER TABLE public.production_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read production" ON public.production_entries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin insert production" ON public.production_entries
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update production" ON public.production_entries
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete production" ON public.production_entries
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_production_entries_updated_at
  BEFORE UPDATE ON public.production_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_production_entries_date ON public.production_entries(entry_date DESC);
CREATE INDEX idx_production_entries_category ON public.production_entries(category);
CREATE INDEX idx_production_entries_obra ON public.production_entries(obra_id);
CREATE INDEX idx_production_entries_employee ON public.production_entries(employee_id);