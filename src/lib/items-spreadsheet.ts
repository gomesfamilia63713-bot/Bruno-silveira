import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { assertItemCodeAvailable, itemSaveError } from "@/lib/item-codes";

export type ItemRow = {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
  condition: string | null;
  notes: string | null;
  kind: "tool" | "material";
  unit: string;
  price: number | null;
  location: string;
  codigo?: string | null;
  caracteristicas?: string | null;
  responsavel?: string | null;
  obra?: string | null;
};

const HEADERS = ["ID", "Código", "Nome", "Característica", "Categoria", "Responsável", "Obra", "Status", "Quantidade", "Preço (R$)", "Tipo", "Unidade", "Condição", "Local", "Observações"] as const;

export function exportItemsXlsx(items: ItemRow[], filename: string) {
  const rows = items.map((i) => ({
    ID: i.id,
    "Código": i.codigo ?? "",
    Nome: i.name,
    "Característica": i.caracteristicas ?? "",
    Categoria: i.category ?? "",
    "Responsável": i.responsavel ?? "",
    Obra: i.obra ?? "",
    Status: i.condition ?? "",
    Quantidade: i.quantity,
    "Preço (R$)": i.price ?? "",
    Tipo: i.kind === "tool" ? "Ferramenta" : "Material",
    Unidade: i.unit ?? "un",
    "Condição": i.condition ?? "",
    Local: i.location ?? "estoque",
    Observações: i.notes ?? "",
  }));
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...HEADERS] });
  ws["!cols"] = [{ wch: 38 }, { wch: 14 }, { wch: 30 }, { wch: 30 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 40 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Itens");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export type ParsedRow = {
  id: string | null;
  name: string;
  category: string | null;
  quantity: number;
  unit: string;
  price: number | null;
  condition: string | null;
  location: string;
  kind: "tool" | "material";
  notes: string | null;
  codigo: string | null;
  caracteristicas: string | null;
  responsavel: string | null;
  obra: string | null;
};

export async function parseItemsXlsx(file: File, defaultKind: "tool" | "material"): Promise<ParsedRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  const out: ParsedRow[] = [];
  for (const r of json) {
    const name = String(r["Nome"] ?? r["nome"] ?? "").trim();
    if (!name) continue;
    const idRaw = String(r["ID"] ?? r["id"] ?? "").trim();
    const priceRaw = r["Preço (R$)"] ?? r["Preco"] ?? r["preço"] ?? r["Preço"] ?? "";
    const priceNum = priceRaw === "" || priceRaw == null ? null : Number(String(priceRaw).replace(",", "."));
    const tipoRaw = String(r["Tipo"] ?? "").toLowerCase().trim();
    const kind: "tool" | "material" = tipoRaw.startsWith("ferr") ? "tool" : tipoRaw.startsWith("mat") ? "material" : defaultKind;
    const locRaw = String(r["Local"] ?? "").toLowerCase().trim();
    const location = locRaw === "casa" || locRaw === "casa_bruno" ? "casa_bruno" : "estoque";
    const status = String(r["Status"] ?? r["Condição"] ?? r["Condicao"] ?? "").trim() || null;
    out.push({
      id: idRaw || null,
      name,
      category: String(r["Categoria"] ?? "").trim() || null,
      quantity: Number(String(r["Qtd"] ?? r["Quantidade"] ?? 0).toString().replace(",", ".")) || 0,
      unit: String(r["Unidade"] ?? "un").trim() || "un",
      price: priceNum != null && !Number.isNaN(priceNum) ? priceNum : null,
      condition: status,
      location,
      kind,
      notes: String(r["Observações"] ?? r["Observacoes"] ?? "").trim() || null,
      codigo: String(r["Código"] ?? r["Codigo"] ?? "").trim() || null,
      caracteristicas: String(r["Característica"] ?? r["Caracteristica"] ?? r["Características"] ?? r["Caracteristicas"] ?? "").trim() || null,
      responsavel: String(r["Responsável"] ?? r["Responsavel"] ?? "").trim() || null,
      obra: String(r["Obra"] ?? "").trim() || null,
    });
  }
  return out;
}

export async function applyImportedItems(rows: ParsedRow[], userId: string | undefined) {
  let updated = 0;
  let inserted = 0;
  let reassigned = 0;

  // Prefetch employees/obras for name → id resolution.
  const [{ data: employees }, { data: obras }] = await Promise.all([
    supabase.from("employees").select("id, name").eq("active", true),
    supabase.from("obras").select("id, name, status").neq("status", "concluida"),
  ]);
  const empByName = new Map<string, string>();
  for (const e of employees ?? []) empByName.set((e.name ?? "").trim().toLowerCase(), e.id);
  const obraByName = new Map<string, string>();
  for (const o of obras ?? []) obraByName.set((o.name ?? "").trim().toLowerCase(), o.id);

  for (const r of rows) {
    const payload = {
      name: r.name, category: r.category, quantity: r.quantity, unit: r.unit,
      price: r.price, condition: r.condition, location: r.location, kind: r.kind, notes: r.notes,
      codigo: r.codigo, caracteristicas: r.caracteristicas,
    };
    let itemId = r.id;
    await assertItemCodeAvailable(r.codigo, itemId, r.condition);
    if (itemId) {
      const { error } = await supabase.from("items").update(payload).eq("id", itemId);
      if (error) throw new Error(itemSaveError(error));
      updated++;
    } else {
      const { data, error } = await supabase.from("items").insert({ ...payload, created_by: userId }).select("id").single();
      if (error) throw new Error(itemSaveError(error));
      if (!error && data) { inserted++; itemId = data.id; }
    }

    // Apply Responsável / Obra reassignment when possible.
    if (itemId) {
      const obraId = r.obra ? obraByName.get(r.obra.trim().toLowerCase()) ?? null : null;
      const holderId = r.responsavel ? empByName.get(r.responsavel.trim().toLowerCase()) ?? null : null;
      try {
        if (r.obra && obraId) {
          // Transfer/allocate to selected obra; keeps holder if provided.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.rpc as any)("transfer_item_between_obras", { _item_id: itemId, _new_obra_id: obraId });
          if (holderId) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase.rpc as any)("set_item_holder", { _item_id: itemId, _new_holder_employee_id: holderId });
          }
          reassigned++;
        } else if (r.responsavel === "" && r.obra === "") {
          // Explicit clear: return everything to stock.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.rpc as any)("transfer_item_between_obras", { _item_id: itemId, _new_obra_id: null });
        } else if (holderId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.rpc as any)("set_item_holder", { _item_id: itemId, _new_holder_employee_id: holderId });
        }
      } catch {
        // Non-fatal — item core fields still updated.
      }
    }
  }
  return { updated, inserted, reassigned };
}
