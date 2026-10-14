import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";

/**
 * Descarte unitário: abate SOMENTE a quantidade informada do saldo do item
 * e acumula essa quantidade em um registro de Descarte (mesmo nome/código),
 * preservando o restante do estoque. Registra histórico + auditoria.
 */
export interface DiscardSource {
  itemId: string;
  name: string;
  /** Alocação em obra (opcional): a quantidade volta ao estoque antes do descarte. */
  obraId?: string | null;
  obraName?: string | null;
  responsavel?: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export async function discardUnits(src: DiscardSource, quantity: number, notes?: string) {
  const qty = Math.round((Number(quantity) || 0) * 100) / 100;
  if (qty <= 0) throw new Error("Informe uma quantidade válida para descarte.");

  // 1) Se estiver alocado em obra, retorna essa quantidade ao estoque central primeiro.
  if (src.obraId) {
    const { error } = await db.rpc("receive_stock_from_obra", {
      _obra_id: src.obraId,
      _item_id: src.itemId,
      _quantity: qty,
    });
    if (error) throw error;
  }

  // 2) Lê o item de origem.
  const { data: item, error: readErr } = await db
    .from("items")
    .select("id,name,category,kind,unit,price,location,codigo,caracteristicas,quantity,condition,notes,image_url")
    .eq("id", src.itemId)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!item) throw new Error("Item não encontrado.");

  const available = Number(item.quantity ?? 0);
  if (qty > available) throw new Error(`Saldo insuficiente. Disponível: ${available}`);

  if (qty >= available && String(item.condition ?? "") !== "Descarte") {
    // Descarte total: o próprio item vira Descarte, mantendo histórico.
    const { error } = await db.from("items")
      .update({ condition: "Descarte", quantity: qty })
      .eq("id", item.id);
    if (error) throw error;
  } else {
    // Descarte parcial: abate do saldo e acumula em um registro de Descarte irmão.
    const { error: decErr } = await db.from("items")
      .update({ quantity: Math.round((available - qty) * 100) / 100 })
      .eq("id", item.id);
    if (decErr) throw decErr;

    const { data: twin } = await db
      .from("items")
      .select("id,quantity")
      .eq("name", item.name)
      .eq("kind", item.kind)
      .eq("condition", "Descarte")
      .neq("id", item.id)
      .maybeSingle();

    if (twin) {
      const { error } = await db.from("items")
        .update({ quantity: Math.round(((Number(twin.quantity) || 0) + qty) * 100) / 100 })
        .eq("id", twin.id);
      if (error) throw error;
      await db.from("item_lifecycle_history").insert({
        item_id: twin.id,
        item_name: item.name,
        item_code: item.codigo,
        event_type: "discarded",
        occurred_at: new Date().toISOString(),
        quantity: qty,
        justification: notes?.trim() || "Descarte unitário",
        obra_id: src.obraId ?? null,
        metadata: { source_item_id: item.id, partial_discard: true },
      });
    } else {
      const { data: discardedItem, error } = await db.from("items").insert({
        name: item.name,
        category: item.category,
        kind: item.kind,
        unit: item.unit,
        price: item.price,
        location: item.location,
        codigo: null,
        caracteristicas: item.caracteristicas,
        image_url: item.image_url,
        condition: "Descarte",
        quantity: qty,
        notes: notes ?? "Descarte unitário",
        discarded_at: new Date().toISOString(),
      }).select("id").single();
      if (error) throw error;
      const { data: firstOperation } = await db.from("stock_movement_log")
        .select("created_at").eq("item_id", item.id).not("obra_id", "is", null)
        .order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (discardedItem) {
        await db.from("item_lifecycle_history").insert({
          item_id: discardedItem.id,
          item_name: item.name,
          item_code: item.codigo,
          event_type: "discarded",
          operation_started_at: firstOperation?.created_at ?? null,
          occurred_at: new Date().toISOString(),
          quantity: qty,
          justification: notes?.trim() || "Descarte unitário",
          obra_id: src.obraId ?? null,
          metadata: { source_item_id: item.id, partial_discard: true },
        });
      }
    }
  }

  // 3) Histórico de movimentação + auditoria (unitário).
  const detail = [
    src.obraName ? `obra: ${src.obraName}` : null,
    src.responsavel && src.responsavel !== "—" ? `responsável: ${src.responsavel}` : null,
    notes?.trim() ? notes.trim() : null,
  ].filter(Boolean).join(" · ");

  await db.from("stock_movement_log").insert({
    item_id: item.id,
    kind: "out",
    quantity: qty,
    obra_id: src.obraId ?? null,
    destination: "Descarte",
    notes: `Descarte unitário${detail ? ` — ${detail}` : ""}`,
  });

  await logAudit(
    "item",
    `Descarte unitário: ${qty} ${item.unit ?? "un"} de "${item.name}"${detail ? ` (${detail})` : ""}`,
    { item_id: item.id, obra_id: src.obraId ?? null, quantity: qty },
  );

  return { discarded: qty };
}
