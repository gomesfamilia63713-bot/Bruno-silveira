import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard, HardHat, Package, Users, Activity,
  Truck, ClipboardList, Printer, FileSpreadsheet, LogOut, Eye, Trash2,
  Hammer, Boxes, Settings2, Backpack, ShieldCheck, Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import bsLogo from "@/assets/bs-logo.png.asset.json";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-role";
import { usePendingRequestsCount } from "@/hooks/use-pending-requests";

const primary = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/obras", label: "Obras", icon: HardHat },
  { to: "/producao", label: "Produção", icon: Activity },
  { to: "/estoque", label: "Ferramentas", icon: Hammer },
  { to: "/mochilas", label: "Mochilas", icon: Backpack },
  { to: "/ativos", label: "Gestão de Ativos", icon: Boxes },
  { to: "/funcionarios", label: "Funcionários", icon: Users },
] as const;

const secondary = [
  { to: "/almoxarifado", label: "Materiais", icon: Package },
  { to: "/manutencao", label: "Manutenção", icon: Settings2 },
  { to: "/descarte", label: "Descarte", icon: Trash2 },
  { to: "/locacoes", label: "Locações", icon: Truck },
  { to: "/pedidos", label: "Pedidos", icon: ClipboardList },
  { to: "/auditoria", label: "Auditoria", icon: ShieldCheck },
  { to: "/imprimir", label: "Imprimir", icon: FileSpreadsheet },
  { to: "/relatorio", label: "Relatório", icon: Printer },
] as const;


export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { isAdmin } = useIsAdmin();
  const isActive = (path: string) => location.pathname === path;
  const pendingRequests = usePendingRequestsCount();
  const closeOnMobile = () => { if (isMobile) setOpenMobile(false); };

  return (
    <Sidebar collapsible="icon" className="border-r border-border/60">
      <SidebarHeader className="border-b border-border/40 bg-gradient-to-br from-slate-900 via-slate-950 to-black">
        <div className="flex items-center gap-2.5 px-1 py-1.5">
          <img src={bsLogo.url} alt="BS" className="h-10 w-10 shrink-0 rounded-lg ring-2 ring-amber-500/50 object-cover shadow" />
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-bold tracking-wider">BS TOOLS</p>
              <p className="truncate text-[10px] text-muted-foreground">{user?.email}</p>
              {!isAdmin && (
                <span className="mt-0.5 inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-400">
                  <Eye className="h-2.5 w-2.5" />Leitura
                </span>
              )}
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="bg-gradient-to-b from-slate-950 to-black">
        <SidebarGroup>
          <SidebarGroupLabel>Operação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {primary.map((item) => (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton asChild isActive={isActive(item.to)} tooltip={item.label}>
                    <Link to={item.to} onClick={closeOnMobile} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Gestão</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {secondary.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton asChild isActive={isActive(item.to)} tooltip={item.label}>
                    <Link to={item.to} onClick={closeOnMobile} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      <span className="flex-1">{item.label}</span>
                      {item.to === "/pedidos" && pendingRequests > 0 && (
                        <span className="ml-auto inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow ring-2 ring-red-500/30 animate-pulse">
                          {pendingRequests > 99 ? "99+" : pendingRequests}
                        </span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border/40 bg-black/60">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Bater Ponto"
              onClick={async () => {
                let url = "/ponto";
                if (user?.id) {
                  const { data } = await supabase.from("employees").select("token").eq("user_id", user.id).maybeSingle();
                  if (data?.token) url = `/ponto?u=${encodeURIComponent(data.token)}`;
                }
                window.location.href = url;
              }}
            >
              <Clock className="h-4 w-4" />
              <span>Bater Ponto</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} tooltip="Sair">
              <LogOut className="h-4 w-4" />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
