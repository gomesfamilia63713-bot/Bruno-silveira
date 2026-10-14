import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import type { QueryClient } from "@tanstack/react-query";
import { useIsMutating, useMutationState, useQueryClient } from "@tanstack/react-query";
import { del, get, set } from "idb-keyval";
import { CloudOff, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

/** UUID gerado no frontend: garante idempotência do envio (mesmo após reenvio offline). */
export function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}


const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get(key).then((v) => (v === undefined ? null : (v as string))),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
  key: "bs-tools-offline-cache",
  throttleTime: 1000,
});

export function OfflineQueryProvider({
  client,
  children,
}: {
  client: QueryClient;
  children: React.ReactNode;
}) {
  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24 * 30,
        dehydrateOptions: {
          // Nunca persistir gravações: elas não podem ser reexecutadas depois de
          // recarregar a página (a função original se perde) e ficavam presas
          // para sempre no aviso "Sincronizando dados".
          // Pontos, pedidos e devoluções têm fila própria em IndexedDB.
          shouldDehydrateMutation: () => false,
        },
      }}
      onSuccess={() => {
        void client.resumePausedMutations();
      }}
    >
      <OfflineIndicator />
      {children}
    </PersistQueryClientProvider>
  );
}

export function useIsOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/** Quantidade de gravações aguardando envio (pausadas ou em retry). */
export function usePendingWrites() {
  const paused = useMutationState({
    filters: { status: "pending" },
    select: (m) => m.state.isPaused,
  });
  const mutating = useIsMutating();
  return { total: paused.length, pausedCount: paused.filter(Boolean).length, mutating };
}

function OfflineIndicator() {
  const online = useIsOnline();
  const client = useQueryClient();
  const { total } = usePendingWrites();

  // Watchdog: se, com internet, algo ficar "sincronizando" por mais de 20s,
  // é gravação travada — descarta para o aviso não ficar preso na tela.
  useEffect(() => {
    if (!online || total === 0) return;
    const t = window.setTimeout(() => {
      void client.resumePausedMutations().catch(() => {});
      window.setTimeout(() => {
        const stuck = client
          .getMutationCache()
          .getAll()
          .filter((m: { state: { status: string } }) => m.state.status === "pending");
        if (stuck.length > 0) client.getMutationCache().clear();
      }, 5000);
    }, 20000);
    return () => window.clearTimeout(t);
  }, [online, total, client]);

  if (online && total === 0) {
    return (
      <div
        role="status"
        aria-label="Online"
        className="pointer-events-none fixed bottom-2 right-2 z-50 flex items-center gap-1.5 rounded-full border border-border/50 bg-background/70 px-2 py-1 text-[10px] font-semibold text-muted-foreground backdrop-blur no-print"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Online
      </div>
    );
  }

  const syncing = online && total > 0;
  return (
    <div
      role="status"
      className={`sticky top-0 z-50 flex items-center justify-center gap-2 px-3 py-2 text-center text-xs font-semibold ${
        syncing
          ? "bg-sky-500/15 text-sky-400"
          : "bg-amber-500/15 text-amber-400"
      }`}
    >
      {syncing ? (
        <>
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Sincronizando dados... ({total})
        </>
      ) : (
        <>
          <CloudOff className="h-3.5 w-3.5" />
          Modo Offline (Seus dados estão seguros localmente)
          {total > 0 ? ` — ${total} na fila` : ""}
        </>
      )}
    </div>
  );
}
