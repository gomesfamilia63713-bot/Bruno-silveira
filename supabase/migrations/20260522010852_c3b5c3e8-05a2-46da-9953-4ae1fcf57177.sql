
-- Add unit column to items
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'un';

-- Obras table
CREATE TABLE IF NOT EXISTS public.obras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'andamento',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.obras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view obras" ON public.obras FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert obras" ON public.obras FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update obras" ON public.obras FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete obras" ON public.obras FOR DELETE TO authenticated USING (true);

CREATE TRIGGER obras_set_updated_at BEFORE UPDATE ON public.obras
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Obra allocations
CREATE TABLE IF NOT EXISTS public.obra_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid NOT NULL REFERENCES public.obras(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS obra_items_obra_id_idx ON public.obra_items(obra_id);

ALTER TABLE public.obra_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view obra_items" ON public.obra_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert obra_items" ON public.obra_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update obra_items" ON public.obra_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete obra_items" ON public.obra_items FOR DELETE TO authenticated USING (true);
