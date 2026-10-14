import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Camera, LogIn, LogOut, MapPin, Mic } from "lucide-react";

type Punch = {
  id: string;
  type: string;
  punched_at: string;
  photo_path: string | null;
  latitude: number | null;
  longitude: number | null;
  cep: string | null;
  street: string | null;
  neighborhood: string | null;
  city: string | null;
  justification: string | null;
  justification_audio_path: string | null;
  justification_audio_transcript: string | null;
  justification_audio_duration_s: number | null;
};

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addrLine(p: Punch) {
  const parts = [p.street, p.neighborhood, p.city, p.cep].filter(Boolean);
  return parts.length ? parts.join(", ") : "Endereço não informado";
}

/** Histórico de registros de ponto com fotos carimbadas ou justificativas em áudio. */
export function PunchHistory({ employeeId }: { employeeId: string }) {
  const qc = useQueryClient();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return isoDate(d);
  });
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [zoom, setZoom] = useState<string | null>(null);

  const { data: punches = [], isLoading, error } = useQuery({
    queryKey: ["punches", employeeId, from, to],
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    refetchInterval: 10000,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("time_punches")
        .select("*")
        .eq("employee_id", employeeId)
        .gte("punched_at", `${from}T00:00:00`)
        .lte("punched_at", `${to}T23:59:59`)
        .order("punched_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Punch[];
    },
  });

  const paths = useMemo(
    () => punches.map((p) => p.photo_path).filter(Boolean) as string[],
    [punches],
  );

  const { data: urls = {}, error: urlError } = useQuery({
    queryKey: ["punch-photos", paths.join("|")],
    enabled: paths.length > 0,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const map: Record<string, string> = {};
      // lotes menores evitam falha silenciosa quando há muitas fotos
      for (let i = 0; i < paths.length; i += 50) {
        const chunk = paths.slice(i, i + 50);
        const { data, error } = await supabase.storage
          .from("time-punch-photos")
          .createSignedUrls(chunk, 60 * 60);
        if (error) {
          // tenta uma a uma para não perder o lote inteiro
          for (const p of chunk) {
            const { data: one } = await supabase.storage
              .from("time-punch-photos")
              .createSignedUrl(p, 60 * 60);
            if (one?.signedUrl) map[p] = one.signedUrl;
          }
          continue;
        }
        (data ?? []).forEach((d: any) => {
          if (d?.path && d?.signedUrl) map[d.path] = d.signedUrl;
        });
      }
      return map;
    },
  });

  const audioPaths = useMemo(
    () => punches.map((p) => p.justification_audio_path).filter(Boolean) as string[],
    [punches],
  );
  const { data: audioUrls = {}, error: audioUrlError } = useQuery({
    queryKey: ["punch-audio", audioPaths.join("|")],
    enabled: audioPaths.length > 0,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const map: Record<string, string> = {};
      for (let i = 0; i < audioPaths.length; i += 50) {
        const chunk = audioPaths.slice(i, i + 50);
        const { data, error } = await supabase.storage.from("time-punch-audio").createSignedUrls(chunk, 60 * 60);
        if (error) throw error;
        (data ?? []).forEach((item: any) => {
          if (item?.path && item?.signedUrl) map[item.path] = item.signedUrl;
        });
      }
      return map;
    },
  });


  useEffect(() => {
    const ch = supabase
      .channel(`punch-history-${employeeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "time_punches", filter: `employee_id=eq.${employeeId}` },
        async () => {
          await qc.invalidateQueries({ queryKey: ["punches", employeeId] });
          await qc.invalidateQueries({ queryKey: ["punch-photos"] });
          await qc.invalidateQueries({ queryKey: ["punch-audio"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [employeeId, qc]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Camera className="h-4 w-4" />
          Registros de ponto ({punches.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-4">
          <div>
            <Label className="text-xs">De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="sm:col-span-2 flex flex-wrap items-end gap-1">
            {[1, 7, 30].map((n) => (
              <Button
                key={n}
                variant="outline"
                size="sm"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() - (n - 1));
                  setFrom(isoDate(d));
                  setTo(isoDate(new Date()));
                }}
              >
                {n}d
              </Button>
            ))}
          </div>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

        {urlError && (
          <p className="text-sm text-destructive">Não foi possível carregar as fotos: {(urlError as Error).message}</p>
        )}
        {audioUrlError && <p className="text-sm text-destructive">Não foi possível carregar os áudios.</p>}

        {!isLoading && punches.length === 0 && (
          <p className="rounded border bg-card p-6 text-center text-sm text-muted-foreground">
            Nenhum registro de ponto no período.
          </p>
        )}

        {punches[0] && (
          <div className="overflow-hidden rounded-lg border border-primary bg-card">
            <div className="border-b border-primary/40 bg-primary/10 px-3 py-2 text-xs font-bold text-primary">
              Registro mais recente
            </div>
            {punches[0].justification_audio_path && audioUrls[punches[0].justification_audio_path] ? (
              <div className="space-y-3 bg-muted p-4">
                <p className="flex items-center gap-2 text-sm font-semibold"><Mic className="h-4 w-4" />Justificativa em áudio</p>
                <audio className="w-full" controls src={audioUrls[punches[0].justification_audio_path]} />
              </div>
            ) : punches[0].photo_path && urls[punches[0].photo_path] ? (
              <Button
                type="button"
                variant="ghost"
                className="h-auto w-full rounded-none p-0"
                onClick={() => setZoom(urls[punches[0].photo_path ?? ""] ?? null)}
              >
                <img
                  src={urls[punches[0].photo_path]}
                  alt={`Foto mais recente de ${new Date(punches[0].punched_at).toLocaleString("pt-BR")}`}
                  className="max-h-[32rem] w-full object-contain bg-muted"
                />
              </Button>
            ) : (
              <div className="flex h-56 items-center justify-center bg-muted text-sm text-muted-foreground">Sem foto</div>
            )}
            <div className="space-y-1 p-3 text-sm">
              <p className="font-semibold">
                {punches[0].type === "in" ? "Entrada" : "Saída"} · {new Date(punches[0].punched_at).toLocaleString("pt-BR")}
              </p>
              <p className="flex items-start gap-1 text-muted-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />{addrLine(punches[0])}
              </p>
              {punches[0].justification && <p className="text-amber-400">Justificativa: {punches[0].justification}</p>}
              {punches[0].justification_audio_transcript && punches[0].justification_audio_transcript !== punches[0].justification && (
                <p className="text-muted-foreground">Transcrição: {punches[0].justification_audio_transcript}</p>
              )}
            </div>
          </div>
        )}

        {punches.length > 1 && <p className="text-xs font-semibold uppercase text-muted-foreground">Histórico anterior</p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {punches.slice(1).map((p) => {
            const url = p.photo_path ? urls[p.photo_path] : null;
            const audioUrl = p.justification_audio_path ? audioUrls[p.justification_audio_path] : null;
            const isIn = p.type === "in";
            return (
              <div key={p.id} className="overflow-hidden rounded-lg border bg-card">
                {audioUrl ? (
                  <div className="flex h-44 flex-col justify-center gap-3 bg-muted p-4">
                    <p className="flex items-center justify-center gap-2 text-xs font-semibold"><Mic className="h-4 w-4" />Ponto justificado</p>
                    <audio className="w-full" controls src={audioUrl} preload="metadata" />
                  </div>
                ) : url ? (
                  <Button type="button" variant="ghost" className="h-auto w-full rounded-none p-0" onClick={() => setZoom(url)}>
                    <img
                      src={url}
                      alt={`Registro de ponto em ${new Date(p.punched_at).toLocaleString("pt-BR")}`}
                      loading="lazy"
                      className="h-44 w-full object-cover"
                    />
                  </Button>
                ) : (
                  <div className="flex h-44 w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                    Sem foto
                  </div>
                )}
                <div className="space-y-1 p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        isIn ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                      }`}
                    >
                      {isIn ? <LogIn className="h-3 w-3" /> : <LogOut className="h-3 w-3" />}
                      {isIn ? "Entrada" : "Saída"}
                    </span>
                    <span className="font-mono">
                      {new Date(p.punched_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  </div>
                  <p className="flex items-start gap-1 text-muted-foreground">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                    {addrLine(p)}
                  </p>
                  {p.latitude != null && p.longitude != null && (
                    <a
                      className="text-sky-400 underline"
                      href={`https://www.google.com/maps?q=${p.latitude},${p.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver no mapa ({Number(p.latitude).toFixed(5)}, {Number(p.longitude).toFixed(5)})
                    </a>
                  )}
                  {p.justification && <p className="text-amber-400">Obs.: {p.justification}</p>}
                  {p.justification_audio_transcript && p.justification_audio_transcript !== p.justification && (
                    <p className="text-muted-foreground">Transcrição: {p.justification_audio_transcript}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>

      {zoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setZoom(null)}
        >
          <img src={zoom} alt="Foto do registro de ponto ampliada" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </Card>
  );
}
