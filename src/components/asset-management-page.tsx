import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { ItemDetailDialog } from "@/components/item-detail-dialog";
import { MobileItemPhotoDialog as ItemPhotoDialog } from "@/components/inventory-page";
import { Boxes, Download, FileSpreadsheet, Package, Pencil, Printer, RefreshCw, Search, Upload, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DiscardUnitDialog, type DiscardTarget } from "@/components/discard-unit-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { bumpInventory } from "@/lib/inventory-store";
import { assertItemCodeAvailable, itemSaveError } from "@/lib/item-codes";

type Kind = "ferramenta" | "material" | string;
type Status = "Bom" | "Regular" | "Danificado" | "Manutenção" | "Descarte";

type Item = {
  id: string; name: string; category: string | null; kind: Kind;
  quantity: number; condition: string | null; location: string | null; unit: string | null;
  price: number | null; codigo: string | null; caracteristicas: string | null; notes: string | null;
  maintenance_exit_justification: string | null;
  image_url: string | null;
};

type ObraItem = {
  id: string; obra_id: string; item_id: string;
  quantity: number; holder_employee_id: string | null;
};
type Employee = { id: string; name: string };
type Obra = { id: string; name: string; status: string | null };

type AssetRow = {
  key: string;
  itemId: string;
  allocationId: string | null;
  obraId: string | null;
  holderId: string | null;
  nome: string;
  caracteristicas: string | null;
  categoria: string;
  tipo: "Ferramenta" | "Material";
  responsavel: string;
  localizacao: string;
  status: Status;
  quantidade: number;
  unidade: string;
  origem: "estoque" | "alocacao";
};

const STATUSES: Status[] = ["Bom", "Regular", "Danificado", "Manutenção", "Descarte"];

const statusStyle: Record<Status, string> = {
  "Bom": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Regular": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Danificado": "bg-red-500/15 text-red-400 border-red-500/30",
  "Manutenção": "bg-sky-500/15 text-sky-400 border-sky-500/30",
  "Descarte": "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

const tipoStyle: Record<"Ferramenta" | "Material", string> = {
  Ferramenta: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  Material: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
};

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function toStatus(raw: string | null | undefined): Status {
  const n = normalize(String(raw ?? ""));
  if (!n) return "Bom";
  if (n.includes("descart") || n.includes("descar")) return "Descarte";
  if (n.includes("dan")) return "Danificado";
  if (n.startsWith("man") || n.includes("reparo") || n.includes("conserto")) return "Manutenção";
  if (n.includes("reg")) return "Regular";
  return "Bom";
}

function toTipo(kind: Kind): "Ferramenta" | "Material" {
  const n = normalize(String(kind ?? ""));
  return n === "material" || n === "materiais" ? "Material" : "Ferramenta";
}

export function AssetManagementPage() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [codeQuery, setCodeQuery] = useState("");

  const [catFilter, setCatFilter] = useState<string>("__all");
  const [statusFilter, setStatusFilter] = useState<string>("__all");
  const [tipoFilter, setTipoFilter] = useState<string>("__all");
  const [obraFilter, setObraFilter] = useState<string>("__all");
  const [editing, setEditing] = useState<AssetRow | null>(null);
  const [discarding, setDiscarding] = useState<DiscardTarget | null>(null);

  const { data: items = [], isLoading: li, refetch: refetchItems } = useQuery({
    queryKey: ["assets:items"],
    queryFn: async (): Promise<Item[]> => {
      const { data, error } = await (supabase as any)
        .from("items")
        .select("id,name,category,kind,quantity,condition,location,unit,price,codigo,caracteristicas,notes,maintenance_exit_justification,image_url")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });
  const { data: allocations = [], isLoading: la, refetch: refetchAlloc } = useQuery({
    queryKey: ["assets:obra_items"],
    queryFn: async (): Promise<ObraItem[]> => {
      const { data, error } = await (supabase as any)
        .from("obra_items")
        .select("id,obra_id,item_id,quantity,holder_employee_id");
      if (error) throw error;
      return (data ?? []) as ObraItem[];
    },
  });
  const { data: employees = [] } = useQuery({
    queryKey: ["assets:employees"],
    queryFn: async (): Promise<Employee[]> => {
      const { data, error } = await (supabase as any)
        .from("employees").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as Employee[];
    },
  });
  const { data: obras = [] } = useQuery({
    queryKey: ["assets:obras"],
    queryFn: async (): Promise<Obra[]> => {
      const { data, error } = await (supabase as any)
        .from("obras").select("id,name,status").order("name");
      if (error) throw error;
      return (data ?? []) as Obra[];
    },
  });

  const empName = useMemo(() => {
    const m = new Map<string, string>();
    employees.forEach((e) => m.set(e.id, e.name));
    return (id: string | null) => (id && m.get(id)) || "—";
  }, [employees]);
  const obraName = useMemo(() => {
    const m = new Map<string, string>();
    obras.forEach((o) => m.set(o.id, o.name));
    return (id: string | null) => (id && m.get(id)) || "—";
  }, [obras]);

  // Realtime — instant refresh when any related table changes
  useEffect(() => {
    const ch = supabase
      .channel("gestao-ativos-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "items" }, () => {
        qc.invalidateQueries({ queryKey: ["assets:items"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "obra_items" }, () => {
        qc.invalidateQueries({ queryKey: ["assets:obra_items"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, () => {
        qc.invalidateQueries({ queryKey: ["assets:employees"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "obras" }, () => {
        qc.invalidateQueries({ queryKey: ["assets:obras"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  // Consolidate: 1 row per allocation + 1 row per item in central stock (qty remaining > 0)
  const rows: AssetRow[] = useMemo(() => {
    const byItem = new Map<string, Item>();
    items.forEach((i) => byItem.set(i.id, i));
    const out: AssetRow[] = [];

    // Allocations
    const allocByItem = new Map<string, number>();
    for (const a of allocations) {
      const it = byItem.get(a.item_id);
      if (!it) continue;
      const q = Number(a.quantity ?? 0);
      allocByItem.set(a.item_id, (allocByItem.get(a.item_id) ?? 0) + q);
      if (q <= 0) continue;
      out.push({
        key: `a:${a.id}`,
        itemId: it.id,
        allocationId: a.id,
        obraId: a.obra_id,
        holderId: a.holder_employee_id,
        nome: it.name,
        caracteristicas: it.caracteristicas,
        categoria: it.category ?? "—",
        tipo: toTipo(it.kind),
        responsavel: empName(a.holder_employee_id),
        localizacao: obraName(a.obra_id),
        status: toStatus(it.condition),
        quantidade: q,
        unidade: it.unit ?? "un",
        origem: "alocacao",
      });
    }

    // Central stock rows (remaining = items.quantity - allocated)
    for (const it of items) {
      const total = Number(it.quantity ?? 0);
      const allocated = allocByItem.get(it.id) ?? 0;
      const remaining = total - allocated;
      if (remaining > 0) {
        out.push({
          key: `s:${it.id}`,
          itemId: it.id,
          allocationId: null,
          obraId: null,
          holderId: null,
          nome: it.name,
        caracteristicas: it.caracteristicas,
          categoria: it.category ?? "—",
          tipo: toTipo(it.kind),
          responsavel: "—",
          localizacao: it.location?.trim() || "Estoque Central",
          status: toStatus(it.condition),
          quantidade: remaining,
          unidade: it.unit ?? "un",
          origem: "estoque",
        });
      }
    }
    const codeOf = (id: string) => items.find((i) => i.id === id)?.codigo ?? "";
    return out.sort((a, b) => {
      const ca = codeOf(a.itemId); const cb = codeOf(b.itemId);
      if (ca && cb) return ca.localeCompare(cb, "pt-BR", { numeric: true });
      if (ca) return -1; if (cb) return 1;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
  }, [items, allocations, empName, obraName]);

  const categorias = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.categoria && r.categoria !== "—") s.add(r.categoria);
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = normalize(query);
    const qc = normalize(codeQuery);
    const codeOf = (id: string) => items.find((i) => i.id === id)?.codigo ?? "";
    return rows.filter((r) => {
      if (catFilter !== "__all" && r.categoria !== catFilter) return false;
      if (statusFilter !== "__all" && r.status !== statusFilter) return false;
      if (tipoFilter !== "__all" && r.tipo !== tipoFilter) return false;
      if (obraFilter !== "__all" && (r.obraId ?? "__stock") !== obraFilter) return false;
      if (qc && !normalize(codeOf(r.itemId)).includes(qc)) return false;
      if (!q) return true;
      return [r.nome, r.caracteristicas, r.responsavel, r.localizacao, r.categoria, r.status, r.tipo, codeOf(r.itemId)]
        .some((v) => normalize(String(v ?? "")).includes(q));
    });
  }, [rows, items, query, codeQuery, catFilter, statusFilter, tipoFilter, obraFilter]);

  /** Impressão limpa das ferramentas de uma obra específica. */
  const printByObra = () => {
    const titulo = obraFilter === "__all"
      ? "Ativos — Todas as localizações"
      : obraFilter === "__stock"
        ? "Ativos — Estoque Central"
        : `Ativos — ${obraName(obraFilter)}`;
    const list = filtered.filter((r) => r.tipo === "Ferramenta");
    if (list.length === 0) { toast.error("Nenhuma ferramenta para imprimir"); return; }
    const body = list.map((r) => `<tr><td>${r.nome}</td><td>${r.categoria}</td><td>${r.quantidade} ${r.unidade}</td><td>${r.responsavel}</td><td>${r.localizacao}</td><td>${r.status}</td></tr>`).join("");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${titulo}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px}h1{font-size:18px;margin:0 0 4px}p{font-size:12px;color:#555;margin:0 0 16px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#f1f5f9}@page{size:A4;margin:14mm}</style>
</head><body><h1>${titulo}</h1><p>${list.length} ferramentas · emitido em ${new Date().toLocaleString("pt-BR")}</p>
<table><thead><tr><th>Ferramenta</th><th>Categoria</th><th>Qtd</th><th>Responsável</th><th>Localização</th><th>Status</th></tr></thead><tbody>${body}</tbody></table>
<script>window.onload=()=>window.print()<\/script></body></html>`;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { toast.error("Permita pop-ups para imprimir"); return; }
    w.document.write(html); w.document.close();
  };


  const totals = useMemo(() => {
    const t = {
      itens: new Set(rows.map((r) => r.itemId)).size,
      ferramentas: rows.filter((r) => r.tipo === "Ferramenta").length,
      materiais: rows.filter((r) => r.tipo === "Material").length,
      alocados: rows.filter((r) => r.origem === "alocacao").length,
      estoque: rows.filter((r) => r.origem === "estoque").length,
    };
    return t;
  }, [rows]);

  const exportXlsx = (subset?: string) => {
    const list = subset ? filtered.filter((r) => r.categoria === subset) : filtered;
    if (list.length === 0) { toast.error("Nada para exportar"); return; }
    const ws = XLSX.utils.json_to_sheet(list.map((r) => ({
      Item: r.nome, Tipo: r.tipo, Categoria: r.categoria,
      Quantidade: r.quantidade, Unidade: r.unidade,
      Responsável: r.responsavel, Localização: r.localizacao, Status: r.status,
    })));
    ws["!cols"] = [{ wch: 32 }, { wch: 12 }, { wch: 18 }, { wch: 10 }, { wch: 8 }, { wch: 20 }, { wch: 22 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ativos");
    XLSX.writeFile(wb, `ativos-${subset ?? "geral"}-${Date.now()}.xlsx`);
  };

  // Full export — one row per item with ALL editable fields (used as the import template)
  const exportFullSheet = () => {
    if (items.length === 0) { toast.error("Nada para exportar"); return; }
    const allocByItem = new Map<string, ObraItem[]>();
    for (const a of allocations) {
      const list = allocByItem.get(a.item_id) ?? [];
      list.push(a);
      allocByItem.set(a.item_id, list);
    }
    const rowsOut = items.map((it) => {
      const allocs = allocByItem.get(it.id) ?? [];
      const main = allocs.sort((a, b) => Number(b.quantity) - Number(a.quantity))[0];
      return {
        ID: it.id,
        "Código": it.codigo ?? "",
        Nome: it.name,
        "Característica": it.caracteristicas ?? "",
        Categoria: it.category ?? "",
        Responsável: main ? empName(main.holder_employee_id) : "—",
        Obra: main ? obraName(main.obra_id) : "Estoque Central",
        Status: toStatus(it.condition),
        Quantidade: Number(it.quantity ?? 0),
        "Preço (R$)": it.price ?? "",
        Tipo: toTipo(it.kind),
        Unidade: it.unit ?? "un",
        "Observações": it.notes ?? "",
      };
    });
    const ws = XLSX.utils.json_to_sheet(rowsOut, {
      header: ["ID", "Código", "Nome", "Característica", "Categoria", "Responsável", "Obra", "Status", "Quantidade", "Preço (R$)", "Tipo", "Unidade", "Observações"],
    });
    ws["!cols"] = [{ wch: 38 }, { wch: 14 }, { wch: 30 }, { wch: 32 }, { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 32 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventário");
    XLSX.writeFile(wb, `inventario-completo-${Date.now()}.xlsx`);
    toast.success(`${rowsOut.length} itens exportados`);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      if (json.length === 0) { toast.error("Planilha vazia"); return; }

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      const existingIds = new Set(items.map((i) => i.id));
      const num = (v: unknown) => {
        if (v === "" || v == null) return null;
        const n = Number(String(v).replace(",", "."));
        return Number.isFinite(n) ? n : null;
      };
      let updated = 0, inserted = 0;

      for (const r of json) {
        const name = String(r["Nome"] ?? r["nome"] ?? "").trim();
        if (!name) continue;
        const idRaw = String(r["ID"] ?? r["id"] ?? "").trim();
        const tipoRaw = normalize(String(r["Tipo"] ?? ""));
        const kind: "tool" | "material" =
          tipoRaw.startsWith("mat") ? "material" : "tool";
        const payload: Record<string, unknown> = {
          name,
          codigo: String(r["Código"] ?? r["Codigo"] ?? "").trim() || null,
          category: String(r["Categoria"] ?? "").trim() || null,
          kind,
          quantity: num(r["Quantidade"]) ?? 0,
          unit: String(r["Unidade"] ?? "un").trim() || "un",
          price: num(r["Preço (R$)"] ?? r["Preco"] ?? r["Preço"]),
          condition: String(r["Status"] ?? r["Condição"] ?? "").trim() || null,
          caracteristicas: String(r["Característica"] ?? r["Características"] ?? r["Caracteristica"] ?? r["Caracteristicas"] ?? "").trim() || null,
          notes: String(r["Observações"] ?? r["Observacoes"] ?? "").trim() || null,
        };

        if (idRaw && existingIds.has(idRaw)) {
          await assertItemCodeAvailable(payload.codigo as string | null, idRaw, payload.condition as string | null);
          const { error } = await (supabase as any).from("items").update(payload).eq("id", idRaw);
          if (error) throw new Error(itemSaveError(error));
          updated++;
        } else {
          await assertItemCodeAvailable(payload.codigo as string | null, null, payload.condition as string | null);
          const { error } = await (supabase as any).from("items").insert({ ...payload, created_by: userId });
          if (error) throw new Error(itemSaveError(error));
          inserted++;
        }
      }

      qc.invalidateQueries({ queryKey: ["assets:items"] });
      qc.invalidateQueries({ queryKey: ["assets:obra_items"] });
      bumpInventory();

      toast.success(`Planilha processada: ${updated} atualizado(s), ${inserted} novo(s)`);
    } catch (e: any) {
      qc.invalidateQueries({ queryKey: ["assets:items"] });
      bumpInventory();
      toast.error(itemSaveError(e));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const loading = li || la;



  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">

        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">Gestão de Ativos</h1>
          <p className="text-sm text-muted-foreground">
            Painel único de ferramentas e materiais — sincronizado em tempo real com estoque, obras e responsáveis.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => { refetchItems(); refetchAlloc(); }}>
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="w-full sm:w-auto" variant="outline"><Download className="h-4 w-4" /> Exportar</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportFullSheet}>
                <FileSpreadsheet className="h-4 w-4" /> Planilha completa (para editar/importar)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => exportXlsx()}>Visão atual (com filtros)</DropdownMenuItem>
              {categorias.length > 0 && <DropdownMenuSeparator />}
              {categorias.length > 0 && <DropdownMenuLabel>Por categoria</DropdownMenuLabel>}
              {categorias.map((c) => (
                <DropdownMenuItem key={c} onClick={() => exportXlsx(c)}>{c}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
            }}
          />
          <Button
            className="col-span-2 w-full sm:col-auto sm:w-auto"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            <Upload className="h-4 w-4" /> {importing ? "Importando…" : "Importar Planilha"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Itens únicos</CardTitle></CardHeader><CardContent className="pt-0"><p className="text-2xl font-bold">{totals.itens}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Wrench className="h-3 w-3" />Ferramentas</CardTitle></CardHeader><CardContent className="pt-0"><p className="text-2xl font-bold">{totals.ferramentas}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground flex items-center gap-1"><Boxes className="h-3 w-3" />Materiais</CardTitle></CardHeader><CardContent className="pt-0"><p className="text-2xl font-bold">{totals.materiais}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Em obra</CardTitle></CardHeader><CardContent className="pt-0"><p className="text-2xl font-bold text-amber-400">{totals.alocados}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">No estoque</CardTitle></CardHeader><CardContent className="pt-0"><p className="text-2xl font-bold text-emerald-400">{totals.estoque}</p></CardContent></Card>
      </div>

      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="gap-3 shrink-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2"><Package className="h-4 w-4" /> Inventário consolidado</CardTitle>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row">
              <div className="relative col-span-2 sm:col-auto">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar item, responsável, obra..." className="pl-8 sm:w-64" />
              </div>
              <div className="relative col-span-2 sm:col-auto">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={codeQuery}
                  onChange={(e) => setCodeQuery(e.target.value)}
                  placeholder="Buscar por Código..."
                  inputMode="search"
                  className="pl-8 font-mono sm:w-44"
                />
              </div>
              <Select value={tipoFilter} onValueChange={setTipoFilter}>
                <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Todos tipos</SelectItem>
                  <SelectItem value="Ferramenta">Ferramentas</SelectItem>
                  <SelectItem value="Material">Materiais</SelectItem>
                </SelectContent>
              </Select>
              <Select value={catFilter} onValueChange={setCatFilter}>
                <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Todas categorias</SelectItem>
                  {categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={obraFilter} onValueChange={setObraFilter}>
                <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Obra" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Todas obras</SelectItem>
                  <SelectItem value="__stock">Estoque Central</SelectItem>
                  {obras.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" className="w-full sm:w-auto" onClick={printByObra}>
                <Printer className="mr-2 h-4 w-4" /> Imprimir por Obra
              </Button>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Todos status</SelectItem>
                  {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          {/* Mobile: lista em cartões (tabela de 11 colunas não cabe em telas pequenas) */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 md:hidden [-webkit-overflow-scrolling:touch]">
            {loading ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
            ) : filtered.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Nenhum item encontrado.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {filtered.map((r) => {
                  const it = items.find((i) => i.id === r.itemId);
                  return (
                    <li key={r.key} className="rounded-lg border border-border/60 bg-card/60 p-3">
                      <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-start gap-2">
                        <ItemPhotoDialog item={{ id: r.itemId, name: r.nome, codigo: it?.codigo ?? null, image_url: it?.image_url ?? null }} canEdit onChanged={() => { void refetchItems(); }} />
                        <div className="min-w-0">
                          <ItemDetailDialog
                            item={{
                              id: r.itemId,
                              name: r.nome,
                              codigo: it?.codigo ?? null,
                              category: r.categoria,
                              caracteristicas: it?.caracteristicas ?? null,
                              condition: it?.condition ?? null,
                              unit: r.unidade,
                              quantity: r.quantidade,
                              price: it?.price ?? null,
                              notes: it?.notes ?? null,
                              responsavel: r.responsavel,
                              obra: r.localizacao,
                            }}
                          >
                            <button type="button" className="max-w-full truncate text-left text-sm font-semibold hover:text-primary">
                              {r.nome}
                            </button>
                          </ItemDetailDialog>
                          {r.caracteristicas?.trim() && <p className="break-words text-xs font-medium text-primary">{r.caracteristicas}</p>}
                          <p className="truncate font-mono text-[11px] text-muted-foreground">
                            {it?.codigo ?? "—"} · {r.categoria}
                          </p>
                        </div>
                        <Button size="sm" variant="outline" className="h-8 shrink-0 px-2 text-xs" onClick={() => setEditing(r)}>
                          <Pencil className="h-3 w-3" /> Mover
                        </Button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className={tipoStyle[r.tipo]}>{r.tipo}</Badge>
                        <Badge variant="outline" className={statusStyle[r.status]}>{r.status}</Badge>
                        <span className="font-mono text-xs">{r.quantidade.toLocaleString("pt-BR")} {r.unidade}</span>
                      </div>
                      <div className="mt-1.5 grid grid-cols-2 gap-1 text-[11px]">
                        <p className="truncate text-muted-foreground">Resp.: <span className="text-foreground">{r.responsavel}</span></p>
                        <p className={`truncate ${r.origem === "alocacao" ? "text-amber-300" : "text-emerald-300"}`}>{r.localizacao}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="hidden min-h-0 flex-1 overflow-auto overscroll-contain md:block">

            <Table className="w-full table-fixed text-xs [&_th]:h-8 [&_th]:px-2 [&_th]:text-xs [&_td]:px-2 [&_td]:py-1.5">
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="w-[6%]">Foto</TableHead>
                  <TableHead className="w-[7%]">Código</TableHead>
                  <TableHead className="w-[14%]">Nome</TableHead>
                  <TableHead className="w-[11%]">Característica</TableHead>
                  <TableHead className="w-[10%]">Categoria</TableHead>
                  <TableHead className="w-[11%]">Responsável</TableHead>
                  <TableHead className="w-[12%]">Obra</TableHead>
                  <TableHead className="w-[8%]">Status</TableHead>
                  <TableHead className="w-[7%] text-right">Qtd</TableHead>
                  <TableHead className="w-[7%] text-right">Preço</TableHead>
                  <TableHead className="w-[7%]">Tipo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={12} className="py-10 text-center text-sm text-muted-foreground">Carregando…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={12} className="py-10 text-center text-sm text-muted-foreground">Nenhum item encontrado.</TableCell></TableRow>
                ) : filtered.map((r) => {
                  const it = items.find((i) => i.id === r.itemId);
                  return (
                  <TableRow key={r.key}>
                    <TableCell className="[&_button]:h-10 [&_button]:w-10"><ItemPhotoDialog item={{ id: r.itemId, name: r.nome, codigo: it?.codigo ?? null, image_url: it?.image_url ?? null }} canEdit onChanged={() => { void refetchItems(); }} /></TableCell>
                    <TableCell className="truncate font-mono">{it?.codigo ?? "—"}</TableCell>
                    <TableCell className="truncate font-medium" title={r.nome}>
                      <ItemDetailDialog
                        item={{
                          id: r.itemId,
                          name: r.nome,
                          codigo: it?.codigo ?? null,
                          category: r.categoria,
                          caracteristicas: it?.caracteristicas ?? null,
                          condition: it?.condition ?? null,
                          unit: r.unidade,
                          quantity: r.quantidade,
                          price: it?.price ?? null,
                          notes: it?.notes ?? null,
                          responsavel: r.responsavel,
                          obra: r.localizacao,
                        }}
                      >
                        <button type="button" className="max-w-full truncate text-left hover:text-primary hover:underline">{r.nome}</button>
                      </ItemDetailDialog>
                      {r.caracteristicas?.trim() && <p className="whitespace-normal break-words text-xs font-medium text-primary">{r.caracteristicas}</p>}
                    </TableCell>
                    <TableCell className="truncate text-muted-foreground" title={it?.caracteristicas ?? ""}>{it?.caracteristicas ?? "—"}</TableCell>
                    <TableCell className="truncate text-muted-foreground" title={r.categoria}>{r.categoria}</TableCell>
                    <TableCell className="truncate" title={r.responsavel}>{r.responsavel}</TableCell>
                    <TableCell className="truncate" title={r.localizacao}>
                      <span className={r.origem === "alocacao" ? "text-amber-300" : "text-emerald-300"}>
                        {r.localizacao}
                      </span>
                    </TableCell>
                    <TableCell className="truncate"><Badge variant="outline" className={statusStyle[r.status]}>{r.status}</Badge></TableCell>
                    <TableCell className="truncate text-right font-mono">{r.quantidade.toLocaleString("pt-BR")}<span className="ml-1 text-[10px] text-muted-foreground">{r.unidade}</span></TableCell>
                    <TableCell className="truncate text-right tabular-nums">{it?.price != null ? `R$ ${Number(it.price).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</TableCell>
                    <TableCell className="truncate"><Badge variant="outline" className={tipoStyle[r.tipo]}>{r.tipo}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setEditing(r)}>
                          <Pencil className="h-3 w-3" /> Mover
                        </Button>
                      </div>
                    </TableCell>

                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>


      <DiscardUnitDialog
        target={discarding}
        onClose={() => setDiscarding(null)}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["assets:items"] });
          qc.invalidateQueries({ queryKey: ["assets:obra_items"] });
        }}
      />

      <MoveDialog
        row={editing}
        onClose={() => setEditing(null)}
        employees={employees}
        obras={obras.filter((o) => (o.status ?? "ativa").toLowerCase() !== "concluida" && (o.status ?? "").toLowerCase() !== "concluída")}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["assets:items"] });
          qc.invalidateQueries({ queryKey: ["assets:obra_items"] });
          bumpInventory();
        }}
      />
    </div>
  );
}

type MoveDialogProps = {
  row: AssetRow | null;
  onClose: () => void;
  employees: Employee[];
  obras: Obra[];
  onDone: () => void;
};

function MoveDialog({ row, onClose, employees, obras, onDone }: MoveDialogProps) {
  const [obraId, setObraId] = useState<string>("__central");
  const [holderId, setHolderId] = useState<string>("__none");
  const [status, setStatus] = useState<Status>("Bom");
  const [qty, setQty] = useState<string>("1");
  const [saving, setSaving] = useState(false);
  const [maintenanceJustification, setMaintenanceJustification] = useState("");

  useEffect(() => {
    if (!row) return;
    // Default destination = current location (user can change to anything)
    setObraId(row.obraId ?? "__central");
    setHolderId(row.holderId ?? "__none");
    setStatus(row.status);
    setQty(String(row.quantidade));
    setMaintenanceJustification("");
  }, [row]);

  if (!row) return null;

  const targetObra = obraId === "__central" ? null : obraId;
  const targetHolder = holderId === "__none" ? null : holderId;
  const maxQty = row.quantidade;

  const save = async () => {
    const q = Math.min(Math.max(Number(qty) || 0, 0), maxQty);
    const leavingMaintenance = row.status === "Manutenção" && status !== "Manutenção";
    if (leavingMaintenance && !maintenanceJustification.trim()) {
      toast.error("Informe a justificativa do conserto antes de retirar da manutenção");
      return;
    }
    setSaving(true);
    try {
      // 1) Status → items.condition
      if (status !== row.status) {
        const { error } = await (supabase as any)
          .from("items").update({
            condition: status,
            maintenance_exit_justification: leavingMaintenance ? maintenanceJustification.trim() : null,
          }).eq("id", row.itemId);
        if (error) throw error;
      }

      const sameLocation =
        (row.origem === "estoque" && targetObra === null) ||
        (row.origem === "alocacao" && targetObra === row.obraId);

      if (sameLocation) {
        // Only responsável / status changed — update holder in-place if allocated
        if (row.origem === "alocacao" && row.allocationId && targetHolder !== row.holderId) {
          const { error } = await (supabase as any)
            .from("obra_items")
            .update({ holder_employee_id: targetHolder })
            .eq("id", row.allocationId);
          if (error) throw error;
        }
      } else if (row.origem === "estoque" && targetObra) {
        // Central stock → obra (partial allowed)
        if (q <= 0) throw new Error("Informe uma quantidade válida.");
        const { error } = await (supabase as any).rpc("allocate_stock_to_obra", {
          _item_id: row.itemId,
          _obra_id: targetObra,
          _quantity: q,
          _notes: "Movimentação via Gestão de Ativos",
          _holder_employee_id: targetHolder,
        });
        if (error) throw error;
      } else if (row.origem === "alocacao" && targetObra === null) {
        // Obra → central stock (partial return)
        if (q <= 0) throw new Error("Informe uma quantidade válida.");
        const { error } = await (supabase as any).rpc("receive_stock_from_obra", {
          _obra_id: row.obraId,
          _item_id: row.itemId,
          _quantity: q,
        });
        if (error) throw error;
      } else if (row.origem === "alocacao" && targetObra && targetObra !== row.obraId) {
        // Obra A → Obra B (partial transfer): return to central then allocate
        if (q <= 0) throw new Error("Informe uma quantidade válida.");
        const { error: e1 } = await (supabase as any).rpc("receive_stock_from_obra", {
          _obra_id: row.obraId,
          _item_id: row.itemId,
          _quantity: q,
        });
        if (e1) throw e1;
        const { error: e2 } = await (supabase as any).rpc("allocate_stock_to_obra", {
          _item_id: row.itemId,
          _obra_id: targetObra,
          _quantity: q,
          _notes: "Transferência entre obras via Gestão de Ativos",
          _holder_employee_id: targetHolder,
        });
        if (e2) throw e2;
      }

      toast.success("Ativo atualizado");
      onDone();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao atualizar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transferir / Editar</DialogTitle>
          <DialogDescription>
            {row.nome} · {row.tipo} · atual: {row.localizacao}
            {row.responsavel !== "—" && ` · ${row.responsavel}`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>Nova Obra</Label>
            <Select value={obraId} onValueChange={setObraId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__central">Estoque Central</SelectItem>
                {obras.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Novo Responsável</Label>
            <Select value={holderId} onValueChange={setHolderId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— sem responsável —</SelectItem>
                {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Nova Quantidade (máx {maxQty})</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              max={maxQty}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Permite transferência parcial. Use o máximo para mover o item inteiro.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {row.status === "Manutenção" && status !== "Manutenção" && (
            <div className="grid gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
              <Label>Justificativa do conserto *</Label>
              <Input
                value={maintenanceJustification}
                onChange={(event) => setMaintenanceJustification(event.target.value)}
                placeholder="Ex.: reparo concluído, item testado e pronto"
                maxLength={500}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Salvando…" : "Confirmar transferência"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

