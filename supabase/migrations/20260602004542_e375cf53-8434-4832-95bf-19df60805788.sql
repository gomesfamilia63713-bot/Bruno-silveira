-- Add location column to items
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT 'estoque';

CREATE INDEX IF NOT EXISTS idx_items_location ON public.items(location);

-- Update price sync trigger to match by FIRST WORD of the name (case-insensitive)
CREATE OR REPLACE FUNCTION public.sync_item_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  first_word text;
BEGIN
  IF NEW.price IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP <> 'INSERT'
     AND NEW.price IS NOT DISTINCT FROM OLD.price
     AND lower(trim(NEW.name)) IS NOT DISTINCT FROM lower(trim(OLD.name)) THEN
    RETURN NEW;
  END IF;

  first_word := lower(split_part(trim(NEW.name), ' ', 1));
  IF first_word IS NULL OR first_word = '' THEN
    RETURN NEW;
  END IF;

  UPDATE public.items
     SET price = NEW.price
   WHERE id <> NEW.id
     AND lower(split_part(trim(name), ' ', 1)) = first_word
     AND (price IS DISTINCT FROM NEW.price);

  RETURN NEW;
END;
$function$;

-- Ensure trigger is wired (idempotent)
DROP TRIGGER IF EXISTS trg_sync_item_price ON public.items;
CREATE TRIGGER trg_sync_item_price
AFTER INSERT OR UPDATE OF price, name ON public.items
FOR EACH ROW EXECUTE FUNCTION public.sync_item_price();
