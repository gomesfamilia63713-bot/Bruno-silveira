
CREATE TYPE public.movement_type AS ENUM ('in', 'out');

CREATE TABLE public.items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  condition TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  type public.movement_type NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  person_name TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_movements_item_id ON public.movements(item_id);
CREATE INDEX idx_movements_created_at ON public.movements(created_at DESC);

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movements ENABLE ROW LEVEL SECURITY;

-- Authenticated users (both owner and employee) can fully manage shared inventory
CREATE POLICY "Authenticated can view items" ON public.items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert items" ON public.items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update items" ON public.items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete items" ON public.items FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated can view movements" ON public.movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert movements" ON public.movements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update movements" ON public.movements FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete movements" ON public.movements FOR DELETE TO authenticated USING (true);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER items_set_updated_at
BEFORE UPDATE ON public.items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger to auto-adjust item quantity when a movement is inserted
CREATE OR REPLACE FUNCTION public.apply_movement_to_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'in' THEN
    UPDATE public.items SET quantity = quantity + NEW.quantity WHERE id = NEW.item_id;
  ELSE
    UPDATE public.items SET quantity = GREATEST(quantity - NEW.quantity, 0) WHERE id = NEW.item_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER movements_apply_stock
AFTER INSERT ON public.movements
FOR EACH ROW EXECUTE FUNCTION public.apply_movement_to_stock();
