import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const OVERDUE_DAYS_LIMIT = 8;

/* ------------------------------------------------------------------ */
/* Store global de alertas dispensados (justificados / devolvidos).    */
/* Compartilhado por TODAS as telas: some instantaneamente em todas.   */
/* ------------------------------------------------------------------ */
let dismissedIds: string[] = [];
const listeners = new Set<() => void>();
const EMPTY_IDS: string[] = [];
function emit() { listeners.forEach((l) => l()); }
export function restoreOverdue(...ids: (string | null | undefined)[]) {
  dismissedIds = dismissedIds.filter((id) => !ids.includes(id));
  emit();
}

/** Remove o alerta do item (e da alocação) de todas as telas. */
export function dismissOverdue(...ids: (string | null | undefined)[]) {
  const next = ids.filter(Boolean) as string[];
  const added = next.filter((id) => !dismissedIds.includes(id));
  if (added.length === 0) return;
  dismissedIds = [...dismissedIds, ...added];
  emit();
  window.setTimeout(() => restoreOverdue(...added), 10_000);
}

export function useDismissedOverdue() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => dismissedIds,
    () => EMPTY_IDS,
  );
}

/** item_id -> max days late (apenas ferramentas com 8+ dias sem devolução) */
export function useOverdueToolDays() {
  const dismissed = useDismissedOverdue();
  const query = useQuery({
    queryKey: ["overdue-tool-days"],
    queryFn: async () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - OVERDUE_DAYS_LIMIT);
      const { data, error } = await supabase
        .from("obra_items")
        .select("id, item_id, created_at, quantity, notes, item:items(kind, alert_resolved_at)")
        .lte("created_at", cutoff.toISOString())
        .gt("quantity", 0);
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const r of (data ?? []) as any[]) {
        if (r.item?.kind !== "tool" || !r.item_id || (r.notes ?? "").trim() || (r.item.alert_resolved_at && r.item.alert_resolved_at >= r.created_at)) continue;
        const days = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86_400_000);
        map[r.item_id] = Math.max(map[r.item_id] ?? 0, days);
      }
      return map;
    },
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const raw = query.data ?? {};
  const data: Record<string, number> = {};
  for (const [itemId, days] of Object.entries(raw)) {
    if (!dismissed.includes(itemId)) data[itemId] = days;
  }
  return { ...query, data };
}

/** Atualiza os alertas quando alocações mudam (devolução/recebimento). */
export function useOverdueRealtimeSync(onChange: () => void) {
  const [cb] = useState(() => onChange);
  useEffect(() => {
    const channel = supabase
      .channel("overdue-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "obra_items" }, () => cb())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [cb]);
}
