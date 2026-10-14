import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  BarChart, Bar, PieChart, Pie, Cell,
} from "recharts";
import { format, subDays, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { SERVICE_CATEGORIES, categoryColor, categoryLabel, UNIT_LABEL, type Unit } from "@/lib/service-categories";
import { ErrorBoundary } from "@/components/error-boundary";
import { OverdueToolsAlert } from "@/components/overdue-tools-alert";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, HardHat, Users, TrendingUp, Hammer, Package, Settings2, Trash2 } from "lucide-react";
import { Link } from "@tanstack/react-router";

type Entry = {
  id: string;
  employee_id: string | null;
  obra_id: string | null;
  category: string;
  unit: Unit;
  quantity: number;
  entry_date: string;
};

const RANGE_DAYS = 30;

export default function DashboardView() {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [obraFilter, setObraFilter] = useState<string>("all");
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [todayOnly, setTodayOnly] = useState(false);
  const qc = useQueryClient();

  const start = format(subDays(new Date(), RANGE_DAYS - 1), "yyyy-MM-dd");

  // Produção em tempo real: qualquer lançamento atualiza o gráfico na hora.
  useEffect(() => {
    const refresh = () => {
      qc.invalidateQueries({ queryKey: ["production_entries"] });
      qc.invalidateQueries({ queryKey: ["dashboard-item-stats"] });
      qc.invalidateQueries({ queryKey: ["employees-min"] });
      qc.invalidateQueries({ queryKey: ["obras-min"] });
    };
    const channel = supabase
      .channel("dashboard-producao")
      .on("postgres_changes", { event: "*", schema: "public", table: "production_entries" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "production_entry_participants" }, refresh)
      .subscribe();
    // Modo offline: ao reconectar ou voltar o foco, refaz a leitura dos dados
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
      supabase.removeChannel(channel);
    };
  }, [qc]);


  const { data: entries = [] } = useQuery({
    queryKey: ["production_entries", start],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("production_entries")
        .select("*")
        .gte("entry_date", start)
        .order("entry_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
  });

  const { data: obras = [] } = useQuery({
    queryKey: ["obras-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("obras").select("id,name").order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("id,name").order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  const { data: itemStats = { tools: 0, materials: 0, maintenance: 0, discard: 0 } } = useQuery({
    queryKey: ["dashboard-item-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.from("items").select("kind,condition,quantity");
      if (error) throw error;
      const rows = (data ?? []) as { kind: string; condition: string | null; quantity: number }[];
      return {
        tools: rows.filter((r) => r.kind === "tool" && r.condition !== "Manutenção" && r.condition !== "Descarte").length,
        materials: rows.filter((r) => r.kind === "material" && r.condition !== "Descarte").length,
        maintenance: rows.filter((r) => r.condition === "Manutenção").length,
        discard: rows.filter((r) => r.condition === "Descarte").length,
      };
    },
  });


  const today = format(new Date(), "yyyy-MM-dd");

  const filtered = useMemo(() => entries.filter((e) => {
    if (categoryFilter !== "all" && e.category !== categoryFilter) return false;
    if (obraFilter !== "all" && e.obra_id !== obraFilter) return false;
    if (employeeFilter !== "all" && e.employee_id !== employeeFilter) return false;
    if (todayOnly && e.entry_date !== today) return false;
    return true;
  }), [entries, categoryFilter, obraFilter, employeeFilter, todayOnly, today]);

  const total = filtered.reduce((s, e) => s + Number(e.quantity), 0);
  const totalToday = filtered.filter((e) => e.entry_date === today)
    .reduce((s, e) => s + Number(e.quantity), 0);

  const anyFilter = categoryFilter !== "all" || obraFilter !== "all" || employeeFilter !== "all" || todayOnly;
  const clearFilters = () => {
    setCategoryFilter("all");
    setObraFilter("all");
    setEmployeeFilter("all");
    setTodayOnly(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300 bg-clip-text text-2xl font-black tracking-tight text-transparent sm:text-3xl">
            Dashboard de Produção
          </h1>
          <p className="text-sm text-muted-foreground">Últimos {RANGE_DAYS} dias · dados em tempo real</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OverdueToolsAlert />

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-9 w-[180px] border-sky-500/30 bg-slate-900/60"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              {SERVICE_CATEGORIES.map((c) => (
                <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={obraFilter} onValueChange={setObraFilter}>
            <SelectTrigger className="h-9 w-[180px] border-sky-500/30 bg-slate-900/60"><SelectValue placeholder="Obra" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas obras</SelectItem>
              {obras.map((o) => (<SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
            <SelectTrigger className="h-9 w-[180px] border-sky-500/30 bg-slate-900/60"><SelectValue placeholder="Funcionário" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos funcionários</SelectItem>
              {employees.map((e) => (<SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard onClick={clearFilters} active={!anyFilter} icon={<TrendingUp className="h-4 w-4" />} label="Produção total (período)" value={total.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} accent="from-sky-500/20 to-cyan-500/5" />
        <StatCard onClick={() => setTodayOnly((v) => !v)} active={todayOnly} icon={<Activity className="h-4 w-4" />} label="Produção hoje" value={totalToday.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} accent="from-emerald-500/20 to-green-500/5" />
        <StatCard onClick={() => setObraFilter((v) => (v === "all" && obras[0] ? obras[0].id : "all"))} active={obraFilter !== "all"} icon={<HardHat className="h-4 w-4" />} label="Obras ativas" value={obras.length.toString()} accent="from-amber-500/20 to-orange-500/5" />
        <StatCard onClick={() => setEmployeeFilter((v) => (v === "all" && employees[0] ? employees[0].id : "all"))} active={employeeFilter !== "all"} icon={<Users className="h-4 w-4" />} label="Funcionários" value={employees.length.toString()} accent="from-fuchsia-500/20 to-purple-500/5" />
        <StatCard to="/estoque" icon={<Hammer className="h-4 w-4" />} label="Total de ferramentas" value={itemStats.tools.toString()} accent="from-cyan-500/20 to-blue-500/5" />
        <StatCard to="/almoxarifado" icon={<Package className="h-4 w-4" />} label="Materiais em estoque" value={itemStats.materials.toString()} accent="from-lime-500/20 to-emerald-500/5" />
        <StatCard to="/manutencao" icon={<Settings2 className="h-4 w-4" />} label="Itens em manutenção" value={itemStats.maintenance.toString()} accent="from-orange-500/20 to-red-500/5" />
        <StatCard to="/descarte" icon={<Trash2 className="h-4 w-4" />} label="Itens em descarte" value={itemStats.discard.toString()} accent="from-slate-500/20 to-slate-700/5" />
      </div>


      <ErrorBoundary label="Evolução da produção">
        <FuturisticCard title="Evolução da produção por categoria">
          <LineByCategory entries={filtered} categoryFilter={categoryFilter} />
        </FuturisticCard>
      </ErrorBoundary>

      <ErrorBoundary label="Produção por período">
        <FuturisticCard title="Produção por período (diária)">
          <ByPeriod entries={filtered} />
        </FuturisticCard>
      </ErrorBoundary>

      <div className="grid gap-4 lg:grid-cols-3">
        <ErrorBoundary label="Produção por Funcionário">
          <FuturisticCard title="Produção por Funcionário">
            <ByEmployee entries={filtered} employees={employees} />
          </FuturisticCard>
        </ErrorBoundary>
        <ErrorBoundary label="Produção por Obra">
          <FuturisticCard title="Produção por Obra">
            <ByObra entries={filtered} obras={obras} />
          </FuturisticCard>
        </ErrorBoundary>
        <ErrorBoundary label="Produção Geral">
          <FuturisticCard title="Produção Geral (por categoria)">
            <TotalDonut entries={filtered} />
          </FuturisticCard>
        </ErrorBoundary>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
  to,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
  to?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const cls = `relative block w-full overflow-hidden rounded-xl border bg-gradient-to-br ${accent} p-4 text-left backdrop-blur transition hover:border-white/20 hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 ${
    active ? "border-sky-400/70 ring-1 ring-sky-400/40" : "border-white/5"
  }`;
  const inner = (
    <>
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[11px] uppercase tracking-wider">{label}</span>
        <span className="rounded-md bg-white/10 p-1.5 text-foreground">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-black text-foreground">{value}</p>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} aria-pressed={!!active}>
        {inner}
      </button>
    );
  }
  return (
    <Link to={to!} className={cls}>
      {inner}
    </Link>
  );
}

function FuturisticCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="border-white/5 bg-slate-950/70 shadow-[0_0_40px_-15px_rgba(56,189,248,0.35)] backdrop-blur">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold tracking-wide text-sky-300/90">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-64 sm:h-72">{children}</CardContent>
    </Card>
  );
}

// Barras por período (produção diária dos últimos 30 dias)
function ByPeriod({ entries }: { entries: Entry[] }) {
  const days = eachDayOfInterval({ start: subDays(new Date(), RANGE_DAYS - 1), end: new Date() });
  const data = days.map((d) => {
    const key = format(d, "yyyy-MM-dd");
    return {
      date: format(d, "dd/MM", { locale: ptBR }),
      total: entries.filter((e) => e.entry_date === key).reduce((s, e) => s + Number(e.quantity), 0),
    };
  });
  if (data.every((d) => d.total === 0)) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <defs>
          <linearGradient id="gradPeriodo" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.35} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="date" stroke="#64748b" fontSize={10} interval="preserveStartEnd" />
        <YAxis stroke="#64748b" fontSize={11} width={40} />
        <Tooltip contentStyle={{ background: "#020617", border: "1px solid #1e293b", borderRadius: 8 }} />
        <Bar dataKey="total" name="Produção" fill="url(#gradPeriodo)" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function LineByCategory({ entries, categoryFilter }: { entries: Entry[]; categoryFilter: string }) {
  const days = eachDayOfInterval({ start: subDays(new Date(), RANGE_DAYS - 1), end: new Date() });
  const cats = categoryFilter === "all"
    ? Array.from(new Set(entries.map((e) => e.category)))
    : [categoryFilter];

  const data = days.map((d) => {
    const key = format(d, "yyyy-MM-dd");
    const row: Record<string, number | string> = { date: format(d, "dd/MM", { locale: ptBR }) };
    for (const cat of cats) {
      row[cat] = entries
        .filter((e) => e.entry_date === key && e.category === cat)
        .reduce((s, e) => s + Number(e.quantity), 0);
    }
    return row;
  });

  if (cats.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <defs>
          <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#0f2233" />
        <XAxis dataKey="date" stroke="#7dd3fc" fontSize={10} tickLine={false} axisLine={{ stroke: "#164e63" }} interval="preserveStartEnd" />
        <YAxis stroke="#7dd3fc" fontSize={10} width={40} tickLine={false} axisLine={{ stroke: "#164e63" }} />
        <Tooltip contentStyle={{ background: "rgba(2,6,23,0.92)", border: "1px solid #22d3ee55", borderRadius: 10, boxShadow: "0 0 24px -6px #22d3ee" }} />
        <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => categoryLabel(String(v))} />
        {cats.map((cat) => (
          <Line
            key={cat}
            type="monotone"
            dataKey={cat}
            stroke={categoryColor(cat)}
            strokeWidth={2.5}
            filter="url(#neonGlow)"
            dot={{ r: 2.5, strokeWidth: 0, fill: categoryColor(cat) }}
            activeDot={{ r: 6, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function ByEmployee({ entries, employees }: { entries: Entry[]; employees: { id: string; name: string }[] }) {
  const map = new Map<string, number>();
  for (const e of entries) {
    if (!e.employee_id) continue;
    map.set(e.employee_id, (map.get(e.employee_id) ?? 0) + Number(e.quantity));
  }
  const data = [...map.entries()]
    .map(([id, total]) => ({ name: employees.find((x) => x.id === id)?.name ?? "—", total }))
    .sort((a, b) => b.total - a.total).slice(0, 8);
  if (data.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis type="number" stroke="#64748b" fontSize={11} />
        <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} width={90} />
        <Tooltip contentStyle={{ background: "#020617", border: "1px solid #1e293b", borderRadius: 8 }} />
        <Bar dataKey="total" fill="url(#gradEmp)" radius={[0, 6, 6, 0]} />
        <defs>
          <linearGradient id="gradEmp" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
        </defs>
      </BarChart>
    </ResponsiveContainer>
  );
}

function ByObra({ entries, obras }: { entries: Entry[]; obras: { id: string; name: string }[] }) {
  const map = new Map<string, number>();
  for (const e of entries) {
    if (!e.obra_id) continue;
    map.set(e.obra_id, (map.get(e.obra_id) ?? 0) + Number(e.quantity));
  }
  const data = [...map.entries()]
    .map(([id, total]) => ({ name: obras.find((x) => x.id === id)?.name ?? "—", total }))
    .sort((a, b) => b.total - a.total).slice(0, 8);
  if (data.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} interval={0} angle={-20} textAnchor="end" height={60} />
        <YAxis stroke="#64748b" fontSize={11} />
        <Tooltip contentStyle={{ background: "#020617", border: "1px solid #1e293b", borderRadius: 8 }} />
        <Bar dataKey="total" fill="url(#gradObra)" radius={[6, 6, 0, 0]} />
        <defs>
          <linearGradient id="gradObra" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#eab308" />
          </linearGradient>
        </defs>
      </BarChart>
    </ResponsiveContainer>
  );
}

function TotalDonut({ entries }: { entries: Entry[] }) {
  const map = new Map<string, number>();
  for (const e of entries) {
    map.set(e.category, (map.get(e.category) ?? 0) + Number(e.quantity));
  }
  const data = [...map.entries()].map(([category, value]) => ({
    name: categoryLabel(category), value, color: categoryColor(category),
  }));
  if (data.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Pie>
        <Tooltip contentStyle={{ background: "#020617", border: "1px solid #1e293b", borderRadius: 8 }} />
        <Legend wrapperStyle={{ fontSize: 10 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Sem dados no período. Lance produções em <b className="ml-1 text-foreground">Produção</b>.
    </div>
  );
}

// unused but kept exported for potential future formatting
export const _unit = (u: Unit) => UNIT_LABEL[u];
