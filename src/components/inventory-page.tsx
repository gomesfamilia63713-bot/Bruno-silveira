import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { generateItemImage } from "@/lib/generate-item-image.functions";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/use-role";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, ArrowDownToLine, ArrowUpFromLine, Package, Trash2, Pencil, Search, MapPin, Printer, Upload, ImageIcon, Sparkles, FileSpreadsheet, FileUp, LayoutGrid, List, Warehouse, PackageCheck, CircleCheck, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "@tanstack/react-router";
import { exportItemsXlsx, parseItemsXlsx, applyImportedItems } from "@/lib/items-spreadsheet";
import { useRef } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useConfirmDelete } from "@/components/password-gate";
import { bumpInventory, useInventoryStore } from "@/lib/inventory-store";
import { dismissOverdue, restoreOverdue, useOverdueToolDays, OVERDUE_DAYS_LIMIT } from "@/lib/overdue-tools";
import { AlertTriangle, Info } from "lucide-react";
import { ItemDetailDialog } from "@/components/item-detail-dialog";
import { logAudit } from "@/lib/audit";
import { DiscardUnitDialog, type DiscardTarget } from "@/components/discard-unit-dialog";
import { StockExitDialog } from "@/components/stock-exit-dialog";
import { assertItemCodeAvailable, itemSaveError } from "@/lib/item-codes";


export type Item = {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
  condition: string | null;
  notes: string | null;
  kind: "tool" | "material";
  image_url: string | null;
  unit: string;
  price: number | null;
  location: string;
  codigo: string | null;
  caracteristicas: string | null;
  maintenance_exit_justification: string | null;
  discarded_at: string | null;
};

const LOCATIONS = [
  { value: "estoque", label: "Estoque" },
  { value: "casa_bruno", label: "Casa" },
] as const;
type LocationValue = (typeof LOCATIONS)[number]["value"];
const PAUSED_OBRA_VALUE = "__obra_parada__";


const CONDITIONS = ["Novo", "Bom", "Regular", "Manutenção", "Danificado", "Descarte"];
const UNITS = [
  { value: "un", label: "Unidade (un)" },
  { value: "kg", label: "Quilo (kg)" },
  { value: "g", label: "Grama (g)" },
  { value: "m", label: "Metro (m)" },
  { value: "cm", label: "Centímetro (cm)" },
  { value: "m2", label: "Metro² (m²)" },
  { value: "m3", label: "Metro³ (m³)" },
  { value: "L", label: "Litro (L)" },
  { value: "saco", label: "Saco" },
  { value: "cx", label: "Caixa" },
];

export type InventoryConfig = {
  kind: "tool" | "material";
  /** Optional override — when set, the page fetches items whose `kind` is IN this list, ignoring `kind`. */
  kinds?: ("tool" | "material")[];
  title: string;
  subtitle: string;
  unitLabel: string;
  categoryPlaceholder: string;
  itemPlaceholder: string;
  newItemLabel: string;
  showCondition: boolean;
  /** Only show items whose `condition` is in this list (case-insensitive). */
  includeConditions?: string[];
  /** Hide items whose `condition` is in this list (case-insensitive). */
  excludeConditions?: string[];
};

export function InventoryPage({ config }: { config: InventoryConfig }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [codigoFilter, setCodigoFilter] = useState("");
  const [mobileSearch, setMobileSearch] = useState("");
  const [mobileObrasOpen, setMobileObrasOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [location, setLocation] = useState<LocationValue>("estoque");
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [holderFilter, setHolderFilter] = useState<string>("all"); // "all" | "stock" | employee name
  const askDelete = useConfirmDelete();
  const lastMutationAt = useInventoryStore((s) => s.lastMutationAt);
  const { isAdmin } = useIsAdmin();


  const itemsKey = ["items", config.kinds ? config.kinds.join(",") : config.kind] as const;

  const { data: allItems = [], isLoading } = useQuery({
    queryKey: itemsKey,
    queryFn: async () => {
      let q = supabase
        .from("items")
        .select("id, name, category, quantity, condition, notes, kind, image_url, unit, price, location, codigo, caracteristicas, maintenance_exit_justification, discarded_at");
      q = config.kinds && config.kinds.length > 0
        ? q.in("kind", config.kinds)
        : q.eq("kind", config.kind);
      const { data, error } = await q.order("name");
      if (error) throw error;
      return data as Item[];
    },
  });

  const items = allItems.filter((i) => (i.location ?? "estoque") === location);

  const { data: lastOutByItem = {} } = useQuery({
    queryKey: ["last-out-by-item", config.kind, items.map((i) => i.id).join(",")],
    queryFn: async () => {
      const ids = items.map((i) => i.id);
      if (ids.length === 0) return {} as Record<string, string>;
      const { data, error } = await supabase
        .from("movements")
        .select("item_id, type, obra, created_at")
        .in("item_id", ids)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      const latestByItem: Record<string, { type: string; obra: string | null }> = {};
      for (const m of data ?? []) {
        if (m.item_id && !latestByItem[m.item_id]) {
          latestByItem[m.item_id] = { type: m.type as string, obra: m.obra };
        }
      }
      const map: Record<string, string> = {};
      for (const [itemId, last] of Object.entries(latestByItem)) {
        if (last.type === "out" && last.obra) map[itemId] = last.obra;
      }
      return map;
    },
    enabled: items.length > 0,
  });

  const { data: inUseMap = {} } = useQuery({
    queryKey: ["items-in-use", config.kind, lastMutationAt],
    queryFn: async () => {
      const { data, error } = await supabase.from("items_in_use").select("item_id, in_use");
      if (error) throw error;
      const m: Record<string, number> = {};
      for (const r of data ?? []) m[r.item_id as string] = Number(r.in_use) || 0;
      return m;
    },
  });

  // Current allocation location per item (which obra it's alloc'd to)
  const { data: allocByItem = {} } = useQuery({
    queryKey: ["item-current-location", config.kind, lastMutationAt],
    queryFn: async () => {
      const { data, error } = await supabase.from("item_current_location").select("item_id, allocated_obras");
      if (error) throw error;
      const m: Record<string, string | null> = {};
      for (const r of data ?? []) m[r.item_id as string] = (r.allocated_obras as string | null) ?? null;
      return m;
    },
  });

  // Current holder(s) per item — who took it out (with obra)
  const { data: holderByItem = {} } = useQuery({
    queryKey: ["item-holder", config.kind, lastMutationAt],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("obra_items")
        .select("id, item_id, obra_id, holder_employee_id, quantity, allocation_status, pause_justification, obra:obras(name), holder:employees!obra_items_holder_employee_id_fkey(name)")
        .gt("quantity", 0);
      if (error) throw error;
      const m: Record<string, HolderAllocation[]> = {};
      for (const r of (data ?? []) as any[]) {
        const isPaused = r.allocation_status === "obra_parada";
        const name = (r.holder?.name as string | undefined) ?? "Sem responsável";
        if (!r.item_id) continue;
        const obra = (r.obra?.name as string | undefined) ?? null;
        (m[r.item_id] ||= []);
        if (!m[r.item_id].some((h) => h.name === name && h.obra === obra && h.isPaused === isPaused)) {
          m[r.item_id].push({
            name,
            obra,
            obraId: (r.obra_id as string | null) ?? null,
            holderId: (r.holder_employee_id as string | null) ?? null,
            allocationId: r.id as string,
            isPaused,
            pauseJustification: (r.pause_justification as string | null) ?? null,
          });
        }
      }
      return m;
    },
  });

  // Histórico acumulativo de responsáveis (usado para EPIs: par de luvas, etc.)
  const { data: historyByItem = {} } = useQuery({
    queryKey: ["item-holder-history", config.kind, lastMutationAt],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("movements")
        .select("item_id, person_name, type, created_at")
        .eq("type", "out")
        .order("created_at", { ascending: true });
      if (error) throw error;
      const m: Record<string, string[]> = {};
      for (const r of (data ?? []) as any[]) {
        const name = (r.person_name as string | null)?.trim();
        if (!name || !r.item_id) continue;
        (m[r.item_id] ||= []);
        if (!m[r.item_id].includes(name)) m[r.item_id].push(name);
      }
      return m;
    },
  });






  useEffect(() => {
    qc.invalidateQueries({ queryKey: itemsKey });
    qc.invalidateQueries({ queryKey: ["items-in-use", config.kind] });
    qc.invalidateQueries({ queryKey: ["item-current-location", config.kind] });
    qc.invalidateQueries({ queryKey: ["item-holder", config.kind] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMutationAt]);


  // Realtime: mutations em obra_items ou items refletem imediatamente na coluna Responsável
  useEffect(() => {
    const ch = supabase
      .channel(`inv-${config.kind}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "obra_items" }, () => bumpInventory())
      .on("postgres_changes", { event: "*", schema: "public", table: "items" }, () => bumpInventory())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [config.kind]);

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: itemsKey });
      toast.success("Item removido");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const holderOptions = useMemo(() => {
    const s = new Set<string>();
    for (const arr of Object.values(holderByItem)) arr.forEach((h) => s.add(h.name));
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [holderByItem]);

  const categoryOptions = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) if (it.category?.trim()) s.add(it.category.trim());
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items]);

  const includeLc = (config.includeConditions ?? []).map((s) => s.toLowerCase());
  const excludeLc = (config.excludeConditions ?? []).map((s) => s.toLowerCase());
  const filtered = items.filter((i) => {
    const condLc = (i.condition ?? "").toLowerCase();
    if (includeLc.length > 0 && !includeLc.includes(condLc)) return false;
    if (excludeLc.length > 0 && excludeLc.includes(condLc)) return false;
    // Itens em uso continuam visíveis mesmo com saldo zerado no estoque central
    if (onlyAvailable && (i.quantity ?? 0) <= 0 && (inUseMap[i.id] ?? 0) <= 0) return false;
    if (categoryFilter !== "all" && (i.category?.trim() || "Sem categoria") !== categoryFilter) return false;
    if (codigoFilter.trim() && !(i.codigo ?? "").toLowerCase().includes(codigoFilter.trim().toLowerCase())) return false;
    if (holderFilter !== "all") {
      const holders = holderByItem[i.id] ?? [];
      if (holderFilter === "stock") { if (holders.length > 0) return false; }
      else if (!holders.some((h) => h.name === holderFilter)) return false;
    }
    const q = search.toLowerCase();
    if (q !== "" && ![i.name, i.category, i.condition, i.codigo, i.caracteristicas].some((v) => v?.toLowerCase().includes(q))) return false;
    const mobileQ = mobileSearch.trim().toLowerCase();
    if (mobileQ !== "") {
      const holders = holderByItem[i.id] ?? [];
      const searchable = [
        i.name,
        i.codigo,
        i.caracteristicas,
        allocByItem[i.id],
        ...holders.flatMap((entry) => [entry.name, entry.obra]),
      ];
      if (!searchable.some((value) => value?.toLowerCase().includes(mobileQ))) return false;
    }
    return true;
  }).sort((a, b) => {
    // Ordenação numérica crescente rigorosa pelo código (prefixos agrupados)
    const ca = (a.codigo ?? "").trim(); const cb = (b.codigo ?? "").trim();
    if (!ca && !cb) return a.name.localeCompare(b.name, "pt-BR");
    if (!ca) return 1;
    if (!cb) return -1;
    const pa = ca.replace(/[0-9]+/g, "").toLowerCase();
    const pb = cb.replace(/[0-9]+/g, "").toLowerCase();
    if (pa !== pb) return pa.localeCompare(pb, "pt-BR");
    const na = Number(ca.replace(/[^0-9]/g, "") || "0");
    const nb = Number(cb.replace(/[^0-9]/g, "") || "0");
    if (na !== nb) return na - nb;
    return ca.localeCompare(cb, "pt-BR", { numeric: true });
  });


  const totalPrice = items.reduce((s, i) => s + (Number(i.price) || 0) * (i.quantity || 0), 0);
  const totals = {
    items: items.length,
    units: items.reduce((s, i) => s + i.quantity, 0),
    zeroed: items.filter((i) => (i.quantity ?? 0) <= 0).length,
    // Contagem real e dinâmica: apenas itens desta aba que estão alocados em obras
    allocatedItems: items.filter((i) => (inUseMap[i.id] ?? 0) > 0).length,
    inUse: items.reduce((s, i) => s + (inUseMap[i.id] ?? 0), 0),
  };


  const onChanged = () => {
    qc.invalidateQueries({ queryKey: itemsKey });
    qc.invalidateQueries({ queryKey: ["last-out-by-item", config.kind] });
    qc.invalidateQueries({ queryKey: ["items-in-use", config.kind] });
    qc.invalidateQueries({ queryKey: ["item-current-location", config.kind] });
    qc.invalidateQueries({ queryKey: ["item-holder", config.kind] });
    qc.invalidateQueries({ queryKey: ["movements"] });
    qc.invalidateQueries({ queryKey: ["overdue-tools"] });
    qc.invalidateQueries({ queryKey: ["overdue-tool-days"] });
    qc.invalidateQueries({ queryKey: ["maintenance-alerts"] });
    qc.invalidateQueries({ queryKey: ["mobile-obra-allocations"] });
    bumpInventory();
  };



  const locationLabel = LOCATIONS.find((l) => l.value === location)?.label ?? "Estoque";
  const printList = () => {
    const rows = [...items].sort((a, b) =>
      (a.category ?? "").localeCompare(b.category ?? "", "pt-BR") || a.name.localeCompare(b.name, "pt-BR"),
    );
    const fmt = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const body = rows.map((r) => {
      const sub = (Number(r.price) || 0) * r.quantity;
      return `<tr>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.category ?? "—")}</td>
        ${config.showCondition ? `<td>${escapeHtml(r.condition ?? "—")}</td>` : ""}
        <td style="text-align:right">${r.quantity}</td>
        <td style="text-align:center">${escapeHtml(r.unit || "un")}</td>
        <td style="text-align:right">${r.price != null ? fmt(Number(r.price)) : "—"}</td>
        <td style="text-align:right">${r.price != null ? fmt(sub) : "—"}</td>
      </tr>`;
    }).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${config.title} — ${locationLabel}</title>
      <style>
        body{font-family:system-ui,sans-serif;color:#000;margin:24px}
        h1{margin:0 0 4px;font-size:20px}
        .meta{font-size:11px;color:#444;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left}
        th{text-transform:uppercase;font-size:10px;letter-spacing:.05em;border-bottom:2px solid #000}
        tfoot td{border-top:2px solid #000;font-weight:700}
      </style></head><body>
      <h1>${config.title} — ${locationLabel}</h1>
      <div class="meta">${new Date().toLocaleString("pt-BR")} · ${rows.length} ${rows.length === 1 ? "item" : "itens"} · Total: ${fmt(totalPrice)}</div>
      <table>
        <thead><tr>
          <th>Item</th><th>Categoria</th>${config.showCondition ? "<th>Estado</th>" : ""}
          <th style="text-align:right">Qtd</th><th style="text-align:center">Un</th>
          <th style="text-align:right">Preço</th><th style="text-align:right">Subtotal</th>
        </tr></thead>
        <tbody>${body || `<tr><td colspan="${config.showCondition ? 7 : 6}" style="text-align:center;color:#666;padding:24px">Nenhum item</td></tr>`}</tbody>
        <tfoot><tr><td colspan="${config.showCondition ? 6 : 5}" style="text-align:right">Total geral</td><td style="text-align:right">${fmt(totalPrice)}</td></tr></tfoot>
      </table>
      <script>window.onload=()=>{window.print();}</script>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast.error("Permita pop-ups para imprimir"); return; }
    w.document.write(html); w.document.close();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold sm:text-4xl">{config.title}</h1>
        <p className="text-sm text-muted-foreground">{config.subtitle}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border bg-card p-1">
          {LOCATIONS.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => setLocation(l.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm ${
                location === l.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="ml-auto hidden flex-wrap gap-2 md:flex">
          <div className="hidden rounded-lg border bg-card p-1 md:inline-flex">
            <button type="button" onClick={() => setViewMode("list")}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title="Ver como lista">
              <List className="h-3.5 w-3.5" /> Lista
            </button>
            <button type="button" onClick={() => setViewMode("grid")}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title="Ver como grade">
              <LayoutGrid className="h-3.5 w-3.5" /> Grade
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={() => exportItemsXlsx(
            items.map((i) => ({
              ...i,
              responsavel: (holderByItem as Record<string, { name: string; obra: string | null }[]>)[i.id]?.map((h) => h.name).join(", ") ?? "",
              obra: (allocByItem as Record<string, string | null>)[i.id] ?? "",
            })),
            `${config.title}_${locationLabel}`
          )}>
            <FileSpreadsheet className="h-4 w-4" /> Planilha
          </Button>
          {isAdmin && <ImportItemsButton kind={config.kind} onDone={onChanged} />}
          {isAdmin && (
            <ReceiveFromObraDialog kind={config.kind} onDone={onChanged}>
              <Button variant="outline" size="sm">
                <PackageCheck className="h-4 w-4" /> Receber de obra
              </Button>
            </ReceiveFromObraDialog>
          )}
          <Button variant="outline" size="sm" onClick={printList}>
            <Printer className="h-4 w-4" /> Imprimir
          </Button>
          {isAdmin && (
            <ClearAllButton
              ids={filtered.map((i) => i.id)}
              label={config.title}
              onDone={onChanged}
            />
          )}
        </div>
      </div>

      <div className="md:hidden">
        <Dialog open={mobileObrasOpen} onOpenChange={setMobileObrasOpen}>
          <DialogTrigger asChild><Button variant="outline"><Warehouse className="h-4 w-4" /> Obras</Button></DialogTrigger>
          <DialogContent className="max-h-[90dvh] overflow-y-auto">
            <DialogHeader><DialogTitle>Obras</DialogTitle></DialogHeader>
            <MobileObrasInventory canEdit={isAdmin} onChanged={onChanged} search={mobileSearch} />
          </DialogContent>
        </Dialog>
      </div>
      <div className="relative md:hidden">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={mobileSearch}
          onChange={(event) => setMobileSearch(event.target.value)}
          placeholder="Buscar nome, característica, código, obra ou responsável"
          className="h-11 pl-9"
        />
      </div>

      <div className={`hidden gap-3 md:grid ${config.kind === "material" ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
        <Stat label="Itens" value={totals.items} />
        <Stat label={config.unitLabel} value={totals.units} />
        {config.kind === "material" && (
          <Stat label="Itens zerados" value={totals.zeroed} accent={totals.zeroed > 0} />
        )}
        <Stat label="Itens em uso" value={totals.inUse} accent={totals.inUse > 0} />
      </div>



      <div className="hidden flex-col gap-3 md:flex md:flex-row md:items-center md:flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder={`Buscar ${config.itemPlaceholder}, categoria, código...`} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Input
          placeholder="Código"
          value={codigoFilter}
          onChange={(e) => setCodigoFilter(e.target.value)}
          className="sm:w-32"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-md border bg-card px-2 py-1.5 text-xs font-medium text-foreground"
          title="Filtrar por categoria"
        >
          <option value="all">Todas categorias</option>
          {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button
          type="button"
          onClick={() => setOnlyAvailable((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${onlyAvailable ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-500" : "bg-card text-muted-foreground hover:text-foreground"}`}
          title="Mostrar apenas itens com saldo em estoque"
        >
          <Warehouse className="h-3.5 w-3.5" /> {onlyAvailable ? "Só disponíveis" : "Todos"}
        </button>
        {isAdmin && (
          <select
            value={holderFilter}
            onChange={(e) => setHolderFilter(e.target.value)}
            className="rounded-md border bg-card px-2 py-1.5 text-xs font-medium text-foreground"
            title="Filtrar por responsável"
          >
            <option value="all">Todos responsáveis</option>
            <option value="stock">Somente no estoque</option>
            {holderOptions.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        )}
        {isAdmin && (
          <ItemDialog config={config} defaultLocation={location} onSaved={onChanged}>
            <Button className="sm:w-auto"><Plus className="h-4 w-4" /> {config.newItemLabel}</Button>
          </ItemDialog>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : filtered.length === 0 ? (
        <EmptyState search={!!search || !!mobileSearch} config={config} />
      ) : (() => {
        // Agrupa por categoria e renderiza em Accordion.
        const groups = filtered.reduce<Record<string, Item[]>>((acc, it) => {
          const key = it.category?.trim() || "Sem categoria";
          (acc[key] ||= []).push(it);
          return acc;
        }, {});
        const order = Object.keys(groups).sort((a, b) => a.localeCompare(b, "pt-BR"));
        return (
          <Accordion type="multiple" defaultValue={order} className="space-y-2">
            {order.map((cat) => (
              <AccordionItem key={cat} value={cat} className="rounded-xl border bg-card">
                <AccordionTrigger className="px-4 py-3 hover:no-underline">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold uppercase tracking-wider">{cat}</span>
                    <span className="rounded-full border bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground">{groups[cat].length}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-0 pb-0">
                  {viewMode === "list" ? (
                    <InventoryTable
                      items={groups[cat]}
                      inUseMap={inUseMap}
                      allocByItem={allocByItem}
                      holderByItem={holderByItem}
                      historyByItem={historyByItem}
                      config={config}
                      onDelete={(id) => {
                        const it = groups[cat].find((x) => x.id === id);
                        askDelete(`Excluir "${it?.name ?? "item"}"?`, () => deleteItem.mutate(id));
                      }}
                      onChanged={onChanged}
                      canEdit={isAdmin}
                    />

                  ) : (
                    <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
                      {groups[cat].map((item) => (
                        <ItemCard
                          key={item.id}
                          item={item}
                          config={config}
                          lastObra={lastOutByItem[item.id]}
                          onDelete={() => askDelete(`Excluir "${item.name}"?`, () => deleteItem.mutate(item.id))}
                          onChanged={onChanged}
                          canEdit={isAdmin}
                        />
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        );
      })()}
    </div>
  );
}

function MobileObrasInventory({ canEdit, onChanged, search }: { canEdit: boolean; onChanged: () => void; search: string }) {
  const { data: obras = [], isLoading: loadingObras, error: obrasError } = useQuery({
    queryKey: ["mobile-obras"],
    queryFn: async () => {
      const { data, error } = await supabase.from("obras").select("id,name,status").order("name");
      if (error) throw error; return data ?? [];
    },
  });
  const { data: allocations = [], isLoading: loadingAllocations, error: allocationsError } = useQuery({
    queryKey: ["mobile-obra-allocations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("obra_items").select("id,obra_id,item_id,quantity,holder_employee_id,allocation_status,pause_justification,item:items(*),holder:employees!obra_items_holder_employee_id_fkey(name)").gt("quantity", 0);
      if (error) throw error; return data ?? [];
    },
  });
  const { data: employees = [] } = useQuery({
    queryKey: ["employees-active-for-inline"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("id,name").eq("active", true).order("name");
      if (error) throw error; return data ?? [];
    },
  });
  if (loadingObras || loadingAllocations) return <p className="text-sm text-muted-foreground">Carregando obras…</p>;
  if (obrasError || allocationsError) return <p role="alert" className="text-sm text-destructive">Não foi possível carregar as obras.</p>;
  const q = search.trim().toLowerCase();
  return <Accordion type="multiple" className="w-full">
    {obras.map((obra) => {
      const rows = allocations.filter((a) => a.obra_id === obra.id && a.item && (!q || [obra.name, a.item.name, a.item.codigo, a.item.caracteristicas, a.holder?.name].some((v) => v?.toLowerCase().includes(q))));
      return <AccordionItem key={obra.id} value={obra.id}>
        <AccordionTrigger className="gap-2 text-left"><span className="min-w-0 break-words">{obra.name}</span><span className="text-xs text-muted-foreground">{rows.length} itens</span></AccordionTrigger>
        <AccordionContent className="divide-y">
          {rows.length === 0 && <p className="py-3 text-sm text-muted-foreground">Nenhum item alocado{q ? " encontrado" : ""}.</p>}
          {rows.map((a) => {
            if (!a.item) return null;
            const holder: HolderAllocation = { name: a.holder?.name ?? "Sem responsável", obra: obra.name, obraId: obra.id, holderId: a.holder_employee_id, allocationId: a.id, isPaused: a.allocation_status === "obra_parada", pauseJustification: a.pause_justification };
            return <MobileInventoryCard key={a.id} item={a.item as Item} currentObra={obra.name} holder={holder} allocationIds={[a.id]} available={Number(a.item.quantity)} inUse={Number(a.quantity)} obras={obras.filter((o) => o.status !== "concluida")} employees={employees} canEdit={canEdit} onChanged={onChanged} />;
          })}
        </AccordionContent>
      </AccordionItem>;
    })}
    {obras.length === 0 && <p className="py-4 text-sm text-muted-foreground">Nenhuma obra cadastrada.</p>}
  </Accordion>;
}

function StatusBadge({ available, inUse, kind }: { available: number; inUse: number; kind?: "tool" | "material" }) {
  // Ferramentas nunca ficam "Zerado"/"Parcial": ou estão Em uso (alocadas) ou Disponível.
  if (kind === "tool") {
    if (inUse > 0) {
      return <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-500">Em uso</Badge>;
    }
    return <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500">Disponível</Badge>;
  }
  if (available <= 0 && inUse <= 0) {
    return <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">Zerado</Badge>;
  }
  if (available <= 0) {
    return <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-500">Em uso</Badge>;
  }
  if (inUse > 0) {
    return <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-500">Parcial</Badge>;
  }
  return <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500">Disponível</Badge>;
}

type HolderAllocation = {
  name: string;
  obra: string | null;
  obraId?: string | null;
  holderId?: string | null;
  allocationId?: string;
  isPaused?: boolean;
  pauseJustification?: string | null;
};

function InventoryTable({ items, inUseMap, allocByItem, holderByItem, historyByItem = {}, config, onDelete, onChanged, canEdit }: {
  items: Item[]; inUseMap: Record<string, number>; allocByItem: Record<string, string | null>;
  holderByItem: Record<string, HolderAllocation[]>;
  historyByItem?: Record<string, string[]>; config: InventoryConfig;
  onDelete: (id: string) => void; onChanged: () => void; canEdit: boolean;
}) {
  const { data: overdueDays = {} } = useOverdueToolDays();
  const { data: obrasList = [] } = useQuery({
    queryKey: ["obras-active-for-inline"],
    queryFn: async () => {
      const { data, error } = await supabase.from("obras").select("id,name,status").neq("status", "concluida").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; status: string }[];
    },
  });
  const { data: employeesList = [] } = useQuery({
    queryKey: ["employees-active-for-inline"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("id,name").eq("active", true).order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const fmtBRL = (n: number | null | undefined) =>
    n == null || Number.isNaN(Number(n))
      ? "—"
      : Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return (
    <div className="rounded-xl border bg-card">
      {/* Mobile: cartões */}
      <div className="divide-y md:hidden">
        {items.map((item) => {
          const inUse = inUseMap[item.id] ?? 0;
          const available = item.quantity;
          const alloc = allocByItem[item.id] ?? null;
          const holders = holderByItem[item.id] ?? [];
          return (
            <MobileInventoryCard
              key={item.id}
              item={item}
              currentObra={alloc}
              holder={holders[0] ?? null}
              allocationIds={holders.map((h) => h.allocationId).filter((id): id is string => Boolean(id))}
              available={available}
              inUse={inUse}
              obras={obrasList}
              employees={employeesList}
              canEdit={canEdit}
              onChanged={onChanged}
            />
          );
        })}
      </div>

      <div className="hidden w-full overflow-x-auto md:block">
        <Table className="w-full table-fixed text-xs [&_th]:h-8 [&_th]:px-2 [&_th]:text-xs [&_td]:px-2 [&_td]:py-1.5 [&_td]:overflow-hidden [&_td]:text-ellipsis [&_td]:whitespace-nowrap">
          <TableHeader className="sticky top-0 z-10 bg-card">

            <TableRow>
              <TableHead className="w-[6%]">Código</TableHead>
              <TableHead className="w-[15%]">Nome</TableHead>
              <TableHead className="w-[12%]">Característica</TableHead>
              <TableHead className="w-[8%]">Categoria</TableHead>
              <TableHead className="w-[10%]">Responsável</TableHead>
              <TableHead className="w-[10%]">Obra</TableHead>
              <TableHead className="w-[7%]">Status</TableHead>
              <TableHead className="w-[5%] text-right">Qtd</TableHead>
              <TableHead className="w-[7%] text-right">Preço</TableHead>
              <TableHead className="w-[4%] text-right">Uso</TableHead>
              <TableHead className="w-[5%] text-right">Disp.</TableHead>
              {canEdit && <TableHead className="w-[180px] text-right">Ações</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const inUse = inUseMap[item.id] ?? 0;
              const available = item.quantity;
              const total = Number(available) + Number(inUse);
              const alloc = allocByItem[item.id] ?? null;
              const holders = holderByItem[item.id] ?? [];
              const currentObra = obrasList.find((o) => o.name === alloc);
              const isEpi = /epi|luva|bota|capacet|óculos|oculos|protetor|cinto/i.test(
                `${item.name} ${item.category ?? ""} ${item.caracteristicas ?? ""}`,
              );
              const epiHistory: string[] = isEpi ? (historyByItem[item.id] ?? []) : [];
              return (
                <TableRow key={item.id}>
                  <TableCell>
                    <InlineEditCell
                      value={item.codigo}
                      placeholder="—"
                      disabled={!canEdit}
                      onSave={async (v) => {
                        await assertItemCodeAvailable(v, item.id, item.condition);
                        const { error } = await supabase.from("items").update({ codigo: v || null }).eq("id", item.id);
                        if (error) throw new Error(itemSaveError(error));
                        onChanged();
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <ItemDetailDialog
                        item={{
                          ...item,
                          responsavel: holders[0]?.name ?? null,
                          obra: alloc,
                        }}
                      >
                        <button type="button" title="Ver detalhes" className="h-8 w-8 shrink-0 overflow-hidden rounded-md border bg-muted/30">
                          {item.image_url ? <img src={item.image_url} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-muted-foreground"><ImageIcon className="h-4 w-4" /></div>}
                        </button>
                      </ItemDetailDialog>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1">
                          <ItemDetailDialog
                            item={{ ...item, responsavel: holders[0]?.name ?? null, obra: alloc }}
                          >
                            <button type="button" title="Ver detalhes e foto" className="shrink-0 text-muted-foreground hover:text-primary">
                              <Info className="h-3.5 w-3.5" />
                            </button>
                          </ItemDetailDialog>
                          <div className="min-w-0 flex-1">
                            <InlineEditCell
                              value={item.name}
                              placeholder="Nome"
                              disabled={!canEdit}
                              onSave={async (v) => {
                                if (!v.trim()) throw new Error("Nome obrigatório");
                                const { error } = await supabase.from("items").update({ name: v.trim() }).eq("id", item.id);
                                if (error) throw error;
                                onChanged();
                              }}
                            />
                          </div>
                        </div>
                        {item.caracteristicas?.trim() && <p className="whitespace-normal break-words text-xs font-medium text-primary">{item.caracteristicas}</p>}
                        <p className="text-[11px] text-muted-foreground">{item.unit || "un"}</p>
                      </div>
                      {item.kind === "tool" && overdueDays[item.id] != null && (
                        <span
                          title={`Sem devolução há ${overdueDays[item.id]} dias (limite ${OVERDUE_DAYS_LIMIT})`}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-1.5 py-0.5 text-[10px] font-bold text-destructive animate-[pulse_0.7s_cubic-bezier(0.4,0,0.6,1)_infinite]"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          {overdueDays[item.id]}d
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <InlineEditCell
                      value={item.caracteristicas}
                      placeholder="—"
                      disabled={!canEdit}
                      multiline
                      onSave={async (v) => {
                        const { error } = await supabase.from("items").update({ caracteristicas: v || null }).eq("id", item.id);
                        if (error) throw error;
                        onChanged();
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <InlineEditCell
                      value={item.category}
                      placeholder="—"
                      disabled={!canEdit}
                      onSave={async (v) => {
                        const { error } = await supabase.from("items").update({ category: v || null }).eq("id", item.id);
                        if (error) throw error;
                        onChanged();
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    {holders.length > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        {holders.map((h, i) => (
                          <span key={i} className="text-xs font-medium text-foreground">
                            {h.name}
                            {h.obra && <span className="text-muted-foreground"> @ {h.obra}</span>}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
                        <Warehouse className="h-3 w-3" /> Estoque
                      </span>
                    )}
                    {isEpi && epiHistory.length > 0 && (
                      <div className="mt-1 border-t border-white/10 pt-1">
                        <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                          Histórico EPI ({epiHistory.length})
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {epiHistory.map((n) => (
                            <span key={n} className="rounded bg-muted/40 px-1 text-[10px] text-muted-foreground">{n}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {alloc ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-500">
                        <MapPin className="h-3 w-3" /> {alloc}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground">
                        <Warehouse className="h-3 w-3" /> Estoque Central
                      </span>
                    )}
                  </TableCell>
                  <TableCell><StatusBadge available={available} inUse={inUse} kind={config.kind} /></TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{total}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <InlineEditCell
                      value={item.price != null ? fmtBRL(Number(item.price)) : null}
                      placeholder="—"
                      disabled={!canEdit}
                      onSave={async (v) => {
                        const cleaned = v.replace(/[^\d,.-]/g, "").replace(",", ".");
                        const n = cleaned.trim() === "" ? null : Number(cleaned);
                        if (n != null && !Number.isFinite(n)) throw new Error("Preço inválido");
                        const { error } = await supabase.from("items").update({ price: n }).eq("id", item.id);
                        if (error) throw error;
                        onChanged();
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-amber-500">{inUse}</TableCell>
                  <TableCell className={`text-right tabular-nums font-semibold ${available <= 0 ? "text-destructive" : "text-emerald-500"}`}>{available}</TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {inUse > 0 && (
                          <ReturnToStockDialog item={item} onSaved={onChanged}>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs"><ArrowDownToLine className="h-3.5 w-3.5" /> Entrada</Button>
                          </ReturnToStockDialog>
                        )}
                        <ReceiveItemDialog item={item} onSaved={onChanged} />
                        <StockExitDialog
                          target={{ itemId: item.id, name: item.name, caracteristicas: item.caracteristicas, unit: item.unit, available: available }}
                          onDone={onChanged}
                        >
                          <Button size="sm" className="h-7 px-2 text-xs" disabled={available <= 0}>
                            <ArrowUpFromLine className="h-3.5 w-3.5" /> Saída Obra
                          </Button>
                        </StockExitDialog>
                        {(item.condition ?? "").toLowerCase() !== "descarte" && (
                          <DiscardButton item={item} onSaved={onChanged} />
                        )}


                        <ItemDialog item={item} config={config} onSaved={onChanged}>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><Pencil className="h-3.5 w-3.5" /></Button>
                        </ItemDialog>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => onDelete(item.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function MobileInventoryCard({
  item, currentObra, holder, allocationIds, available, inUse, obras, employees, canEdit, onChanged,
}: {
  item: Item;
  currentObra: string | null;
  holder: HolderAllocation | null;
  allocationIds: string[];
  available: number;
  inUse: number;
  obras: { id: string; name: string }[];
  employees: { id: string; name: string }[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  const confirmInspection = async () => {
    setConfirming(true);
    try {
      dismissOverdue(item.id, ...allocationIds);
      const { error } = await supabase.rpc("confirm_inventory_inspection", { _item_id: item.id });
      if (error) throw error;
      onChanged();
      toast.success("Item conferido e alerta removido");
    } catch (error) {
      restoreOverdue(item.id, ...allocationIds);
      toast.error(error instanceof Error ? error.message : "Falha ao confirmar o item");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="px-3 py-2.5">
      <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-start gap-2.5">
        <MobileItemPhotoDialog item={item} onChanged={onChanged} canEdit={canEdit} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-5">{item.name}</p>
          {item.caracteristicas?.trim() && (
            <p className="line-clamp-2 rounded-sm bg-muted/60 px-1.5 py-0.5 text-xs font-medium leading-4 text-primary">
              {item.caracteristicas.trim()}
            </p>
          )}
          <p className="truncate font-mono text-[11px] leading-4 text-muted-foreground">Código: {item.codigo || "—"}</p>
        </div>
        <StatusBadge available={available} inUse={inUse} kind={item.kind} />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 border-t pt-2 text-xs">
        <div className="min-w-0">
          <dt className="text-[10px] uppercase text-muted-foreground">Obra</dt>
          <dd className="truncate font-medium leading-5">{holder?.isPaused ? "Obra Parada" : currentObra ?? "Estoque Central"}</dd>
        </div>
        <div className="min-w-0 border-l pl-3">
          <dt className="text-[10px] uppercase text-muted-foreground">Responsável</dt>
          <dd className="truncate font-medium leading-5">{holder?.isPaused ? "Sem expediente" : holder?.name ?? "Sem responsável"}</dd>
        </div>
      </dl>
      {holder?.isPaused && holder.pauseJustification && (
        <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs">
          <p className="font-semibold text-destructive">Obra Parada / Sem expediente no local</p>
          <p className="mt-0.5 break-words text-foreground">Justificativa: {holder.pauseJustification}</p>
        </div>
      )}
      {canEdit && (
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" className="h-9" onClick={confirmInspection} disabled={confirming}>
            <CircleCheck className="h-4 w-4" /> {confirming ? "Confirmando…" : "Confirmar"}
          </Button>
          <MobileInventoryUpdateDialog
            item={item}
            holder={holder}
            available={available}
            inUse={inUse}
            obras={obras}
            employees={employees}
            onChanged={onChanged}
          />
        </div>
      )}
    </div>
  );
}

export function MobileItemPhotoDialog({ item, onChanged, canEdit }: { item: Pick<Item, "id" | "name" | "codigo" | "image_url">; onChanged: () => void; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  const updatePhoto = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione uma imagem válida"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Imagem muito grande (máx. 5 MB)"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user?.id ?? "mobile"}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("item-photos").upload(path, file, {
        upsert: false,
        contentType: file.type,
      });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("item-photos").getPublicUrl(path);
      const { error: updateError } = await supabase.from("items").update({ image_url: data.publicUrl }).eq("id", item.id);
      if (updateError) throw updateError;
      bumpInventory();
      onChanged();
      toast.success("Foto do item atualizada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a foto");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" className="h-14 w-14 overflow-hidden rounded-md border bg-muted/30 p-0" title={`Ver foto de ${item.name}`}>
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span className="flex flex-col items-center text-[9px] leading-tight text-muted-foreground"><ImageIcon className="mb-0.5 h-5 w-5" />Sem foto</span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="break-words">{item.name}</DialogTitle>
          <DialogDescription>{item.codigo ? `Código ${item.codigo}` : "Foto do item"}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-56 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} className="max-h-[60vh] w-full object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground"><ImageIcon className="h-10 w-10" />Sem foto cadastrada</div>
          )}
        </div>
        {canEdit && (
          <>
            <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => void updatePhoto(event.target.files?.[0])} />
            <Button type="button" className="w-full" disabled={uploading} onClick={() => inputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              {uploading ? "Enviando…" : item.image_url ? "Atualizar foto" : "Adicionar foto"}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MobileInventoryUpdateDialog({ item, holder, available, inUse, obras, employees, onChanged }: {
  item: Item;
  holder: HolderAllocation | null;
  available: number;
  inUse: number;
  obras: { id: string; name: string }[];
  employees: { id: string; name: string }[];
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedObraId, setSelectedObraId] = useState(holder?.obraId ?? "");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(holder?.holderId ?? "");
  const [pauseJustification, setPauseJustification] = useState(holder?.pauseJustification ?? "");
  const [allocationQuantity, setAllocationQuantity] = useState("1");
  const [saving, setSaving] = useState(false);
  const isPaused = selectedObraId === PAUSED_OBRA_VALUE;
  const isCentralStock = inUse <= 0 && available > 0;
  const parsedAllocationQuantity = Number(allocationQuantity.replace(",", "."));

  useEffect(() => {
    if (!open) return;
    setSelectedObraId(holder?.isPaused ? PAUSED_OBRA_VALUE : holder?.obraId ?? "");
    setSelectedEmployeeId(holder?.holderId ?? "");
    setPauseJustification(holder?.pauseJustification ?? "");
    setAllocationQuantity("1");
  }, [open, holder?.obraId, holder?.holderId, holder?.isPaused, holder?.pauseJustification]);

  const allocateFromCentralStock = async () => {
    if (!selectedObraId) { toast.error("Selecione a obra de destino"); return; }
    if (!selectedEmployeeId) { toast.error("Selecione o responsável"); return; }
    if (!Number.isFinite(parsedAllocationQuantity) || parsedAllocationQuantity <= 0 || parsedAllocationQuantity > available) {
      toast.error(`Informe uma quantidade entre 1 e ${available}`);
      return;
    }
    setSaving(true);
    try {
      const destination = obras.find((obra) => obra.id === selectedObraId)?.name ?? "obra selecionada";
      const responsible = employees.find((employee) => employee.id === selectedEmployeeId)?.name ?? "responsável selecionado";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("handle_movimentacao_estoque", {
        _kind: "retirada",
        _item_id: item.id,
        _obra_id: selectedObraId,
        _quantity: parsedAllocationQuantity,
        _employee_id: selectedEmployeeId,
        _notes: `Alocação mobile automática · obra: ${destination} · responsável: ${responsible}`,
      });
      if (error) throw error;
      bumpInventory();
      onChanged();
      setOpen(false);
      toast.success(`${parsedAllocationQuantity} ${item.unit} alocado(s) com sucesso`);
      void Promise.all([
        queryClient.refetchQueries({ queryKey: ["items-in-use"] }),
        queryClient.refetchQueries({ queryKey: ["item-current-location"] }),
        queryClient.refetchQueries({ queryKey: ["item-holder"] }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao alocar o item");
    } finally {
      setSaving(false);
    }
  };

  const saveAssignment = async () => {
    if (inUse <= 0) return;
    if (!selectedObraId) { toast.error("Selecione a nova obra"); return; }
    if (isPaused && !pauseJustification.trim()) { toast.error("Informe a justificativa da obra parada"); return; }
    if (!isPaused && !selectedEmployeeId) { toast.error("Selecione o novo responsável"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("update_item_assignment", {
        _item_id: item.id,
        _new_obra_id: isPaused ? holder?.obraId ?? item.id : selectedObraId,
        _new_holder_employee_id: isPaused ? holder?.holderId ?? item.id : selectedEmployeeId,
        _allocation_status: isPaused ? "obra_parada" : "active",
        _pause_justification: isPaused ? pauseJustification.trim() : "",
      });
      if (error) throw error;

      dismissOverdue(item.id, holder?.allocationId);
      bumpInventory();
      onChanged();
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["items-in-use"] }),
        queryClient.refetchQueries({ queryKey: ["item-current-location"] }),
        queryClient.refetchQueries({ queryKey: ["item-holder"] }),
      ]);
      setOpen(false);
      toast.success(isPaused ? "Item marcado como obra parada" : "Obra e responsável atualizados");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar o item");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-10"><RefreshCw className="h-4 w-4" /> Atualizar</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Atualizar item</DialogTitle>
          <DialogDescription>{item.name} · código {item.codigo || "—"}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {isCentralStock ? (
            <>
              {available > 1 && (
                <div className="space-y-1.5">
                  <Label htmlFor={`allocation-quantity-${item.id}`}>Quantidade</Label>
                  <Input
                    id={`allocation-quantity-${item.id}`}
                    inputMode="decimal"
                    value={allocationQuantity}
                    onChange={(event) => setAllocationQuantity(event.target.value.replace(/[^0-9.,]/g, ""))}
                    aria-describedby={`allocation-balance-${item.id}`}
                  />
                  <p id={`allocation-balance-${item.id}`} className="text-xs text-muted-foreground">
                    Disponível: {available} {item.unit}
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Obra de destino</Label>
                <Select value={selectedObraId} onValueChange={setSelectedObraId}>
                  <SelectTrigger><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
                  <SelectContent>{obras.map((obra) => <SelectItem key={obra.id} value={obra.id}>{obra.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Responsável</Label>
                <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                  <SelectTrigger><SelectValue placeholder="Selecione o responsável" /></SelectTrigger>
                  <SelectContent>{employees.map((employee) => <SelectItem key={employee.id} value={employee.id}>{employee.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={allocateFromCentralStock} disabled={saving}>
                {saving ? "Alocando…" : "Confirmar alocação"}
              </Button>
            </>
          ) : inUse > 0 ? (
            <>
              <div className="space-y-1.5">
                <Label>Nova obra</Label>
                <Select value={selectedObraId} onValueChange={setSelectedObraId}>
                  <SelectTrigger><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PAUSED_OBRA_VALUE}>🔴 Obra Parada / Sem expediente no local</SelectItem>
                    {obras.map((obra) => <SelectItem key={obra.id} value={obra.id}>{obra.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {isPaused ? (
                <div className="space-y-1.5">
                  <Label htmlFor={`pause-justification-${item.id}`}>Justificativa</Label>
                  <Textarea
                    id={`pause-justification-${item.id}`}
                    value={pauseJustification}
                    onChange={(event) => setPauseJustification(event.target.value)}
                    placeholder="Ex.: obra paralisada ou sem encarregado no momento"
                    maxLength={500}
                    required
                  />
                  <p className="text-xs text-muted-foreground">O item permanece vinculado à obra atual, sem responsável, até a retomada.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Novo responsável</Label>
                  <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                    <SelectTrigger><SelectValue placeholder="Selecione o responsável" /></SelectTrigger>
                    <SelectContent>{employees.map((employee) => <SelectItem key={employee.id} value={employee.id}>{employee.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              <Button className="w-full" onClick={saveAssignment} disabled={saving}>
                {saving ? "Salvando…" : "Salvar alteração / baixa"}
              </Button>
            </>
          ) : null}
          {available > 0 && !isCentralStock && (
            <div className="border-t pt-4">
              <p className="mb-2 text-xs text-muted-foreground">Baixa do Estoque Central</p>
              <StockExitDialog target={{ itemId: item.id, name: item.name, caracteristicas: item.caracteristicas, unit: item.unit, available }} onDone={() => { onChanged(); setOpen(false); }}>
                <Button variant="outline" className="w-full"><ArrowUpFromLine className="h-4 w-4" /> Registrar saída</Button>
              </StockExitDialog>
            </div>
          )}
          {!isCentralStock && inUse <= 0 && available <= 0 && <p className="text-sm text-muted-foreground">Este item não possui saldo para movimentação.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}


function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}


function Stat({ label, value, accent, money }: { label: string; value?: number; accent?: boolean; money?: number }) {
  const display =
    money != null
      ? `R$ ${money.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : String(value ?? 0);
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 font-bold ${money != null ? "text-base sm:text-lg" : "text-2xl"} ${accent ? "text-destructive" : "text-foreground"}`}>{display}</p>
    </div>
  );
}


function ConditionDot({ condition }: { condition: string }) {
  const map: Record<string, { color: string; label: string }> = {
    "Novo": { color: "bg-emerald-500", label: "Novo" },
    "Bom": { color: "bg-emerald-500", label: "Bom" },
    "Regular": { color: "bg-yellow-500", label: "Regular" },
    "Manutenção": { color: "bg-orange-500", label: "Manutenção" },
    "Danificado": { color: "bg-destructive", label: "Danificado" },
  };
  const c = map[condition] ?? { color: "bg-muted-foreground", label: condition };
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      <span className={`h-1.5 w-1.5 rounded-full ${c.color}`} />
      {c.label}
    </span>
  );
}

function EmptyState({ search, config }: { search: boolean; config: InventoryConfig }) {
  return (
    <div className="rounded-xl border border-dashed bg-card/50 p-10 text-center">
      <Package className="mx-auto h-10 w-10 text-muted-foreground" />
      <p className="mt-3 font-medium">{search ? "Nada encontrado" : `Comece adicionando seu primeiro ${config.itemPlaceholder}`}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {search ? "Tente outro termo de busca." : `Clique em "${config.newItemLabel}" para cadastrar.`}
      </p>
    </div>
  );
}

function ItemCard({ item, config, lastObra, onDelete, onChanged, canEdit }: { item: Item; config: InventoryConfig; lastObra?: string; onDelete: () => void; onChanged: () => void; canEdit: boolean }) {
  return (
    <div className="group rounded-xl border bg-card p-3 transition-colors hover:border-primary/40">
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border bg-muted/30">
          {item.image_url ? (
            <img src={item.image_url} alt={item.name} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <ImageIcon className="h-5 w-5" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="truncate font-semibold leading-tight">{item.name}</h3>
            {item.caracteristicas?.trim() && <p className="break-words text-xs font-medium text-primary">{item.caracteristicas}</p>}
            {config.showCondition && item.condition && <ConditionDot condition={item.condition} />}
          </div>
          {item.category && <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.category}</p>}
          {item.price != null && (
            <p className="mt-0.5 text-xs font-medium text-primary">
              R$ {Number(item.price).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          )}
          {item.notes && <p className="mt-1 line-clamp-2 text-xs italic text-muted-foreground/90">{item.notes}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className={`text-xl font-bold leading-tight ${item.quantity === 0 ? "text-destructive" : "text-foreground"}`}>{item.quantity}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.unit || "un"}</p>
        </div>
      </div>

      {lastObra && (
        <div className="mt-3">
          <Badge variant="outline" className="border-border text-muted-foreground font-normal">
            <MapPin className="h-3 w-3" /> {lastObra}
          </Badge>
        </div>
      )}

      {canEdit && (
        <>
          <div className={`mt-3 grid gap-2 ${lastObra ? "grid-cols-2" : "grid-cols-1"}`}>
            {lastObra && (
              <ReturnToStockDialog item={item} onSaved={onChanged}>
                <Button size="sm" variant="outline">
                  <ArrowDownToLine className="h-3.5 w-3.5" /> Entrada
                </Button>
              </ReturnToStockDialog>
            )}
            <MovementDialog item={item} type="out" onSaved={onChanged}>
              <Button size="sm">
                <ArrowUpFromLine className="h-3.5 w-3.5" /> Saída
              </Button>
            </MovementDialog>
          </div>


          <div className="mt-2 flex items-center justify-end gap-1 opacity-60 transition-opacity group-hover:opacity-100">
            <ItemDialog item={item} config={config} onSaved={onChanged}>
              <Button size="sm" variant="ghost" className="h-7 px-2">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </ItemDialog>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive"
              onClick={() => onDelete()}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function ItemDialog({ children, item, config, onSaved, defaultLocation }: { children: React.ReactNode; item?: Item; config: InventoryConfig; onSaved: () => void; defaultLocation?: LocationValue }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 0));
  const [unit, setUnit] = useState(item?.unit ?? "un");
  const [condition, setCondition] = useState(item?.condition ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [imageUrl, setImageUrl] = useState(item?.image_url ?? "");
  const [price, setPrice] = useState(item?.price != null ? String(item.price) : "");
  const [location, setLocation] = useState<LocationValue>(((item?.location as LocationValue) ?? defaultLocation ?? "estoque"));
  const [codigo, setCodigo] = useState(item?.codigo ?? "");
  const [caracteristicas, setCaracteristicas] = useState(item?.caracteristicas ?? "");
  const [maintenanceExitJustification, setMaintenanceExitJustification] = useState(item?.maintenance_exit_justification ?? "");

  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();
  const genImage = useServerFn(generateItemImage);

  const reset = () => {
    if (!item) { setName(""); setCategory(""); setQuantity("0"); setUnit("un"); setCondition(""); setNotes(""); setImageUrl(""); setPrice(""); setCodigo(""); setCaracteristicas(""); setMaintenanceExitJustification(""); }
  };

  const handleFile = async (file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Imagem muito grande (máx 5MB)"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user?.id ?? "anon"}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("item-photos").upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("item-photos").getPublicUrl(path);
      setImageUrl(data.publicUrl);
      toast.success("Foto enviada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro no upload");
    } finally {
      setUploading(false);
    }
  };

  const handleAI = async () => {
    if (!name.trim()) { toast.error("Digite o nome do item primeiro"); return; }
    setGenerating(true);
    try {
      const { dataUrl } = await genImage({ data: { name: name.trim(), category: category.trim() || null } });
      // Upload to storage so URL is small and persistent
      const base64 = dataUrl.split(",")[1];
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const path = `${user?.id ?? "anon"}/ai-${crypto.randomUUID()}.png`;
      const { error } = await supabase.storage.from("item-photos").upload(path, bytes, { contentType: "image/png", upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("item-photos").getPublicUrl(path);
      setImageUrl(data.publicUrl);
      toast.success("Imagem gerada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar");
    } finally {
      setGenerating(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const leavingMaintenance = item?.condition === "Manutenção" && condition !== "Manutenção";
    if (leavingMaintenance && !maintenanceExitJustification.trim()) {
      toast.error("Informe a justificativa do conserto antes de retirar da manutenção");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        category: category.trim() || null,
        quantity: parseFloat(String(quantity).replace(",", ".")) || 0,
        unit: unit || "un",
        condition: config.showCondition ? (condition || null) : null,
        notes: notes.trim() || null,
        image_url: imageUrl.trim() || null,
        price: price.trim() === "" ? null : (parseFloat(price.replace(",", ".")) || null),
        kind: config.kind,
        location,
        codigo: codigo.trim() || null,
        caracteristicas: caracteristicas.trim() || null,
        maintenance_exit_justification: leavingMaintenance ? maintenanceExitJustification.trim() : null,
      };

      if (item) {
        await assertItemCodeAvailable(payload.codigo, item.id, payload.condition);
        const { error } = await supabase.from("items").update(payload).eq("id", item.id);
        if (error) throw error;
        toast.success("Item atualizado");
      } else {
        await assertItemCodeAvailable(payload.codigo, null, payload.condition);
        const { error } = await supabase.from("items").insert({ ...payload, created_by: user?.id });
        if (error) throw error;
        toast.success("Item adicionado");
        reset();
      }
      onSaved();
      setOpen(false);
    } catch (err) {
      toast.error(itemSaveError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{item ? "Editar item" : config.newItemLabel}</DialogTitle>
            <DialogDescription>Cadastre {config.itemPlaceholder === "material" ? "um material" : "uma ferramenta"} do seu estoque.</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder={config.itemPlaceholder === "material" ? "Ex.: Cimento CP-II 50kg" : "Ex.: Furadeira Bosch"} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={config.categoryPlaceholder} />
            </div>
            <div className="space-y-1.5">
              <Label>Código</Label>
              <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ex.: FM-001" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Características</Label>
            <Textarea rows={2} value={caracteristicas} onChange={(e) => setCaracteristicas(e.target.value)} placeholder="Ex.: 220V, 750W, mandril 13mm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Unidade</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Local</Label>
              <Select value={location} onValueChange={(v) => setLocation(v as LocationValue)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOCATIONS.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Quantidade</Label>
              <Input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^0-9.,]/g, ""))} placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label>Preço unitário (R$)</Label>
              <Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" />
            </div>
          </div>
          <p className="-mt-1 text-[11px] text-muted-foreground">
            💡 Ao salvar, o mesmo preço é aplicado automaticamente a outros itens com o mesmo primeiro nome.

          </p>
          {config.showCondition && (
            <div className="space-y-1.5">
              <Label>Estado / Condição</Label>
              <Select value={condition} onValueChange={setCondition}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {item?.condition === "Manutenção" && condition !== "Manutenção" && (
            <div className="space-y-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
              <Label htmlFor={`maintenance-justification-${item.id}`}>Justificativa do conserto *</Label>
              <Textarea
                id={`maintenance-justification-${item.id}`}
                value={maintenanceExitJustification}
                onChange={(event) => setMaintenanceExitJustification(event.target.value)}
                placeholder="Informe o reparo realizado e confirme que o item está pronto"
                maxLength={500}
                required
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Foto do item</Label>
            <div className="flex items-start gap-3">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-muted/30">
                {imageUrl ? (
                  <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <Input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="Cole uma URL da internet..."
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={handleAI} disabled={generating || !name.trim()} className="h-7 text-xs">
                    <Sparkles className="h-3.5 w-3.5" />
                    {generating ? "Gerando..." : "Gerar com IA"}
                  </Button>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted">
                    <Upload className="h-3.5 w-3.5" />
                    {uploading ? "Enviando..." : "Galeria"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                  </label>
                  {imageUrl && (
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setImageUrl("")}>
                      Remover
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
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

function MovementDialog({ children, item, type, onSaved }: { children: React.ReactNode; item: Item; type: "in" | "out"; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState("1");
  const [employeeId, setEmployeeId] = useState<string>("");
  const [obraId, setObraId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const label = type === "in" ? "Devolução" : "Retirada";

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const quantity = parseFloat(String(qty).replace(",", "."));
    if (!quantity || quantity <= 0) { toast.error("Quantidade inválida"); return; }
    if (type === "out") {
      if (quantity > item.quantity) { toast.error(`Saldo insuficiente. Disponível: ${item.quantity}`); return; }
      if (!employeeId) { toast.error("Informe o funcionário responsável"); return; }
    }
    setSaving(true);
    try {
      // Fonte única de verdade: RPC atômica handle_movimentacao_estoque
      // debita o saldo, vincula obra + responsável e loga — tudo em transação.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("handle_movimentacao_estoque", {
        _kind: type === "out" ? "retirada" : "devolucao",
        _item_id: item.id,
        _obra_id: obraId || null,
        _quantity: quantity,
        _employee_id: employeeId || null,
        _notes: notes.trim() || null,
      });
      if (error) throw error;
      toast.success(`${label} registrada`);
      onSaved();
      bumpInventory();
      setOpen(false);
      setQty("1"); setEmployeeId(""); setObraId(""); setNotes("");
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
            <DialogTitle>{label} — {item.name}</DialogTitle>
            <DialogDescription>
              Em estoque: {item.quantity} {item.unit || "un"}.{" "}
              {type === "out" ? "Debitado do saldo automaticamente." : "Creditado ao saldo automaticamente."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Quantidade ({item.unit || "un"}) *</Label>
            <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9.,]/g, ""))} required autoFocus placeholder="0,00" />
          </div>
          {type === "out" && (
            <>
              <div className="space-y-1.5">
                <Label>Solicitante (Responsável) *</Label>
                <Select value={employeeId} onValueChange={setEmployeeId}>
                  <SelectTrigger><SelectValue placeholder="Selecione o funcionário" /></SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Obra destino (opcional)</Label>
                <Select value={obraId || "none"} onValueChange={(v) => setObraId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Sem obra" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem obra</SelectItem>
                    {obras.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando..." : `Registrar ${label.toLowerCase()}`}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


function ImportItemsButton({ kind, onDone }: { kind: "tool" | "material"; onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const handleFile = async (file: File) => {
    try {
      const rows = await parseItemsXlsx(file, kind);
      if (rows.length === 0) { toast.error("Planilha vazia"); return; }
      if (!confirm(`Importar ${rows.length} linha(s)? Linhas com ID atualizam o item; sem ID criam um novo.`)) return;
      const res = await applyImportedItems(rows, user?.id);
      toast.success(`${res.updated} atualizadas, ${res.inserted} criadas`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao importar");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        <FileUp className="h-4 w-4" /> Importar
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
    </>
  );
}

function ReceiveFromObraDialog({ children, kind, onDone }: { children: React.ReactNode; kind: "tool" | "material"; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [obraId, setObraId] = useState<string>("");
  const [itemId, setItemId] = useState<string>("");
  const [qty, setQty] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const { data: obrasList = [] } = useQuery({
    queryKey: ["obras-for-receive"],
    queryFn: async () => {
      const { data, error } = await supabase.from("obras").select("id, name, status").neq("status", "concluida").order("name");
      if (error) throw error;
      return data as { id: string; name: string; status: string }[];
    },
    enabled: open,
  });

  const { data: allocated = [] } = useQuery({
    queryKey: ["obra-allocated-items", obraId, kind],
    queryFn: async () => {
      if (!obraId) return [] as { item_id: string; quantity: number; name: string; unit: string }[];
      const { data, error } = await supabase
        .from("obra_items")
        .select("item_id, quantity, item:items(name, unit, kind)")
        .eq("obra_id", obraId)
        .gt("quantity", 0);
      if (error) throw error;
      return (data ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((r: any) => r.item?.kind === kind)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => ({ item_id: r.item_id as string, quantity: Number(r.quantity), name: r.item.name as string, unit: (r.item.unit as string) || "un" }));
    },
    enabled: open && !!obraId,
  });

  const selectedAlloc = allocated.find((a) => a.item_id === itemId);
  const maxQty = selectedAlloc?.quantity ?? 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!obraId || !itemId) { toast.error("Selecione obra e item"); return; }
    const q = parseFloat(String(qty || maxQty).replace(",", "."));
    if (!q || q <= 0) { toast.error("Quantidade inválida"); return; }
    if (q > maxQty) { toast.error(`Máximo disponível para receber: ${maxQty}`); return; }
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("receive_stock_from_obra", { _obra_id: obraId, _item_id: itemId, _quantity: q });
      if (error) throw error;
      toast.success("Item recebido no Estoque Central");
      bumpInventory();
      onDone();
      setOpen(false);
      setObraId(""); setItemId(""); setQty("");
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
            <DialogTitle>Receber de obra</DialogTitle>
            <DialogDescription>Devolve um item alocado ao Estoque Central e zera o vínculo com a obra.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Obra</Label>
            <Select value={obraId} onValueChange={(v) => { setObraId(v); setItemId(""); setQty(""); }}>
              <SelectTrigger><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
              <SelectContent>
                {obrasList.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Item alocado</Label>
            <Select value={itemId} onValueChange={(v) => { setItemId(v); const a = allocated.find((x) => x.item_id === v); setQty(a ? String(a.quantity) : ""); }} disabled={!obraId}>
              <SelectTrigger><SelectValue placeholder={obraId ? (allocated.length ? "Selecione o item" : "Nenhum item alocado") : "Selecione a obra primeiro"} /></SelectTrigger>
              <SelectContent>
                {allocated.map((a) => (
                  <SelectItem key={a.item_id} value={a.item_id}>{a.name} — {a.quantity} {a.unit}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Quantidade a devolver {selectedAlloc ? `(máx ${maxQty} ${selectedAlloc.unit})` : ""}</Label>
            <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9.,]/g, ""))} disabled={!itemId} placeholder="0,00" />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving || !itemId}>{saving ? "Recebendo..." : "Confirmar recebimento"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReturnToStockDialog({ children, item, onSaved }: { children: React.ReactNode; item: Item; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<string>("");
  const qc = useQueryClient();

  // Auto-detect the active obra allocation for this item.
  // enforce_single_obra_allocation guarantees at most 1 active obra per item.
  const { data: alloc, isLoading } = useQuery({
    queryKey: ["item-active-allocation", item.id, open],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("obra_items")
        .select("obra_id, quantity, obra:obras(name, status)")
        .eq("item_id", item.id)
        .gt("quantity", 0);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = (data ?? []) as any[];
      const active = rows.filter((r) => r.obra?.status !== "concluida");
      if (active.length === 0) return null;
      const total = active.reduce((s, r) => s + Number(r.quantity), 0);
      return {
        obra_id: active[0].obra_id as string,
        obra_name: (active[0].obra?.name as string) ?? "Obra",
        quantity: total,
      };
    },
    enabled: open,
  });

  useEffect(() => {
    if (alloc) setQty(String(alloc.quantity));
  }, [alloc]);

  const maxQty = alloc?.quantity ?? 0;

  // Atomic RPC: subtracts from obra_items, adds back to items.quantity, logs
  // to system_logs — all within a single transaction. If any step fails the
  // whole operation rolls back, so an item can never be duplicated or lost.
  const mutation = useMutation({
    mutationFn: async (q: number) => {
      if (!alloc) throw new Error("Item não está alocado em nenhuma obra");
      if (q > maxQty) throw new Error(`Saldo insuficiente. Alocado: ${maxQty}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("receive_stock_from_obra", {
        _obra_id: alloc.obra_id, _item_id: item.id, _quantity: q,
      });
      if (error) throw error;
      return q;
    },
    onSuccess: () => {
      toast.success(`Sucesso: ${item.name} devolvido ao estoque!`);
      // Reatividade: invalida todos os caches de inventário para que a lista,
      // "Localização Atual" e contadores atualizem sem refresh.
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["items-in-use"] });
      qc.invalidateQueries({ queryKey: ["item-current-location"] });
      qc.invalidateQueries({ queryKey: ["item-active-allocation", item.id] });
      bumpInventory();
      onSaved();
      setOpen(false);
      setQty("");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Erro na devolução"),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = parseFloat(String(qty).replace(",", "."));
    if (!q || q <= 0) { toast.error("Quantidade inválida"); return; }
    mutation.mutate(q);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Entrada de {item.name}</DialogTitle>
            <DialogDescription>
              {alloc
                ? <>Devolver de <span className="font-medium text-foreground">{alloc.obra_name}</span> para o Estoque Central.</>
                : "Verificando alocação…"}
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : !alloc ? (
            <p className="text-sm text-muted-foreground">Este item não está alocado em nenhuma obra ativa.</p>
          ) : (
            <div className="space-y-1.5">
              <Label>Quantidade (máx {maxQty} {item.unit || "un"})</Label>
              <Input
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/[^0-9.,]/g, ""))}
                autoFocus
                placeholder="0,00"
              />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending || !alloc}>
              {mutation.isPending ? "Devolvendo..." : "Confirmar entrada"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Célula editável inline: clique para editar, Enter/blur para salvar, Esc para cancelar. */
function InlineEditCell({
  value, placeholder, disabled, multiline, onSave,
}: {
  value: string | null;
  placeholder?: string;
  disabled?: boolean;
  multiline?: boolean;
  onSave: (v: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setDraft(value ?? ""); }, [value]);

  const commit = async () => {
    const trimmed = draft.trim();
    if (trimmed === (value ?? "")) { setEditing(false); return; }
    setBusy(true);
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
      setDraft(value ?? "");
    } finally {
      setBusy(false);
    }
  };

  if (disabled) {
    return <span className="text-xs text-muted-foreground">{value?.trim() || placeholder || "—"}</span>;
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setEditing(true); }}
        className="w-full rounded px-1 py-0.5 text-left text-xs hover:bg-muted/40"
      >
        {value?.trim() ? (
          <span className="text-foreground">{value}</span>
        ) : (
          <span className="text-muted-foreground italic">{placeholder ?? "clique para editar"}</span>
        )}
      </button>
    );
  }

  const commonProps = {
    autoFocus: true,
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !multiline) { e.preventDefault(); (e.target as HTMLElement).blur(); }
      else if (e.key === "Enter" && multiline && !e.shiftKey) { e.preventDefault(); (e.target as HTMLElement).blur(); }
      else if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); }
    },
    disabled: busy,
    className: "h-7 text-xs",
  };

  return multiline
    ? <Textarea {...(commonProps as any)} rows={2} />
    : <Input {...(commonProps as any)} />;
}

function ObraInlineSelect({
  itemId, itemName, currentObraId, obras, onChanged,
}: {
  itemId: string;
  itemName: string;
  currentObraId: string | null;
  obras: { id: string; name: string }[];
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const askDelete = useConfirmDelete();

  const handleChange = (nextValue: string) => {
    const targetObraId = nextValue === "__stock__" ? null : nextValue;
    if (targetObraId === currentObraId) return;
    const targetName = targetObraId ? obras.find((o) => o.id === targetObraId)?.name : "Estoque Central";
    const doTransfer = async () => {
      setSaving(true);
      try {
        const { error } = await (supabase as any).rpc("transfer_item_between_obras", {
          _item_id: itemId,
          _new_obra_id: targetObraId,
        });
        if (error) throw error;
        toast.success(`"${itemName}" → ${targetName}`);
        bumpInventory();
        onChanged();
      } catch (e: any) {
        toast.error(e?.message ?? "Falha ao transferir");
      } finally { setSaving(false); }
    };

    if (targetObraId === null) {
      askDelete(`Retornar "${itemName}" ao Estoque? Digite a senha para confirmar.`, doTransfer);
    } else {
      void doTransfer();
    }
  };

  return (
    <Select value={currentObraId ?? "__stock__"} onValueChange={handleChange} disabled={saving}>
      <SelectTrigger className="h-7 w-full text-[11px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__stock__">↩ Estoque Central</SelectItem>
        {obras.map((o) => (
          <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function HolderInlineSelect({
  itemId, itemName, currentHolderId, employees, onChanged,
}: {
  itemId: string;
  itemName: string;
  currentHolderId: string | null;
  employees: { id: string; name: string }[];
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const handleChange = async (next: string) => {
    const target = next === "__none__" ? null : next;
    if (target === currentHolderId) return;
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("set_item_holder", {
        _item_id: itemId,
        _new_holder_employee_id: target,
      });
      if (error) throw error;
      const name = target ? employees.find((e) => e.id === target)?.name : "sem responsável";
      toast.success(`"${itemName}" → ${name}`);
      bumpInventory();
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao atribuir responsável");
    } finally { setSaving(false); }
  };
  return (
    <Select value={currentHolderId ?? "__none__"} onValueChange={handleChange} disabled={saving}>
      <SelectTrigger className="h-7 w-full text-[11px]"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">— sem responsável —</SelectItem>
        {employees.map((e) => (
          <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * "Receber Item": mostra de qual obra o item veio e quem é o responsável.
 * Ao confirmar, devolve ao Estoque Central (RPC atômica) e registra no
 * Histórico de Movimentação + Auditoria.
 */
function ReceiveItemDialog({ item, onSaved }: { item: Item; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const { data: allocs = [], isLoading, refetch } = useQuery({
    queryKey: ["item-allocs-receive", item.id, open],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("obra_items")
        .select("id, quantity, created_at, notes, obra:obras(id, name, status), holder:employees(id, name)")
        .eq("item_id", item.id)
        .gt("quantity", 0)
        .order("created_at", { ascending: true });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[]).filter((r) => r.obra?.status !== "concluida");
    },
    enabled: open,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const receive = async (row: any) => {
    const max = Number(row.quantity);
    const raw = qty[row.id] ?? String(max);
    const q = parseFloat(raw.replace(",", "."));
    if (!q || q <= 0) { toast.error("Quantidade inválida"); return; }
    if (q > max) { toast.error(`Máximo em poder: ${max}`); return; }
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("return_stock_from_obra_item", {
        _obra_item_id: row.id, _quantity: q,
      });
      if (error) throw error;
      await logAudit("stock", `Recebimento: "${item.name}" (${q} ${item.unit || "un"}) retornou de ${row.obra?.name ?? "Sem obra"}${row.holder?.name ? ` — responsável ${row.holder.name}` : ""}`, {
        item_id: item.id, obra_id: row.obra?.id ?? null, quantity: q,
      });
      toast.success(`Recebido: ${item.name} voltou ao Estoque Central`);
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["items-in-use"] });
      qc.invalidateQueries({ queryKey: ["item-current-location"] });
      bumpInventory();
      onSaved();
      const { data } = await refetch();
      if (!data || data.length === 0) setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao receber item");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-emerald-500 hover:text-emerald-500" title="Receber item">
          <PackageCheck className="h-3.5 w-3.5" /> Receber
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receber "{item.name}"</DialogTitle>
          <DialogDescription>Confira a origem e o responsável antes de confirmar o retorno ao Estoque Central.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : allocs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Este item não está em nenhuma obra ou com nenhum responsável.</p>
        ) : (
          <div className="space-y-3">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {allocs.map((row: any) => (
              <div key={row.id} className="rounded-lg border bg-muted/20 p-3">
                <div className="mb-2 grid gap-1 text-xs">
                  <p><span className="text-muted-foreground">Obra de origem: </span><span className="font-semibold text-foreground">{row.obra?.name ?? "Sem obra"}</span></p>
                  <p><span className="text-muted-foreground">Responsável: </span><span className="font-semibold text-foreground">{row.holder?.name ?? "—"}</span></p>
                  <p><span className="text-muted-foreground">Em poder desde: </span>{new Date(row.created_at).toLocaleString("pt-BR")}</p>
                  <p><span className="text-muted-foreground">Quantidade alocada: </span><span className="font-semibold">{Number(row.quantity)} {item.unit || "un"}</span></p>
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Quantidade a receber</Label>
                    <Input inputMode="decimal" placeholder={String(row.quantity)}
                      value={qty[row.id] ?? String(row.quantity)}
                      onChange={(e) => setQty((c) => ({ ...c, [row.id]: e.target.value.replace(/[^0-9.,]/g, "") }))} />
                  </div>
                  <Button size="sm" disabled={saving} onClick={() => receive(row)}>
                    <ArrowDownToLine className="h-4 w-4" /> Confirmar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DiscardButton({ item, onSaved }: { item: Item; onSaved: () => void }) {
  const [target, setTarget] = useState<DiscardTarget | null>(null);
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs text-amber-500 hover:text-amber-500"
        title="Descartar unidade"
        disabled={Number(item.quantity) <= 0}
        onClick={() => setTarget({
          itemId: item.id,
          name: item.name,
          caracteristicas: item.caracteristicas,          available: Number(item.quantity) || 0,
          unit: item.unit,
        })}
      >
        <Trash2 className="h-3.5 w-3.5" /> Descarte
      </Button>
      <DiscardUnitDialog target={target} onClose={() => setTarget(null)} onDone={onSaved} />
    </>
  );
}

function ClearAllButton({ ids, label, onDone }: { ids: string[]; label: string; onDone: () => void }) {
  const askDelete = useConfirmDelete();
  const handle = () => {
    if (ids.length === 0) { toast.info("Nada para apagar nesta aba"); return; }
    askDelete(
      `Apagar TODOS os ${ids.length} itens desta aba (${label})? Esta ação não pode ser desfeita.`,
      async () => {
        const { error } = await supabase.from("items").delete().in("id", ids);
        if (error) throw error;
        await logAudit("item", `Exclusão em massa: ${ids.length} itens apagados (${label})`, { quantity: ids.length });
        toast.success(`${ids.length} itens apagados`);

        bumpInventory();
        onDone();
      },
    );
  };
  return (
    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={handle}>
      <Trash2 className="h-4 w-4" /> Apagar tudo
    </Button>
  );
}

