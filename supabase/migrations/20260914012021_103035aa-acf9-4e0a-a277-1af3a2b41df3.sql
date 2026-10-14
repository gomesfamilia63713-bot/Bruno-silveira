DROP POLICY IF EXISTS "Anon can read own uploaded punch photos" ON storage.objects;

CREATE OR REPLACE FUNCTION public.admin_return_material_request(_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  req public.material_requests%ROWTYPE;
  it jsonb;
  remaining_qty numeric;
  returned_qty numeric;
  alloc public.obra_items%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT * INTO req
  FROM public.material_requests
  WHERE id = _request_id
  FOR UPDATE;

  IF req.id IS NULL THEN RAISE EXCEPTION 'Solicitação não encontrada'; END IF;
  IF req.kind <> 'pedido' THEN RAISE EXCEPTION 'Esta solicitação não é uma retirada'; END IF;
  IF req.status = 'devolvido' THEN RETURN; END IF;
  IF req.status <> 'em_uso' OR NOT req.inventory_applied THEN
    RAISE EXCEPTION 'Solicitação ainda não está em uso';
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(req.items) LOOP
    remaining_qty := (it->>'quantity')::numeric;
    IF remaining_qty IS NULL OR remaining_qty <= 0 THEN
      RAISE EXCEPTION 'Quantidade inválida';
    END IF;

    FOR alloc IN
      SELECT oi.*
      FROM public.obra_items oi
      WHERE oi.item_id = (it->>'item_id')::uuid
        AND oi.holder_employee_id = req.employee_id
        AND oi.obra_id IS NOT DISTINCT FROM req.obra_id
      ORDER BY oi.created_at, oi.id
      FOR UPDATE
    LOOP
      EXIT WHEN remaining_qty <= 0;
      returned_qty := LEAST(remaining_qty, alloc.quantity);

      UPDATE public.items
      SET quantity = quantity + returned_qty,
          updated_at = now()
      WHERE id = alloc.item_id;

      IF returned_qty >= alloc.quantity THEN
        DELETE FROM public.obra_items WHERE id = alloc.id;
      ELSE
        UPDATE public.obra_items
        SET quantity = quantity - returned_qty
        WHERE id = alloc.id;
      END IF;

      INSERT INTO public.stock_movement_log
        (item_id, kind, quantity, obra_id, destination, notes, actor_id)
      VALUES
        (alloc.item_id, 'in', returned_qty, alloc.obra_id, 'Estoque Central',
         'Devolução administrativa da solicitação ' || req.id::text, auth.uid());

      remaining_qty := remaining_qty - returned_qty;
    END LOOP;

    IF remaining_qty > 0 THEN
      RAISE EXCEPTION 'Quantidade em posse insuficiente para concluir a devolução';
    END IF;
  END LOOP;

  UPDATE public.material_requests
  SET status = 'devolvido', returned_at = now(), updated_at = now()
  WHERE id = req.id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_return_material_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_return_material_request(uuid) TO service_role;