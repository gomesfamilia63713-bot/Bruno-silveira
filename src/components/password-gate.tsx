import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

/**
 * Global password-gate for destructive actions.
 * ANY delete in the app should route through `confirmDelete(message, onConfirm)`.
 * Enforces the shared code "4123" before invoking the callback.
 *
 * Security note: This is a UX guard — the real security lives in Supabase RLS.
 * Do not use it to protect data that RLS itself cannot protect.
 */

const DELETE_CODE = "4123";

type Ctx = {
  confirmDelete: (message: string, onConfirm: () => void | Promise<void>) => void;
};

const PasswordGateCtx = createContext<Ctx | null>(null);

export function usePasswordGate(): Ctx {
  const c = useContext(PasswordGateCtx);
  if (!c) throw new Error("usePasswordGate deve ser usado dentro de <PasswordGateProvider>");
  return c;
}

/** Convenience: `const askDelete = useConfirmDelete()` → `askDelete("Excluir X?", () => ...)`. */
export function useConfirmDelete() {
  return usePasswordGate().confirmDelete;
}

type Pending = { message: string; onConfirm: () => void | Promise<void> } | null;

export function PasswordGateProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending>(null);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const confirmDelete = useCallback((message: string, onConfirm: () => void | Promise<void>) => {
    setPw("");
    setBusy(false);
    setPending({ message, onConfirm });
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const close = () => { setPending(null); setPw(""); setBusy(false); };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!pending) return;
    if (pw !== DELETE_CODE) {
      toast.error("Senha incorreta");
      setPw("");
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      await pending.onConfirm();
      close();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao excluir");
      setBusy(false);
    }
  };

  return (
    <PasswordGateCtx.Provider value={{ confirmDelete }}>
      {children}
      <Dialog open={!!pending} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" /> Confirmar exclusão
            </DialogTitle>
            <DialogDescription>{pending?.message ?? ""}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pg-pw" className="text-xs uppercase tracking-wider text-muted-foreground">
                Digite a senha para confirmar
              </Label>
              <Input
                id="pg-pw"
                ref={inputRef}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="••••"
                disabled={busy}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close} disabled={busy}>Cancelar</Button>
              <Button type="submit" variant="destructive" disabled={busy || pw.length === 0}>
                {busy ? "Excluindo..." : "Excluir"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PasswordGateCtx.Provider>
  );
}
