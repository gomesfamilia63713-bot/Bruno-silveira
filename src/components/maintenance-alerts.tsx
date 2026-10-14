import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wrench } from "lucide-react";
import { toast } from "sonner";
import { useDismissedOverdue } from "@/lib/overdue-tools";
import { supabase } from "@/integrations/supabase/client";

export const MAINTENANCE_ALERT_DAYS = 7;
const REMINDER_MS = 30 * 60_000;

type Row = { id: string; name: string; codigo: string | null; caracteristicas: string | null; resolved: string | null; since: string; days: number };

export function MaintenanceAlerts() {
  const dismissed = useDismissedOverdue();
  const { data: queryRows = [] } = useQuery({
    queryKey: ["maintenance-alerts"],
    queryFn: async (): Promise<Row[]> => {
      const { data: items, error } = await supabase
        .from("items")
        .select("id, name, codigo, caracteristicas, updated_at, alert_resolved_at")
        .eq("condition", "Manutenção");
      if (error) throw error;
      const ids = (items ?? []).map((i) => i.id);
      const entered: Record<string, string> = {};
      for (let i = 0; i < ids.length; i += 200) {
        const { data: hist } = await supabase
          .from("item_lifecycle_history")
          .select("item_id, occurred_at")
          .eq("event_type", "maintenance_in")
          .in("item_id", ids.slice(i, i + 200));
        for (const h of hist ?? []) {
          if (!entered[h.item_id] || h.occurred_at > entered[h.item_id]) entered[h.item_id] = h.occurred_at;
        }
      }
      return (items ?? [])
        .map((i) => {
          const since = entered[i.id] ?? i.updated_at;
          return { id: i.id, name: i.name, codigo: i.codigo, caracteristicas: i.caracteristicas, resolved: i.alert_resolved_at, since, days: Math.floor((Date.now() - new Date(since).getTime()) / 86_400_000) };
        })
        .filter((r) => !r.resolved || r.resolved < r.since)
        .sort((a, b) => b.days - a.days);
    },
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const rows = useMemo(() => queryRows.filter((r) => !dismissed.includes(r.id)), [queryRows, dismissed]);
  const late = useMemo(() => rows.filter((r) => r.days >= MAINTENANCE_ALERT_DAYS), [rows]);

  useEffect(() => {
    if (late.length === 0) return;
    const remind = () =>
      toast.warning(`${late.length} item(ns) parado(s) na manutenção há ${MAINTENANCE_ALERT_DAYS}+ dias`, {
        description: late.slice(0, 3).map((r) => `${r.name} (${r.days}d)`).join(" · "),
        id: "maintenance-reminder",
      });
    remind();
    const iv = window.setInterval(remind, REMINDER_MS);
    return () => window.clearInterval(iv);
  }, [late.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (rows.length === 0) return null;

  return (
    <div className="px-4 pt-4 md:px-6">
      <div className={`rounded-lg border p-3 ${late.length ? "border-destructive/40 bg-destructive/10" : "border-border bg-card"}`}>
        <p className={`flex items-center gap-2 text-sm font-semibold ${late.length ? "text-destructive" : "text-foreground"}`}>
          <Wrench className={`h-4 w-4 ${late.length ? "animate-pulse" : ""}`} />
          {late.length
            ? `${late.length} de ${rows.length} item(ns) na manutenção há ${MAINTENANCE_ALERT_DAYS}+ dias`
            : `${rows.length} item(ns) em manutenção — nenhum atrasado`}
        </p>
        {late.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {late.slice(0, 12).map((r) => (
              <li key={r.id} className="rounded-md border border-destructive/30 bg-background px-2 py-1 text-xs">
                {r.codigo && <span className="mr-1 font-mono text-muted-foreground">{r.codigo}</span>}
                <span className="block font-medium">{r.name}</span>
                {r.caracteristicas?.trim() && <span className="block break-words font-medium text-primary">{r.caracteristicas}</span>}
                <span className="font-semibold text-destructive">{r.days} dias</span>
              </li>
            ))}
            {late.length > 12 && <li className="px-2 py-1 text-xs text-muted-foreground">+{late.length - 12}</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
