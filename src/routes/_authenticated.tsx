import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AdminNotifications } from "@/components/admin-notifications";


export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AdminNotifications />
      <div className="flex h-screen w-full overflow-hidden bg-gradient-to-br from-slate-950 via-black to-slate-950">
        <AppSidebar />
        <SidebarInset className="flex min-w-0 flex-1 flex-col bg-transparent">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border/40 bg-background/60 px-3 backdrop-blur-lg no-print">
            <SidebarTrigger />
            <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              BS TOOLS ERP
            </span>
          </header>
          <main className="flex min-h-0 w-full max-w-full flex-1 flex-col overflow-auto px-2 py-2 sm:px-3 sm:py-3 xl:px-4 2xl:px-5">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
