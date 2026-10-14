import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useIsAdmin } from "@/hooks/use-role";
import { logAudit } from "@/lib/audit";
import { WhatsappRecipientsPanel } from "@/components/whatsapp-recipients-panel";
import { CheckCircle2, XCircle, RotateCcw, Clock, Package } from "lucide-react";

export const Route = createFileRoute("/_authenticated/pedidos")({
  head: () => ({
    meta: [
      { title: "Pedidos de Material — BS TOOLS" },
      { name: "description", content: "Aprove e acompanhe pedidos e devoluções de materiais." },
      { property: "og:title", content: "Pedidos de Material — BS TOOLS" },
      { property: "og:description", content: "Aprove e acompanhe pedidos e devoluções de materiais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PedidosPage,
});

interface MRItem { item_id: string | null; name: string; caracteristicas?: string | null; quantity: number; unit?: string | null; manual?: boolean }
interface MR {
  id: string;
  employee_id: string;
  obra_id: string | null;
  obra_name: string | null;
  items: MRItem[];
  kind: "pedido" | "devolucao";
  status: "pendente" | "aprovado" | "em_uso" | "devolvido" | "rejeitado";
  notes: string | null;
  requested_at: string;
  available_at: string;
  approved_at: string | null;
  returned_at: string | null;
}

function statusBadge(s: MR["status"]) {
  const map: Record<string, string> = {
    pendente: "bg-amber-500/20 text-amber-400 border-amber-500/40",
    aprovado: "bg-sky-500/20 text-sky-400 border-sky-500/40",
    em_uso: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
    devolvido: "bg-muted text-muted-foreground",
    rejeitado: "bg-destructive/20 text-destructive border-destructive/40",
  };
  return <Badge className={`border ${map[s]}`}>{s.replace("_", " ")}</Badge>;
}

async function playBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; g.gain.value = 0.15;
    o.start(); setTimeout(() => { o.stop(); ctx.close(); }, 180);
  } catch {}
  try { navigator.vibrate?.(120); } catch {}
}

async function notifyEmployee(text: string) {
  try {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") await Notification.requestPermission();
    if (Notification.permission === "granted") new Notification("Pedido de material", { body: text });
  } catch {}
}

function PedidosPage() {
  const { isAdmin } = useIsAdmin();
  const [rows, setRows] = useState<MR[]>([]);
  const [emps, setEmps] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"todos" | "pendente" | "em_uso">("pendente");

  const load = async () => {
    setLoading(true);
    try {
      const [reqRes, empRes, itemRes] = await Promise.all([
        (supabase as any).from("material_requests").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("employees").select("id, name"),
        supabase.from("items").select("id,caracteristicas"),
      ]);
      if (reqRes.error) throw reqRes.error;
      if (empRes.error) throw empRes.error;
      if (itemRes.error) throw itemRes.error;
      const characteristics = new Map((itemRes.data ?? []).map((i) => [i.id, i.caracteristicas]));
      const normalized: MR[] = ((reqRes.data ?? []) as any[]).map((r) => ({
        ...r,
        items: Array.isArray(r?.items) ? r.items.map((i: MRItem) => ({ ...i, caracteristicas: (i.item_id ? characteristics.get(i.item_id) : null) ?? i.caracteristicas })) : [],
      }));
      setRows(normalized);
      const map: Record<string, string> = {};
      (empRes.data ?? []).forEach((x: any) => { map[x.id] = x.name; });
      setEmps(map);
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Realtime: novos pedidos/devoluções aparecem sem F5
  useEffect(() => {
    const channel = supabase
      .channel(`admin-pedidos-page-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "material_requests" },
        (payload: any) => {
          load();
          if (payload.eventType === "INSERT") {
            const n = payload.new;
            const items = Array.isArray(n?.items) ? n.items : [];
            const summary = items.slice(0, 3).map((i: any) => `${i.quantity}× ${i.name}`).join(", ");
            playBeep();
            toast.info(n?.kind === "devolucao" ? "Nova devolução recebida" : "Novo pedido recebido", {
              description: summary || undefined,
              duration: 8000,
            });
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const approve = async (r: MR) => {
    const availableAt = new Date(r.available_at).getTime();
    if (r.kind === "pedido" && Number.isFinite(availableAt) && availableAt > Date.now()) {
      toast.error(`Entrega liberada somente em ${new Date(r.available_at).toLocaleString("pt-BR")}.`);
      return;
    }
    try {
      const { error } = await (supabase as any).rpc("approve_material_request", { _request_id: r.id });
      if (error) throw error;
      await playBeep();
      notifyEmployee(`${emps[r.employee_id] ?? "Funcionário"}: ${r.kind} aprovado`);
      await logAudit("pedido", `${r.kind === "devolucao" ? "Devolução aprovada" : "Pedido aprovado"} de ${emps[r.employee_id] ?? "funcionário"} — ${r.items.length} item(ns)${r.obra_name ? ` — obra ${r.obra_name}` : ""}`, { obra_id: r.obra_id, metadata: { request_id: r.id, items: r.items } });
      toast.success("Aprovado e estoque atualizado");
      load();
    } catch (err: any) { toast.error(err?.message ?? "Erro"); }
  };

  const markReturned = async (r: MR) => {
    try {
      const { error } = await (supabase as any).rpc("admin_return_material_request", { _request_id: r.id });
      if (error) throw error;
      await playBeep();
      await logAudit("pedido", `Devolução confirmada de ${emps[r.employee_id] ?? "funcionário"} — itens retornaram ao estoque`, { obra_id: r.obra_id, metadata: { request_id: r.id, items: r.items } });
      toast.success("Devolvido ao estoque");
      load();
    } catch (err: any) { toast.error(err?.message ?? "Erro"); }
  };

  const reject = async (r: MR) => {
    try {
      const { error } = await (supabase as any).from("material_requests").update({ status: "rejeitado" }).eq("id", r.id);
      if (error) throw error;
      await logAudit("pedido", `Pedido rejeitado de ${emps[r.employee_id] ?? "funcionário"}`, { obra_id: r.obra_id, metadata: { request_id: r.id } });
      toast.success("Rejeitado"); load();
    } catch (err: any) { toast.error(err?.message ?? "Erro"); }
  };

  const counts = {
    pendente: rows.filter((r) => r.status === "pendente").length,
    em_uso: rows.filter((r) => r.status === "em_uso").length,
    todos: rows.length,
  };
  // Se não há pendentes mas existem pedidos, mostra automaticamente todos.
  const effectiveFilter = filter === "pendente" && counts.pendente === 0 && counts.todos > 0 ? "todos" : filter;
  const filtered = rows.filter((r) => effectiveFilter === "todos" ? true : effectiveFilter === "pendente" ? r.status === "pendente" : r.status === "em_uso");

  if (!isAdmin) {
    return <div className="mx-auto max-w-2xl p-6 text-center text-muted-foreground">Somente administradores podem gerenciar pedidos.</div>;
  }

  return (
    <div className="w-full p-3 sm:p-4 xl:px-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold flex items-center gap-2"><Package className="h-5 w-5" />Pedidos de Material</h1>
        <div className="flex gap-1 rounded-md border p-1 text-xs">
          {(["pendente", "em_uso", "todos"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded px-2 py-1 ${effectiveFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
              {(f === "em_uso" ? "Em uso" : f[0].toUpperCase() + f.slice(1))} ({counts[f]})
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4"><WhatsappRecipientsPanel /></div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {counts.todos === 0 ? "Nenhum pedido registrado ainda." : "Nenhum pedido neste filtro — veja a aba \"Todos\"."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((r) => (
            <div key={r.id} className="rounded-lg border bg-card p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{emps[r.employee_id] ?? "—"} <span className="text-xs text-muted-foreground">• {r.kind}</span></p>
                  <p className="text-xs text-muted-foreground">{r.obra_name ?? "Sem obra"} • {new Date(r.requested_at).toLocaleString("pt-BR")}</p>
                  <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-amber-400"><Clock className="h-3 w-3" /> Disponível: {new Date(r.available_at).toLocaleString("pt-BR")}</p>
                </div>
                {statusBadge(r.status)}
              </div>
              <ul className="mb-2 space-y-0.5 text-sm">
                {r.items.map((it, i) => (
                  <li key={i} className="flex justify-between border-b border-border/40 py-0.5">
                    <span className="min-w-0"><span className="block break-words">{it.name}</span>{it.caracteristicas?.trim() && <span className="block break-words text-xs font-medium text-primary">{it.caracteristicas}</span>}</span>
                    <span className="text-muted-foreground">{it.quantity} {it.unit ?? ""}</span>
                  </li>
                ))}
              </ul>
              {r.notes && <p className="mb-2 text-xs italic text-muted-foreground">"{r.notes}"</p>}
              {r.status === "pendente" && (
                <div className="flex gap-2">
                  {(() => {
                    const waitingForDelivery = r.kind === "pedido"
                      && Number.isFinite(new Date(r.available_at).getTime())
                      && new Date(r.available_at).getTime() > Date.now();
                    return (
                  <Button
                    size="sm"
                    onClick={() => approve(r)}
                    className="flex-1"
                    disabled={waitingForDelivery}
                    title={waitingForDelivery ? "Aguardando o horário de entrega" : "Aprovar pedido"}
                  >
                    <CheckCircle2 className="mr-1 h-4 w-4" />
                    {waitingForDelivery ? "Aguardando horário" : "Aprovar"}
                  </Button>
                    );
                  })()}
                  <Button size="sm" variant="destructive" onClick={() => reject(r)}><XCircle className="h-4 w-4" /></Button>
                </div>
              )}
              {r.status === "em_uso" && (
                <Button size="sm" variant="outline" onClick={() => markReturned(r)} className="w-full">
                  <RotateCcw className="mr-1 h-4 w-4" />Marcar devolvido
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
