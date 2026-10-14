import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-role";

/** Realtime count of pending material_requests (admins only). */
export function usePendingRequestsCount() {
  const { isAdmin } = useIsAdmin();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isAdmin) { setCount(0); return; }
    let alive = true;

    const load = async () => {
      const { count: c } = await (supabase as any)
        .from("material_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pendente");
      if (alive) setCount(c ?? 0);
    };
    load();

    const ch = supabase
      .channel("sidebar-pending-mr")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "material_requests" },
        () => load(),
      )
      .subscribe();

    return () => { alive = false; supabase.removeChannel(ch); };
  }, [isAdmin]);

  return count;
}
