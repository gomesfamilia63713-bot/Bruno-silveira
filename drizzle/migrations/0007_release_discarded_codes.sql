CREATE OR REPLACE FUNCTION public.clear_discarded_item_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.condition = 'Descarte' THEN
    NEW.codigo := NULL;
    NEW.discarded_at := COALESCE(NEW.discarded_at, now());
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS items_clear_discarded_code ON public.items;
CREATE TRIGGER items_clear_discarded_code BEFORE INSERT OR UPDATE ON public.items
FOR EACH ROW EXECUTE FUNCTION public.clear_discarded_item_code();
UPDATE public.items SET codigo = NULL WHERE condition = 'Descarte' AND codigo IS NOT NULL;