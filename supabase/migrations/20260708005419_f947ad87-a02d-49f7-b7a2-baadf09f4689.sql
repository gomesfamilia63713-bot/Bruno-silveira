DROP INDEX IF EXISTS public.idx_items_code;
ALTER TABLE public.items DROP COLUMN IF EXISTS code;