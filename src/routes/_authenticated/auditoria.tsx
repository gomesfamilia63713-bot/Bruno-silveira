import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-role";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldCheck, RefreshCw, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/auditoria")({
  component: AuditoriaPage,
  head: () => ({
    meta: [
      { title: "Auditoria do Sistema | BS TOOLS ERP" },
      { name: "description", content: "Trilha de auditoria: logins, alterações, descartes, recebimentos e aprovações com data e hora." },
      { property: "og:title", content: "Auditoria do Sistema | BS TOOLS ERP" },
      { property: "og:description", content: "Histórico completo de ações realizadas no ERP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

interface LogRow {
  id: string;
  category: string;
  message: string;
  quantity: number | null;
  actor_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const CATEGORIES = ["todos", "auth", "stock", "item", "obra", "pedido", "producao", "funcionario", "sistema"] as const;

function catColor(c: string) {
  const map: Record<string, string> = {
    auth: "bg-sky-500/15 text-sky-400 border-sky-500/40",
    stock: "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
    item: "bg-amber-500/15 text-amber-400 border-amber-500/40",
    pedido: "bg-violet-500/15 text-violet-400 border-violet-500/40",
    obra: "bg-orange-500/15 text-orange-400 border-orange-500/40",
  };
  return map[c] ?? "bg-muted text-muted-foreground border-border";
}

function AuditoriaPage() {
  const { isAdmin } = useIsAdmin();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("todos");

  const { data: rows = [], isFetching, refetch } = useQuery({
    queryKey: ["system_logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_logs")
        .select("id, category, message, quantity, actor_id, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as LogRow[];
    },
    enabled: isAdmin,
  });

  // Realtime: ouvintes registrados antes do subscribe.
  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel(`auditoria-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "system_logs" }, () => {
        qc.invalidateQueries({ queryKey: ["system_logs"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isAdmin, qc]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (cat !== "todos" && r.category !== cat) return false;
      if (!term) return true;
      const actor = String((r.metadata as { actor_email?: string } | null)?.actor_email ?? "");
      return `${r.message} ${r.category} ${actor}`.toLowerCase().includes(term);
    });
  }, [rows, q, cat]);

  if (!isAdmin) {
    return <div className="mx-auto max-w-2xl p-6 text-center text-muted-foreground">Somente administradores podem ver a auditoria.</div>;
  }

  return (
    <div className="w-full space-y-4 p-1 sm:p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold"><ShieldCheck className="h-5 w-5 text-primary" />Auditoria</h1>
          <p className="text-xs text-muted-foreground">Todas as ações registradas no sistema, com autor, data e hora.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar por ação, item ou usuário…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1 rounded-md border p-1 text-xs">
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCat(c)}
              className={`rounded px-2 py-1 capitalize ${cat === c ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[150px]">Data / Hora</TableHead>
              <TableHead className="w-[110px]">Categoria</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead className="w-[200px]">Usuário</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">Nenhum registro.</TableCell></TableRow>
            ) : filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("pt-BR")}
                </TableCell>
                <TableCell><Badge className={`border ${catColor(r.category)}`}>{r.category}</Badge></TableCell>
                <TableCell className="text-sm">{r.message}</TableCell>
                <TableCell className="truncate text-xs text-muted-foreground">
                  {String((r.metadata as { actor_email?: string } | null)?.actor_email ?? (r.actor_id ? "—" : "sistema"))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
