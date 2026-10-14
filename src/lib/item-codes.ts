import { supabase } from "@/integrations/supabase/client";

export const CODE_IN_USE_MESSAGE = "Código já em uso por outro item. Informe um código diferente.";

export function itemSaveError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String(error.message);
    if (("code" in error && error.code === "23505" && /code|codigo/i.test(message)) || /Código já em uso|inventory_code_reservations/i.test(message)) {
      return CODE_IN_USE_MESSAGE;
    }
    return message;
  }
  return "Não foi possível salvar o item.";
}

/** Early feedback only: the database reservation is the concurrency-safe authority. */
export async function assertItemCodeAvailable(code: string | null, itemId?: string | null, condition?: string | null) {
  if (condition === "Descarte" || !code?.trim()) return;
  const normalized = code.trim();
  const literalPattern = normalized.replace(/[\\%_]/g, "\\$&");
  let query = supabase.from("items").select("id").ilike("codigo", literalPattern).or("condition.is.null,condition.neq.Descarte").limit(1);
  if (itemId) query = query.neq("id", itemId);
  const { data, error } = await query;
  if (error) throw new Error(itemSaveError(error));
  if (data?.length) throw new Error(CODE_IN_USE_MESSAGE);
}