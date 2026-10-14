import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowUpFromLine, Minus, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { bumpInventory } from "@/lib/inventory-store";
import { logAudit } from "@/lib/audit";
import { notifyStockExit } from "@/lib/whatsapp.functions";

export interface StockExitTarget {
  itemId: string;
  name: string;
  caracteristicas?: string | null;
  unit?: string | null;
  available: number;
}

function pad(n: number) { return String(n).padStart(2, "0"); }

/**
 * "Registrar Saída": saída unitária (item por item) do Estoque Central com
 * destino (funcionário obrigatório + obra opcional), data e hora.
 * Baixa imediata via RPC atômica + histórico + auditoria + WhatsApp.
 */
export function StockExitDialog({
  target, onDone, children, disabled,
}: {
  target: StockExitTarget;
  onDone: () => void;
  children?: React.ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState("1");
  const [employeeId, setEmployeeId] = useState("");
  const [obraId, setObraId] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    setQty("1"); setNotes(""); setEmployeeId(""); setObraId("");
    setDate(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
    setTime(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
  }, [open]);

  const { data: employees = [] } = useQuery({
    queryKey: ["employees-active-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("id, name").eq("active", true).order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
    enabled: open,
  });

  const { data: obras = [] } = useQuery({
    queryKey: ["obras-active-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("obras").select("id, name, status").neq("status", "concluida").order("name");
      if (error) throw error;
      return data as { id: string; name: string; status: string }[];
    },
    enabled: open,
  });

  const max = Number(target.available) || 0;
  const parsed = Number(String(qty).replace(",", ".")) || 0;
  const step = (n: number) => setQty(String(Math.min(Math.max(parsed + n, 0), max)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed || parsed <= 0) { toast.error("Quantidade inválida"); return; }
    if (parsed > max) { toast.error(`Saldo insuficiente. Disponível: ${max}`); return; }
    if (!employeeId) { toast.error("Informe o responsável pela saída"); return; }
    if (!obraId) { toast.error("Selecione a obra de destino"); return; }

    const employeeName = employees.find((x) => x.id === employeeId)?.name ?? "—";
    const obraName = obras.find((o) => o.id === obraId)?.name ?? null;
    const quando = date && time ? `${date.split("-").reverse().join("/")} ${time}` : new Date().toLocaleString("pt-BR");
    const detalhe = [
      `saída em ${quando}`,
      `responsável: ${employeeName}`,
      obraName ? `obra: ${obraName}` : "sem obra",
      notes.trim() || null,
    ].filter(Boolean).join(" · ");

    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("handle_movimentacao_estoque", {
        _kind: "retirada",
        _item_id: target.itemId,
        _obra_id: obraId || null,
        _quantity: parsed,
        _employee_id: employeeId,
        _notes: detalhe,
      });
      if (error) throw error;

      await logAudit(
        "stock",
        `Registrar Saída: ${parsed} ${target.unit ?? "un"} de "${target.name}" (${detalhe})`,
        { item_id: target.itemId, obra_id: obraId || null, quantity: parsed },
      );

      void notifyStockExit({
        data: {
          item: target.name,
          quantity: parsed,
          unit: target.unit ?? "un",
          employee: employeeName,
          obra: obraName,
          when: quando,
        },
      }).catch(() => undefined);

      toast.success(`Saída registrada: ${parsed} ${target.unit ?? "un"} de "${target.name}"`);
      bumpInventory();
      onDone();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao registrar saída");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button size="sm" variant="ghost" disabled={disabled}
            className="h-7 px-2 text-xs text-sky-500 hover:text-sky-500" title="Registrar saída">
            <ArrowUpFromLine className="h-3.5 w-3.5" /> Saída Obra
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpFromLine className="h-4 w-4 text-sky-500" /> Registrar Saída para Obra
            </DialogTitle>
            <DialogDescription>
              {target.name} · disponível: {max} {target.unit ?? "un"}
            </DialogDescription>
            {target.caracteristicas?.trim() && <p className="break-words text-xs font-medium text-primary">{target.caracteristicas}</p>}
          </DialogHeader>

          <div className="space-y-1.5">
            <Label>Quantidade ({target.unit ?? "un"}) *</Label>
            <div className="flex items-center gap-2">
              <Button type="button" size="icon" variant="outline" className="h-9 w-9" onClick={() => step(-1)}>
                <Minus className="h-4 w-4" />
              </Button>
              <Input inputMode="decimal" className="text-center" value={qty}
                onChange={(e) => setQty(e.target.value.replace(/[^0-9.,]/g, ""))} autoFocus />
              <Button type="button" size="icon" variant="outline" className="h-9 w-9" onClick={() => step(1)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Responsável (destino) *</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="Selecione o funcionário" /></SelectTrigger>
              <SelectContent>
                {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Obra de destino *</Label>
            <Select value={obraId} onValueChange={setObraId}>
              <SelectTrigger><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
              <SelectContent>
                {obras.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Data da saída</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Hora</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Observação (opcional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Motivo / detalhes da saída" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving || parsed <= 0 || !employeeId || !obraId}>{saving ? "Registrando…" : "Confirmar saída"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
