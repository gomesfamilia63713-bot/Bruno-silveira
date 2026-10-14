import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Image as ImageIcon } from "lucide-react";

export interface ItemDetail {
  id: string;
  name: string;
  codigo?: string | null;
  category?: string | null;
  caracteristicas?: string | null;
  condition?: string | null;
  unit?: string | null;
  quantity?: number | null;
  price?: number | null;
  location?: string | null;
  notes?: string | null;
  image_url?: string | null;
  responsavel?: string | null;
  obra?: string | null;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/50 py-1.5 last:border-0">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium break-words">{value ?? "—"}</span>
    </div>
  );
}

/** Modal de especificações completas + foto ampliada do item. */
export function ItemDetailDialog({ item, children }: { item: ItemDetail; children: React.ReactNode }) {
  const [zoom, setZoom] = useState(false);
  const brl = (n: number | null | undefined) =>
    n == null ? "—" : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="break-words">{item.name}</DialogTitle>
          {item.caracteristicas?.trim() && <p className="break-words text-xs font-medium text-primary">{item.caracteristicas}</p>}
          <DialogDescription>
            {item.codigo ? `Código ${item.codigo}` : "Sem código"} · Especificações completas
          </DialogDescription>
        </DialogHeader>

        <div
          className={`overflow-hidden rounded-xl border bg-muted/30 ${item.image_url ? "cursor-zoom-in" : ""}`}
          onClick={() => item.image_url && setZoom((z) => !z)}
        >
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={item.name}
              className={`w-full ${zoom ? "max-h-none" : "max-h-72"} object-contain`}
            />
          ) : (
            <div className="flex h-40 w-full items-center justify-center text-muted-foreground">
              <ImageIcon className="h-8 w-8" />
            </div>
          )}
        </div>

        <div className="mt-1">
          <Row label="Categoria" value={item.category || "—"} />
          <Row label="Características" value={item.caracteristicas || "—"} />
          <Row
            label="Estado"
            value={item.condition ? <Badge variant="outline">{item.condition}</Badge> : "—"}
          />
          <Row label="Quantidade" value={`${item.quantity ?? 0} ${item.unit || "un"}`} />
          <Row label="Preço unitário" value={brl(item.price)} />
          <Row label="Localização" value={item.obra || item.location || "Estoque Central"} />
          {item.responsavel && <Row label="Responsável" value={item.responsavel} />}
          {item.notes && <Row label="Observações" value={item.notes} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
