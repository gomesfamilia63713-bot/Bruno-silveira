ALTER TABLE public.items ADD COLUMN epi_ca text, ADD COLUMN epi_expires_at date, ADD COLUMN epi_received_at date;
CREATE TABLE public.epi_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_id uuid NOT NULL REFERENCES public.items(id), event_type text NOT NULL CHECK (event_type IN ('delivery','discard')), employee_id uuid, employee_name text, quantity numeric NOT NULL CHECK(quantity > 0), occurred_at timestamptz NOT NULL, received_at date NOT NULL, item_name text NOT NULL, item_code text, caracteristicas text, ca text, notes text, actor_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.epi_events TO authenticated;
GRANT ALL ON public.epi_events TO service_role;
ALTER TABLE public.epi_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed in read epi events" ON public.epi_events FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE INDEX epi_events_item_date ON public.epi_events(item_id, occurred_at DESC);
CREATE OR REPLACE FUNCTION public.record_epi_event(_event_id uuid, _item_id uuid, _event_type text, _quantity numeric, _occurred_at timestamptz, _employee_id uuid DEFAULT NULL, _notes text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item public.items%ROWTYPE; v_employee text; v_qty numeric; v_existing public.epi_events%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Apenas administradores podem movimentar EPIs.'; END IF;
 IF _event_id IS NULL OR _occurred_at IS NULL OR _occurred_at > now() + interval '5 minutes' THEN RAISE EXCEPTION 'Informe uma data válida.'; END IF;
 SELECT * INTO v_item FROM public.items WHERE id = _item_id FOR UPDATE;
 IF NOT FOUND OR v_item.kind <> 'epi' THEN RAISE EXCEPTION 'EPI não encontrado.'; END IF;
 SELECT * INTO v_existing FROM public.epi_events WHERE id = _event_id;
 IF FOUND THEN
  IF v_existing.item_id <> _item_id OR v_existing.event_type <> _event_type OR v_existing.actor_id <> auth.uid() THEN RAISE EXCEPTION 'Identificador de movimentação inválido.'; END IF;
  RETURN _event_id;
 END IF;
 IF v_item.condition = 'Descarte' THEN RAISE EXCEPTION 'Este EPI já foi descartado.'; END IF;
 IF _occurred_at::date < coalesce(v_item.epi_received_at, v_item.created_at::date) THEN RAISE EXCEPTION 'A data não pode ser anterior à entrada do EPI.'; END IF;
 IF _event_type = 'delivery' THEN
  IF _quantity IS NULL OR _quantity <= 0 OR _quantity <> trunc(_quantity) OR _quantity > v_item.quantity THEN RAISE EXCEPTION 'Quantidade inválida ou saldo insuficiente.'; END IF;
  IF v_item.epi_expires_at IS NOT NULL AND v_item.epi_expires_at < _occurred_at::date THEN RAISE EXCEPTION 'EPI vencido não pode ser entregue.'; END IF;
  SELECT name INTO v_employee FROM public.employees WHERE id = _employee_id AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selecione um funcionário ativo.'; END IF;
  v_qty := _quantity;
  UPDATE public.items SET quantity = quantity - v_qty WHERE id = _item_id;
 ELSIF _event_type = 'discard' THEN
  IF nullif(btrim(_notes), '') IS NULL THEN RAISE EXCEPTION 'Informe o motivo do descarte.'; END IF;
  v_qty := v_item.quantity;
  IF v_qty <= 0 THEN RAISE EXCEPTION 'Não há saldo disponível para descarte.'; END IF;
  UPDATE public.items SET condition = 'Descarte', notes = _notes WHERE id = _item_id;
 ELSE RAISE EXCEPTION 'Movimentação inválida.'; END IF;
 INSERT INTO public.epi_events(id,item_id,event_type,employee_id,employee_name,quantity,occurred_at,received_at,item_name,item_code,caracteristicas,ca,notes,actor_id) VALUES (_event_id,_item_id,_event_type,CASE WHEN _event_type='delivery' THEN _employee_id ELSE NULL END,v_employee,v_qty,_occurred_at,coalesce(v_item.epi_received_at,v_item.created_at::date),v_item.name,v_item.codigo,v_item.caracteristicas,v_item.epi_ca,_notes,auth.uid());
 INSERT INTO public.stock_movement_log(item_id,kind,quantity,destination,notes,actor_id) VALUES (_item_id,'out',v_qty,CASE WHEN _event_type='delivery' THEN v_employee ELSE 'Descarte' END,concat('EPI ',_event_type,' · ',_notes),auth.uid());
 INSERT INTO public.system_logs(category,message,item_id,quantity,actor_id,metadata) VALUES ('item',CASE WHEN _event_type='delivery' THEN 'Entrega de EPI' ELSE 'Descarte de EPI' END,_item_id,v_qty,auth.uid(),jsonb_build_object('epi_event_id',_event_id,'occurred_at',_occurred_at));
 RETURN _event_id;
END; $$;
REVOKE ALL ON FUNCTION public.record_epi_event(uuid,uuid,text,numeric,timestamptz,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_epi_event(uuid,uuid,text,numeric,timestamptz,uuid,text) TO authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.epi_events;