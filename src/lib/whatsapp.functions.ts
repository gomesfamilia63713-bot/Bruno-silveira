import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Status da configuração do provedor de WhatsApp (sem expor segredos). */
export const getWhatsappStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const evolution = !!process.env["WHATSAPP_API_URL"] && !!process.env["WHATSAPP_API_KEY"];
    const cloud = !!process.env["WHATSAPP_PHONE_NUMBER_ID"] && !!process.env["WHATSAPP_TOKEN"];
    return {
      provider: evolution ? "evolution" : cloud ? "cloud" : null,
      configured: evolution || cloud,
      supportsGroups: evolution,
    };
  });

/** Envia uma mensagem de teste para todos os contatos ativos. */
export const sendWhatsappTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Somente administradores");
    const { notifyAdminsWhatsApp } = await import("@/lib/whatsapp.server");
    return notifyAdminsWhatsApp(
      "✅ BS TOOLS — teste de notificação. Se você recebeu esta mensagem, os alertas de pedidos e devoluções estão funcionando.",
    );
  });

/** Notifica administradores (WhatsApp) sobre uma saída de estoque registrada. */
export const notifyStockExit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    item: string; quantity: number; unit: string; employee: string; obra: string | null; when: string;
  }) => input)
  .handler(async ({ data }) => {
    const { notifyAdminsWhatsApp } = await import("@/lib/whatsapp.server");
    const text =
      `📦 *SAÍDA DE ESTOQUE*\n` +
      `Item: ${data.item}\n` +
      `Qtd: ${data.quantity} ${data.unit}\n` +
      `Responsável: ${data.employee}\n` +
      `Obra: ${data.obra ?? "sem obra"}\n` +
      `Data/hora: ${data.when}`;
    return notifyAdminsWhatsApp(text);
  });
