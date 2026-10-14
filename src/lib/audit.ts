import { supabase } from "@/integrations/supabase/client";

export type AuditCategory =
  | "auth"
  | "stock"
  | "item"
  | "obra"
  | "pedido"
  | "producao"
  | "funcionario"
  | "sistema";

interface AuditExtra {
  item_id?: string | null;
  obra_id?: string | null;
  quantity?: number | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Registra uma ação do usuário na trilha de auditoria (tabela system_logs).
 * Nunca lança erro: auditoria não pode quebrar o fluxo do usuário.
 */
export async function logAudit(category: AuditCategory, message: string, extra: AuditExtra = {}) {
  try {
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    await supabase.from("system_logs").insert({
      category,
      message,
      item_id: extra.item_id ?? null,
      obra_id: extra.obra_id ?? null,
      quantity: extra.quantity ?? null,
      actor_id: user?.id ?? null,
      metadata: {
        ...(extra.metadata ?? {}),
        actor_email: user?.email ?? null,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      },
    } as never);
  } catch {
    /* silencioso */
  }
}
