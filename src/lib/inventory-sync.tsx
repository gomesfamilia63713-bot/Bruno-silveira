import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { bumpInventory } from "@/lib/inventory-store";
import { useAuth } from "@/hooks/use-auth";

/**
 * Global inventory sync — a single Realtime subscription that keeps
 * the "Materiais", "Ferramentas" and "Gestão de Ativos" tabs in sync.
 *
 * Any change to items / obra_items / employees / obras invalidates
 * every query key those pages use, so the UI reflects the update
 * across all tabs simultaneously without a reload.
 */
export function InventorySyncProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const { session, loading } = useAuth();
  const accessToken = session?.access_token;

  useEffect(() => {
    if (loading || !accessToken) return;
    void supabase.realtime.setAuth(accessToken);
    const invalidateAll = () => {
      // asset-management-page keys
      qc.invalidateQueries({ queryKey: ["assets:items"] });
      qc.invalidateQueries({ queryKey: ["assets:obra_items"] });
      qc.invalidateQueries({ queryKey: ["assets:employees"] });
      qc.invalidateQueries({ queryKey: ["assets:obras"] });
      // inventory-page keys (both "tool" and "material" instances)
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["items-in-use"] });
      qc.invalidateQueries({ queryKey: ["item-current-location"] });
      qc.invalidateQueries({ queryKey: ["item-holder"] });
      qc.invalidateQueries({ queryKey: ["last-out-by-item"] });
      qc.invalidateQueries({ queryKey: ["item-active-allocation"] });
      qc.invalidateQueries({ queryKey: ["obra-allocated-items"] });
      qc.invalidateQueries({ queryKey: ["obras-active-list"] });
      qc.invalidateQueries({ queryKey: ["obras-active-for-inline"] });
      qc.invalidateQueries({ queryKey: ["obras-for-receive"] });
      qc.invalidateQueries({ queryKey: ["employees-active-list"] });
      qc.invalidateQueries({ queryKey: ["employees-active-for-inline"] });
      qc.invalidateQueries({ queryKey: ["movements"] });
      qc.invalidateQueries({ queryKey: ["obras"] });
      qc.invalidateQueries({ queryKey: ["obra-counts"] });
      qc.invalidateQueries({ queryKey: ["obra_items"] });
      qc.invalidateQueries({ queryKey: ["item-lifecycle-history"] });
      qc.invalidateQueries({ queryKey: ["overdue-tools"] });
      qc.invalidateQueries({ queryKey: ["overdue-tool-days"] });
      qc.invalidateQueries({ queryKey: ["maintenance-alerts"] });
      qc.invalidateQueries({ queryKey: ["mobile-obras"] });
      qc.invalidateQueries({ queryKey: ["mobile-obra-allocations"] });
      qc.invalidateQueries({ queryKey: ["obras-active-for-inline"] });
      qc.invalidateQueries({ queryKey: ["item-holder-history"] });
      qc.invalidateQueries({ queryKey: ["epi-events"] });
      bumpInventory();
    };

    const handleItemChange = (payload: { new: Record<string, unknown> }) => {
      const item = payload.new;
      if (typeof item.id === "string" && typeof item.alert_resolved_at === "string") {
        // Stop older reads from restoring the alert after the live update.
        void qc.cancelQueries({ queryKey: ["overdue-tool-days"] });
        void qc.cancelQueries({ queryKey: ["overdue-tools"] });
        void qc.cancelQueries({ queryKey: ["maintenance-alerts"] });
        const resolvedAt = item.alert_resolved_at;
        qc.setQueriesData<Record<string, number>>({ queryKey: ["overdue-tool-days"] }, (old) => {
          if (!old) return old;
          const next = { ...old }; delete next[item.id as string]; return next;
        });
        qc.setQueriesData<Array<{ item_id: string; created_at: string }>>({ queryKey: ["overdue-tools"] }, (old) => old?.filter((row) => row.item_id !== item.id || row.created_at > resolvedAt));
        qc.setQueriesData<Array<{ id: string; since: string }>>({ queryKey: ["maintenance-alerts"] }, (old) => old?.filter((row) => row.id !== item.id || row.since > resolvedAt));
      }
      invalidateAll();
    };
    const ch = supabase
      .channel("inventory-global-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "items" }, handleItemChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "obra_items" }, invalidateAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, invalidateAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "obras" }, invalidateAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_movement_log" }, invalidateAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "item_lifecycle_history" }, invalidateAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "movements" }, invalidateAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "epi_events" }, invalidateAll)
      .subscribe((status) => { if (status === "SUBSCRIBED") invalidateAll(); });

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") invalidateAll();
    };
    window.addEventListener("online", invalidateAll);
    window.addEventListener("focus", invalidateAll);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      supabase.removeChannel(ch);
      window.removeEventListener("online", invalidateAll);
      window.removeEventListener("focus", invalidateAll);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [qc, accessToken, loading]);

  return <>{children}</>;
}
