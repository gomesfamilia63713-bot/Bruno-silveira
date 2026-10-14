import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import bsLogo from "@/assets/bs-logo.png.asset.json";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Acesso — BS TOOLS" },
      { name: "description", content: "Acesso ao painel administrativo e ponto individual." },
      { property: "og:title", content: "Acesso — BS TOOLS" },
      { property: "og:description", content: "Acesso ao painel administrativo e ponto individual." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"choose" | "admin">("choose");

  const goPonto = () => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("bs-ponto-token") : null;
    window.location.href = stored ? `/ponto?u=${encodeURIComponent(stored)}` : "/ponto";
  };

  const handleAuth = async (mode: "signin" | "signup", e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Conta criada! Verifique seu e-mail para confirmar.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Login administrativo: encerra qualquer sessão de funcionário para não
        // cair na tela do PWA do funcionário.
        navigate({ to: "/" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao autenticar");
    } finally {
      setLoading(false);
    }
  };

 const handleGoogle = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro no login com Google");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src={bsLogo.url} alt="BS Materiais e Ferramentas" className="mb-4 h-32 w-32 rounded-2xl object-cover ring-1 ring-amber-500/40 shadow-2xl shadow-amber-500/20" />
          <h1 className="text-3xl font-bold">BS Materiais e Ferramentas</h1>
          <p className="mt-1 text-sm text-muted-foreground">Controle de estoque, obras e locações</p>
        </div>

        {mode === "choose" && (
          <div className="rounded-xl border bg-card p-6 shadow-2xl shadow-black/40">
            <p className="mb-4 text-center text-sm text-muted-foreground">Como você quer continuar?</p>
            <div className="space-y-3">
              <Button className="h-14 w-full text-base" onClick={() => setMode("admin")}>
                Entrar como Admin
              </Button>
              <Button variant="outline" className="h-14 w-full text-base" onClick={goPonto}>
                Bater o Ponto
              </Button>
            </div>
          </div>
        )}

        <div className={`rounded-xl border bg-card p-6 shadow-2xl shadow-black/40 ${mode === "choose" ? "hidden" : ""}`}>
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={(e) => handleAuth("signin", e)} className="space-y-4 pt-4">
                <Field label="E-mail" value={email} setValue={setEmail} type="email" />
                <Field label="Senha" value={password} setValue={setPassword} type="password" />
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Entrando..." : "Entrar"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={(e) => handleAuth("signup", e)} className="space-y-4 pt-4">
                <Field label="E-mail" value={email} setValue={setEmail} type="email" />
                <Field label="Senha (mín. 6)" value={password} setValue={setPassword} type="password" />
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Criando..." : "Criar conta"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">ou</span>
            </div>
          </div>

          <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={loading}>
            <GoogleIcon /> Continuar com Google
          </Button>

          <button type="button" onClick={() => setMode("choose")} className="mt-4 w-full text-center text-xs text-muted-foreground underline">
            Voltar às opções
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, setValue, type }: { label: string; value: string; setValue: (v: string) => void; type: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => setValue(e.target.value)} required />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.22-4.74 3.22-8.32z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/>
    </svg>
  );
}
