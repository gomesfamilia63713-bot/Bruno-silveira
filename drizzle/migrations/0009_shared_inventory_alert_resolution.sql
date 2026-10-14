ALTER TABLE public.items ADD COLUMN IF NOT EXISTS alert_resolved_at timestamptz;
CREATE OR REPLACE FUNCTION public.mark_item_alert_handled() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN
IF NEW.condition IS DISTINCT FROM OLD.condition AND NEW.condition = 'Manutenção' THEN NEW.alert_resolved_at := NULL;
ELSIF (to_jsonb(NEW) - 'updated_at' - 'alert_resolved_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at' - 'alert_resolved_at') THEN NEW.alert_resolved_at := now(); END IF;
RETURN NEW; END $$;
CREATE TRIGGER mark_item_alert_handled BEFORE UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION public.mark_item_alert_handled();
CREATE OR REPLACE FUNCTION public.mark_allocation_alert_handled() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN
IF NEW.obra_id IS DISTINCT FROM OLD.obra_id OR NEW.holder_employee_id IS DISTINCT FROM OLD.holder_employee_id OR NEW.allocation_status IS DISTINCT FROM OLD.allocation_status OR NEW.pause_justification IS DISTINCT FROM OLD.pause_justification OR NEW.notes IS DISTINCT FROM OLD.notes OR NEW.quantity IS DISTINCT FROM OLD.quantity THEN
UPDATE public.items SET alert_resolved_at = now() WHERE id = NEW.item_id;
END IF; RETURN NEW; END $$;
CREATE TRIGGER mark_allocation_alert_handled AFTER UPDATE ON public.obra_items FOR EACH ROW EXECUTE FUNCTION public.mark_allocation_alert_handled();
CREATE OR REPLACE FUNCTION public.confirm_inventory_inspection(_item_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE item_name text; BEGIN
IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'Apenas administradores podem confirmar itens'; END IF;
UPDATE public.items SET alert_resolved_at = now() WHERE id = _item_id RETURNING name INTO item_name;
IF NOT FOUND THEN RAISE EXCEPTION 'Item não encontrado'; END IF;
INSERT INTO public.system_logs(category, message, item_id, actor_id, metadata) VALUES ('stock', format('Vistoria confirmada: "%s"', item_name), _item_id, auth.uid(), jsonb_build_object('source', 'mobile_inventory', 'action', 'inspection'));
END $$;
REVOKE ALL ON FUNCTION public.confirm_inventory_inspection(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_inventory_inspection(uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.stock_catalog_with_details() RETURNS TABLE(id uuid, name text, kind text, unit text, quantity numeric, category text, codigo text, caracteristicas text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT i.id, i.name, i.kind, i.unit, i.quantity, i.category, i.codigo, i.caracteristicas FROM public.items i WHERE coalesce(i.condition, '') <> 'Descarte' ORDER BY i.name $$;
GRANT EXECUTE ON FUNCTION public.stock_catalog_with_details() TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.my_items_with_details_by_token(_token text) RETURNS TABLE(obra_item_id uuid, item_id uuid, name text, unit text, quantity numeric, obra_name text, origin_label text, taken_at timestamptz, caracteristicas text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT oi.id, oi.item_id, i.name, i.unit, oi.quantity, o.name, oi.origin_label, oi.created_at, i.caracteristicas FROM public.obra_items oi JOIN public.employees e ON e.id = oi.holder_employee_id JOIN public.items i ON i.id = oi.item_id LEFT JOIN public.obras o ON o.id = oi.obra_id WHERE e.token = _token AND e.active AND oi.quantity > 0 ORDER BY oi.created_at DESC $$;
GRANT EXECUTE ON FUNCTION public.my_items_with_details_by_token(text) TO anon, authenticated, service_role;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['employees','obras','stock_movement_log','movements'] LOOP IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t); END IF; END LOOP; END $$;