ALTER TABLE public.rentals
  ADD CONSTRAINT rentals_obra_id_fkey
  FOREIGN KEY (obra_id) REFERENCES public.obras(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rentals_obra_id_idx ON public.rentals(obra_id);
CREATE INDEX IF NOT EXISTS rentals_status_idx ON public.rentals(status);
CREATE INDEX IF NOT EXISTS movements_item_id_idx ON public.movements(item_id);
CREATE INDEX IF NOT EXISTS movements_created_at_idx ON public.movements(created_at DESC);
CREATE INDEX IF NOT EXISTS obra_items_obra_id_idx ON public.obra_items(obra_id);
CREATE INDEX IF NOT EXISTS obra_items_item_id_idx ON public.obra_items(item_id);