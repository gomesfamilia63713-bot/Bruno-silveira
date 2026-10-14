import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Truck, Calendar, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { downloadXls, xlsTable } from "@/lib/html-xls";
import { useConfirmDelete } from "@/components/password-gate";

export const Route = createFileRoute("/_authenticated/locacoes")({
  head: () => ({
    meta: [
      { title: "Locações — BS TOOLS" },
      { name: "description", content: "Equipamentos locados, fornecedores e períodos por obra." },
      { property: "og:title", content: "Locações — BS TOOLS" },
      { property: "og:description", content: "Equipamentos locados, fornecedores e períodos por obra." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LocacoesPage,
});

type Obra = { id: string; name: string };

type Rental = {
  id: string;
  supplier: string;
  item_name: string;
  obra_id: string | null;
  start_at: string;
  end_at: string | null;
  daily_rate: number | null;
  status: string;
  notes: string | null;
  obra: { name: string } | null;
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(s: string): string | null {
  return s ? new Date(s).toISOString() : null;
}

function LocacoesPage() {
  const qc = useQueryClient();
  const askDelete = useConfirmDelete();
  const [filter, setFilter] = useState<"ativa" | "encerrada" | "todas">("ativa");

  const { data: rentals = [], isLoading } = useQuery({
    queryKey: ["rentals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rentals")
        .select("id, supplier, item_name, obra_id, start_at, end_at, daily_rate, status, notes, obra:obras(name)")
        .order("start_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Rental[];
    },
  });

  const closeRental = useMutation({
    mutationFn: async (r: Rental) => {
      const { error } = await supabase.from("rentals")
        .update({ status: "encerrada", end_at: r.end_at ?? new Date().toISOString() })
        .eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rentals"] }); toast.success("Locação encerrada"); },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rentals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rentals"] }); toast.success("Removido"); },
  });

  const visible = rentals.filter((r) => filter === "todas" ? true : r.status === filter);
  const totalAtivas = rentals.filter((r) => r.status === "ativa").length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">Locações</h1>
          <p className="text-sm text-muted-foreground">Equipamentos alugados de fornecedores: betoneira, andaime, escora...</p>
        </div>
        <RentalDialog onSaved={() => qc.invalidateQueries({ queryKey: ["rentals"] })}>
          <Button><Plus className="h-4 w-4" /> Nova locação</Button>
        </RentalDialog>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterBtn active={filter === "ativa"} onClick={() => setFilter("ativa")}>Ativas ({totalAtivas})</FilterBtn>
        <FilterBtn active={filter === "encerrada"} onClick={() => setFilter("encerrada")}>Encerradas</FilterBtn>
        <FilterBtn active={filter === "todas"} onClick={() => setFilter("todas")}>Todas</FilterBtn>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => {
          const fmt = (n: number | null) => n != null ? `R$ ${Number(n).toFixed(2)}` : "";
          const rowsX = visible.map((r) => {
            const start = new Date(r.start_at);
            const end = r.end_at ? new Date(r.end_at) : null;
            const days = end ? Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000)) : Math.max(1, Math.ceil((Date.now() - start.getTime()) / 86400000));
            const cost = r.daily_rate ? r.daily_rate * days : null;
            return [r.item_name, r.supplier, r.obra?.name ?? "", start.toLocaleString("pt-BR"), end ? end.toLocaleString("pt-BR") : "", days, fmt(r.daily_rate), fmt(cost), r.status, r.notes ?? ""];
          });
          const html = xlsTable(["Equipamento", "Fornecedor", "Obra", "Início", "Fim", "Dias", "Diária", "Custo total", "Status", "Obs."], rowsX);
          downloadXls("Locações — BS TOOLS", html);
        }}>
          <FileSpreadsheet className="h-4 w-4" /> Planilha
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card/50 p-10 text-center">
          <Truck className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 font-medium">Nenhuma locação {filter !== "todas" ? filter : ""}</p>
          <p className="mt-1 text-sm text-muted-foreground">Clique em "Nova locação" para começar.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {visible.map((r) => (
            <RentalCard key={r.id} r={r}
              onClose={() => { if (confirm("Encerrar locação?")) closeRental.mutate(r); }}
              onDelete={() => askDelete("Excluir locação?", () => remove.mutate(r.id))}
              onSaved={() => qc.invalidateQueries({ queryKey: ["rentals"] })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}>
      {children}
    </button>
  );
}

function RentalCard({ r, onClose, onDelete, onSaved }: { r: Rental; onClose: () => void; onDelete: () => void; onSaved: () => void }) {
  const start = new Date(r.start_at);
  const end = r.end_at ? new Date(r.end_at) : null;
  const days = end
    ? Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000))
    : Math.max(1, Math.ceil((Date.now() - start.getTime()) / 86400000));
  const cost = r.daily_rate ? r.daily_rate * days : null;

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="truncate font-semibold">{r.item_name}</h3>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
              r.status === "ativa" ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400" : "border-border bg-muted text-muted-foreground"
            }`}>{r.status}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Fornecedor: <span className="text-foreground">{r.supplier}</span>
            {r.obra?.name && <> • Obra: <span className="text-foreground">{r.obra.name}</span></>}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> Início: {start.toLocaleString("pt-BR")}</span>
            {end && <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> Fim: {end.toLocaleString("pt-BR")}</span>}
            <span>• {days} {days === 1 ? "dia" : "dias"}</span>
            {cost !== null && <span>• R$ {cost.toFixed(2)}</span>}
          </p>
          {r.notes && <p className="mt-2 text-xs italic text-muted-foreground/90">{r.notes}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          {r.status === "ativa" && (
            <Button size="sm" variant="ghost" onClick={onClose} title="Encerrar"><CheckCircle2 className="h-4 w-4 text-emerald-500" /></Button>
          )}
          <RentalDialog rental={r} onSaved={onSaved}>
            <Button size="sm" variant="ghost"><Pencil className="h-4 w-4" /></Button>
          </RentalDialog>
          <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}

function RentalDialog({ children, rental, onSaved }: { children: React.ReactNode; rental?: Rental; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [supplier, setSupplier] = useState(rental?.supplier ?? "");
  const [itemName, setItemName] = useState(rental?.item_name ?? "");
  const [obraId, setObraId] = useState<string>(rental?.obra_id ?? "none");
  const [startAt, setStartAt] = useState(toLocalInput(rental?.start_at ?? new Date().toISOString()));
  const [endAt, setEndAt] = useState(toLocalInput(rental?.end_at ?? null));
  const [dailyRate, setDailyRate] = useState(rental?.daily_rate != null ? String(rental.daily_rate) : "");
  const [status, setStatus] = useState(rental?.status ?? "ativa");
  const [notes, setNotes] = useState(rental?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();

  const { data: obras = [] } = useQuery({
    queryKey: ["obras", "lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("obras").select("id, name").order("name");
      if (error) throw error;
      return data as Obra[];
    },
    enabled: open,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        supplier: supplier.trim(),
        item_name: itemName.trim(),
        obra_id: obraId === "none" ? null : obraId,
        start_at: fromLocalInput(startAt) ?? new Date().toISOString(),
        end_at: fromLocalInput(endAt),
        daily_rate: dailyRate.trim() ? parseFloat(dailyRate) : null,
        status,
        notes: notes.trim() || null,
      };
      if (rental) {
        const { error } = await supabase.from("rentals").update(payload).eq("id", rental.id);
        if (error) throw error;
        toast.success("Locação atualizada");
      } else {
        const { error } = await supabase.from("rentals").insert({ ...payload, created_by: user?.id });
        if (error) throw error;
        toast.success("Locação registrada");
      }
      onSaved();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{rental ? "Editar locação" : "Nova locação"}</DialogTitle>
            <DialogDescription>Equipamento alugado de fornecedor (ex.: betoneira, andaime).</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Equipamento *</Label>
              <Input value={itemName} onChange={(e) => setItemName(e.target.value)} required placeholder="Ex.: Betoneira 400L" />
            </div>
            <div className="space-y-1.5">
              <Label>Fornecedor *</Label>
              <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} required placeholder="Nome / empresa" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Obra (destino)</Label>
            <Select value={obraId} onValueChange={setObraId}>
              <SelectTrigger><SelectValue placeholder="Sem obra" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Sem obra —</SelectItem>
                {obras.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Entrada (data/hora) *</Label>
              <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Saída/Devolução (data/hora)</Label>
              <Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Valor diário (R$)</Label>
              <Input type="number" min={0} step="any" value={dailyRate} onChange={(e) => setDailyRate(e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativa">Ativa</SelectItem>
                  <SelectItem value="encerrada">Encerrada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Contato, condição, contrato..." />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving || !supplier.trim() || !itemName.trim()}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
