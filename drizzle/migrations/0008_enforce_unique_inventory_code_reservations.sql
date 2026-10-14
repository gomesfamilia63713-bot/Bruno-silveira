CREATE TABLE public.inventory_code_reservations (
  codigo text PRIMARY KEY,
  CONSTRAINT inventory_code_reservations_normalized CHECK (codigo <> '' AND codigo = lower(btrim(codigo)))
);
GRANT ALL ON public.inventory_code_reservations TO service_role;
ALTER TABLE public.inventory_code_reservations ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.inventory_code_reservations IS 'Unique reservations for item codes; legacy duplicate items are preserved but cannot create new duplicate claims.';
INSERT INTO public.inventory_code_reservations(codigo)
SELECT DISTINCT lower(btrim(codigo)) FROM public.items
WHERE nullif(btrim(codigo), '') IS NOT NULL AND condition IS DISTINCT FROM 'Descarte';
CREATE OR REPLACE FUNCTION public.reserve_inventory_item_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE normalized_code text; old_code text;
BEGIN
  IF NEW.condition = 'Descarte' THEN
    NEW.codigo := NULL;
    NEW.discarded_at := coalesce(NEW.discarded_at, now());
    RETURN NEW;
  END IF;
  NEW.codigo := nullif(btrim(NEW.codigo), '');
  normalized_code := lower(NEW.codigo);
  IF normalized_code IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    old_code := CASE WHEN OLD.condition IS DISTINCT FROM 'Descarte' THEN lower(nullif(btrim(OLD.codigo), '')) ELSE NULL END;
    IF old_code IS NOT DISTINCT FROM normalized_code THEN RETURN NEW; END IF;
  END IF;
  BEGIN
    INSERT INTO public.inventory_code_reservations(codigo) VALUES (normalized_code);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Código já em uso por outro item. Informe um código diferente.', CONSTRAINT = 'inventory_code_reservations_pkey';
  END;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.reserve_inventory_item_code() FROM PUBLIC;
CREATE TRIGGER aa_reserve_inventory_item_code BEFORE INSERT OR UPDATE OF codigo, condition ON public.items
FOR EACH ROW EXECUTE FUNCTION public.reserve_inventory_item_code();
CREATE OR REPLACE FUNCTION public.release_inventory_item_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_code text;
BEGIN
  old_code := lower(nullif(btrim(OLD.codigo), ''));
  IF old_code IS NOT NULL THEN
    DELETE FROM public.inventory_code_reservations r WHERE r.codigo = old_code
    AND NOT EXISTS (SELECT 1 FROM public.items i WHERE lower(btrim(i.codigo)) = old_code AND i.condition IS DISTINCT FROM 'Descarte');
  END IF;
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.release_inventory_item_code() FROM PUBLIC;
CREATE TRIGGER release_inventory_item_code AFTER UPDATE OF codigo, condition OR DELETE ON public.items
FOR EACH ROW EXECUTE FUNCTION public.release_inventory_item_code();