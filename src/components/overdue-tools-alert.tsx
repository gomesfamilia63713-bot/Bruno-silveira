import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  OVERDUE_DAYS_LIMIT as DAYS_LIMIT,
  dismissOverdue,
  useDismissedOverdue,
  useOverdueRealtimeSync,
} from "@/lib/overdue-tools";

type Row = {
  id: string;
  item_id: string | null;
  quantity: number;
  notes: string | null;
  created_at: string;
  item: { name: string; codigo: string | null; kind: string; caracteristicas: string | null; alert_resolved_at: string | null } | null;
  obra: { name: string } | null;
  holder: { name: string } | null;
};

export function OverdueToolsAlert() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const dismissed = useDismissedOverdue();

  useOverdueRealtimeSync(() => {
    qc.invalidateQueries({ queryKey: ["overdue-tools"] });
    qc.invalidateQueries({ queryKey: ["overdue-tool-days"] });
  });

  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - DAYS_LIMIT);
    return d.toISOString();
  }, []);

  const { data: rows = [] } = useQuery({
    queryKey: ["overdue-tools", cutoff],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("obra_items")
        .select("id, item_id, quantity, notes, created_at, item:items(name, codigo, kind, caracteristicas, alert_resolved_at), obra:obras(name), holder:employees(name)")
        .lte("created_at", cutoff)
        .gt("quantity", 0)
        .order("created_at", { ascending: true });
      if (error) throw error;
      // Alerta restrito estritamente a FERRAMENTAS
      return ((data ?? []) as unknown as Row[]).filter((r) => r.item?.kind === "tool");
    },
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const q = query.trim().toLowerCase();
  // Justificativa salva no banco = alerta resolvido em todos os dispositivos
  const active = rows.filter((r) => !dismissed.includes(r.id) && !(r.notes ?? "").trim() && !(r.item?.alert_resolved_at && r.item.alert_resolved_at >= r.created_at));
  const visible = q
    ? active.filter((r) =>
        [r.item?.name, r.item?.caracteristicas, r.item?.codigo, r.obra?.name, r.holder?.name, r.notes]
          .some((v) => (v ?? "").toLowerCase().includes(q)),
      )
    : active;

  if (active.length === 0) return null;

  const daysLate = (iso: string) =>
    Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`${active.length} ferramentas com atraso de devolução`}
          className="relative inline-flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive transition hover:bg-destructive/20 animate-[pulse_0.7s_cubic-bezier(0.4,0,0.6,1)_infinite]"
        >
          <AlertTriangle className="h-5 w-5 animate-[bounce_0.6s_infinite]" />
          <span className="text-xs font-bold uppercase tracking-wider">{active.length} em atraso</span>
          <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-destructive animate-[ping_0.8s_cubic-bezier(0,0,0.2,1)_infinite]" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5 animate-[pulse_0.7s_cubic-bezier(0.4,0,0.6,1)_infinite]" />
            Ferramentas sem devolução há {DAYS_LIMIT}+ dias
          </DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar ferramenta, código, obra ou responsável..."
            className="pl-8"
          />
        </div>
        <div className="space-y-3">
          {visible.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum item encontrado.</p>
          )}
          {visible.map((r) => (
            <OverdueRow
              key={r.id}
              r={r}
              days={daysLate(r.created_at)}
              onSaved={() => {
                dismissOverdue(r.id, r.item_id);
                qc.invalidateQueries({ queryKey: ["overdue-tools"] });
                qc.invalidateQueries({ queryKey: ["overdue-tool-days"] });
              }}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function OverdueRow({ r, days, onSaved }: { r: Row; days: number; onSaved: () => void }) {
  const [text, setText] = useState(r.notes ?? "");
  const [saved, setSaved] = useState(r.notes ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("obra_items").update({ notes: text }).eq("id", r.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setSaved(text);
    toast.success("Justificativa registrada");
    onSaved();
  };

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        {r.item?.codigo && (
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{r.item.codigo}</span>
        )}
        <p className="font-semibold">{r.item?.name ?? "Item removido"}</p>
        <Badge variant="destructive" className="animate-[pulse_0.7s_cubic-bezier(0.4,0,0.6,1)_infinite]">{days} dias em atraso</Badge>
      </div>
      {r.item?.caracteristicas?.trim() && <p className="mt-1 break-words text-xs font-medium text-primary">{r.item.caracteristicas}</p>}
      {saved.trim() && (
        <p className="mt-1 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1 text-xs text-foreground">
          <span className="font-semibold text-destructive">Justificativa:</span> {saved}
        </p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        Obra: <span className="text-foreground">{r.obra?.name ?? "Sem obra"}</span>
        {" • "}Responsável: <span className="text-foreground">{r.holder?.name ?? "—"}</span>
        {" • "}Qtd: {r.quantity}
      </p>
      <div className="mt-2 flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Justificativa do atraso..."
          className="h-8 text-xs"
        />
        <Button size="sm" className="h-8" onClick={save} disabled={saving}>Salvar</Button>
      </div>
    </div>
  );
}
