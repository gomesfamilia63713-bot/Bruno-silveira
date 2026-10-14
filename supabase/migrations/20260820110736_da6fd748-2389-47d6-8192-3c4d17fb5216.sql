CREATE OR REPLACE VIEW public.items_in_use AS
SELECT oi.item_id,
       COALESCE(sum(oi.quantity), 0::numeric) AS in_use
FROM public.obra_items oi
LEFT JOIN public.obras o ON o.id = oi.obra_id
WHERE oi.quantity > 0
  AND (oi.obra_id IS NULL OR o.status IS DISTINCT FROM 'concluida')
GROUP BY oi.item_id;

CREATE OR REPLACE VIEW public.item_current_location AS
SELECT i.id AS item_id,
       (SELECT string_agg(DISTINCT COALESCE(o.name, 'Com funcionário'), ', ')
          FROM public.obra_items oi
          LEFT JOIN public.obras o ON o.id = oi.obra_id
         WHERE oi.item_id = i.id
           AND oi.quantity > 0
           AND (oi.obra_id IS NULL OR o.status IS DISTINCT FROM 'concluida')) AS allocated_obras
FROM public.items i;

GRANT SELECT ON public.items_in_use TO authenticated, anon, service_role;
GRANT SELECT ON public.item_current_location TO authenticated, anon, service_role;