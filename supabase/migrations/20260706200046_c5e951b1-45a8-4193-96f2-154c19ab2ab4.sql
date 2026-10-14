ALTER TABLE public.items ADD COLUMN IF NOT EXISTS codigo text, ADD COLUMN IF NOT EXISTS caracteristicas text;
CREATE INDEX IF NOT EXISTS items_codigo_idx ON public.items (lower(codigo));