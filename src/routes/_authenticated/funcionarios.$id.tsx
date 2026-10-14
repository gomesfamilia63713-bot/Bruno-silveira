import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-role";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Save, Trash2, Briefcase, Activity, CalendarClock, Printer, FileSpreadsheet, Camera } from "lucide-react";
import { PunchHistory } from "@/components/punch-history";
import { downloadXls, xlsTable, xlsSectionHeader } from "@/lib/html-xls";
import { toast } from "sonner";
import { EMPLOYEE_ROLES, roleLabel, type EmployeeRoleKey } from "@/lib/roles";
import { categoryLabel } from "@/lib/service-categories";
import { useConfirmDelete } from "@/components/password-gate";

export const Route = createFileRoute("/_authenticated/funcionarios/$id")({
  head: () => ({
    meta: [
      { title: "Ficha do Funcionário — BS TOOLS" },
      { name: "description", content: "Ficha individual com fotos de ponto, jornada e produção." },
      { property: "og:title", content: "Ficha do Funcionário — BS TOOLS" },
      { property: "og:description", content: "Ficha individual com fotos de ponto, jornada e produção." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FichaPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">
      Erro: {error instanceof Error ? error.message : "Não foi possível carregar a ficha."}
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-6 text-sm text-muted-foreground">Funcionário não encontrado.</div>
  ),
});

type Emp = {
  id: string; name: string; phone: string | null; role: string | null;
  role_other: string | null; active: boolean; token: string;
};
type Entry = {
  id: string; entry_date: string; category: string; specification: string | null;
  unit: string; quantity: number; total_value: number;
  effort_unit: string; effort_amount: number; obra_id: string | null;
};
type Participant = {
  id: string; entry_id: string; employee_id: string; valor_individual: number;
  quantity_share: number;
};

function FichaPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { isAdmin } = useIsAdmin();

  const { data: emp } = useQuery({
    queryKey: ["emp", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Emp | null;
    },
  });


  const { data: participations = [] } = useQuery({
    queryKey: ["emp-participations", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("production_entry_participants")
        .select("*").eq("employee_id", id);
      if (error) throw error;
      return (data ?? []) as Participant[];
    },
  });

  const entryIds = useMemo(() => participations.map((p) => p.entry_id), [participations]);
  const { data: entries = [] } = useQuery({
    queryKey: ["emp-entries", id, entryIds.length],
    enabled: entryIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("production_entries")
        .select("*").in("id", entryIds).order("entry_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
  });

  const { data: obras = [] } = useQuery({
    queryKey: ["obras-min"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("obras").select("id,name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const obraName = useMemo(() => {
    const m = new Map<string, string>();
    obras.forEach((o) => m.set(o.id, o.name));
    return (id: string | null) => (id && m.get(id)) || "—";
  }, [obras]);

  const productionByUnit = useMemo(() => {
    const totals = { m3: 0, m2: 0, m: 0 };
    const participantByEntry = new Map(participations.map((participant) => [participant.entry_id, participant]));
    entries.forEach((entry) => {
      const unit = normalizeUnit(entry.unit);
      if (!(unit in totals)) return;
      const participant = participantByEntry.get(entry.id);
      const share = Number(participant?.quantity_share ?? entry.quantity ?? 0);
      totals[unit as keyof typeof totals] += share;
    });
    return totals;
  }, [entries, participations]);

  const quantityShare = useMemo(() => {
    const map = new Map<string, number>();
    participations.forEach((participant) => map.set(participant.entry_id, Number(participant.quantity_share ?? 0)));
    return map;
  }, [participations]);




  if (!emp) {
    return <p className="p-6 text-sm text-muted-foreground">Carregando…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/funcionarios"><ArrowLeft className="mr-1 h-4 w-4" />Voltar</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span>{emp.name}</span>
            <span className="inline-flex items-center gap-1 text-xs text-sky-400">
              <Briefcase className="h-3 w-3" />{roleLabel(emp.role, emp.role_other)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DadosForm emp={emp} isAdmin={isAdmin} onSaved={() => qc.invalidateQueries({ queryKey: ["emp", id] })} />
        </CardContent>
      </Card>

      <Tabs defaultValue="pontos">
        <TabsList>
          <TabsTrigger value="pontos"><Camera className="mr-1 h-3 w-3" />Pontos & Fotos</TabsTrigger>
          <TabsTrigger value="jornada"><CalendarClock className="mr-1 h-3 w-3" />Jornada</TabsTrigger>
          <TabsTrigger value="prod"><Activity className="mr-1 h-3 w-3" />Produções ({entries.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pontos" className="mt-3">
          <PunchHistory employeeId={id} />
        </TabsContent>

        <TabsContent value="jornada" className="mt-3">
          <JornadaCard employeeId={id} empName={emp.name} />
        </TabsContent>


        <TabsContent value="prod" className="mt-3">
          <div className="mb-3 grid gap-3 sm:grid-cols-3">
            {(["m3", "m2", "m"] as const).map((unit) => (
              <Card key={unit}>
                <CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Produção acumulada</p>
                  <p className="mt-1 font-mono text-2xl font-bold text-primary">
                    {productionByUnit[unit].toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {unitLabel(unit)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
          {entries.length === 0 ? (
            <p className="rounded border bg-card p-6 text-center text-sm text-muted-foreground">Nenhuma produção lançada.</p>
          ) : (
            <div className="rounded border bg-card overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-left">Obra</th>
                    <th className="px-3 py-2 text-left">Serviço</th>
                    <th className="px-3 py-2 text-right">Quantidade</th>
                    {isAdmin && <th className="px-3 py-2 text-right">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <ProdRow key={e.id} entry={e} quantity={quantityShare.get(e.id) ?? Number(e.quantity)} obraLabel={obraName(e.obra_id)} isAdmin={isAdmin} />
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted/30 text-sm font-semibold">
                  {(["m3", "m2", "m"] as const).map((unit) => (
                    <tr key={unit}>
                      <td colSpan={3} className="px-3 py-2 text-right">Total em {unitLabel(unit)}</td>
                      <td className="px-3 py-2 text-right font-mono text-emerald-400">
                        {productionByUnit[unit].toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {unitLabel(unit)}
                      </td>
                      {isAdmin && <td />}
                    </tr>
                  ))}
                </tfoot>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DadosForm({ emp, isAdmin, onSaved }: { emp: Emp; isAdmin: boolean; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: emp.name, phone: emp.phone ?? "",
    role: (emp.role ?? "pedreiro") as EmployeeRoleKey,
    role_other: emp.role_other ?? "",
  });
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("employees").update({
        name: form.name.trim(), phone: form.phone.trim() || null,
        role: form.role, role_other: form.role === "outros" ? (form.role_other.trim() || null) : null,
      }).eq("id", emp.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Salvo"); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div><Label>Nome</Label><Input disabled={!isAdmin} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
      <div><Label>Telefone</Label><Input disabled={!isAdmin} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
      <div>
        <Label>Cargo</Label>
        <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as EmployeeRoleKey }))} disabled={!isAdmin}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{EMPLOYEE_ROLES.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {form.role === "outros" && (
        <div><Label>Especifique</Label><Input disabled={!isAdmin} value={form.role_other} onChange={(e) => setForm((f) => ({ ...f, role_other: e.target.value }))} /></div>
      )}
      {isAdmin && (
        <div className="sm:col-span-2 flex justify-end">
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            <Save className="mr-1 h-3 w-3" />Salvar dados
          </Button>
        </div>
      )}
    </div>
  );
}

function JornadaCard({ employeeId, empName }: { employeeId: string; empName: string }) {
  const qc = useQueryClient();
  const [from, setFrom] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 29); return isoDate(d);
  });
  const [to, setTo] = useState<string>(() => isoDate(new Date()));

  const { data, isLoading, error } = useQuery({
    queryKey: ["jornada", employeeId, from, to],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("employee_journey_summary", {
        _employee_id: employeeId, _from: from, _to: to,
      });
      if (error) throw error;
      return (data ?? []) as JornadaRow[];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`jornada-${employeeId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "time_punches", filter: `employee_id=eq.${employeeId}` },
        () => qc.invalidateQueries({ queryKey: ["jornada", employeeId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [employeeId, qc]);

  const totals = (data ?? []).reduce(
    (acc, r) => {
      acc.worked += Number(r.worked_hours);
      acc.regular += Number(r.regular_hours);
      acc.extra += Number(r.extra_hours);
      return acc;
    },
    { worked: 0, regular: 0, extra: 0 },
  );

  const rows = data ?? [];

  const exportXls = () => {
    downloadXls(
      `Jornada_${empName}_${from}_a_${to}`,
      xlsSectionHeader(`${empName} — ${new Date(from + "T00:00").toLocaleDateString("pt-BR")} a ${new Date(to + "T00:00").toLocaleDateString("pt-BR")}`) +
        xlsTable(
          ["Data", "Horas Trabalhadas", "Horas Normais", "Horas Extras", "Status"],
          rows.map((r) => [
            new Date(r.day + "T00:00").toLocaleDateString("pt-BR"),
            fmtHM(Number(r.worked_hours)),
            fmtHM(Number(r.regular_hours)),
            Number(r.extra_hours) > 0 ? fmtHM(Number(r.extra_hours)) : "—",
            Number(r.extra_hours) > 0 ? "Extra" : "Normal",
          ]).concat([[
            "TOTAL", fmtHM(totals.worked), fmtHM(totals.regular), fmtHM(totals.extra),
            `${rows.length} dia(s) trabalhado(s)`,
          ]]),
        ),
    );
  };

  const printSheet = () => {
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { toast.error("Permita pop-ups para imprimir"); return; }
    const body = rows.map((r) => `<tr>
        <td>${new Date(r.day + "T00:00").toLocaleDateString("pt-BR")}</td>
        <td style="text-align:right">${fmtHM(Number(r.worked_hours))}</td>
        <td style="text-align:right">${fmtHM(Number(r.regular_hours))}</td>
        <td style="text-align:right">${Number(r.extra_hours) > 0 ? fmtHM(Number(r.extra_hours)) : "—"}</td>
        <td style="text-align:right">${Number(r.extra_hours) > 0 ? "Extra" : "Normal"}</td>
      </tr>`).join("");
    w.document.write(`<html><head><meta charset="utf-8"><title>Ficha — ${empName}</title>
      <style>body{font-family:Arial,sans-serif;color:#000;padding:24px}
      h1{font-size:18px;margin:0 0 2px}p{font-size:12px;color:#444;margin:0 0 12px}
      table{border-collapse:collapse;width:100%;font-size:12px}
      th,td{border:1px solid #999;padding:6px}th{background:#eee;text-align:left}
      tfoot td{font-weight:bold;background:#f5f5f5}</style></head><body>
      <h1>Ficha de Jornada — ${empName}</h1>
      <p>Período: ${new Date(from + "T00:00").toLocaleDateString("pt-BR")} a ${new Date(to + "T00:00").toLocaleDateString("pt-BR")} • Jornada padrão: 8h/dia</p>
      <table><thead><tr><th>Data</th><th style="text-align:right">Trabalhadas</th><th style="text-align:right">Normais</th><th style="text-align:right">Extras</th><th style="text-align:right">Status</th></tr></thead>
      <tbody>${body || '<tr><td colspan="5">Sem registros</td></tr>'}</tbody>
      <tfoot><tr><td>Total (${rows.length} dias)</td><td style="text-align:right">${fmtHM(totals.worked)}</td><td style="text-align:right">${fmtHM(totals.regular)}</td><td style="text-align:right">${fmtHM(totals.extra)}</td><td></td></tr></tfoot>
      </table></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4" />Resumo de Jornada
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="default" className="flex-1 min-w-[150px]" onClick={printSheet}>
            <Printer className="mr-1.5 h-4 w-4" />Imprimir Ficha
          </Button>
          <Button size="sm" variant="secondary" className="flex-1 min-w-[150px]" onClick={exportXls}>
            <FileSpreadsheet className="mr-1.5 h-4 w-4" />Gerar Planilha Excel
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="sm:col-span-2 flex flex-wrap items-end gap-1">
            {[7, 30, 90].map((n) => (
              <Button key={n} variant="outline" size="sm" onClick={() => {
                const d = new Date(); d.setDate(d.getDate() - (n - 1));
                setFrom(isoDate(d)); setTo(isoDate(new Date()));
              }}>{n}d</Button>
            ))}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-4">
          <div className="rounded-md border bg-card p-3">
            <p className="text-[10px] uppercase text-muted-foreground">Total do período</p>
            <p className="font-mono text-lg font-bold">{fmtHM(totals.worked)}</p>
          </div>
          <div className="rounded-md border bg-card p-3">
            <p className="text-[10px] uppercase text-muted-foreground">Convertido</p>
            <p className="font-mono text-sm font-bold">{fmtDaysExtra(totals.worked)}</p>
          </div>
          <div className="rounded-md border bg-card p-3">
            <p className="text-[10px] uppercase text-muted-foreground">Horas normais</p>
            <p className="font-mono text-lg font-bold text-emerald-400">{fmtHM(totals.regular)}</p>
          </div>
          <div className="rounded-md border bg-card p-3">
            <p className="text-[10px] uppercase text-muted-foreground">Total de extras</p>
            <p className="font-mono text-lg font-bold text-amber-400">{fmtHM(totals.extra)}</p>
          </div>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

        {data && (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-left">Data</th>
                  <th className="p-2 text-right">Horas Trabalhadas</th>
                  <th className="p-2 text-right">Extras</th>
                  <th className="p-2 text-right">Status</th>
                  <th className="p-2 text-right">Total do Dia</th>
                </tr>
              </thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Sem registros no período.</td></tr>
                ) : data.map((r) => {
                  const worked = Number(r.worked_hours);
                  const extra = Number(r.extra_hours);
                  return (
                    <tr key={r.day} className="border-t">
                      <td className="p-2">{new Date(r.day + "T00:00").toLocaleDateString("pt-BR")}</td>
                      <td className="p-2 text-right font-mono">{fmtHM(worked)}</td>
                      <td className="p-2 text-right font-mono text-amber-400">{extra > 0 ? fmtHM(extra) : "—"}</td>
                      <td className="p-2 text-right">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${extra > 0 ? "bg-amber-500 text-black" : "bg-emerald-500 text-white"}`}>
                          {extra > 0 ? "Extra" : "Normal"}
                        </span>
                      </td>
                      <td className="p-2 text-right font-mono font-semibold">{fmtDaysExtra(worked)}</td>
                    </tr>
                  );
                })}
              </tbody>
              {data.length > 0 && (
                <tfoot className="bg-muted/30 font-semibold">
                  <tr className="border-t">
                    <td className="p-2">Total Geral</td>
                    <td className="p-2 text-right font-mono">{fmtHM(totals.worked)}</td>
                    <td className="p-2 text-right font-mono text-amber-400">{fmtHM(totals.extra)}</td>
                    <td className="p-2"></td>
                    <td className="p-2 text-right font-mono">{fmtDaysExtra(totals.worked)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type JornadaRow = {
  day: string; worked_hours: number; regular_hours: number; extra_hours: number;
};

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtHM(hours: number) {
  const total = Math.round((Number(hours) || 0) * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

function fmtDaysExtra(hours: number) {
  const days = (Number(hours) || 0) / 8;
  return `${days.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} dia(s)`;
}

function normalizeUnit(unit: string | null | undefined) {
  const u = (unit ?? "").toLowerCase().replace(/\s/g, "");
  if (["m2", "m²", "metro2", "metroquadrado"].includes(u)) return "m2";
  if (["m3", "m³", "metro3", "metrocubico", "metrocúbico"].includes(u)) return "m3";
  if (["m", "metro", "metros", "metrolinear"].includes(u)) return "m";
  return u;
}

function unitLabel(unit: "m3" | "m2" | "m") {
  return unit === "m3" ? "m³" : unit === "m2" ? "m²" : "m";
}

function ProdRow({ entry, quantity, obraLabel, isAdmin }: { entry: Entry; quantity: number; obraLabel: string; isAdmin: boolean }) {
  const qc = useQueryClient();
  const askDelete = useConfirmDelete();
  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("production_entries").delete().eq("id", entry.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lançamento removido");
      qc.invalidateQueries({ queryKey: ["emp-entries"] });
      qc.invalidateQueries({ queryKey: ["emp-participations"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao remover"),
  });

  return (
    <tr className="border-t">
      <td className="px-3 py-2">{new Date(entry.entry_date + "T00:00").toLocaleDateString("pt-BR")}</td>
      <td className="px-3 py-2">{obraLabel}</td>
      <td className="px-3 py-2">
        {categoryLabel(entry.category)}
        {entry.specification ? <span className="text-muted-foreground"> — {entry.specification}</span> : null}
      </td>
      <td className="px-3 py-2 text-right font-mono">
        {Number(quantity || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {entry.unit}
      </td>
      {isAdmin && (
        <td className="px-3 py-2 text-right">
          <Button size="sm" variant="destructive" disabled={del.isPending}
            onClick={() => askDelete("Excluir lançamento?", () => del.mutate())}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </td>
      )}
    </tr>
  );
}
