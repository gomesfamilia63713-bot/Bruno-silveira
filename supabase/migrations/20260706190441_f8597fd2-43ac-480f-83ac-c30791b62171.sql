CREATE OR REPLACE FUNCTION public.handle_movimentacao_estoque(
  _kind text,
  _item_id uuid,
  _obra_id uuid,
  _quantity numeric,
  _employee_id uuid DEFAULT NULL,
  _notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  alloc_id uuid;
BEGIN
  IF _kind NOT IN ('retirada','devolucao') THEN
    RAISE EXCEPTION 'kind inválido: %', _kind;
  END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade inválida';
  END IF;

  IF _kind = 'retirada' THEN
    IF _obra_id IS NULL THEN RAISE EXCEPTION 'Obra obrigatória para retirada'; END IF;
    IF _employee_id IS NULL THEN RAISE EXCEPTION 'Solicitante obrigatório para retirada'; END IF;
    new_id := public.allocate_stock_to_obra(
      _item_id := _item_id,
      _obra_id := _obra_id,
      _quantity := _quantity,
      _notes := _notes,
      _holder_employee_id := _employee_id
    );
    RETURN new_id;
  END IF;

  -- devolucao: localiza alocação ativa por item (+obra +funcionário se fornecidos)
  SELECT oi.id INTO alloc_id
    FROM public.obra_items oi
    JOIN public.obras o ON o.id = oi.obra_id
   WHERE oi.item_id = _item_id
     AND oi.quantity > 0
     AND o.status <> 'concluida'
     AND (_obra_id IS NULL OR oi.obra_id = _obra_id)
     AND (_employee_id IS NULL OR oi.holder_employee_id = _employee_id)
   ORDER BY oi.created_at ASC
   LIMIT 1;

  IF alloc_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma alocação ativa encontrada para devolver';
  END IF;

  PERFORM public.return_stock_from_obra_item(alloc_id, _quantity);
  RETURN alloc_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.handle_movimentacao_estoque(text, uuid, uuid, numeric, uuid, text) TO authenticated, service_role;