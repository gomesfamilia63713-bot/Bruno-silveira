
-- 1) Estoque: transferência automática. Sem bloqueio.
CREATE OR REPLACE FUNCTION public.allocate_stock_to_obra(
  _item_id uuid, _obra_id uuid, _quantity numeric,
  _notes text DEFAULT NULL::text, _holder_employee_id uuid DEFAULT NULL::uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  avail numeric; new_id uuid; obra_name text; item_name text;
  r record; total_transferred numeric := 0;
BEGIN
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
  SELECT items.name INTO item_name FROM public.items WHERE items.id = _item_id;
  IF item_name IS NULL THEN RAISE EXCEPTION 'Item não encontrado'; END IF;
  SELECT obras.name INTO obra_name FROM public.obras WHERE obras.id = _obra_id;
  IF obra_name IS NULL THEN RAISE EXCEPTION 'Obra não encontrada'; END IF;

  -- TRANSFERÊNCIA: se existe alocação ativa em outra obra, apenas movemos.
  FOR r IN
    SELECT oi.id AS alloc_id, oi.quantity AS alloc_qty, oi.obra_id AS old_obra
      FROM public.obra_items oi
      JOIN public.obras o ON o.id = oi.obra_id
     WHERE oi.item_id = _item_id
       AND oi.obra_id <> _obra_id
       AND oi.quantity > 0
       AND o.status <> 'concluida'
     ORDER BY oi.created_at ASC
     FOR UPDATE
  LOOP
    UPDATE public.obra_items
       SET obra_id = _obra_id,
           holder_employee_id = COALESCE(_holder_employee_id, obra_items.holder_employee_id),
           notes = COALESCE(_notes, obra_items.notes)
     WHERE id = r.alloc_id;
    INSERT INTO public.stock_movement_log (item_id, kind, quantity, obra_id, destination, notes, actor_id)
    VALUES (_item_id, 'transfer', r.alloc_qty, _obra_id, obra_name,
            format('Transferência automática (obra anterior: %s)', r.old_obra), auth.uid());
    total_transferred := total_transferred + r.alloc_qty;
    new_id := r.alloc_id;
  END LOOP;

  -- Se ainda restam quantidades a alocar do estoque livre:
  IF _quantity > total_transferred THEN
    DECLARE qty_from_stock numeric := _quantity - total_transferred;
    BEGIN
      SELECT items.quantity INTO avail FROM public.items WHERE items.id = _item_id FOR UPDATE;
      IF qty_from_stock > avail THEN
        RAISE EXCEPTION 'Saldo insuficiente. Disponível: %', avail;
      END IF;
      UPDATE public.items SET quantity = quantity - qty_from_stock::int WHERE id = _item_id;
      INSERT INTO public.obra_items (obra_id, item_id, quantity, notes, created_by, holder_employee_id)
      VALUES (_obra_id, _item_id, qty_from_stock, _notes, auth.uid(), _holder_employee_id)
      RETURNING id INTO new_id;
      INSERT INTO public.stock_movement_log (item_id, kind, quantity, obra_id, destination, notes, actor_id)
      VALUES (_item_id, 'out', qty_from_stock, _obra_id, obra_name, _notes, auth.uid());
    END;
  END IF;

  INSERT INTO public.system_logs (category, message, item_id, obra_id, quantity, actor_id)
  VALUES ('stock', format('Item "%s" alocado/transferido (%s) para obra "%s"', item_name, _quantity, obra_name),
          _item_id, _obra_id, _quantity, auth.uid());
  RETURN new_id;
END; $function$;

-- 2) Produção: campos de horário e HR share por participante
ALTER TABLE public.production_entries
  ADD COLUMN IF NOT EXISTS hora_inicio time,
  ADD COLUMN IF NOT EXISTS hora_fim time;

ALTER TABLE public.production_entry_participants
  ADD COLUMN IF NOT EXISTS quantity_share numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hours_share numeric NOT NULL DEFAULT 0;
