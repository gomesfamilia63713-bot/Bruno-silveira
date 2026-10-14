
-- Free notes on obras
ALTER TABLE public.obras ADD COLUMN IF NOT EXISTS free_notes text;

-- Extras (off-stock materials bought separately for an obra)
CREATE TABLE IF NOT EXISTS public.obra_extras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obra_id uuid NOT NULL,
  name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'un',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.obra_extras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view obra_extras" ON public.obra_extras FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert obra_extras" ON public.obra_extras FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update obra_extras" ON public.obra_extras FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete obra_extras" ON public.obra_extras FOR DELETE TO authenticated USING (true);

-- Rentals (locação de ferramentas/equipamentos de terceiros)
CREATE TABLE IF NOT EXISTS public.rentals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier text NOT NULL,
  item_name text NOT NULL,
  obra_id uuid,
  start_at timestamptz NOT NULL DEFAULT now(),
  end_at timestamptz,
  daily_rate numeric,
  status text NOT NULL DEFAULT 'ativa',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rentals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view rentals" ON public.rentals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert rentals" ON public.rentals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update rentals" ON public.rentals FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete rentals" ON public.rentals FOR DELETE TO authenticated USING (true);

DROP TRIGGER IF EXISTS rentals_set_updated_at ON public.rentals;
CREATE TRIGGER rentals_set_updated_at BEFORE UPDATE ON public.rentals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Return items to stock when removed from an obra
CREATE OR REPLACE FUNCTION public.return_obra_item_to_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  obra_name text;
  qty integer;
BEGIN
  qty := GREATEST(ROUND(OLD.quantity)::int, 0);
  IF qty <= 0 THEN
    RETURN OLD;
  END IF;
  SELECT name INTO obra_name FROM public.obras WHERE id = OLD.obra_id;
  INSERT INTO public.movements (item_id, type, quantity, obra, notes, created_by)
  VALUES (OLD.item_id, 'in', qty, obra_name, 'Devolução da obra ao estoque', OLD.created_by);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_return_obra_item_to_stock ON public.obra_items;
CREATE TRIGGER trg_return_obra_item_to_stock
  BEFORE DELETE ON public.obra_items
  FOR EACH ROW EXECUTE FUNCTION public.return_obra_item_to_stock();

-- Auto-link out movements to obra when obra name matches
CREATE OR REPLACE FUNCTION public.auto_link_movement_to_obra()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  found_obra_id uuid;
  already_exists boolean;
BEGIN
  IF NEW.type <> 'out' OR NEW.obra IS NULL OR length(trim(NEW.obra)) = 0 THEN
    RETURN NEW;
  END IF;
  SELECT id INTO found_obra_id FROM public.obras
    WHERE lower(name) = lower(trim(NEW.obra))
    ORDER BY created_at DESC LIMIT 1;
  IF found_obra_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- avoid double-insert when allocation flow already created the row in the same instant
  SELECT EXISTS (
    SELECT 1 FROM public.obra_items
    WHERE obra_id = found_obra_id AND item_id = NEW.item_id
      AND created_at >= NEW.created_at - interval '2 seconds'
      AND created_at <= NEW.created_at + interval '2 seconds'
  ) INTO already_exists;
  IF already_exists THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.obra_items (obra_id, item_id, quantity, notes, created_by)
  VALUES (found_obra_id, NEW.item_id, NEW.quantity, NEW.notes, NEW.created_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_link_movement_to_obra ON public.movements;
CREATE TRIGGER trg_auto_link_movement_to_obra
  AFTER INSERT ON public.movements
  FOR EACH ROW EXECUTE FUNCTION public.auto_link_movement_to_obra();
