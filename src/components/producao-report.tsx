import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter, LineChart as LineChartIcon, RotateCcw } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Area, AreaChart,
} from "recharts";
import { UNIT_LABEL, type Unit } from "@/lib/service-categories";

export type ReportRow = {
  key: string;
  entry_date: string;
  employee_id: string | null;
  employee_name: string;
  obra_id: string | null;
  obra_name: string;
  category_key: string;
  categoria: string;
  servico: string;
  descricao: string;
  unit: Unit;
  horas: number;
  producao: number;
};

type Opt = { id: string; name: string };

function fmt(n: number) {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export function ProducaoReport({
  rows,
  obras,
  employees,
  categories,
  live,
}: {
  rows: ReportRow[];
  obras: Opt[];
  employees: Opt[];
  categories: { key: string; label: string }[];
  live?: boolean;
}) {
  const [obraId, setObraId] = useState("all");
  const [empId, setEmpId] = useState("all");
  const [cat, setCat] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [groupBy, setGroupBy] = useState<"data" | "obra">("data");

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (obraId !== "all" && r.obra_id !== obraId) return false;
        if (empId !== "all" && r.employee_id !== empId) return false;
        if (cat !== "all" && r.category_key !== cat) return false;
        if (from && r.entry_date < from) return false;
        if (to && r.entry_date > to) return false;
        return true;
      }),
    [rows, obraId, empId, cat, from, to],
  );

  const totalProd = filtered.reduce((a, r) => a + r.producao, 0);
  const totalHoras = filtered.reduce((a, r) => a + r.horas, 0);

  const chartData = useMemo(() => {
    const m = new Map<string, { label: string; producao: number; horas: number; sort: string }>();
    filtered.forEach((r) => {
      const k = groupBy === "data" ? r.entry_date : (r.obra_id ?? "sem-obra");
      const label = groupBy === "data" ? format(new Date(r.entry_date + "T00:00:00"), "dd/MM") : r.obra_name;
      const cur = m.get(k) ?? { label, producao: 0, horas: 0, sort: groupBy === "data" ? r.entry_date : r.obra_name };
      cur.producao += r.producao;
      cur.horas += r.horas;
      m.set(k, cur);
    });
    return [...m.values()].sort((a, b) => a.sort.localeCompare(b.sort));
  }, [filtered, groupBy]);

  const unit = filtered[0]?.unit;

  return (
    <Card className="relative overflow-hidden border-cyan-400/20 bg-slate-950/70 shadow-[0_0_60px_-25px_rgba(34,211,238,0.6)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_60%)]" />
      <CardHeader className="relative flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-sm text-cyan-300">
          <LineChartIcon className="h-4 w-4" /> Relatório de Produção
          {live && (
            <span className="ml-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> tempo real
            </span>
          )}
        </CardTitle>
        <Button
          size="sm"
          variant="ghost"
          className="no-print text-xs text-muted-foreground"
          onClick={() => { setObraId("all"); setEmpId("all"); setCat("all"); setFrom(""); setTo(""); }}
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Limpar
        </Button>
      </CardHeader>
      <CardContent className="relative space-y-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Obra</Label>
            <Select value={obraId} onValueChange={setObraId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {obras.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Funcionário</Label>
            <Select value={empId} onValueChange={setEmpId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Categoria</Label>
            <Select value={cat} onValueChange={setCat}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {categories.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Agrupar por</Label>
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as "data" | "obra")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="data">Período (data)</SelectItem>
                <SelectItem value="obra">Obra</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3">
            <div className="text-[10px] uppercase text-muted-foreground">Lançamentos</div>
            <div className="font-mono text-xl text-cyan-300">{filtered.length}</div>
          </div>
          <div className="rounded-lg border border-sky-400/20 bg-sky-400/5 p-3">
            <div className="text-[10px] uppercase text-muted-foreground">Produção</div>
            <div className="font-mono text-xl text-sky-300">
              {fmt(totalProd)}{unit ? (UNIT_LABEL[unit] ?? unit) : ""}
            </div>
          </div>
          <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3">
            <div className="text-[10px] uppercase text-muted-foreground">Horas</div>
            <div className="font-mono text-xl text-emerald-300">{fmt(totalHoras)}h</div>
          </div>
        </div>

        <div className="rounded-xl border border-cyan-400/15 bg-slate-950/60 p-2 backdrop-blur">
          <div className="flex items-center justify-end gap-4 px-2 pt-1 text-[10px] uppercase tracking-wider">
            <span className="inline-flex items-center gap-1.5 text-cyan-300">
              <span className="h-0.5 w-4 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.9)]" /> Produção
            </span>
            <span className="inline-flex items-center gap-1.5 text-emerald-300">
              <span className="h-0.5 w-4 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" /> Horas
            </span>
          </div>
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 12, right: 12, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="prodGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                  <filter id="neon" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="3.5" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#7dd3fc", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "rgba(148,163,184,0.2)" }} />
                <YAxis yAxisId="left" tick={{ fill: "#7dd3fc", fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: "#6ee7b7", fontSize: 11 }} tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => `${v}h`} />
                <Tooltip
                  contentStyle={{
                    background: "rgba(2,6,23,0.92)",
                    border: "1px solid rgba(34,211,238,0.35)",
                    borderRadius: 10,
                    boxShadow: "0 0 24px -6px rgba(34,211,238,0.6)",
                    color: "#e0f2fe",
                    fontSize: 12,
                  }}
                  formatter={(v: number, n: string) => [n === "horas" ? `${fmt(Number(v))}h` : fmt(Number(v)), n === "producao" ? "Produção" : "Horas"]}
                />
                <Area yAxisId="left" type="monotone" dataKey="producao" stroke="none" fill="url(#prodGlow)" />
                <Line
                  yAxisId="left"
                  type="monotone" dataKey="producao" stroke="#22d3ee" strokeWidth={2.5}
                  filter="url(#neon)" isAnimationActive
                  dot={{ r: 3, fill: "#0f172a", stroke: "#22d3ee", strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: "#22d3ee" }}
                />
                <Line
                  yAxisId="right"
                  type="monotone" dataKey="horas" stroke="#34d399" strokeWidth={2}
                  filter="url(#neon)" isAnimationActive
                  dot={{ r: 2.5, fill: "#0f172a", stroke: "#34d399", strokeWidth: 2 }}
                  activeDot={{ r: 4, fill: "#34d399" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="overflow-x-auto rounded border border-white/5">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/60 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left">Data</th>
                <th className="px-2 py-1.5 text-left">Funcionário</th>
                <th className="px-2 py-1.5 text-left">Obra</th>
                <th className="px-2 py-1.5 text-left">Categoria</th>
                <th className="px-2 py-1.5 text-left">Serviço</th>
                <th className="px-2 py-1.5 text-right">Horas</th>
                <th className="px-2 py-1.5 text-right">Produção</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">
                  <Filter className="mr-1 inline h-3.5 w-3.5" /> Nenhum lançamento para os filtros.
                </td></tr>
              ) : filtered.slice(0, 200).map((r) => (
                <tr key={r.key} className="border-t border-white/5 hover:bg-cyan-400/5">
                  <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">
                    {format(new Date(r.entry_date + "T00:00:00"), "dd/MM/yy")}
                  </td>
                  <td className="px-2 py-1.5 text-emerald-200">{r.employee_name}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{r.obra_name}</td>
                  <td className="px-2 py-1.5">
                    <Badge variant="secondary" className="whitespace-nowrap text-[10px]">{r.categoria}</Badge>
                  </td>
                  <td className="px-2 py-1.5">{r.servico}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-sky-300">{fmt(r.horas)}h</td>
                  <td className="px-2 py-1.5 text-right font-mono text-cyan-300">
                    {fmt(r.producao)}{UNIT_LABEL[r.unit] ?? r.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
