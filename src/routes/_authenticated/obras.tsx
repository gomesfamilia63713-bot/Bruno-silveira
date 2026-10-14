import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, HardHat, MapPin, ArrowUpFromLine, ChevronRight, Check, ChevronsUpDown, FileText, Printer, FileSpreadsheet, ArrowRightLeft } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useConfirmDelete } from "@/components/password-gate";
import { cn } from "@/lib/utils";
import { downloadXls, xlsTable, xlsSectionHeader } from "@/lib/html-xls";
import { bumpInventory } from "@/lib/inventory-store";
import { MochilasPanel } from "@/components/mochilas-panel";

export const Route = createFileRoute("/_authenticated/obras")({
  head: () => ({
    meta: [
      { title: "Obras — BS TOOLS" },
      { name: "description", content: "Gestão de obras, insumos e recursos alocados." },
      { property: "og:title", content: "Obras — BS TOOLS" },
      { property: "og:description", content: "Gestão de obras, insumos e recursos alocados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ObrasPage,
});

type Obra = {
  id: string;
  name: string;
  status: string;
  notes: string | null;
  free_notes: string | null;
  created_at: string;
};

type ItemLite = { id: string; name: string; quantity: number; unit: string; kind: "tool" | "material"; category: string | null; caracteristicas: string | null };

type AllocRow = {
  id: string;
  obra_id: string;
  item_id: string;
  quantity: number;
  notes: string | null;
  created_at: string;
  item: { name: string; unit: string; kind: string; price: number | null; codigo: string | null; caracteristicas: string | null } | null;
};

type ExtraRow = {
  id: string;
  obra_id: string;
  name: string;
  quantity: number;
  unit: string;
  notes: string | null;
  price: number | null;
  created_at: string;
  purchase_date: string | null;
};

type ExtraGroup = {
  key: string;
  name: string;
  unit: string;
  totalQty: number;
  price: number | null;
  rows: ExtraRow[];
};

function groupExtras(extras: ExtraRow[]): ExtraGroup[] {
  const map = new Map<string, ExtraGroup>();
  for (const x of extras) {
    const key = `${x.name.trim().toLowerCase()}|${x.unit}`;
    const g = map.get(key);
    if (g) {
      g.totalQty += Number(x.quantity) || 0;
      g.rows.push(x);
      if (g.price == null && x.price != null) g.price = Number(x.price);
    } else {
      map.set(key, {
        key,
        name: x.name,
        unit: x.unit,
        totalQty: Number(x.quantity) || 0,
        price: x.price != null ? Number(x.price) : null,
        rows: [x],
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

function fmtBRL(n: number) {
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const STATUSES = [
  { value: "andamento", label: "Em andamento" },
  { value: "pausada", label: "Pausada" },
  { value: "concluida", label: "Concluída" },
];

const STATUS_LABEL: Record<string, string> = {
  andamento: "Em andamento", pausada: "Pausada", concluida: "Concluída",
};

const UNITS = ["un", "kg", "g", "m", "cm", "m2", "m3", "L", "saco", "cx"];

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function printObra(obra: Obra, allocs: AllocRow[], extras: ExtraRow[]) {
  const tools = allocs.filter((a) => a.item?.kind === "tool");
  const materials = allocs.filter((a) => a.item?.kind === "material");
  const now = new Date();
  const rowsHtml = (rows: AllocRow[]) => rows.length === 0
    ? `<tr><td colspan="3" style="color:#666;font-style:italic;padding:8px">Nenhum item.</td></tr>`
    : rows.map((a) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd">${escapeHtml(a.item?.name ?? "(removido)")}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right">${a.quantity} ${escapeHtml(a.item?.unit ?? "un")}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd;color:#555">${escapeHtml(a.notes ?? "")}</td>
      </tr>`).join("");
  const extrasHtml = extras.length === 0
    ? `<tr><td colspan="3" style="color:#666;font-style:italic;padding:8px">Nenhum item.</td></tr>`
    : extras.map((x) => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd">${escapeHtml(x.name)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right">${x.quantity} ${escapeHtml(x.unit)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd;color:#555">${escapeHtml(x.notes ?? "")}</td>
      </tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(obra.name)}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;color:#000;padding:24px;max-width:780px;margin:auto}
h1{margin:0 0 4px;font-size:22px}h2{margin:18px 0 6px;font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:#333;border-bottom:2px solid #000;padding-bottom:4px}
table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;padding:6px 8px;border-bottom:2px solid #000;background:#f5f5f5;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
.meta{color:#444;font-size:12px;margin-bottom:14px}.notes{white-space:pre-wrap;border:1px solid #ccc;padding:10px;border-radius:4px;font-size:13px;background:#fafafa}
@media print{body{padding:0}}</style></head>
<body>
<h1>${escapeHtml(obra.name)}</h1>
<div class="meta">Status: ${escapeHtml(STATUS_LABEL[obra.status] ?? obra.status)} • Impresso em ${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</div>
${obra.notes ? `<div class="notes">${escapeHtml(obra.notes)}</div>` : ""}
<h2>🔧 Ferramentas</h2>
<table><thead><tr><th>Ferramenta</th><th style="text-align:right;width:120px">Qtd</th><th style="width:35%">Obs.</th></tr></thead><tbody>${rowsHtml(tools)}</tbody></table>
<h2>📦 Materiais (do estoque)</h2>
<table><thead><tr><th>Material</th><th style="text-align:right;width:120px">Qtd</th><th style="width:35%">Obs.</th></tr></thead><tbody>${rowsHtml(materials)}</tbody></table>
<h2>🧱 Comprados à parte</h2>
<table><thead><tr><th>Item</th><th style="text-align:right;width:120px">Qtd</th><th style="width:35%">Obs.</th></tr></thead><tbody>${extrasHtml}</tbody></table>
${obra.free_notes ? `<h2>📝 Anotações</h2><div class="notes">${escapeHtml(obra.free_notes)}</div>` : ""}
<script>window.onload=()=>{window.print();}</script>
</body></html>`;
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) { toast.error("Permita pop-ups para imprimir"); return; }
  w.document.write(html);
  w.document.close();
}

function printOrcamento(obra: Obra, allocs: AllocRow[], extras: ExtraRow[]) {
  const materials = allocs.filter((a) => a.item?.kind === "material");
  const groups = groupExtras(extras);
  const now = new Date();

  const stockRows = materials.map((a) => {
    const price = a.item?.price != null ? Number(a.item.price) : null;
    const sub = price != null ? price * Number(a.quantity) : null;
    return `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #ddd">${escapeHtml(a.item?.name ?? "(removido)")}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right">${a.quantity} ${escapeHtml(a.item?.unit ?? "un")}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right">${price != null ? fmtBRL(price) : "—"}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right;font-weight:600">${sub != null ? fmtBRL(sub) : "—"}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="4" style="color:#666;font-style:italic;padding:8px">Nenhum material do estoque.</td></tr>`;

  const extraRows = groups.map((g) => {
    const sub = g.price != null ? g.price * g.totalQty : null;
    return `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #ddd">${escapeHtml(g.name)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right">${g.totalQty} ${escapeHtml(g.unit)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right">${g.price != null ? fmtBRL(g.price) : "—"}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right;font-weight:600">${sub != null ? fmtBRL(sub) : "—"}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="4" style="color:#666;font-style:italic;padding:8px">Nenhum item comprado à parte.</td></tr>`;

  const totalStock = materials.reduce((s, a) => s + (a.item?.price != null ? Number(a.item.price) * Number(a.quantity) : 0), 0);
  const totalExtras = groups.reduce((s, g) => s + (g.price != null ? g.price * g.totalQty : 0), 0);
  const total = totalStock + totalExtras;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Orçamento — ${escapeHtml(obra.name)}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;color:#000;padding:24px;max-width:820px;margin:auto}
h1{margin:0 0 4px;font-size:22px}h2{margin:18px 0 6px;font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:#333;border-bottom:2px solid #000;padding-bottom:4px}
table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;padding:6px 8px;border-bottom:2px solid #000;background:#f5f5f5;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
.meta{color:#444;font-size:12px;margin-bottom:14px}
.totals{margin-top:18px;border-top:2px solid #000;padding-top:10px;font-size:13px}
.totals .row{display:flex;justify-content:space-between;padding:3px 0}
.totals .grand{font-size:16px;font-weight:700;border-top:1px solid #000;margin-top:6px;padding-top:6px}
@media print{body{padding:0}}</style></head>
<body>
<h1>Orçamento — ${escapeHtml(obra.name)}</h1>
<div class="meta">Status: ${escapeHtml(STATUS_LABEL[obra.status] ?? obra.status)} • Gerado em ${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</div>
<h2>📦 Materiais do estoque</h2>
<table><thead><tr><th>Material</th><th style="text-align:right;width:110px">Qtd</th><th style="text-align:right;width:110px">Preço</th><th style="text-align:right;width:130px">Subtotal</th></tr></thead><tbody>${stockRows}</tbody></table>
<h2>🧱 Comprados à parte</h2>
<table><thead><tr><th>Item</th><th style="text-align:right;width:110px">Qtd</th><th style="text-align:right;width:110px">Preço</th><th style="text-align:right;width:130px">Subtotal</th></tr></thead><tbody>${extraRows}</tbody></table>
<div class="totals">
  <div class="row"><span>Subtotal materiais do estoque</span><span>${fmtBRL(totalStock)}</span></div>
  <div class="row"><span>Subtotal comprados à parte</span><span>${fmtBRL(totalExtras)}</span></div>
  <div class="row grand"><span>TOTAL DA OBRA</span><span>${fmtBRL(total)}</span></div>
</div>
<script>window.onload=()=>{window.print();}</script>
</body></html>`;
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) { toast.error("Permita pop-ups para imprimir"); return; }
  w.document.write(html);
  w.document.close();
}

async function exportAllObrasXls(obras: Obra[]) {
  if (obras.length === 0) { toast.info("Nenhuma obra"); return; }
  const ids = obras.map((o) => o.id);
  const [allocsRes, extrasRes] = await Promise.all([
    supabase.from("obra_items").select("id, obra_id, item_id, quantity, notes, created_at, item:items(name, unit, kind, price, codigo, caracteristicas)").in("obra_id", ids),
    supabase.from("obra_extras").select("id, obra_id, name, quantity, unit, notes, price, created_at, purchase_date").in("obra_id", ids),
  ]);
  if (allocsRes.error || extrasRes.error) { toast.error("Erro ao carregar"); return; }
  const allAllocs = (allocsRes.data ?? []) as unknown as AllocRow[];
  const allExtras = (extrasRes.data ?? []) as ExtraRow[];
  let html = "";
  for (const o of obras) {
    const allocs = allAllocs.filter((a) => a.obra_id === o.id);
    const extras = allExtras.filter((x) => x.obra_id === o.id);
    html += obraXlsBlock(o, allocs, extras);
  }
  downloadXls("Obras — BS TOOLS", html);
}

function obraXlsBlock(obra: Obra, allocs: AllocRow[], extras: ExtraRow[]) {
  const fmt = (n: number | null | undefined) => n != null ? `R$ ${Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "";
  const tools = allocs.filter((a) => a.item?.kind === "tool");
  const materials = allocs.filter((a) => a.item?.kind === "material");
  const groups = groupExtras(extras);
  let html = xlsSectionHeader(`🏗️ ${obra.name} — ${STATUS_LABEL[obra.status] ?? obra.status}`);
  html += xlsTable(["Ferramenta", "Qtd", "Un", "Obs"], tools.map((a) => [a.item?.name ?? "(removido)", a.quantity, a.item?.unit ?? "un", a.notes ?? ""]));
  const matRows = materials.map((a) => {
    const price = a.item?.price != null ? Number(a.item.price) : null;
    const sub = price != null ? price * Number(a.quantity) : null;
    return [a.item?.name ?? "(removido)", a.quantity, a.item?.unit ?? "un", fmt(price), fmt(sub), a.notes ?? ""];
  });
  html += xlsTable(["Material (estoque)", "Qtd", "Un", "Preço", "Subtotal", "Obs"], matRows);
  const extRows = groups.map((g) => {
    const sub = g.price != null ? g.price * g.totalQty : null;
    return [g.name, g.totalQty, g.unit, fmt(g.price), fmt(sub)];
  });
  html += xlsTable(["Comprado à parte", "Qtd", "Un", "Preço", "Subtotal"], extRows);
  const totalStock = materials.reduce((s, a) => s + (a.item?.price != null ? Number(a.item.price) * Number(a.quantity) : 0), 0);
  const totalExtras = groups.reduce((s, g) => s + (g.price != null ? g.price * g.totalQty : 0), 0);
  html += `<p style="font-weight:bold;text-align:right;margin:6px 0 18px">Subtotal estoque: ${fmt(totalStock)} • Subtotal à parte: ${fmt(totalExtras)} • <span style="font-size:14px">TOTAL: ${fmt(totalStock + totalExtras)}</span></p>`;
  return html;
}


function ObrasPage() {
  const qc = useQueryClient();
  const [openObra, setOpenObra] = useState<Obra | null>(null);

  const { data: obras = [], isLoading } = useQuery({
    queryKey: ["obras"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("obras")
        .select("id, name, status, notes, free_notes, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Obra[];
    },
  });

  const { data: counts = {} } = useQuery({
    queryKey: ["obra-counts", obras.map((o) => o.id).join(",")],
    queryFn: async () => {
      if (obras.length === 0) return {} as Record<string, number>;
      const { data, error } = await supabase
        .from("obra_items")
        .select("obra_id")
        .in("obra_id", obras.map((o) => o.id));
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of data ?? []) {
        if (!r.obra_id) continue;
        map[r.obra_id] = (map[r.obra_id] ?? 0) + 1;
      }
      return map;
    },
    enabled: obras.length > 0,
  });

  // "Concluir" = apenas UPDATE de status. Devolução automática de itens continua a cargo da RPC de finalização em outro fluxo.
  const finishObra = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("obras").update({ status: "concluida" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["obras"] });
      toast.success("Obra concluída");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const reopenObra = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("obras").update({ status: "andamento" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["obras"] }); toast.success("Obra reaberta"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const openObraFresh = openObra ? obras.find((o) => o.id === openObra.id) ?? openObra : null;

  const andamento = obras.filter((o) => o.status !== "concluida");
  const concluidas = obras.filter((o) => o.status === "concluida");

  const renderList = (list: Obra[], concluded: boolean) => (
    list.length === 0 ? (
      <div className="rounded-xl border border-dashed bg-card/50 p-10 text-center">
        <HardHat className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-3 font-medium">{concluded ? "Nenhuma obra concluída" : "Nenhuma obra em andamento"}</p>
      </div>
    ) : (
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 text-left font-semibold">Obra</th>
              <th className="px-3 py-2 text-left font-semibold">Status</th>
              <th className="px-3 py-2 text-right font-semibold">Itens</th>
              <th className="hidden px-3 py-2 text-left font-semibold sm:table-cell">Observações</th>
              <th className="px-3 py-2 text-right font-semibold">Ações</th>
            </tr>
          </thead>
          <tbody>
            {list.map((obra) => (
              <tr key={obra.id} className="border-b last:border-0 transition-colors hover:bg-muted/30">
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setOpenObra(obra)}
                    className="flex items-center gap-1 text-left font-medium hover:text-primary hover:underline"
                  >
                    {obra.name}
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </td>
                <td className="px-3 py-2"><StatusBadge status={obra.status} /></td>
                <td className="px-3 py-2 text-right tabular-nums">{counts[obra.id] ?? 0}</td>
                <td className="hidden max-w-[280px] truncate px-3 py-2 text-xs text-muted-foreground sm:table-cell">
                  {obra.notes ?? "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  {concluded ? (
                    <Button size="sm" variant="outline" onClick={() => reopenObra.mutate(obra.id)}>Reabrir</Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => finishObra.mutate(obra.id)}>
                      <Check className="h-3.5 w-3.5" /> Concluir
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">Obras</h1>
          <p className="text-sm text-muted-foreground">Gerencie obras em andamento, ferramentas, materiais e anotações.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => exportAllObrasXls(obras)}>
            <FileSpreadsheet className="h-4 w-4" /> Planilha
          </Button>
          <ObraDialog onSaved={() => qc.invalidateQueries({ queryKey: ["obras"] })}>
            <Button><Plus className="h-4 w-4" /> Nova obra</Button>
          </ObraDialog>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <Tabs defaultValue="andamento" className="space-y-4">
          <TabsList>
            <TabsTrigger value="andamento">Em andamento ({andamento.length})</TabsTrigger>
            <TabsTrigger value="concluidas">Concluídas ({concluidas.length})</TabsTrigger>
            <TabsTrigger value="mochilas">Mochilas</TabsTrigger>
          </TabsList>
          <TabsContent value="andamento">{renderList(andamento, false)}</TabsContent>
          <TabsContent value="concluidas">{renderList(concluidas, true)}</TabsContent>
          <TabsContent value="mochilas"><MochilasPanel /></TabsContent>
        </Tabs>
      )}

      {openObraFresh && (
        <ObraDetailDialog
          obra={openObraFresh}
          obras={obras}
          onClose={() => setOpenObra(null)}
          onChanged={() => {
            qc.invalidateQueries({ queryKey: ["obras"] });
            qc.invalidateQueries({ queryKey: ["obra-counts"] });
          }}
        />
      )}
    </div>
  );
}



function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    andamento: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    pausada: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    concluida: "bg-muted text-muted-foreground border-border",
  };
  const labels: Record<string, string> = { andamento: "Em andamento", pausada: "Pausada", concluida: "Concluída" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${map[status] ?? ""}`}>
      {labels[status] ?? status}
    </span>
  );
}

function ObraDialog({ children, obra, onSaved }: { children: React.ReactNode; obra?: Obra; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(obra?.name ?? "");
  const [status, setStatus] = useState(obra?.status ?? "andamento");
  const [notes, setNotes] = useState(obra?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { name: name.trim(), status, notes: notes.trim() || null };
      if (obra) {
        const wasFinal = obra.status === "concluida";
        const willFinalize = status === "concluida" && !wasFinal;
        if (willFinalize) {
          if (!confirm("Ao finalizar a obra, TODOS os itens alocados serão devolvidos automaticamente ao Estoque Central. Confirmar?")) {
            setSaving(false); return;
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: rpcErr } = await (supabase.rpc as any)("finalize_obra", { _obra_id: obra.id });
          if (rpcErr) throw rpcErr;
          // Update name/notes only (status already set by RPC)
          const { error } = await supabase.from("obras").update({ name: payload.name, notes: payload.notes }).eq("id", obra.id);
          if (error) throw error;
          bumpInventory();
          toast.success("Obra finalizada e itens devolvidos ao estoque");
        } else {
          const { error } = await supabase.from("obras").update(payload).eq("id", obra.id);
          if (error) throw error;
          toast.success("Obra atualizada");
        }
      } else {
        const { error } = await supabase.from("obras").insert({ ...payload, created_by: user?.id });
        if (error) throw error;
        toast.success("Obra criada");
        setName(""); setStatus("andamento"); setNotes("");
      }
      onSaved();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{obra ? "Editar obra" : "Nova obra"}</DialogTitle>
            <DialogDescription>Cadastre a obra para alocar ferramentas e materiais.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ex.: Casa Rua das Flores" />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Endereço, responsável, prazo..." />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving || !name.trim()}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ObraDetailDialog({ obra, obras, onClose, onChanged }: { obra: Obra; obras: Obra[]; onClose: () => void; onChanged: () => void }) {
  const qc = useQueryClient();
  const askDelete = useConfirmDelete();

  const { data: allocs = [], isLoading } = useQuery({
    queryKey: ["obra_items", obra.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("obra_items")
        .select("id, obra_id, item_id, quantity, notes, created_at, item:items(name, unit, kind, price, codigo, caracteristicas)")
        .eq("obra_id", obra.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as AllocRow[];
    },
  });

  const { data: extras = [] } = useQuery({
    queryKey: ["obra_extras", obra.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("obra_extras")
        .select("id, obra_id, name, quantity, unit, notes, price, created_at, purchase_date")
        .eq("obra_id", obra.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ExtraRow[];
    },
  });

  const [returning, setReturning] = useState<AllocRow | null>(null);
  const doReturn = async (allocId: string, qty: number) => {
    const { error } = await supabase.rpc("return_stock_from_obra_item", {
      _obra_item_id: allocId,
      _quantity: qty,
    });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["obra_items", obra.id] });
    qc.invalidateQueries({ queryKey: ["items"] });
    qc.invalidateQueries({ queryKey: ["items-in-use"] });
    qc.invalidateQueries({ queryKey: ["movements"] });
    bumpInventory();
    toast.success(qty > 0 ? `Devolvidas ${qty} un ao estoque` : "Alocação removida");
    setReturning(null);
  };

  const removeExtra = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("obra_extras").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["obra_extras", obra.id] }); toast.success("Removido"); },
  });

  // Free notes (autosaved with debounce)
  const [freeNotes, setFreeNotes] = useState(obra.free_notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  useEffect(() => { setFreeNotes(obra.free_notes ?? ""); }, [obra.id, obra.free_notes]);

  useEffect(() => {
    if (freeNotes === (obra.free_notes ?? "")) return;
    const t = setTimeout(async () => {
      setSavingNotes(true);
      const { error } = await supabase.from("obras").update({ free_notes: freeNotes }).eq("id", obra.id);
      setSavingNotes(false);
      if (error) toast.error("Erro ao salvar anotações");
      else { qc.invalidateQueries({ queryKey: ["obras"] }); }
    }, 800);
    return () => clearTimeout(t);
  }, [freeNotes, obra.id, obra.free_notes, qc]);

  const tools = allocs.filter((a) => a.item?.kind === "tool");
  const materials = allocs.filter((a) => a.item?.kind === "material");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" /> {obra.name}</DialogTitle>
              <DialogDescription>
                <StatusBadge status={obra.status} />
              </DialogDescription>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => printOrcamento(obra, allocs, extras)} title="Imprimir orçamento (só materiais)">
                <FileText className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => printObra(obra, allocs, extras)} title="Imprimir obra completa">
                <Printer className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => downloadXls(`Obra ${obra.name}`, obraXlsBlock(obra, allocs, extras))} title="Planilha (Excel/Word)">
                <FileSpreadsheet className="h-4 w-4" />
              </Button>
              <ObraDialog obra={obra} onSaved={onChanged}>
                <Button size="sm" variant="ghost"><Pencil className="h-4 w-4" /></Button>
              </ObraDialog>
              <TransferObraDialog obra={obra} obras={obras} onTransferred={() => { onChanged(); onClose(); }} />
            </div>
          </div>
        </DialogHeader>

        {obra.notes && (
          <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground whitespace-pre-wrap">{obra.notes}</p>
        )}

        {/* Tools */}
        <div className="flex items-center justify-between pt-2">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">🔧 Ferramentas</h4>
          <AllocDialog obra={obra} kind="tool" onSaved={() => { qc.invalidateQueries({ queryKey: ["obra_items"] }); qc.invalidateQueries({ queryKey: ["items"] }); onChanged(); }}>
            <Button size="sm" variant="outline"><Plus className="h-4 w-4" /> Alocar</Button>
          </AllocDialog>
        </div>
        {isLoading ? null : tools.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma ferramenta alocada.</p>
        ) : (
          <div className="space-y-2">
            {tools.map((a) => (
              <AllocCard key={a.id} a={a} onRemove={() => setReturning(a)} />
            ))}
          </div>
        )}

        {/* Materials from stock */}
        <div className="flex items-center justify-between pt-2">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">📦 Materiais (do estoque)</h4>
          <AllocDialog obra={obra} kind="material" onSaved={() => { qc.invalidateQueries({ queryKey: ["obra_items"] }); qc.invalidateQueries({ queryKey: ["items"] }); onChanged(); }}>
            <Button size="sm" variant="outline"><Plus className="h-4 w-4" /> Alocar</Button>
          </AllocDialog>
        </div>
        {materials.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum material alocado do estoque.</p>
        ) : (
          <div className="space-y-2">
            {materials.map((a) => (
              <AllocCard key={a.id} a={a} editable onRemove={() => setReturning(a)} onChanged={() => { qc.invalidateQueries({ queryKey: ["obra_items", obra.id] }); qc.invalidateQueries({ queryKey: ["items"] }); }} />
            ))}
          </div>
        )}

        {/* Extras (comprados separados) */}
        <div className="flex items-center justify-between pt-2">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">🧱 Insumos e materiais da obra</h4>
          <ExtraDialog obra={obra} onSaved={() => qc.invalidateQueries({ queryKey: ["obra_extras", obra.id] })}>
            <Button size="sm" variant="outline"><Plus className="h-4 w-4" /> Adicionar</Button>
          </ExtraDialog>
        </div>
        {extras.length === 0 ? (
            <p className="text-xs text-muted-foreground">Registre tijolo, cimento, ferragens e outros insumos. Cada lançamento permanece no histórico.</p>
        ) : (
          <div className="space-y-2">
            {groupExtras(extras).map((g) => (
              <div key={g.key} className="rounded-md border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{g.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Total: <span className="font-medium text-foreground">{g.totalQty} {g.unit}</span>
                      {g.price != null && <> • {fmtBRL(g.price)} / {g.unit} • Subtotal: <span className="font-medium text-foreground">{fmtBRL(g.price * g.totalQty)}</span></>}
                      {g.rows.length > 1 && <> • {g.rows.length} compras</>}
                    </p>
                  </div>
                </div>
                <div className="mt-2 space-y-1 border-t pt-2">
                  <p className="pb-1 text-[10px] font-semibold uppercase text-muted-foreground">Histórico semanal</p>
                  {g.rows.map((x) => (
                    <div key={x.id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">
                        +{x.quantity} {x.unit}
                        {x.price != null && <> • {fmtBRL(Number(x.price))}</>}
                        {" • Semana de "}{new Date(x.purchase_date ? `${x.purchase_date}T00:00:00` : x.created_at).toLocaleDateString("pt-BR")}
                        {" • Registrado em "}{new Date(x.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                        {x.notes && <span className="ml-1 italic">• {x.notes}</span>}
                      </span>
                      <div className="flex gap-1">
                        <ExtraDialog obra={obra} extra={x} onSaved={() => qc.invalidateQueries({ queryKey: ["obra_extras", obra.id] })}>
                          <Button size="sm" variant="ghost" className="h-6 px-2"><Pencil className="h-3 w-3" /></Button>
                        </ExtraDialog>
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-destructive" onClick={() => askDelete("Remover esta compra?", () => removeExtra.mutate(x.id))}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Free notes */}
        <div className="space-y-1.5 pt-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-muted-foreground"><FileText className="h-4 w-4" /> Anotações da obra</Label>
            <span className="text-[10px] text-muted-foreground">{savingNotes ? "Salvando..." : "Salvo automaticamente"}</span>
          </div>
          <Textarea
            value={freeNotes}
            onChange={(e) => setFreeNotes(e.target.value)}
            rows={6}
            placeholder="Escreva o que precisar: pedidos pendentes, telefones, andamento, próximos passos..."
            className="resize-y"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Alocar gera saída no estoque. Devolver um item retorna a quantidade ao estoque automaticamente. Ver{" "}
          <Link to="/" className="underline">Estoque</Link> ou <Link to="/almoxarifado" className="underline">Almoxarifado</Link>.
        </p>
      </DialogContent>
      {returning && (
        <ReturnAllocDialog
          alloc={returning}
          onClose={() => setReturning(null)}
          onConfirm={(qty) => doReturn(returning.id, qty)}
        />
      )}
    </Dialog>
  );
}

function TransferObraDialog({ obra, obras, onTransferred }: { obra: Obra; obras: Obra[]; onTransferred: () => void }) {
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState("__central");
  const [saving, setSaving] = useState(false);
  const destinations = obras.filter((candidate) => candidate.id !== obra.id && candidate.status !== "concluida");

  const transfer = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("transfer_obra_resources", {
        _source_obra_id: obra.id,
        _target_obra_id: targetId === "__central" ? undefined : targetId,
      });
      if (error) throw error;
      bumpInventory();
      toast.success(`${data ?? 0} recurso(s) transferido(s)`);
      setOpen(false);
      onTransferred();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível transferir os recursos");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><ArrowRightLeft className="h-4 w-4" /> Transferir</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transferir recursos da obra</DialogTitle>
          <DialogDescription>Todos os itens de {obra.name} serão movidos e registrados no histórico.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Destino</Label>
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__central">Estoque Central</SelectItem>
              {destinations.map((candidate) => <SelectItem key={candidate.id} value={candidate.id}>{candidate.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={transfer} disabled={saving}><ArrowRightLeft className="h-4 w-4" /> {saving ? "Transferindo…" : "Confirmar transferência"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReturnAllocDialog({ alloc, onClose, onConfirm }: {
  alloc: AllocRow; onClose: () => void; onConfirm: (qty: number) => void | Promise<void>;
}) {
  const max = Number(alloc.quantity) || 0;
  const [qty, setQty] = useState(String(max));
  const [saving, setSaving] = useState(false);
  const n = Number(qty);
  const invalid = !Number.isFinite(n) || n < 0 || n > max;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid) return;
    setSaving(true);
    try { await onConfirm(n); } finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Devolver ao estoque</DialogTitle>
            <DialogDescription>
              {alloc.item?.name} — alocado: <b>{max} {alloc.item?.unit || "un"}</b>. Quanto está voltando para o estoque?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Quantidade a devolver</Label>
            <Input type="number" min={0} max={max} step="any" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus />
            <p className="text-[11px] text-muted-foreground">Digite 0 se todo o material foi consumido / perdido.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={invalid || saving}>{saving ? "Devolvendo..." : "Confirmar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


function AllocCard({ a, onRemove, editable, onChanged }: { a: AllocRow; onRemove: () => void; editable?: boolean; onChanged?: () => void }) {
  const [price, setPrice] = useState(a.item?.price != null ? String(a.item.price) : "");
  useEffect(() => { setPrice(a.item?.price != null ? String(a.item.price) : ""); }, [a.item?.price]);
  const savePrice = async () => {
    if (!a.item_id) return;
    const parsed = price.trim() === "" ? null : parseFloat(price.replace(",", "."));
    if (parsed != null && Number.isNaN(parsed)) { toast.error("Preço inválido"); return; }
    if ((a.item?.price ?? null) === parsed) return;
    const { error } = await supabase.from("items").update({ price: parsed }).eq("id", a.item_id);
    if (error) { toast.error(error.message); return; }
    toast.success("Preço atualizado");
    onChanged?.();
  };
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-card p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {a.item?.codigo && <span className="mr-2 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{a.item.codigo}</span>}
          {a.item?.name ?? "Item removido"}
        </p>
        {a.item?.caracteristicas?.trim() && <p className="break-words text-xs font-medium text-primary">{a.item.caracteristicas}</p>}
        <p className="text-xs text-muted-foreground">
          {a.quantity} {a.item?.unit || "un"}
          {a.notes && ` • ${a.notes}`}
        </p>
        {editable && (
          <div className="mt-2 flex items-center gap-2">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Preço un.</Label>
            <Input
              type="number" step="0.01" min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              onBlur={savePrice}
              placeholder="0,00"
              className="h-7 w-24 text-xs"
            />
            <span className="text-[10px] text-muted-foreground">R$</span>
          </div>
        )}
      </div>
      <Button size="sm" variant="ghost" className="text-destructive" onClick={onRemove}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ExtraDialog({ children, obra, onSaved, extra }: { children: React.ReactNode; obra: Obra; onSaved: () => void; extra?: ExtraRow }) {
  const today = new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(extra?.name ?? "");
  const [qty, setQty] = useState(extra ? String(extra.quantity) : "1");
  const [unit, setUnit] = useState(extra?.unit ?? "saco");
  const [price, setPrice] = useState(extra?.price != null ? String(extra.price) : "");
  const [notes, setNotes] = useState(extra?.notes ?? "");
  const [purchaseDate, setPurchaseDate] = useState(extra?.purchase_date ?? today);
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();
  const qtyRef = useRef<HTMLInputElement>(null);
  const commonMaterials = ["Tijolo", "Cimento", "Ferragens", "Areia", "Brita"];

  const chooseMaterial = (value: string) => {
    setName(value);
    window.setTimeout(() => qtyRef.current?.focus(), 0);
  };

  useEffect(() => {
    if (open && extra) {
      setName(extra.name); setQty(String(extra.quantity)); setUnit(extra.unit);
      setPrice(extra.price != null ? String(extra.price) : ""); setNotes(extra.notes ?? "");
      setPurchaseDate(extra.purchase_date ?? today);
    }
  }, [open, extra, today]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Informe o nome"); return; }
    setSaving(true);
    try {
      const parsedPrice = price.trim() === "" ? null : (parseFloat(price.replace(",", ".")) || null);
      const payload = {
        name: name.trim(), quantity: parseFloat(qty) || 0, unit,
        price: parsedPrice, notes: notes.trim() || null,
        purchase_date: purchaseDate || null,
      };
      if (extra) {
        const { error } = await supabase.from("obra_extras").update(payload).eq("id", extra.id);
        if (error) throw error;
        toast.success("Atualizado");
      } else {
        const { error } = await supabase.from("obra_extras").insert({ ...payload, obra_id: obra.id, created_by: user?.id });
        if (error) throw error;
        toast.success("Adicionado");
        setName(""); setQty("1"); setUnit("saco"); setPrice(""); setNotes(""); setPurchaseDate(today);
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
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{extra ? "Editar registro" : "Registrar insumo da semana"}</DialogTitle>
            <DialogDescription>Cada novo lançamento fica gravado com data e hora no histórico da obra.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <div className="flex flex-wrap gap-1.5">
              {commonMaterials.map((material) => (
                <Button key={material} type="button" size="sm" variant={name === material ? "secondary" : "outline"} onClick={() => chooseMaterial(material)}>
                  {material}
                </Button>
              ))}
            </div>
            <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); qtyRef.current?.focus(); } }} required placeholder="Outro material..." autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Quantidade</Label>
              <Input ref={qtyRef} type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Unidade</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Preço unitário (R$)</Label>
              <Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label>Data da compra</Label>
              <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Fornecedor, nota fiscal..." />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : (extra ? "Salvar" : "Adicionar")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AllocDialog({ children, obra, kind, onSaved }: { children: React.ReactNode; obra: Obra; kind: "tool" | "material"; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [pickKey, setPickKey] = useState(""); // either item.id (stock) or `alloc:<allocId>`
  const [qty, setQty] = useState("1");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { user } = useAuth();

  const { data: stockItems = [] } = useQuery({
    queryKey: ["items", kind, "positive"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items").select("id, name, quantity, unit, kind, category, caracteristicas")
        .eq("kind", kind).gt("quantity", 0).order("name");
      if (error) throw error;
      return data as ItemLite[];
    },
    enabled: open,
  });

  const { data: otherAllocs = [] } = useQuery({
    queryKey: ["obra_items", "other-obras", obra.id, kind],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("obra_items")
        .select("id, obra_id, item_id, quantity, item:items(id, name, unit, kind, category, caracteristicas), obra:obras(name)")
        .neq("obra_id", obra.id);
      if (error) throw error;
      return (data ?? []).filter((r: any) => r.item?.kind === kind);
    },
    enabled: open,
  });

  type Pick = { key: string; id: string; name: string; quantity: number; unit: string; category: string | null; caracteristicas: string | null; sourceObra?: string; allocId?: string };
  const picks: Pick[] = [
    ...stockItems.map((i) => ({ key: i.id, id: i.id, name: i.name, quantity: i.quantity, unit: i.unit, category: i.category, caracteristicas: i.caracteristicas })),
    ...otherAllocs.map((a: any) => ({
      key: `alloc:${a.id}`, id: a.item_id, name: a.item.name, quantity: Number(a.quantity), unit: a.item.unit, category: a.item.category, caracteristicas: a.item.caracteristicas,
      sourceObra: a.obra?.name as string | undefined, allocId: a.id as string,
    })),
  ];
  const selected = picks.find((p) => p.key === pickKey);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) { toast.error("Selecione um item"); return; }
    const quantity = parseFloat(qty);
    if (!quantity || quantity <= 0) { toast.error("Quantidade inválida"); return; }
    if (quantity > selected.quantity) { toast.error(`Disponível: ${selected.quantity} ${selected.unit}`); return; }
    setSaving(true);
    try {
      if (selected.allocId) {
        // Transferência direta de outra obra → esta obra (sem mexer no estoque)
        const { error } = await supabase
          .from("obra_items")
          .update({ obra_id: obra.id, quantity, notes: notes.trim() || `Transferido de ${selected.sourceObra ?? "outra obra"}` })
          .eq("id", selected.allocId);
        if (error) throw error;
        toast.success(`Transferido de ${selected.sourceObra ?? "outra obra"}`);
      } else {
        const { error } = await supabase.rpc("allocate_stock_to_obra", {
          _item_id: selected.id,
          _obra_id: obra.id,
          _quantity: quantity,
          _notes: notes.trim() || undefined,
        });
        if (error) throw error;
        toast.success("Alocado e baixado do estoque");
      }
      setPickKey(""); setQty("1"); setNotes("");
      onSaved();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Alocar {kind === "tool" ? "ferramenta" : "material"} → {obra.name}</DialogTitle>
            <DialogDescription>Do estoque ou já alocado em outra obra (será transferido automaticamente).</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>{kind === "tool" ? "Ferramenta" : "Material"} *</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" role="combobox" className="w-full justify-between font-normal">
                  {selected ? (
                    <span className="truncate">{selected.name} — {selected.quantity} {selected.unit}{selected.sourceObra ? ` (em ${selected.sourceObra})` : ""}</span>
                  ) : (
                    <span className="text-muted-foreground">{picks.length === 0 ? "Sem itens disponíveis" : "Digite para buscar..."}</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder={`Buscar ${kind === "tool" ? "ferramenta" : "material"}...`} />
                  <CommandList>
                    <CommandEmpty>Nada encontrado.</CommandEmpty>
                    {picks.filter((p) => !p.allocId).length > 0 && (
                      <CommandGroup heading="No estoque">
                        {picks.filter((p) => !p.allocId).map((p) => (
                          <CommandItem key={p.key} value={`${p.name} ${p.caracteristicas ?? ""} ${p.category ?? ""}`}
                            onSelect={() => { setPickKey(p.key); setPickerOpen(false); }}>
                            <Check className={cn("mr-2 h-4 w-4", pickKey === p.key ? "opacity-100" : "opacity-0")} />
                            <span className="min-w-0 flex-1"><span className="block truncate">{p.name}</span>{p.caracteristicas?.trim() && <span className="block break-words text-xs font-medium text-primary">{p.caracteristicas}</span>}</span>
                            <span className="ml-2 text-xs text-muted-foreground">{p.quantity} {p.unit}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                    {picks.filter((p) => p.allocId).length > 0 && (
                      <CommandGroup heading="Em outras obras (transferir)">
                        {picks.filter((p) => p.allocId).map((p) => (
                          <CommandItem key={p.key} value={`${p.name} ${p.caracteristicas ?? ""} ${p.sourceObra ?? ""}`}
                            onSelect={() => { setPickKey(p.key); setQty(String(p.quantity)); setPickerOpen(false); }}>
                            <Check className={cn("mr-2 h-4 w-4", pickKey === p.key ? "opacity-100" : "opacity-0")} />
                            <span className="flex-1 truncate">{p.name} <span className="text-xs text-amber-500">• {p.sourceObra}</span>{p.caracteristicas?.trim() && <span className="block break-words text-xs font-medium text-primary">{p.caracteristicas}</span>}</span>
                            <span className="ml-2 text-xs text-muted-foreground">{p.quantity} {p.unit}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1.5">
            <Label>Quantidade {selected ? `(disponível: ${selected.quantity} ${selected.unit})` : ""} *</Label>
            <Input type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving || !pickKey}>
              <ArrowUpFromLine className="h-4 w-4" />
              {saving ? (selected?.allocId ? "Transferindo..." : "Alocando...") : (selected?.allocId ? "Transferir" : "Alocar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
