import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, Clock, CloudOff, Minus, PackagePlus, Plus, RotateCcw, Search, Send } from "lucide-react";
import {
  flushRequestQueue,
  onRequestQueueChange,
  readRequestQueue,
  submitRequest,
  type PendingRequest,
} from "@/lib/request-queue";
import { OFFLINE_SYNC_COMPLETE_EVENT } from "@/lib/offline-autosync";


type StockItem = {
  id: string; name: string; caracteristicas: string | null; kind: string; unit: string;
  quantity: number; category: string | null; codigo: string | null;
};

type MyItem = {
  obra_item_id: string; item_id: string; name: string; caracteristicas: string | null; unit: string;
  quantity: number; obra_name: string | null; origin_label: string | null; taken_at: string;
};

type OpenObra = { id: string; name: string };

/** Prazo de entrega: manhã -> 14:00 do mesmo dia; tarde -> 08:00 do dia seguinte. */
export function deliveryEstimate(now = new Date()) {
  const local = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const morning = local.getHours() < 12;
  const d = new Date(local);
  if (morning) d.setHours(14, 0, 0, 0);
  else { d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); }
  return {
    morning,
    text: morning
      ? "Pedido da manhã: entrega a partir das 14:00 de hoje."
      : "Pedido da tarde: entrega a partir das 08:00 de amanhã.",
    when: d,
  };
}

export function PontoRequests({ token, employeeName }: { token: string | null; employeeName?: string }) {
  const [tab, setTab] = useState<"pedido" | "devolucao">("pedido");
  const [stock, setStock] = useState<StockItem[]>([]);
  const [mine, setMine] = useState<MyItem[]>([]);
  const [obras, setObras] = useState<OpenObra[]>([]);
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [ret, setRet] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [destination, setDestination] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const est = deliveryEstimate();

  useEffect(() => {
    const refresh = () => void readRequestQueue().then(setPendingRequests);
    refresh();
    const off = onRequestQueueChange(refresh);
    return off;
  }, []);


  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [s, m, o] = await Promise.all([
        (supabase as any).rpc("stock_catalog_with_details"),
        (supabase as any).rpc("my_items_with_details_by_token", { _token: token }),
        (supabase as any).rpc("open_obras_by_employee_token", { _token: token }),
      ]);
      if (Array.isArray(s.data)) {
        setStock(s.data as StockItem[]);
        localStorage.setItem("bs-ponto-stock", JSON.stringify(s.data));
      }
      if (Array.isArray(m.data)) {
        setMine(m.data as MyItem[]);
        localStorage.setItem(`bs-ponto-mine-${token}`, JSON.stringify(m.data));
      }
      if (Array.isArray(o.data)) {
        setObras(o.data as OpenObra[]);
        localStorage.setItem(`bs-ponto-obras-${token}`, JSON.stringify(o.data));
      }
    } catch {
      /* mantém cache */
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const cs = localStorage.getItem("bs-ponto-stock");
    if (cs) setStock(JSON.parse(cs));
    const cm = localStorage.getItem(`bs-ponto-mine-${token}`);
    if (cm) setMine(JSON.parse(cm));
    const co = localStorage.getItem(`bs-ponto-obras-${token}`);
    if (co) setObras(JSON.parse(co));
    void load();
    const ch = supabase
      .channel(`ponto-stock-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "items" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "obra_items" }, () => void load())
      .subscribe();
    const onSyncComplete = () => void load();
    window.addEventListener(OFFLINE_SYNC_COMPLETE_EVENT, onSyncComplete);
    return () => {
      void supabase.removeChannel(ch);
      window.removeEventListener(OFFLINE_SYNC_COMPLETE_EVENT, onSyncComplete);
    };
  }, [token, load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = stock.filter((i) => Number(i.quantity) > 0);
    if (!s) return base.slice(0, 40);
    return base.filter((i) =>
      i.name.toLowerCase().includes(s) || (i.caracteristicas ?? "").toLowerCase().includes(s) || (i.codigo ?? "").toLowerCase().includes(s),
    ).slice(0, 40);
  }, [stock, q]);

  const cartCount = Object.values(cart).filter((n) => n > 0).length;
  const retCount = Object.values(ret).filter((n) => n > 0).length;

  const submit = async () => {
    if (!token) return;
    const items =
      tab === "pedido"
        ? Object.entries(cart).filter(([, n]) => n > 0).map(([id, n]) => {
            const it = stock.find((s) => s.id === id);
            return { item_id: id, name: it?.name ?? "Item", caracteristicas: it?.caracteristicas ?? null, quantity: n, unit: it?.unit ?? null };
          })
        : Object.entries(ret).filter(([, n]) => n > 0).map(([id, n]) => {
            const it = mine.find((s) => s.obra_item_id === id);
            return { obra_item_id: id, item_id: it?.item_id ?? null, name: it?.name ?? "Item", caracteristicas: it?.caracteristicas ?? null, quantity: n, unit: it?.unit ?? null };
          });
    if (!items.length) { toast.error("Selecione ao menos um item."); return; }
    if (tab === "pedido" && !destination) {
      toast.error("Selecione uma obra ou Mochila.");
      return;
    }
    setBusy(true);
    try {
      const result = await submitRequest({
        clientId: crypto.randomUUID(),
        token,
        kind: tab,
        items,
        notes: notes.trim() || null,
        destination: tab === "pedido" ? (destination === "mochila" ? "mochila" : "obra") : undefined,
        obraId: tab === "pedido" && destination !== "mochila" ? destination : null,
        createdAt: new Date().toISOString(),
      });
      if (result === "sent") {
        toast.success(tab === "pedido" ? "Pedido enviado ao administrador!" : "Devolução registrada — estoque atualizado.");
      } else {
        toast.success("Salvo no celular. Será enviado assim que voltar a internet.");
      }
      setCart({}); setRet({}); setNotes(""); setDestination("");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar");
    } finally {
      setBusy(false);
    }
  };


  if (!token) {
    return (
      <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-bold">
          <PackagePlus className="h-4 w-4 text-cyan-400" />
          Pedidos e Devolução
        </h2>
        <p className="text-xs text-slate-400">
          Abra pelo seu link individual (enviado pelo administrador) para pedir ou devolver materiais e ferramentas.
        </p>
      </section>
    );
  }

  const Stepper = ({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) => (
    <div className="flex items-center gap-1">
      <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => onChange(Math.max(0, value - 1))}>
        <Minus className="h-3 w-3" />
      </Button>
      <span className="w-8 text-center text-sm font-semibold">{value}</span>
      <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => onChange(Math.min(max, value + 1))}>
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );

  return (
    <section className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
        <PackagePlus className="h-4 w-4 text-cyan-400" />
        Pedidos e Devolução {employeeName ? `— ${employeeName}` : ""}
      </h2>

      <div className="mb-3 flex items-start gap-3 rounded-lg border-2 border-amber-400 bg-amber-500/20 p-3 text-sm leading-snug text-amber-200 shadow-sm">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
        <div>
          <p className="font-bold">Horário de entrega</p>
          <p className="mt-0.5">{est.text}</p>
          <p className="mt-1 text-xs text-amber-300/90">
            Manhã: entrega após 14:00. Tarde: entrega após 08:00 do dia seguinte.
          </p>
        </div>
      </div>

      <div className="mb-3 rounded-lg border border-slate-800 bg-slate-950/60 p-2">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-cyan-300">
          Itens sob minha responsabilidade ({mine.length})
        </p>
        {mine.length === 0 ? (
          <p className="py-1 text-[11px] text-slate-500">Nenhum item retirado do estoque no momento.</p>
        ) : (
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {mine.map((i) => (
              <li key={`resp-${i.obra_item_id}`} className="flex items-start justify-between gap-2 text-[11px]">
                <span className="min-w-0">
                  <b className="block truncate text-slate-200">{i.name}</b>
                  {i.caracteristicas?.trim() && <span className="block break-words text-xs font-medium text-primary">{i.caracteristicas}</span>}
                  <span className="text-slate-400">
                    {i.obra_name ?? "Sem obra"} · origem: {i.origin_label ?? "Estoque Central"} ·{" "}
                    {new Date(i.taken_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-slate-200">{Number(i.quantity)} {i.unit}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pendingRequests.length > 0 && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-300">
          <span className="flex items-center gap-2">
            <CloudOff className="h-3.5 w-3.5" />
            <span>
              {pendingRequests.length} envio(s) aguardando internet
              {pendingRequests[0]?.kind === "pedido" && (
                <small className="block">{deliveryEstimate(new Date(pendingRequests[0].createdAt)).text}</small>
              )}
            </span>
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              const { sent } = await flushRequestQueue();
              toast[sent > 0 ? "success" : "message"](
                sent > 0 ? `${sent} envio(s) concluído(s)` : "Sem conexão para enviar agora",
              );
              await load();
            }}
          >
            Enviar agora
          </Button>
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 gap-2">

        <Button variant={tab === "pedido" ? "default" : "secondary"} onClick={() => setTab("pedido")}>
          <PackagePlus className="mr-2 h-4 w-4" />Pedir
        </Button>
        <Button variant={tab === "devolucao" ? "default" : "secondary"} onClick={() => setTab("devolucao")}>
          <RotateCcw className="mr-2 h-4 w-4" />Devolver
        </Button>
      </div>

      {tab === "pedido" ? (
        <>
          <div className="mb-3 space-y-1.5">
            <label className="text-xs font-semibold text-slate-200">Destino obrigatório</label>
            <Select value={destination} onValueChange={setDestination}>
              <SelectTrigger className="h-11 bg-slate-950/60">
                <SelectValue placeholder="Escolha uma obra ou Mochila" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mochila">Mochila — sob minha responsabilidade</SelectItem>
                {obras.map((obra) => (
                  <SelectItem key={obra.id} value={obra.id}>{obra.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-slate-400">
              O destino aparecerá na saída do estoque e no painel administrativo.
            </p>
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar item ou código" className="pl-8" />
          </div>
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {filtered.length === 0 && <li className="p-3 text-center text-xs text-slate-500">Nenhum item disponível.</li>}
            {filtered.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{i.name}</p>
                  {i.caracteristicas?.trim() && <p className="break-words text-xs font-medium text-primary">{i.caracteristicas}</p>}
                  <p className="text-[11px] text-slate-400">
                    {i.codigo ? `#${i.codigo} · ` : ""}{i.kind === "ferramenta" ? "Ferramenta" : "Material"} · {Number(i.quantity)} {i.unit} disponível
                  </p>
                </div>
                <Stepper
                  value={cart[i.id] ?? 0}
                  max={Number(i.quantity)}
                  onChange={(n) => setCart((c) => ({ ...c, [i.id]: n }))}
                />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {mine.length === 0 && <li className="p-3 text-center text-xs text-slate-500">Você não tem itens sob sua responsabilidade.</li>}
          {mine.map((i) => (
            <li key={i.obra_item_id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{i.name}</p>
                  {i.caracteristicas?.trim() && <p className="break-words text-xs font-medium text-primary">{i.caracteristicas}</p>}
                <p className="text-[11px] text-slate-400">
                  {Number(i.quantity)} {i.unit} · {i.obra_name ?? "Sem obra"} · origem: {i.origin_label ?? "Estoque Central"}
                </p>
                <p className="text-[11px] text-slate-500">
                  Retirado em {new Date(i.taken_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </p>
              </div>
              <Stepper
                value={ret[i.obra_item_id] ?? 0}
                max={Number(i.quantity)}
                onChange={(n) => setRet((c) => ({ ...c, [i.obra_item_id]: n }))}
              />
            </li>
          ))}
        </ul>
      )}

      <Input
        className="mt-2"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Observação (opcional)"
      />

      <Button
        className="mt-2 h-12 w-full bg-cyan-600 hover:bg-cyan-500"
        disabled={busy || (tab === "pedido" ? cartCount === 0 || !destination : retCount === 0)}
        onClick={submit}
      >
        <Send className="mr-2 h-4 w-4" />
        {tab === "pedido" ? `Enviar pedido (${cartCount})` : `Registrar devolução (${retCount})`}
      </Button>
    </section>
  );
}
