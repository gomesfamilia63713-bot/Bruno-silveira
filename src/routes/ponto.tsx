import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Camera, CloudOff, LogIn, LogOut, MapPin, RefreshCw, CheckCircle2, Mic, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  flushQueue,
  onQueueChange,
  readQueue,
  submitPunch,
} from "@/lib/punch-queue";
import { PontoRequests } from "@/components/ponto-requests";
import { InstallPwaButton } from "@/components/install-pwa-button";
import { startWavRecording, type ActiveWavRecording } from "@/lib/wav-recorder";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmployeePunchHistory } from "@/components/employee-punch-history";

export const Route = createFileRoute("/ponto")({
  head: () => ({
    meta: [
      { title: "Registro de Ponto — BS TOOLS" },
      { name: "description", content: "Bata seu ponto com foto, data, hora e endereço, mesmo sem internet." },
      { property: "og:title", content: "Registro de Ponto — BS TOOLS" },
      { property: "og:description", content: "Bata seu ponto com foto, data, hora e endereço, mesmo sem internet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PontoPage,
});

type Addr = { street: string | null; neighborhood: string | null; city: string | null; cep: string | null };

function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function fmt(d: Date) {
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

function addrLine(a: Addr | null) {
  if (!a) return "Endereço indisponível";
  const parts = [a.street, a.neighborhood, a.city, a.cep].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Endereço indisponível";
}

function PontoPage() {
  const [token, setToken] = useState<string | null>(null);
  const [employee, setEmployee] = useState<{ id: string; name: string } | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [addr, setAddr] = useState<Addr | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [pending, setPending] = useState(0);
  const [blocked, setBlocked] = useState(0);
  const [busy, setBusy] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [lastShot, setLastShot] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [justification, setJustification] = useState("");
  const [justificationType, setJustificationType] = useState<"in" | "out">("in");
  const [audio, setAudio] = useState<{ blob: Blob; url: string; durationS: number } | null>(null);
  const [recording, setRecording] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRecorderRef = useRef<ActiveWavRecording | null>(null);

  useEffect(() => () => {
    const active = audioRecorderRef.current;
    audioRecorderRef.current = null;
    if (active) void active.stop();
    if (audio) URL.revokeObjectURL(audio.url);
  }, [audio]);

  // token do link individual (?u=) — mantido mesmo ao instalar o app / abrir offline
  useEffect(() => {
    const urlToken = new URLSearchParams(window.location.search).get("u");
    const stored = localStorage.getItem("bs-ponto-token");
    const t = urlToken ?? stored;
    if (!t) return;
    setToken(t);
    localStorage.setItem("bs-ponto-token", t);
    if (!urlToken) {
      // recoloca o token na URL para que o app instalado abra sempre identificado
      window.history.replaceState(null, "", `/ponto?u=${encodeURIComponent(t)}`);
    }
    // manifest dinâmico: o app instalado a partir deste link abre já com o token
    try {
      const manifest = {
        id: `/ponto?u=${t}`,
        name: "BS TOOLS — Ponto",
        short_name: "Ponto BS",
        start_url: `/ponto?u=${t}`,
        scope: "/",
        display: "standalone",
        background_color: "#020617",
        theme_color: "#020617",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" }));
      let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
      if (!link) {
        link = document.createElement("link");
        link.rel = "manifest";
        document.head.appendChild(link);
      }
      link.href = url;
    } catch {
      /* manifest padrão continua valendo */
    }
  }, []);

  // nome do funcionário (com cache offline)
  useEffect(() => {
    if (!token) return;
    const cached = localStorage.getItem(`bs-ponto-emp-${token}`);
    if (cached) setEmployee(JSON.parse(cached));
    void (async () => {
      const { data } = await (supabase as any).rpc("employee_by_token", { _token: token });
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.id) {
        const emp = { id: row.id as string, name: row.name as string };
        setEmployee(emp);
        localStorage.setItem(`bs-ponto-emp-${token}`, JSON.stringify(emp));
      }
    })();
  }, [token]);

  // relógio + rede + fila
  useEffect(() => {
    setNow(new Date());
    const t = window.setInterval(() => setNow(new Date()), 1000);
    const upd = () => setOnline(navigator.onLine);
    upd();
    window.addEventListener("online", upd);
    window.addEventListener("offline", upd);
    const refresh = () => void readQueue().then((q) => {
      setPending(q.length);
      setBlocked(q.filter((item) => item.blockedReason).length);
    });
    refresh();
    const offQ = onQueueChange(refresh);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("online", upd);
      window.removeEventListener("offline", upd);
      offQ();
    };
  }, []);

  // câmera traseira em tempo real
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch {
        setCamError("Não foi possível abrir a câmera. Autorize o acesso e recarregue.");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // localização em tempo real + endereço
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    const cached = localStorage.getItem("bs-ponto-addr");
    if (cached) setAddr(JSON.parse(cached));
    const id = navigator.geolocation.watchPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  useEffect(() => {
    if (!coords || !navigator.onLine) return;
    const ctrl = new AbortController();
    void (async () => {
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.lat}&lon=${coords.lng}&accept-language=pt-BR`,
          { signal: ctrl.signal, headers: { Accept: "application/json" } },
        );
        const j: any = await r.json();
        const a: Addr = {
          street: j?.address?.road ?? j?.address?.pedestrian ?? null,
          neighborhood: j?.address?.suburb ?? j?.address?.neighbourhood ?? null,
          city: j?.address?.city ?? j?.address?.town ?? j?.address?.municipality ?? null,
          cep: j?.address?.postcode ?? null,
        };
        setAddr(a);
        localStorage.setItem("bs-ponto-addr", JSON.stringify(a));
      } catch {
        /* mantém último endereço conhecido */
      }
    })();
    return () => ctrl.abort();
  }, [coords?.lat, coords?.lng]);

  const capture = useCallback(
    async (type: "in" | "out") => {
      if (!token) {
        toast.error("Abra pelo seu link individual de ponto.");
        return;
      }
      const video = videoRef.current;
      if (!video || !video.videoWidth) {
        toast.error("Câmera ainda não está pronta.");
        return;
      }
      setBusy(true);
      try {
        const stamp = new Date();
        const w = video.videoWidth;
        const h = video.videoHeight;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Não foi possível preparar a foto. Tente novamente.");
        ctx.drawImage(video, 0, 0, w, h);

        // Carimbo (watermark): data, hora e endereço completo
        const lines = [
          `${employee?.name ?? "Funcionário"} · ${type === "in" ? "ENTRADA" : "SAÍDA"}`,
          fmt(stamp),
          addrLine(addr),
          coords ? `GPS ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : "GPS indisponível",
        ];
        const fs = Math.max(16, Math.round(w * 0.032));
        const pad = Math.round(fs * 0.6);
        const boxH = lines.length * (fs + pad * 0.35) + pad * 1.5;
        ctx.fillStyle = "rgba(0,0,0,0.62)";
        ctx.fillRect(0, h - boxH, w, boxH);
        ctx.fillStyle = "#ffffff";
        ctx.font = `600 ${fs}px Arial, sans-serif`;
        ctx.textBaseline = "top";
        lines.forEach((line, i) => {
          ctx.fillText(line, pad, h - boxH + pad * 0.75 + i * (fs + pad * 0.35), w - pad * 2);
        });

        const blob = await new Promise<Blob | null>((res) =>
          canvas.toBlob(res, "image/jpeg", 0.85),
        );
        if (!blob) throw new Error("Não foi possível gerar a foto. Tente novamente.");
        setLastShot(canvas.toDataURL("image/jpeg", 0.5));

        const result = await submitPunch({
          clientId: newId(),
          token,
          type,
          punchedAt: stamp.toISOString(),
          photo: blob,
          latitude: coords?.lat ?? null,
          longitude: coords?.lng ?? null,
          cep: addr?.cep ?? null,
          street: addr?.street ?? null,
          neighborhood: addr?.neighborhood ?? null,
          city: addr?.city ?? null,
        });

        if (result === "sent") toast.success("Ponto registrado!");
        else toast.success("Ponto salvo no celular. Será enviado ao voltar a internet.");
      } catch (e: any) {
        toast.error(e?.message ?? "Falha ao registrar ponto");
      } finally {
        setBusy(false);
      }
    },
    [token, employee, addr, coords],
  );

  const toggleAudioRecording = useCallback(async () => {
    if (recording) {
      const active = audioRecorderRef.current;
      audioRecorderRef.current = null;
      setRecording(false);
      if (!active) return;
      const result = await active.stop();
      if (result.blob.size < 2048) {
        toast.error("O áudio ficou vazio. Grave novamente.");
        return;
      }
      setAudio((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return { ...result, url: URL.createObjectURL(result.blob) };
      });
      return;
    }
    try {
      audioRecorderRef.current = await startWavRecording();
      setRecording(true);
    } catch {
      toast.error("Autorize o microfone para gravar a justificativa.");
    }
  }, [recording]);

  const submitJustifiedPunch = useCallback(async () => {
    if (!token) return toast.error("Abra pelo seu link individual de ponto.");
    if (!audio) return toast.error("Grave o áudio da justificativa.");
    setBusy(true);
    try {
      const result = await submitPunch({
        clientId: newId(), token, type: justificationType, punchedAt: new Date().toISOString(), photo: null,
        latitude: coords?.lat ?? null, longitude: coords?.lng ?? null,
        cep: addr?.cep ?? null, street: addr?.street ?? null,
        neighborhood: addr?.neighborhood ?? null, city: addr?.city ?? null,
        justification: justification.trim() || null,
        justificationAudio: audio.blob,
        justificationAudioDurationS: audio.durationS,
      });
      toast.success(result === "sent" ? "Ponto justificado e transcrito!" : "Justificativa salva no celular para sincronizar.");
      URL.revokeObjectURL(audio.url);
      setAudio(null);
      setJustification("");
    } catch (error) {
      toast.error((error as Error).message || "Falha ao enviar a justificativa.");
    } finally {
      setBusy(false);
    }
  }, [token, audio, justificationType, coords, addr, justification]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between gap-2 px-4 py-3">
        <div>
          <p className="text-xs text-slate-400">Registro de ponto</p>
          <h1 className="text-lg font-bold">{employee?.name ?? "Identificando..."}</h1>
        </div>
        <div className="text-right text-xs">
          <p className="font-mono text-sm">{now ? fmt(now) : "--/--/----, --:--:--"}</p>
          <p className={online ? "text-emerald-400" : "text-amber-400"}>
            {online ? "Online" : "Offline"}
            {pending > 0 ? ` · ${pending} na fila` : ""}
          </p>
        </div>
      </header>

      <div className="relative mx-auto w-full max-w-2xl flex-1 px-4">
        <Tabs defaultValue="ponto" className="w-full">
          <TabsList className="sticky top-0 z-20 grid h-auto w-full grid-cols-2 bg-slate-900 p-1">
            <TabsTrigger value="ponto" className="min-h-12 whitespace-normal px-2 text-center text-xs sm:text-sm">
              Registro de Ponto e Justificativas
            </TabsTrigger>
            <TabsTrigger value="itens" className="min-h-12 whitespace-normal px-2 text-center text-xs sm:text-sm">
              Meus Itens e Solicitações
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ponto" forceMount className="data-[state=inactive]:hidden">
        <div className="relative mx-auto aspect-[3/4] w-full max-w-md overflow-hidden rounded-2xl border border-slate-800 bg-black">
          <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-[55%] w-[70%] rounded-[50%] border-2 border-cyan-400/70 shadow-[0_0_24px_rgba(34,211,238,0.35)]" />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/60 p-3 text-[11px] leading-snug">
            <p className="font-mono">{now ? fmt(now) : "--/--/----, --:--:--"}</p>
            <p className="flex items-center gap-1 text-slate-200">
              <MapPin className="h-3 w-3 shrink-0" />
              {addrLine(addr)}
            </p>
          </div>
          {camError && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 p-6 text-center text-sm text-amber-300">
              {camError}
            </div>
          )}
        </div>

        <div className="mx-auto mt-4 grid w-full max-w-md grid-cols-2 gap-3">
          <Button
            size="lg"
            className="h-14 bg-emerald-600 hover:bg-emerald-500"
            disabled={busy || !token}
            onClick={() => capture("in")}
          >
            <LogIn className="mr-2 h-5 w-5" />
            Entrada
          </Button>
          <Button
            size="lg"
            className="h-14 bg-rose-600 hover:bg-rose-500"
            disabled={busy || !token}
            onClick={() => capture("out")}
          >
            <LogOut className="mr-2 h-5 w-5" />
            Saída
          </Button>
        </div>

        <div className="mx-auto w-full max-w-md">
        {!token && (
          <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-center text-xs text-amber-300">
            Abra o seu link individual de ponto (enviado pelo administrador).
          </p>
        )}

        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs">
          <span className="flex items-center gap-2">
            {pending > 0 ? <CloudOff className="h-4 w-4 text-amber-400" /> : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
            {pending > 0 ? `${pending} registro(s) aguardando envio` : "Tudo sincronizado"}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending === 0}
            onClick={async () => {
              const { sent } = await flushQueue();
              toast[sent > 0 ? "success" : "message"](
                sent > 0 ? `${sent} registro(s) enviado(s)` : "Sem conexão para enviar agora",
              );
            }}
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            Sincronizar
          </Button>
        </div>
        {blocked > 0 && (
          <p className="mt-2 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-300">
            {blocked} justificativa(s) precisam ser revisadas antes de um novo envio.
          </p>
        )}

        {lastShot && (
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-2">
            <img src={lastShot} alt="Último registro de ponto" className="h-16 w-16 rounded object-cover" />
            <p className="text-xs text-slate-400">
              <Camera className="mr-1 inline h-3 w-3" />
              Último registro capturado com carimbo de data, hora e endereço.
            </p>
          </div>
        )}

        <section className="mt-4 space-y-3 rounded-lg border border-slate-700 bg-slate-900/80 p-4">
          <div>
            <h2 className="font-semibold">Ponto com justificativa</h2>
            <p className="text-xs text-slate-400">Para atraso ou esquecimento. O áudio será transcrito automaticamente.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={justificationType === "in" ? "default" : "secondary"} onClick={() => setJustificationType("in")}>Entrada</Button>
            <Button type="button" variant={justificationType === "out" ? "default" : "secondary"} onClick={() => setJustificationType("out")}>Saída</Button>
          </div>
          <label className="block text-xs font-medium text-slate-300" htmlFor="justification">Justificativa escrita (opcional se a fala for reconhecida)</label>
          <textarea
            id="justification"
            value={justification}
            onChange={(event) => setJustification(event.target.value)}
            rows={3}
            maxLength={600}
            placeholder="Ex.: Esqueci de registrar a entrada no horário correto."
            className="w-full resize-none rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-cyan-400"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant={recording ? "destructive" : "secondary"} onClick={toggleAudioRecording} disabled={busy}>
              {recording ? <Square className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
              {recording ? "Parar gravação" : "Gravar áudio"}
            </Button>
            {recording && <span className="text-xs font-semibold text-rose-400">Gravando…</span>}
            {audio && (
              <Button type="button" size="icon" variant="ghost" title="Descartar áudio" onClick={() => {
                URL.revokeObjectURL(audio.url);
                setAudio(null);
              }}><Trash2 className="h-4 w-4" /></Button>
            )}
          </div>
          {audio && <audio className="w-full" controls src={audio.url} />}
          <Button type="button" className="w-full" disabled={busy || recording || !audio || !token} onClick={submitJustifiedPunch}>
            {busy ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Registrar ponto justificado
          </Button>
        </section>
        <EmployeePunchHistory token={token} />
        </div>
          </TabsContent>

          <TabsContent value="itens" forceMount className="data-[state=inactive]:hidden">
            <PontoRequests token={token} employeeName={employee?.name} />
          </TabsContent>
        </Tabs>
        <InstallPwaButton />
        <div className="h-8" />
      </div>
    </div>
  );
}
