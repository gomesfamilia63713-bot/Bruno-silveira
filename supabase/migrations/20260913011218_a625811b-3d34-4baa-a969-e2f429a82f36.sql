CREATE UNIQUE INDEX IF NOT EXISTS time_punches_client_id_unique
ON public.time_punches (client_id)
WHERE client_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS material_requests_client_id_unique
ON public.material_requests (client_id)
WHERE client_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_material_request_by_token(
  _token text,
  _kind text,
  _items jsonb,
  _notes text DEFAULT NULL::text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _emp_id uuid;
  _req_id uuid;
  _obra_id uuid;
  _obra_name text;
  _destination text;
  _client_id uuid;
BEGIN
  SELECT e.id INTO _emp_id
  FROM public.employees e
  WHERE e.token = _token AND e.active
  LIMIT 1;

  IF _emp_id IS NULL THEN RAISE EXCEPTION 'Funcionário não encontrado'; END IF;
  IF _kind NOT IN ('pedido', 'devolucao') THEN RAISE EXCEPTION 'Tipo inválido'; END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Nenhum item informado';
  END IF;

  BEGIN
    _client_id := NULLIF(_items->0->>'client_id', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Identificador do envio inválido';
  END;
  IF _client_id IS NULL THEN RAISE EXCEPTION 'Identificador do envio obrigatório'; END IF;

  SELECT mr.id INTO _req_id
  FROM public.material_requests mr
  WHERE mr.client_id = _client_id
  LIMIT 1;
  IF _req_id IS NOT NULL THEN RETURN _req_id; END IF;

  IF _kind = 'pedido' THEN
    _destination := _items->0->>'destination';
    IF _destination NOT IN ('obra', 'mochila') THEN
      RAISE EXCEPTION 'Selecione uma obra ou Mochila';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(_items) x
      WHERE x->>'destination' IS DISTINCT FROM _destination
    ) THEN
      RAISE EXCEPTION 'Todos os itens devem ter o mesmo destino';
    END IF;

    IF _destination = 'obra' THEN
      BEGIN
        _obra_id := NULLIF(_items->0->>'obra_id', '')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Obra de destino inválida';
      END;
      IF _obra_id IS NULL THEN RAISE EXCEPTION 'Selecione a obra de destino'; END IF;
      SELECT o.name INTO _obra_name
      FROM public.obras o
      WHERE o.id = _obra_id
        AND lower(coalesce(o.status, '')) NOT IN ('concluida', 'concluída', 'finalizada');
      IF _obra_name IS NULL THEN RAISE EXCEPTION 'Obra não encontrada ou já concluída'; END IF;
    ELSE
      _obra_id := NULL;
      _obra_name := 'Mochila';
    END IF;
  END IF;

  INSERT INTO public.material_requests
    (employee_id, obra_id, obra_name, items, kind, status, notes, client_id)
  VALUES
    (_emp_id, _obra_id, _obra_name, _items, _kind, 'pendente', _notes, _client_id)
  RETURNING id INTO _req_id;

  RETURN _req_id;
EXCEPTION WHEN unique_violation THEN
  SELECT mr.id INTO _req_id FROM public.material_requests mr WHERE mr.client_id = _client_id;
  RETURN _req_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_material_request(_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  req public.material_requests%ROWTYPE;
  it jsonb;
  requested_qty numeric;
  allocation_qty numeric;
  allocation_item uuid;
  allocation_holder uuid;
  employee_token text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT * INTO req
  FROM public.material_requests
  WHERE id = _request_id
  FOR UPDATE;

  IF req.id IS NULL THEN RAISE EXCEPTION 'Solicitação não encontrada'; END IF;
  IF req.status <> 'pendente' THEN RETURN; END IF;

  IF req.kind = 'pedido' THEN
    FOR it IN SELECT * FROM jsonb_array_elements(req.items) LOOP
      requested_qty := (it->>'quantity')::numeric;
      IF requested_qty IS NULL OR requested_qty <= 0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
      PERFORM public.allocate_stock_to_obra(
        (it->>'item_id')::uuid,
        req.obra_id,
        requested_qty,
        format('Pedido aprovado — destino: %s', coalesce(req.obra_name, 'Mochila')),
        req.employee_id
      );
    END LOOP;
    UPDATE public.material_requests
    SET status = 'em_uso', approved_at = now(), approved_by = auth.uid(), updated_at = now()
    WHERE id = req.id;
  ELSE
    SELECT e.token INTO employee_token FROM public.employees e WHERE e.id = req.employee_id;
    IF employee_token IS NULL THEN RAISE EXCEPTION 'Funcionário não encontrado'; END IF;

    FOR it IN SELECT * FROM jsonb_array_elements(req.items) LOOP
      requested_qty := (it->>'quantity')::numeric;
      SELECT oi.quantity, oi.item_id, oi.holder_employee_id
      INTO allocation_qty, allocation_item, allocation_holder
      FROM public.obra_items oi
      WHERE oi.id = (it->>'obra_item_id')::uuid
      FOR UPDATE;

      IF allocation_item IS NULL THEN RAISE EXCEPTION 'Item já devolvido ou alocação inexistente'; END IF;
      IF allocation_holder IS DISTINCT FROM req.employee_id THEN
        RAISE EXCEPTION 'Item não pertence ao funcionário desta devolução';
      END IF;
      IF requested_qty IS NULL OR requested_qty <= 0 OR requested_qty > allocation_qty THEN
        RAISE EXCEPTION 'Quantidade de devolução inválida. Em posse: %', allocation_qty;
      END IF;

      PERFORM public.return_stock_by_employee_token(
        employee_token,
        (it->>'obra_item_id')::uuid,
        requested_qty
      );
    END LOOP;
    UPDATE public.material_requests
    SET status = 'devolvido', approved_at = now(), approved_by = auth.uid(), returned_at = now(), updated_at = now()
    WHERE id = req.id;
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_material_request_by_token(text, text, jsonb, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_material_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_material_request(uuid) TO service_role;