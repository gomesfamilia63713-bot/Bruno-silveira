import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { flushWhatsappQueue } from "@/lib/whatsapp-link";
import { flushQueue } from "@/lib/punch-queue";
import { flushRequestQueue } from "@/lib/request-queue";

export const OFFLINE_SYNC_COMPLETE_EVENT = "bs:offline-sync-complete";

/**
 * Sincronização automática global (todas as telas: Ponto, Pedidos, Produção, Estoque).
 * Roda imediatamente ao voltar a conexão, ao focar a aba e a cada 30s.
 */
export function OfflineAutoSync() {
  const qc = useQueryClient();

  useEffect(() => {
    let running = false;

    const sync = async () => {
      if (running || typeof navigator === "undefined" || navigator.onLine === false) return;
      running = true;
      try {
        const [, punches, requests] = await Promise.all([
          qc.resumePausedMutations().catch(() => undefined),
          flushQueue().catch(() => ({ sent: 0, left: 0 })),
          flushRequestQueue().catch(() => ({ sent: 0, left: 0 })),
        ]);
        const wa = flushWhatsappQueue();
        await qc.invalidateQueries();
        window.dispatchEvent(new CustomEvent(OFFLINE_SYNC_COMPLETE_EVENT, {
          detail: { punches, requests },
        }));
        if (wa > 0) toast.info(`${wa} mensagem(ns) de WhatsApp reaberta(s)`);

      } finally {
        running = false;
      }
    };

    void sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", () => {});
    window.addEventListener("focus", sync);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void sync();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    const iv = window.setInterval(sync, 30000);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(iv);
    };
  }, [qc]);

  return null;
}
