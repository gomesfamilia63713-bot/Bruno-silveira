import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Trash2, Minus, Plus } from "lucide-react";
import { discardUnits, type DiscardSource } from "@/lib/discard";
import { bumpInventory } from "@/lib/inventory-store";

export interface DiscardTarget extends DiscardSource {
  available: number;
  caracteristicas?: string | null;
  unit?: string | null;
}

/** Diálogo de descarte unitário: abate apenas a quantidade escolhida (padrão 1). */
export function DiscardUnitDialog({
  target, onClose, onDone,
}: { target: DiscardTarget | null; onClose: () => void; onDone: () => void }) {
  const [qty, setQty] = useState("1");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setQty("1"); setNotes(""); }, [target?.itemId, target?.obraId]);

  if (!target) return null;
  const max = Number(target.available) || 0;
  const parsed = Number(String(qty).replace(",", ".")) || 0;
  const step = (n: number) => setQty(String(Math.min(Math.max(parsed + n, 0), max)));

  const confirm = async () => {
    setSaving(true);
    try {
      const res = await discardUnits(target, parsed, notes);
      toast.success(`${res.discarded} ${target.unit ?? "un"} de "${target.name}" enviado(s) para Descarte`);
      bumpInventory();
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao descartar");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-amber-500" /> Descarte unitário
          </DialogTitle>
          <DialogDescription>
            {target.name}
            {target.obraName ? ` · obra: ${target.obraName}` : " · Estoque Central"}
            {target.responsavel && target.responsavel !== "—" ? ` · ${target.responsavel}` : ""}
            {` · disponível: ${max} ${target.unit ?? "un"}`}
          </DialogDescription>
          {target.caracteristicas?.trim() && <p className="break-words text-xs font-medium text-primary">{target.caracteristicas}</p>}
        </DialogHeader>

        <div className="grid gap-3 py-1">
          <div className="grid gap-1.5">
            <Label>Quantidade a descartar</Label>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" className="h-9 w-9"
                      onClick={() => step(-1)} disabled={parsed <= 0}><Minus className="h-4 w-4" /></Button>
              <Input inputMode="decimal" className="text-center" value={qty}
                     onChange={(e) => setQty(e.target.value)} />
              <Button type="button" variant="outline" size="icon" className="h-9 w-9"
                      onClick={() => step(1)} disabled={parsed >= max}><Plus className="h-4 w-4" /></Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Somente esta quantidade é abatida do estoque — o restante continua disponível.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label>Motivo (opcional)</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                      placeholder="Ex.: disco quebrado durante o corte" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={confirm} disabled={saving || parsed <= 0 || parsed > max}
                  className="bg-amber-600 hover:bg-amber-600/90">
            {saving ? "Descartando…" : "Confirmar descarte"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
