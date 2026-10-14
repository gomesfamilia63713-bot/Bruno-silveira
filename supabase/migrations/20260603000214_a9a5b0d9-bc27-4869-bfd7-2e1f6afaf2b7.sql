-- 1) Sync price including NULL (clearing price propagates to all items with same first word)
-- 2) Add price column to obra_extras for budget
CREATE OR REPLACE FUNCTION public.sync_item_price()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  first_word text;
BEGIN
  -- Skip if nothing relevant changed
  IF TG_OP <> 'INSERT'
     AND NEW.price IS NOT DISTINCT FROM OLD.price
     AND lower(trim(NEW.name)) IS NOT DISTINCT FROM lower(trim(OLD.name)) THEN
    RETURN NEW;
  END IF;

  first_word := lower(split_part(trim(NEW.name), ' ', 1));
  IF first_word IS NULL OR first_word = '' THEN
    RETURN NEW;
  END IF;

  -- Propagate price (including NULL clear) to all items sharing first word
  UPDATE public.items
     SET price = NEW.price
   WHERE id <> NEW.id
     AND lower(split_part(trim(name), ' ', 1)) = first_word
     AND (price IS DISTINCT FROM NEW.price);

  RETURN NEW;
END;
$function$;

ALTER TABLE public.obra_extras ADD COLUMN IF NOT EXISTS price numeric;