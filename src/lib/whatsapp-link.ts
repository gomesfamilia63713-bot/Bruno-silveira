/**
 * Disparo de WhatsApp à prova de offline.
 * Nunca lança erro: sem internet, a mensagem fica salva localmente e é
 * reaberta automaticamente quando a conexão volta.
 */
const QUEUE_KEY = "bs-wa-queue";

export interface WaMessage {
  phone: string;
  text: string;
  created_at: number;
}

function readQueue(): WaMessage[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as WaMessage[];
  } catch {
    return [];
  }
}

function writeQueue(q: WaMessage[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-20)));
  } catch {}
}

export function pendingWhatsappCount() {
  return readQueue().length;
}

export function buildWaLink(phone: string, text?: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return digits ? `https://wa.me/${digits}${q}` : `https://wa.me/${q}`;
}

/** Abre o WhatsApp. Offline: guarda na fila local e retorna "queued". */
export function openWhatsApp(phone: string, text?: string): "opened" | "queued" {
  const online = typeof navigator === "undefined" ? true : navigator.onLine !== false;
  if (!online) {
    writeQueue([...readQueue(), { phone, text: text ?? "", created_at: Date.now() }]);
    return "queued";
  }
  try {
    window.open(buildWaLink(phone, text), "_blank", "noopener,noreferrer");
  } catch {
    writeQueue([...readQueue(), { phone, text: text ?? "", created_at: Date.now() }]);
    return "queued";
  }
  return "opened";
}

/** Reabre mensagens que ficaram pendentes enquanto estava offline. */
export function flushWhatsappQueue(): number {
  const q = readQueue();
  if (!q.length) return 0;
  writeQueue([]);
  for (const m of q) {
    try {
      window.open(buildWaLink(m.phone, m.text), "_blank", "noopener,noreferrer");
    } catch {}
  }
  return q.length;
}
