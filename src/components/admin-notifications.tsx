import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-role";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

/**
 * Admin-only realtime + Web Push listener.
 * Subscribes to new material_requests and shows a toast + browser Notification.
 */
export function AdminNotifications() {
  const { isAdmin } = useIsAdmin();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const empCacheRef = useRef<Record<string, string>>({});

  // Ask for Notification permission once (admins only)
  useEffect(() => {
    if (!isAdmin) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      try { Notification.requestPermission().catch(() => {}); } catch {}
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel(`admin-notifications-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "material_requests" },
        async (payload) => {
          const row: any = payload.new ?? {};
          const kind = row.kind === "devolucao" ? "Devolução" : "Pedido";
          let empName = empCacheRef.current[row.employee_id];
          if (!empName && row.employee_id) {
            const { data } = await supabase.from("employees").select("name").eq("id", row.employee_id).maybeSingle();
            empName = data?.name ?? "Funcionário";
            empCacheRef.current[row.employee_id] = empName;
          }
          const items: any[] = Array.isArray(row.items) ? row.items : [];
          const summary = items.slice(0, 3).map((i) => `${i.quantity}× ${i.name}${i.manual ? " (manual)" : ""}`).join(", ");

          toast.info(`${kind} de ${empName ?? "Funcionário"}`, {
            description: summary || row.notes || "Novo pedido recebido",
            action: { label: "Abrir", onClick: () => navigate({ to: "/pedidos" }) },
            duration: 8000,
          });

          try {
            if ("Notification" in window && Notification.permission === "granted") {
              const n = new Notification(`${kind} — ${empName ?? "Funcionário"}`, {
                body: summary || "Novo pedido recebido",
                tag: `mr-${row.id}`,
              });
              n.onclick = () => { window.focus(); navigate({ to: "/pedidos" }); n.close(); };
            }
          } catch {}
          try { navigator.vibrate?.(150); } catch {}

          qc.invalidateQueries({ queryKey: ["material_requests"] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isAdmin, qc, navigate]);

  return null;
}
