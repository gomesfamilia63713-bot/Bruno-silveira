import { get, set } from "idb-keyval";
import { supabase } from "@/integrations/supabase/client";
import { isRetryableError } from "@/lib/connectivity";

const KEY = "bs-request-queue-v1";
let queueOperation: Promise<unknown> = Promise.resolve();

export type PendingRequest = {
  clientId: string;
  token: string;
  kind: "pedido" | "devolucao";
  items: any[];
  notes: string | null;
  destination?: "obra" | "mochila";
  obraId?: string | null;
  createdAt: string;
  blockedReason?: string | null;
};

const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}
export function onRequestQueueChange(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export async function readRequestQueue(): Promise<PendingRequest[]> {
  return ((await get(KEY)) as PendingRequest[] | undefined) ?? [];
}

async function writeQueue(list: PendingRequest[]) {
  await set(KEY, list);
  notify();
}

function serializeQueue<T>(operation: () => Promise<T>): Promise<T> {
  const next = queueOperation.then(operation, operation);
  queueOperation = next.then(() => undefined, () => undefined);
  return next;
}

async function sendRequest(r: PendingRequest) {
  const items = r.items.map((item) => ({
    ...item,
    client_id: r.clientId,
    requested_at: r.createdAt,
  }));
  const { error } = await (supabase as any).rpc("create_material_request_by_token", {
    _token: r.token,
    _kind: r.kind,
    _items: items,
    _notes: r.notes ?? "",
    _destination: r.destination ?? null,
    _obra_id: r.destination === "obra" ? (r.obraId ?? null) : null,
  });
  if (error) throw error;
}

let syncing = false;

/** Envia tudo que está na fila de pedidos/devoluções. Mantém o que falhar. */
export async function flushRequestQueue(): Promise<{ sent: number; left: number }> {
  if (syncing) return { sent: 0, left: (await readRequestQueue()).length };
  syncing = true;
  try {
    return await serializeQueue(async () => {
      const list = await readRequestQueue();
      const remaining: PendingRequest[] = [];
      let sent = 0;
      for (let index = 0; index < list.length; index++) {
        const r = list[index];
        if (r.blockedReason) {
          remaining.push(r);
          continue;
        }
        try {
          await sendRequest(r);
          sent++;
        } catch (error) {
          if (isRetryableError(error)) {
            remaining.push(...list.slice(index));
            break;
          }
          remaining.push({
            ...r,
            blockedReason: (error as Error).message || "Revise este envio antes de tentar novamente.",
          });
        }
      }
      await writeQueue(remaining);
      return { sent, left: remaining.length };
    });
  } finally {
    syncing = false;
  }
}

/** Envia agora se houver rede; senão guarda no celular para enviar depois. */
export async function submitRequest(r: PendingRequest): Promise<"sent" | "queued"> {
  try {
    await sendRequest(r);
    return "sent";
  } catch (error) {
    if (!isRetryableError(error)) throw error;
  }
  await serializeQueue(async () => {
    const list = await readRequestQueue();
    if (!list.some((queued) => queued.clientId === r.clientId)) list.push(r);
    await writeQueue(list);
  });
  return "queued";
}
