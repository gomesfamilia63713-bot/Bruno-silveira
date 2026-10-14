ALTER TABLE public.items ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'tool';
CREATE INDEX IF NOT EXISTS idx_items_kind ON public.items(kind);