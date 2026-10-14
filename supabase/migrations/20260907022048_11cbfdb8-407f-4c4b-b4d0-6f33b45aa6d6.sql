-- Catálogo público de estoque (para o app do funcionário via link individual)
CREATE OR REPLACE FUNCTION public.stock_catalog_public()
RETURNS TABLE(id uuid, name text, kind text, unit text, quantity numeric, category text, codigo text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT i.id, i.name, i.kind, i.unit, i.quantity, i.category, i.codigo
  FROM public.items i
  WHERE coalesce(i.condition, '') <> 'Descarte'
  ORDER BY i.name
$$;

GRANT EXECUTE ON FUNCTION public.stock_catalog_public() TO anon, authenticated;

-- Itens sob responsabilidade do funcionário
CREATE OR REPLACE FUNCTION public.my_items_by_token(_token text)
RETURNS TABLE(obra_item_id uuid, item_id uuid, name text, unit text, quantity numeric, obra_name text, origin_label text, taken_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT oi.id, oi.item_id, i.name, i.unit, oi.quantity,
         o.name, oi.origin_label, oi.created_at
  FROM public.obra_items oi
  JOIN public.employees e ON e.id = oi.holder_employee_id
  JOIN public.items i ON i.id = oi.item_id
  LEFT JOIN public.obras o ON o.id = oi.obra_id
  WHERE e.token = _token AND e.active AND oi.quantity > 0
  ORDER BY oi.created_at DESC
$$;

GRANT EXECUTE ON FUNCTION public.my_items_by_token(text) TO anon, authenticated;

-- Registro de pedido / devolução pelo funcionário
CREATE OR REPLACE FUNCTION public.create_material_request_by_token(
  _token text,
  _kind text,
  _items jsonb,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _emp_id uuid; _emp_name text; _req_id uuid; it jsonb;
BEGIN
  SELECT e.id, e.name INTO _emp_id, _emp_name
  FROM public.employees e WHERE e.token = _token AND e.active;
  IF _emp_id IS NULL THEN RAISE EXCEPTION 'Funcionário não encontrado'; END IF;
  IF _kind NOT IN ('pedido', 'devolucao') THEN RAISE EXCEPTION 'Tipo inválido'; END IF;
  IF _items IS NULL OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Nenhum item informado'; END IF;

  INSERT INTO public.material_requests (employee_id, items, kind, status, notes)
  VALUES (_emp_id, _items, _kind, 'pendente', _notes)
  RETURNING id INTO _req_id;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    IF _kind = 'pedido' THEN
      IF (it->>'item_id') IS NOT NULL THEN
        PERFORM public.allocate_stock_to_obra(
          (it->>'item_id')::uuid,
          NULL::uuid,
          (it->>'quantity')::numeric,
          format('Pedido de %s', _emp_name),
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
END; $$;

GRANT EXECUTE ON FUNCTION public.create_material_request_by_token(text, text, jsonb, text) TO anon, authenticated;