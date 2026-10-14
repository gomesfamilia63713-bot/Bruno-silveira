CREATE OR REPLACE FUNCTION public.create_material_request_by_token(
  _token text,
  _kind text,
  _items jsonb,
  _notes text DEFAULT NULL::text,
  _destination text DEFAULT NULL::text,
  _obra_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _emp_id uuid;
  _emp_name text;
  _req_id uuid;
  _obra_name text;
  _client_text text;
  _client_id uuid;
  _hash text;
  _requested_at timestamptz;
  it jsonb;
BEGIN
  SELECT e.id, e.name INTO _emp_id, _emp_name
  FROM public.employees e
  WHERE e.token = _token AND e.active
  LIMIT 1;

  IF _emp_id IS NULL THEN RAISE EXCEPTION 'Funcionário não encontrado'; END IF;
  IF _kind NOT IN ('pedido', 'devolucao') THEN RAISE EXCEPTION 'Tipo inválido'; END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Nenhum item informado';
  END IF;

  _client_text := NULLIF(_items->0->>'client_id', '');
  IF _client_text IS NULL THEN RAISE EXCEPTION 'Identificador do envio obrigatório'; END IF;
  BEGIN
    _client_id := _client_text::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    _hash := md5(_token || ':' || _client_text);
    _client_id := (substr(_hash,1,8) || '-' || substr(_hash,9,4) || '-' || substr(_hash,13,4) || '-' || substr(_hash,17,4) || '-' || substr(_hash,21,12))::uuid;
  END;

  SELECT mr.id INTO _req_id
  FROM public.material_requests mr
  WHERE mr.client_id = _client_id
  LIMIT 1;
  IF _req_id IS NOT NULL THEN RETURN _req_id; END IF;

  BEGIN
    _requested_at := COALESCE(NULLIF(_items->0->>'requested_at', '')::timestamptz, now());
  EXCEPTION WHEN invalid_text_representation THEN
    _requested_at := now();
  END;
  IF _requested_at > now() + interval '5 minutes' OR _requested_at < now() - interval '30 days' THEN
    _requested_at := now();
  END IF;

  IF _kind = 'pedido' THEN
    IF _destination NOT IN ('obra', 'mochila') THEN
      RAISE EXCEPTION 'Selecione uma obra ou Mochila';
    END IF;
    IF _destination = 'obra' THEN
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
  ELSE
    _obra_id := NULL;
    _obra_name := NULL;
  END IF;

  INSERT INTO public.material_requests
    (employee_id, obra_id, obra_name, items, kind, status, notes, client_id, inventory_applied, requested_at)
  VALUES
    (_emp_id, _obra_id, _obra_name, _items, _kind, 'pendente', _notes, _client_id, false, _requested_at)
  RETURNING id INTO _req_id;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    IF _kind = 'pedido' THEN
      IF NULLIF(it->>'item_id', '') IS NOT NULL THEN
        PERFORM public.allocate_stock_to_obra(
          (it->>'item_id')::uuid,
          _obra_id,
          (it->>'quantity')::numeric,
          format('Pedido de %s — destino: %s', _emp_name, _obra_name),
          _emp_id
        );
      END IF;
    ELSE
      IF NULLIF(it->>'obra_item_id', '') IS NOT NULL THEN
        PERFORM public.return_stock_by_employee_token(
          _token,
          (it->>'obra_item_id')::uuid,
          (it->>'quantity')::numeric
        );
      END IF;
    END IF;
  END LOOP;

  UPDATE public.material_requests
  SET inventory_applied = true
  WHERE id = _req_id;

  RETURN _req_id;
EXCEPTION WHEN unique_violation THEN
  SELECT mr.id INTO _req_id FROM public.material_requests mr WHERE mr.client_id = _client_id;
  RETURN _req_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_material_request_by_token(text, text, jsonb, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_material_request_by_token(text, text, jsonb, text, text, uuid) TO anon, authenticated, service_role;