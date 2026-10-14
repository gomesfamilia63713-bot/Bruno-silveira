import { useEffect, useState } from "react";
import { Camera, LogIn, LogOut, MapPin, Mic, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type EmployeePunch = {
  id: string;
  type: string;
  punched_at: string;
  photo_url: string | null;
  audio_url: string | null;
  justification: string | null;
  justification_audio_transcript: string | null;
  street: string | null;
  neighborhood: string | null;
  city: string | null;
  cep: string | null;
};

function addressOf(punch: EmployeePunch) {
  return [punch.street, punch.neighborhood, punch.city, punch.cep].filter(Boolean).join(" · ") || "Endereço não informado";
}

export function EmployeePunchHistory({ token }: { token: string | null }) {
  const [punches, setPunches] = useState<EmployeePunch[]>([]);
  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  const load = async () => {
    if (!token || !navigator.onLine) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/public/punch-history?token=${encodeURIComponent(token)}`);
      if (!response.ok) throw new Error("Não foi possível carregar o histórico.");
      const data = await response.json() as { punches?: EmployeePunch[] };
      const rows = data.punches ?? [];
      setPunches(rows);
      localStorage.setItem(`bs-ponto-history-${token}`, JSON.stringify(rows));
    } catch {
      // O histórico em cache continua disponível quando a rede oscila.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    const cached = localStorage.getItem(`bs-ponto-history-${token}`);
    if (cached) {
      try { setPunches(JSON.parse(cached) as EmployeePunch[]); } catch { /* ignora cache inválido */ }
    }
    void load();
    const refresh = () => void load();
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, [token]);

  if (!token) return null;

  return (
    <section className="mt-4 rounded-lg border border-slate-700 bg-slate-900/80 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold"><Camera className="h-4 w-4" />Meu histórico</h2>
          <p className="text-xs text-slate-400">Registros recentes enviados ao painel.</p>
        </div>
        <Button type="button" size="icon" variant="ghost" title="Atualizar histórico" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {punches.length === 0 ? (
        <p className="mt-3 rounded-md border border-slate-800 bg-slate-950/60 p-4 text-center text-xs text-slate-400">
          {loading ? "Carregando histórico…" : "Nenhum registro recente."}
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {punches.map((punch) => (
            <article key={punch.id} className="flex gap-3 rounded-md border border-slate-800 bg-slate-950/60 p-2">
              {punch.photo_url ? (
                <Button type="button" variant="ghost" className="h-20 w-20 shrink-0 overflow-hidden rounded-md p-0" onClick={() => setZoom(punch.photo_url)}>
                  <img src={punch.photo_url} alt="Foto do registro" className="h-full w-full object-cover" />
                </Button>
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md bg-slate-900 text-slate-500">
                  {punch.audio_url ? <Mic className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
                </div>
              )}
              <div className="min-w-0 flex-1 text-xs">
                <p className="flex items-center gap-1 font-semibold text-slate-100">
                  {punch.type === "in" ? <LogIn className="h-3.5 w-3.5 text-emerald-400" /> : <LogOut className="h-3.5 w-3.5 text-rose-400" />}
                  {punch.type === "in" ? "Entrada" : "Saída"} · {new Date(punch.punched_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </p>
                <p className="mt-1 flex items-start gap-1 text-slate-400"><MapPin className="mt-0.5 h-3 w-3 shrink-0" />{addressOf(punch)}</p>
                {punch.justification && <p className="mt-1 text-amber-300">{punch.justification}</p>}
                {punch.audio_url && <audio className="mt-2 h-8 w-full" controls preload="metadata" src={punch.audio_url} />}
              </div>
            </article>
          ))}
        </div>
      )}

      {zoom && (
        <Button type="button" variant="ghost" className="fixed inset-0 z-50 h-screen w-screen rounded-none bg-slate-950/90 p-4" onClick={() => setZoom(null)}>
          <img src={zoom} alt="Foto ampliada do registro" className="max-h-full max-w-full object-contain" />
        </Button>
      )}
    </section>
  );
}