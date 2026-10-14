import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export function ProductionVoiceInput({ busy, onTranscript, onComplete }: {
  busy: boolean;
  onTranscript: (text: string) => void;
  onComplete: (text: string) => void;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [recording, setRecording] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState("");
  const recognitionRef = useRef<Recognition | null>(null);
  const callbacks = useRef({ onTranscript, onComplete });
  callbacks.current = { onTranscript, onComplete };

  useEffect(() => {
    const speechWindow = window as SpeechWindow;
    setSupported(Boolean(speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition));
    return () => {
      const recognition = recognitionRef.current;
      if (!recognition) return;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      recognition.abort();
    };
  }, []);

  function start() {
    const speechWindow = window as SpeechWindow;
    const Constructor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Constructor || recognitionRef.current) return;
    const recognition = new Constructor();
    recognitionRef.current = recognition;
    recognition.lang = "pt-BR";
    recognition.continuous = true;
    recognition.interimResults = true;
    let transcript = "";
    let failed = false;
    setError("");
    recognition.onresult = (event) => {
      transcript = Array.from(event.results).map((result) => result[0].transcript).join(" ").trim();
      callbacks.current.onTranscript(transcript);
    };
    recognition.onerror = (event) => {
      failed = true;
      const messages: Record<string, string> = {
        "not-allowed": "Permita o acesso ao microfone para gravar o lançamento.",
        "service-not-allowed": "O reconhecimento de voz está bloqueado neste navegador.",
        "audio-capture": "Microfone indisponível. Verifique a conexão e tente novamente.",
        "no-speech": "Nenhuma fala reconhecida. Toque no microfone para tentar novamente.",
        network: "Sem conexão com o reconhecimento de voz. O texto já capturado foi mantido.",
        aborted: "Gravação interrompida. O texto já capturado foi mantido.",
      };
      setError(messages[event.error] ?? "Não foi possível reconhecer a fala. Você pode digitar o lançamento.");
      setRecording(false);
      setStopping(false);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setRecording(false);
      setStopping(false);
      if (failed) return;
      if (transcript.length < 3) {
        setError("Nenhuma fala reconhecida. Toque no microfone para tentar novamente.");
        return;
      }
      callbacks.current.onComplete(transcript);
    };
    try {
      recognition.start();
      setRecording(true);
      callbacks.current.onTranscript("");
    } catch {
      recognitionRef.current = null;
      setError("Não foi possível iniciar o microfone. Você pode digitar o lançamento.");
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant={recording ? "destructive" : "default"}
        className="min-h-11 w-full whitespace-normal sm:w-auto"
        disabled={supported !== true || busy || stopping} aria-pressed={recording}
        onClick={() => {
          if (recording) {
            setStopping(true);
            recognitionRef.current?.stop();
          } else start();
        }}>
        {stopping || busy ? <Loader2 className="mr-2 h-5 w-5 shrink-0 animate-spin" />
          : recording ? <Square className="mr-2 h-5 w-5 shrink-0" />
          : <Mic className="mr-2 h-5 w-5 shrink-0" />}
        {busy ? "Interpretando lançamento..." : stopping ? "Encerrando gravação..."
          : recording ? "Encerrar e preencher" : "Gravar lançamento por voz"}
      </Button>
      <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
        {recording && !stopping ? "Ouvindo em português…" : ""}
        {supported === false ? "Voz indisponível neste navegador. Você pode digitar a transcrição abaixo." : ""}
      </p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}