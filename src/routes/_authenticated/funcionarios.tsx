import { buildWaLink } from "@/lib/whatsapp-link";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, MessageCircle, Power, Briefcase, Pencil, Printer, FileSpreadsheet, Link2 } from "lucide-react";
import { downloadXls, xlsTable, xlsSectionHeader } from "@/lib/html-xls";
import { toast } from "sonner";
import { EMPLOYEE_ROLES, roleLabel, type EmployeeRoleKey } from "@/lib/roles";
import { useConfirmDelete } from "@/components/password-gate";

export const Route = createFileRoute("/_authenticated/funcionarios")({
  head: () => ({
    meta: [
      { title: "Funcionários — BS TOOLS" },
      { name: "description", content: "Gestão de funcionários, links individuais e jornadas." },
      { property: "og:title", content: "Funcionários — BS TOOLS" },
      { property: "og:description", content: "Gestão de funcionários, links individuais e jornadas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FuncionariosPage,
});

type Employee = {
  id: string; name: string; phone: string | null;
  token: string; active: boolean; created_at: string;
  role: string | null; role_other: string | null;
};

function FuncionariosPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate({ from: "/funcionarios" });
  const { isAdmin } = useIsAdmin();
  const qc = useQueryClient();
  const askDelete = useConfirmDelete();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dlgOpen, setDlgOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; phone: string; role: EmployeeRoleKey; role_other: string }>({
    name: "", phone: "", role: "pedreiro", role_other: "",
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees").select("*").order("name");
      if (error) throw error;
      return data as Employee[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Nome é obrigatório");
      const { error } = await supabase.from("employees").insert({
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        role: form.role,
        role_other: form.role === "outros" ? (form.role_other.trim() || null) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      setDlgOpen(false);
      setForm({ name: "", phone: "", role: "pedreiro", role_other: "" });
      toast.success("Funcionário criado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async (emp: Employee) => {
      const { error } = await supabase.from("employees")
        .update({ active: !emp.active }).eq("id", emp.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });

  const [editEmp, setEditEmp] = useState<Employee | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; phone: string; role: EmployeeRoleKey; role_other: string }>({
    name: "", phone: "", role: "pedreiro", role_other: "",
  });

  const openEdit = (emp: Employee) => {
    setEditEmp(emp);
    setEditForm({
      name: emp.name,
      phone: emp.phone ?? "",
      role: (emp.role as EmployeeRoleKey) ?? "pedreiro",
      role_other: emp.role_other ?? "",
    });
  };

  const saveEdit = useMutation({
    mutationFn: async () => {
      if (!editEmp) return;
      if (!editForm.name.trim()) throw new Error("Nome é obrigatório");
      const { error } = await supabase.from("employees").update({
        name: editForm.name.trim(),
        phone: editForm.phone.trim() || null,
        role: editForm.role,
        role_other: editForm.role === "outros" ? (editForm.role_other.trim() || null) : null,
      }).eq("id", editEmp.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      setEditEmp(null);
      toast.success("Dados atualizados — histórico preservado");
    },
    onError: (e: Error) => toast.error(e.message),
  });




  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employees").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      setSelectedId(null);
      toast.success("Removido");
    },
  });

  const currentId = selectedId ?? employees[0]?.id;

  if (pathname !== "/funcionarios" && pathname !== "/funcionarios/") return <Outlet />;

  // Relatório de jornada (30 dias): horas trabalhadas e extras por funcionário (8h/dia).
  const buildJourneyReport = async () => {
    const to = new Date();
    const from = new Date(to.getTime() - 29 * 86400000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const rows: (string | number)[][] = [];
    const totals: (string | number)[][] = [];
    for (const emp of employees) {
      const { data } = await (supabase as any).rpc("employee_journey_summary", {
        _employee_id: emp.id, _from: fmt(from), _to: fmt(to),
      });
      const days = (data ?? []) as { day: string; worked_hours: number; regular_hours: number; extra_hours: number }[];
      let w = 0, r = 0, x = 0;
      for (const d of days) {
        w += Number(d.worked_hours) || 0; r += Number(d.regular_hours) || 0; x += Number(d.extra_hours) || 0;
        rows.push([
          emp.name,
          new Date(`${d.day}T12:00:00`).toLocaleDateString("pt-BR"),
          (Number(d.worked_hours) || 0).toFixed(2),
          (Number(d.regular_hours) || 0).toFixed(2),
          (Number(d.extra_hours) || 0).toFixed(2),
          (Number(d.extra_hours) || 0) > 0 ? "Extra" : "Normal",
        ]);
      }
      totals.push([emp.name, roleLabel(emp.role, emp.role_other), w.toFixed(2), r.toFixed(2), x.toFixed(2)]);
    }
    return {
      period: `${from.toLocaleDateString("pt-BR")} a ${to.toLocaleDateString("pt-BR")}`,
      rows, totals,
    };
  };

  const exportJourneyXls = async () => {
    const t = toast.loading("Gerando planilha...");
    try {
      const { period, rows, totals } = await buildJourneyReport();
      downloadXls(
        `Funcionarios Jornada ${period}`,
        xlsSectionHeader(`Resumo por funcionário — ${period} (jornada padrão 8h/dia)`) +
        xlsTable(["Funcionário", "Cargo", "Horas trabalhadas", "Horas normais", "Horas extras"], totals) +
        xlsSectionHeader("Detalhamento diário") +
        xlsTable(["Funcionário", "Data", "Horas trabalhadas", "Horas normais", "Horas extras", "Status"], rows),
      );
      toast.success("Planilha gerada", { id: t });
    } catch (e: any) { toast.error(e?.message ?? "Erro", { id: t }); }
  };

  const printJourney = async () => {
    const t = toast.loading("Preparando impressão...");
    try {
      const { period, rows, totals } = await buildJourneyReport();
      const tbl = (headers: string[], data: (string | number)[][]) =>
        `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${
          data.length ? data.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")
            : `<tr><td colspan="${headers.length}">Sem registros</td></tr>`
        }</tbody></table>`;
      const html = `<html><head><meta charset="utf-8"><title>Jornada</title><style>
body{font-family:Arial,sans-serif;padding:24px;color:#111}h1{font-size:20px;margin:0}h2{font-size:14px;margin:18px 0 6px}
table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #999;padding:5px 7px;text-align:left}
th{background:#f3f4f6;text-transform:uppercase;font-size:10px}</style></head><body>
<h1>Funcionários — Horas trabalhadas e extras</h1><p>${period} · jornada padrão 8h/dia</p>
<h2>Resumo por funcionário</h2>${tbl(["Funcionário", "Cargo", "Horas trabalhadas", "Horas normais", "Horas extras"], totals)}
<h2>Detalhamento diário</h2>${tbl(["Funcionário", "Data", "Horas trabalhadas", "Horas normais", "Horas extras", "Status"], rows)}
</body></html>`;
      const w = window.open("", "_blank");
      if (!w) throw new Error("Bloqueado pelo navegador");
      w.document.write(html); w.document.close(); w.focus();
      setTimeout(() => w.print(), 400);
      toast.success("Pronto", { id: t });
    } catch (e: any) { toast.error(e?.message ?? "Erro", { id: t }); }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Funcionários</h1>
          <p className="text-sm text-muted-foreground">Cadastro e gestão da equipe.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={printJourney}><Printer className="mr-2 h-4 w-4" />Imprimir</Button>
        <Button variant="outline" onClick={exportJourneyXls}><FileSpreadsheet className="mr-2 h-4 w-4" />Planilha Excel</Button>
        {isAdmin && (
          <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Novo</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo funcionário</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
                <div><Label>Telefone (WhatsApp)</Label><Input placeholder="55119..." value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
                <div>
                  <Label>Cargo</Label>
                  <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v as EmployeeRoleKey }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EMPLOYEE_ROLES.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {form.role === "outros" && (
                  <div>
                    <Label>Especifique o cargo</Label>
                    <Input value={form.role_other} onChange={(e) => setForm((f) => ({ ...f, role_other: e.target.value }))} placeholder="Ex.: Pintor de faixa" />
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button onClick={() => create.mutate()} disabled={!form.name.trim() || create.isPending}>Criar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        </div>
      </div>


      {employees.length === 0 ? (
        <p className="rounded-md border bg-card p-6 text-center text-sm text-muted-foreground">Nenhum funcionário cadastrado.</p>
      ) : (
        <Tabs value={currentId} onValueChange={setSelectedId}>
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
            {employees.map((e) => (
              <TabsTrigger
                key={e.id}
                value={e.id}
                onClick={() => navigate({ to: "/funcionarios/$id", params: { id: e.id } })}
                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                {e.name}{!e.active && " (off)"}
              </TabsTrigger>
            ))}
          </TabsList>

          {employees.map((emp) => (
            <TabsContent key={emp.id} value={emp.id} className="mt-4">
              <EmployeePanel
                employee={emp}
                isAdmin={isAdmin}
                onEdit={() => openEdit(emp)}
                onToggle={() => toggleActive.mutate(emp)}
                onDelete={() => askDelete(`Remover ${emp.name} e seus registros?`, () => remove.mutate(emp.id))}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}

      <Dialog open={!!editEmp} onOpenChange={(o) => !o && setEditEmp(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar funcionário</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>Telefone (WhatsApp)</Label><Input placeholder="55119..." value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} /></div>
            <div>
              <Label>Cargo</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm((f) => ({ ...f, role: v as EmployeeRoleKey }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EMPLOYEE_ROLES.map((r) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {editForm.role === "outros" && (
              <div>
                <Label>Especifique o cargo</Label>
                <Input value={editForm.role_other} onChange={(e) => setEditForm((f) => ({ ...f, role_other: e.target.value }))} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => saveEdit.mutate()} disabled={!editForm.name.trim() || saveEdit.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmployeePanel({ employee, isAdmin, onEdit, onToggle, onDelete }: {
  employee: Employee; isAdmin: boolean; onEdit: () => void; onToggle: () => void; onDelete: () => void;
}) {
  const whats = employee.phone ? buildWaLink(employee.phone) : null;
  const pontoLink = `${window.location.origin}/ponto?u=${employee.token}`;
  const copyLink = () => {
    navigator.clipboard?.writeText(pontoLink).then(
      () => toast.success("Link de ponto copiado!"),
      () => { window.prompt("Copie o link de ponto:", pontoLink); },
    );
  };
  const sendWhats = () => {
    const msg = `Olá ${employee.name}! Seu link individual de ponto: ${pontoLink}`;
    const phone = employee.phone?.replace(/\D/g, "");
    window.open(phone ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}` : `https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Link to="/funcionarios/$id" params={{ id: employee.id }} className="text-lg font-semibold text-primary hover:underline">
              {employee.name}
            </Link>
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-sky-400">
              <Briefcase className="h-3 w-3" />{roleLabel(employee.role, employee.role_other)}
            </p>
            {whats ? (
              <a href={whats} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1 text-sm text-emerald-500 hover:underline">
                <MessageCircle className="h-4 w-4" />{employee.phone}
              </a>
            ) : (
              <p className="text-sm text-muted-foreground">Sem telefone</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={copyLink}><Link2 className="mr-1 h-3 w-3" />Link de ponto</Button>
            {employee.phone && (
              <Button size="sm" variant="outline" className="text-emerald-500" onClick={sendWhats}>
                <MessageCircle className="mr-1 h-3 w-3" />Enviar link
              </Button>
            )}
            {isAdmin && (
              <>
                <Button size="sm" variant="outline" onClick={onEdit}><Pencil className="mr-1 h-3 w-3" />Editar</Button>
                <Button size="sm" variant="outline" onClick={onToggle}><Power className="mr-1 h-3 w-3" />{employee.active ? "Desativar" : "Ativar"}</Button>
                <Button size="sm" variant="destructive" onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
