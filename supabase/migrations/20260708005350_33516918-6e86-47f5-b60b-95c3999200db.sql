ALTER TABLE public.items ADD COLUMN IF NOT EXISTS code text;
CREATE INDEX IF NOT EXISTS idx_items_code ON public.items (code) WHERE code IS NOT NULL;