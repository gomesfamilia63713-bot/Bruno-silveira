import { QueryClient } from "@tanstack/react-query";
import { OfflineQueryProvider } from "@/lib/offline-sync";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/use-auth";
import { PasswordGateProvider } from "@/components/password-gate";
import { InventorySyncProvider } from "@/lib/inventory-sync";
import { useEffect, type ReactNode } from "react";
import { registerServiceWorker } from "@/lib/register-sw";
import { installModuleRecovery, recoverFromModuleLoadError } from "@/lib/module-recovery";
import { OfflineAutoSync } from "@/lib/offline-autosync";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Página não encontrada</h2>
        <Link to="/" className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          Voltar
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  const message = error instanceof Error ? error.message : "O aplicativo encontrou um erro inesperado.";
  useEffect(() => {
    void recoverFromModuleLoadError(error);
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0b1220" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { title: "BS TOOLS — Controle de Ferramentas e Materiais" },
      { name: "description", content: "BS TOOLS: controle de entrada e saída de ferramentas e materiais." },
      { property: "og:title", content: "BS TOOLS" },
      { name: "twitter:title", content: "BS TOOLS" },
      { property: "og:description", content: "Controle de entrada e saída de ferramentas e materiais." },
      { name: "twitter:description", content: "Controle de entrada e saída de ferramentas e materiais." },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/app-icon.png" },
      { rel: "apple-touch-startup-image", href: "/splash.png" },

      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow:wght@400;500;600;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    const removeModuleRecovery = installModuleRecovery();
    registerServiceWorker();
    return removeModuleRecovery;
  }, []);
  return (
    <OfflineQueryProvider client={queryClient}>
      <AuthProvider>
        <PasswordGateProvider>
          <InventorySyncProvider>
            <OfflineAutoSync />
            <Outlet />
            <Toaster richColors position="top-right" />
          </InventorySyncProvider>
        </PasswordGateProvider>
      </AuthProvider>
    </OfflineQueryProvider>
  );
}
