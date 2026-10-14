
-- Enum status pedido
DO $$ BEGIN
  CREATE TYPE public.material_request_status AS ENUM ('pendente','aprovado','em_uso','devolvido','rejeitado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.material_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  obra_id uuid REFERENCES public.obras(id) ON DELETE SET NULL,
  obra_name text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{item_id, name, quantity, unit}]
  kind text NOT NULL DEFAULT 'pedido', -- 'pedido' | 'devolucao'
  status public.material_request_status NOT NULL DEFAULT 'pendente',
  notes text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid,
  returned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_requests TO authenticated;
GRANT ALL ON public.material_requests TO service_role;

ALTER TABLE public.material_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read requests" ON public.material_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write requests" ON public.material_requests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_mr_updated_at BEFORE UPDATE ON public.material_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Regra: pedidos até 11:59 (BRT) disponíveis 14h mesmo dia. A partir de 12:00 disponíveis 08h dia seguinte.
CREATE OR REPLACE FUNCTION public.compute_material_available_at()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE
  local_ts timestamp;
  local_date date;
  cutoff time := '12:00';
BEGIN
  local_ts := (NEW.requested_at AT TIME ZONE 'America/Sao_Paulo');
  local_date := local_ts::date;
  IF local_ts::time < cutoff THEN
    NEW.available_at := ((local_date + time '14:00') AT TIME ZONE 'America/Sao_Paulo');
  ELSE
    NEW.available_at := (((local_date + 1) + time '08:00') AT TIME ZONE 'America/Sao_Paulo');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_mr_available_at BEFORE INSERT ON public.material_requests
FOR EACH ROW EXECUTE FUNCTION public.compute_material_available_at();
