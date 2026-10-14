import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Share } from "lucide-react";

/** Botão claro para instalar o app (PWA) na tela do funcionário. */
export function InstallPwaButton() {
  const [deferred, setDeferred] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const onPrompt = (e: any) => { e.preventDefault(); setDeferred(e); };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener("beforeinstallprompt", onPrompt as any);
    window.addEventListener("appinstalled", onInstalled);
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true);
    setIsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent));
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt as any);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  if (!deferred) {
    return (
      <p className="mt-3 flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 p-3 text-[11px] text-cyan-200">
        <Share className="h-4 w-4 shrink-0" />
        {isIOS
          ? "Para instalar como app: toque em Compartilhar e depois em “Adicionar à Tela de Início”."
          : "Para instalar como app: abra o menu do navegador (⋮) e toque em “Instalar app” / “Adicionar à tela inicial”. Depois de instalado, funciona sem internet."}
      </p>
    );
  }

  return (
    <Button
      className="mt-3 h-12 w-full bg-slate-800 hover:bg-slate-700"
      onClick={async () => {
        deferred.prompt();
        try { await deferred.userChoice; } catch {}
        setDeferred(null);
      }}
    >
      <Download className="mr-2 h-4 w-4" />
      Baixar como App
    </Button>
  );
}
