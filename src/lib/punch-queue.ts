import { get, set } from "idb-keyval";
import { supabase } from "@/integrations/supabase/client";
import { isRetryableError } from "@/lib/connectivity";

const KEY = "bs-punch-queue-v1";
let queueOperation: Promise<unknown> = Promise.resolve();

export type PendingPunch = {
  clientId: string;
  token: string;
  type: string;
  punchedAt: string;
  photo: Blob | null;
  latitude: number | null;
  longitude: number | null;
  cep: string | null;
  street: string | null;
  neighborhood: string | null;
  city: string | null;
  justification?: string | null;
  justificationAudio?: Blob | null;
  justificationAudioDurationS?: number | null;
  blockedReason?: string | null;
};

export async function readQueue(): Promise<PendingPunch[]> {
  return ((await get(KEY)) as PendingPunch[] | undefined) ?? [];
}

async function writeQueue(list: PendingPunch[]) {
  await set(KEY, list);
  notify();
}

function serializeQueue<T>(operation: () => Promise<T>): Promise<T> {
  const next = queueOperation.then(operation, operation);
  queueOperation = next.then(() => undefined, () => undefined);
  return next;
}

const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((l) => l());
}
export function onQueueChange(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export async function enqueuePunch(p: PendingPunch) {
  await serializeQueue(async () => {
    const list = await readQueue();
    if (!list.some((queued) => queued.clientId === p.clientId)) list.push(p);
    await writeQueue(list);
  });
}

async function sendPunch(p: PendingPunch) {
  if (p.justificationAudio) {
    const form = new FormData();
    form.append("token", p.token);
    form.append("clientId", p.clientId);
    form.append("type", p.type);
    form.append("punchedAt", p.punchedAt);
    form.append("justification", p.justification ?? "");
    form.append("durationS", String(p.justificationAudioDurationS ?? 0));
    form.append("audio", p.justificationAudio, "justificativa.wav");
    if (p.latitude != null) form.append("latitude", String(p.latitude));
    if (p.longitude != null) form.append("longitude", String(p.longitude));
    if (p.cep) form.append("cep", p.cep);
    if (p.street) form.append("street", p.street);
    if (p.neighborhood) form.append("neighborhood", p.neighborhood);
    if (p.city) form.append("city", p.city);
    const response = await fetch("/api/public/punch-justification", { method: "POST", body: form });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      const error = new Error(payload.error || "Falha ao enviar a justificativa.") as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    return;
  }
  let photoPath: string | null = null;
  if (p.photo) {
    const path = `${p.token}/${p.clientId}.jpg`;
    const { error } = await supabase.storage
      .from("time-punch-photos")
      .upload(path, p.photo, { contentType: "image/jpeg", upsert: false });
    const uploadMessage = error?.message.toLowerCase() ?? "";
    const alreadyUploaded = uploadMessage.includes("already exists") || uploadMessage.includes("duplicate");
    if (error && !alreadyUploaded) throw error;
    photoPath = path;
  }
  const { error } = await (supabase as any).rpc("register_punch_by_token", {
    _token: p.token,
    _type: p.type,
    _punched_at: p.punchedAt,
    _photo_path: photoPath,
    _latitude: p.latitude,
    _longitude: p.longitude,
    _cep: p.cep,
    _street: p.street,
    _neighborhood: p.neighborhood,
    _city: p.city,
    _justification: p.justification ?? null,
    _client_id: p.clientId,
    // Envia a assinatura completa para não haver ambiguidade entre versões antigas da RPC.
    _justification_audio_path: null,
    _justification_audio_transcript: null,
    _justification_audio_duration_s: null,
  });
  if (error) throw error;
}

let syncing = false;

function canRetryBlockedPunch(reason: string | null | undefined) {
  const message = reason?.toLowerCase() ?? "";
  return message.includes("permission denied for function register_punch_by_token")
    || message.includes("could not choose the best candidate function")
    || message.includes("already exists")
    || message.includes("duplicate");
}

/** Envia tudo que está na fila. Mantém na fila o que falhar. */
export async function flushQueue(): Promise<{ sent: number; left: number }> {
  if (syncing) return { sent: 0, left: (await readQueue()).length };
  syncing = true;
  try {
    return await serializeQueue(async () => {
      const list = await readQueue();
      let sent = 0;
      const remaining: PendingPunch[] = [];
      for (let index = 0; index < list.length; index++) {
        const p = list[index];
        if (p.blockedReason && !canRetryBlockedPunch(p.blockedReason)) {
          remaining.push(p);
          continue;
        }
        try {
          await sendPunch({ ...p, blockedReason: null });
          sent++;
        } catch (error) {
          if (isRetryableError(error)) {
            remaining.push(...list.slice(index));
            break;
          }
          remaining.push({ ...p, blockedReason: (error as Error).message || "Revise este registro antes de reenviar." });
        }
      }
      await writeQueue(remaining);
      return { sent, left: remaining.length };
    });
  } finally {
    syncing = false;
  }
}

/** Registra o ponto: envia na hora se houver rede, senão guarda no celular. */
export async function submitPunch(p: PendingPunch): Promise<"sent" | "queued"> {
  try {
    await sendPunch(p);
    return "sent";
  } catch (error) {
    if (!isRetryableError(error)) throw error;
  }
  await enqueuePunch(p);
  return "queued";
}
