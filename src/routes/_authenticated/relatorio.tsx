import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Printer, History as HistoryIcon, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight } from "lucide-react";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/relatorio")({
  head: () => ({
    meta: [
      { title: "Relatório de Movimentações — BS TOOLS" },
      { name: "description", content: "Histórico de entradas, saídas e transferências." },
      { property: "og:title", content: "Relatório de Movimentações — BS TOOLS" },
      { property: "og:description", content: "Histórico de entradas, saídas e transferências." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RelatorioMovimentacaoPage,
});

type MovRow = {
  id: string;
  created_at: string;
  kind: "in" | "out" | "transfer" | string;
  quantity: number;
  destination: string | null;
  notes: string | null;
  item_id: string | null;
  obra_id: string | null;
  item_name: string;
  obra_name: string;
};

const KIND_LABEL: Record<string, string> = {
  in: "Entrada",
  out: "Saída",
  transfer: "Transferência",
};

const kindStyle: Record<string, string> = {
  in: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  out: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  transfer: "bg-sky-500/15 text-sky-300 border-sky-500/30",
};

function KindIcon({ kind }: { kind: string }) {
  if (kind === "in") return <ArrowDownCircle className="h-3.5 w-3.5" />;
  if (kind === "out") return <ArrowUpCircle className="h-3.5 w-3.5" />;
  if (kind === "transfer") return <ArrowLeftRight className="h-3.5 w-3.5" />;
  return <HistoryIcon className="h-3.5 w-3.5" />;
}

function RelatorioMovimentacaoPage() {
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [days, setDays] = useState<string>("30");

  const since = useMemo(() => subDays(new Date(), Number(days)).toISOString(), [days]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["movement-report", days],
    queryFn: async (): Promise<MovRow[]> => {
      const { data: mv, error } = await supabase
        .from("stock_movement_log")
        .select("id, created_at, kind, quantity, destination, notes, item_id, obra_id")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;

      const itemIds = Array.from(new Set((mv ?? []).map((r) => r.item_id).filter(Boolean))) as string[];
      const obraIds = Array.from(new Set((mv ?? []).map((r) => r.obra_id).filter(Boolean))) as string[];
      const [{ data: its }, { data: obs }] = await Promise.all([
        itemIds.length
          ? supabase.from("items").select("id,name,codigo").in("id", itemIds)
          : Promise.resolve({ data: [] as { id: string; name: string; codigo: string | null }[] }),
        obraIds.length
          ? supabase.from("obras").select("id,name").in("id", obraIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ]);
      const itemMap = new Map((its ?? []).map((i) => [i.id, i]));
      const obraMap = new Map((obs ?? []).map((o) => [o.id, o.name]));
      return (mv ?? []).map((r) => {
        const it = r.item_id ? itemMap.get(r.item_id) : null;
        return {
          ...(r as any),
          item_name: it ? (it.codigo ? `${it.codigo} · ${it.name}` : it.name) : "—",
          obra_name: r.obra_id ? obraMap.get(r.obra_id) ?? r.destination ?? "—" : r.destination ?? "—",
        } as MovRow;
      });
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (kindFilter !== "all" && r.kind !== kindFilter) return false;
      if (!q) return true;
      return [r.item_name, r.obra_name, r.notes ?? ""].some((v) => v.toLowerCase().includes(q));
    });
  }, [rows, kindFilter, query]);

  const totals = useMemo(() => {
    return {
      total: filtered.length,
      in: filtered.filter((r) => r.kind === "in").length,
      out: filtered.filter((r) => r.kind === "out").length,
      transfer: filtered.filter((r) => r.kind === "transfer").length,
    };
  }, [filtered]);

  const handlePrint = () => window.print();

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #print-area, #print-area * { visibility: visible !important; }
          #print-area { position: absolute; inset: 0; padding: 16px; background: white !important; color: black !important; }
          #print-area table, #print-area th, #print-area td { color: black !important; border-color: #ccc !important; background: white !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between no-print">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Relatório de Movimentação</h1>
          <p className="text-sm text-muted-foreground">Histórico detalhado de entradas, saídas e transferências.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="60">Últimos 60 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos tipos</SelectItem>
              <SelectItem value="in">Entradas</SelectItem>
              <SelectItem value="out">Saídas</SelectItem>
              <SelectItem value="transfer">Transferências</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Buscar item, obra, observação..." value={query} onChange={(e) => setQuery(e.target.value)} className="sm:w-64" />
          <Button onClick={handlePrint} className="gap-2"><Printer className="h-4 w-4" />Imprimir</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 no-print">
        <StatCard label="Total" value={totals.total} />
        <StatCard label="Entradas" value={totals.in} accent="text-emerald-300" />
        <StatCard label="Saídas" value={totals.out} accent="text-amber-300" />
        <StatCard label="Transferências" value={totals.transfer} accent="text-sky-300" />
      </div>

      <Card id="print-area" className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="shrink-0">
          <CardTitle className="flex items-center gap-2">
            <HistoryIcon className="h-4 w-4" />
            Movimentações · últimos {days} dias
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Gerado em {format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })} · {filtered.length} registros
          </p>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <div className="min-h-0 flex-1 overflow-auto">
            <Table className="[&_th]:h-9 [&_th]:px-2 [&_td]:px-2 [&_td]:py-1.5 text-xs">
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="w-[140px]">Data</TableHead>
                  <TableHead className="w-[130px]">Tipo</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Obra / Destino</TableHead>
                  <TableHead className="text-right w-[90px]">Qtd</TableHead>
                  <TableHead>Observações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Carregando…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Nenhuma movimentação no período.</TableCell></TableRow>
                ) : filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums">{format(new Date(r.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`gap-1 ${kindStyle[r.kind] ?? ""}`}>
                        <KindIcon kind={r.kind} />
                        {KIND_LABEL[r.kind] ?? r.kind}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{r.item_name}</TableCell>
                    <TableCell>{r.obra_name}</TableCell>
                    <TableCell className="text-right font-mono">{Number(r.quantity).toLocaleString("pt-BR")}</TableCell>
                    <TableCell className="text-muted-foreground">{r.notes ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, accent = "text-foreground" }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-slate-950/60 p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-black ${accent}`}>{value}</p>
    </div>
  );
}
