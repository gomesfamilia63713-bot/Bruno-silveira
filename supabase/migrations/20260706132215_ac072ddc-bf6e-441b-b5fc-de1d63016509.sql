
DROP VIEW IF EXISTS public.items_in_use;
CREATE VIEW public.items_in_use
WITH (security_invoker = on) AS
  SELECT oi.item_id, COALESCE(SUM(oi.quantity), 0)::numeric AS in_use
  FROM public.obra_items oi
  JOIN public.obras o ON o.id = oi.obra_id AND o.status = 'ativa'
  GROUP BY oi.item_id;

GRANT SELECT ON public.items_in_use TO authenticated;

REVOKE EXECUTE ON FUNCTION public.allocate_stock_to_obra(uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_stock_to_obra(uuid, uuid, numeric, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.return_stock_from_obra_item(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.return_stock_from_obra_item(uuid, numeric) TO authenticated;
