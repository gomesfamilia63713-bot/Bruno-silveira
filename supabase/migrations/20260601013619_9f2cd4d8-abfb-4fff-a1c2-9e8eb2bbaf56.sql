-- Add price column to items
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS price numeric;

-- Trigger: when a price is set on an item, replicate it to other items with the same name
CREATE OR REPLACE FUNCTION public.sync_item_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.price IS NOT NULL AND (
       TG_OP = 'INSERT'
       OR NEW.price IS DISTINCT FROM OLD.price
       OR lower(trim(NEW.name)) IS DISTINCT FROM lower(trim(OLD.name))
  ) THEN
    UPDATE public.items
       SET price = NEW.price
     WHERE id <> NEW.id
       AND lower(trim(name)) = lower(trim(NEW.name))
       AND (price IS DISTINCT FROM NEW.price);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_item_price ON public.items;
CREATE TRIGGER trg_sync_item_price
AFTER INSERT OR UPDATE OF price, name ON public.items
FOR EACH ROW EXECUTE FUNCTION public.sync_item_price();