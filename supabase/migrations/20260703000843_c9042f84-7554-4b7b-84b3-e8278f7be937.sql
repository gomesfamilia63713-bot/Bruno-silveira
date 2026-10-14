
-- 1) Cargo em funcionários
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS role_other text;

-- 2) Novas colunas em production_entries
ALTER TABLE public.production_entries
  ADD COLUMN IF NOT EXISTS specification text,
  ADD COLUMN IF NOT EXISTS total_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS effort_unit text NOT NULL DEFAULT 'dia',
  ADD COLUMN IF NOT EXISTS effort_amount numeric NOT NULL DEFAULT 1;

-- 3) Participantes do lançamento (multi-funcionário + rateio salvo)
CREATE TABLE IF NOT EXISTS public.production_entry_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.production_entries(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  role_snapshot text,
  included_in_rateio boolean NOT NULL DEFAULT true,
  valor_individual numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entry_id, employee_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.production_entry_participants TO authenticated;
GRANT ALL ON public.production_entry_participants TO service_role;
ALTER TABLE public.production_entry_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read participants" ON public.production_entry_participants
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin write participants" ON public.production_entry_participants
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS idx_pep_entry ON public.production_entry_participants(entry_id);
CREATE INDEX IF NOT EXISTS idx_pep_emp ON public.production_entry_participants(employee_id);

-- 4) Categorias com regra de rateio para ajudante (editável)
CREATE TABLE IF NOT EXISTS public.rateio_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  label text NOT NULL,
  includes_helper boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rateio_categories TO authenticated;
GRANT ALL ON public.rateio_categories TO service_role;
ALTER TABLE public.rateio_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read rateio_cats" ON public.rateio_categories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin write rateio_cats" ON public.rateio_categories
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'))
  WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_rateio_categories_updated_at
  BEFORE UPDATE ON public.rateio_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) Seed inicial
INSERT INTO public.rateio_categories (key, label, includes_helper) VALUES
  ('reboco','Reboco',false),
  ('pintura','Pintura',false),
  ('alvenaria','Alvenaria',false),
  ('escavacao','Escavação',true),
  ('aterro','Aterro',true),
  ('limpeza','Limpeza',true),
  ('carregar_entulho','Carregar Entulho',true),
  ('eletrica','Elétrica',false),
  ('hidraulica','Hidráulica',false),
  ('gesso','Gesso',false),
  ('piso','Piso/Revestimento',false),
  ('estrutura','Estrutura/Concreto',false),
  ('cobertura','Cobertura',false)
ON CONFLICT (key) DO NOTHING;

-- 6) Migrar produção existente: cria 1 participante por entry legado
INSERT INTO public.production_entry_participants (entry_id, employee_id, included_in_rateio, valor_individual)
SELECT pe.id, pe.employee_id, true, 0
FROM public.production_entries pe
WHERE pe.employee_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.production_entry_participants p WHERE p.entry_id = pe.id
  );
