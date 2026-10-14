REVOKE EXECUTE ON FUNCTION public.active_obras_for_employee_request() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_material_request_by_token(text, text, jsonb, text, text, uuid) FROM anon, authenticated;

CREATE OR REPLACE VIEW public.employee_request_open_obras
WITH (security_invoker = false, security_barrier = true)
AS
SELECT o.id, o.name
FROM public.obras o
WHERE lower(coalesce(o.status, '')) NOT IN ('concluida', 'concluída', 'finalizada');

REVOKE ALL ON public.employee_request_open_obras FROM PUBLIC;
GRANT SELECT ON public.employee_request_open_obras TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_material_request_by_token(
  _token text,
  _kind text,
  _items jsonb,
  _notes text DEFAULT NULL::text
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
  _obra_id uuid;
  _obra_name text;
  _destination text;
  it jsonb;
BEGIN
  SELECT e.id, e.name INTO _emp_id, _emp_name
  FROM public.employees e
  WHERE e.token = _token AND e.active;

  IF _emp_id IS NULL THEN RAISE EXCEPTION 'Funcionário não encontrado'; END IF;
  IF _kind NOT IN ('pedido', 'devolucao') THEN RAISE EXCEPTION 'Tipo inválido'; END IF;
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Nenhum item informado'; END IF;

  IF _kind = 'pedido' THEN
    _destination := _items->0->>'destination';
    IF _destination NOT IN ('obra', 'mochila') THEN
      RAISE EXCEPTION 'Selecione uma obra ou Mochila';
    END IF;

    IF _destination = 'obra' THEN
      BEGIN
        _obra_id := (_items->0->>'obra_id')::uuid;
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
  ELSE
    _obra_name := NULL;
  END IF;

  INSERT INTO public.material_requests (employee_id, obra_id, obra_name, items, kind, status, notes)
  VALUES (_emp_id, _obra_id, _obra_name, _items, _kind, 'pendente', _notes)
  RETURNING id INTO _req_id;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    IF _kind = 'pedido' THEN
      IF (it->>'item_id') IS NOT NULL THEN
        PERFORM public.allocate_stock_to_obra(
          (it->>'item_id')::uuid,
          _obra_id,
          (it->>'quantity')::numeric,
          format('Pedido de %s — destino: %s', _emp_name, _obra_name),
          _emp_id
        );
      END IF;
    ELSE
      IF (it->>'obra_item_id') IS NOT NULL THEN
        PERFORM public.return_stock_by_employee_token(
          _token,
          (it->>'obra_item_id')::uuid,
          (it->>'quantity')::numeric
        );
      END IF;
    END IF;
  END LOOP;

  RETURN _req_id;
END;
$$;