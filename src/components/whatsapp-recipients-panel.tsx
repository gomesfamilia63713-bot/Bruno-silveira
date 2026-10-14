import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { MessageCircle, Plus, Send, Trash2, Users } from "lucide-react";
import { logAudit } from "@/lib/audit";
import { useServerFn } from "@tanstack/react-start";
import { getWhatsappStatus, sendWhatsappTest } from "@/lib/whatsapp.functions";

interface Recipient {
  id: string;
  label: string;
  target: string;
  is_group: boolean;
  active: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from("whatsapp_recipients");

export function WhatsappRecipientsPanel() {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [target, setTarget] = useState("");
  const [isGroup, setIsGroup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const statusFn = useServerFn(getWhatsappStatus);
  const testFn = useServerFn(sendWhatsappTest);

  const { data: status } = useQuery({ queryKey: ["whatsapp_status"], queryFn: () => statusFn({}) });

  const runTest = async () => {
    setTesting(true);
    try {
      const res = await testFn({});
      if (res.sent > 0) toast.success(`Mensagem de teste enviada para ${res.sent} contato(s)`);
      else toast.error(res.skipped ?? "Nada enviado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no envio");
    } finally { setTesting(false); }
  };

  const { data: rows = [] } = useQuery({
    queryKey: ["whatsapp_recipients"],
    queryFn: async () => {
      const { data, error } = await table().select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Recipient[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["whatsapp_recipients"] });

  const add = async () => {
    const clean = isGroup ? target.trim() : target.replace(/\D/g, "");
    if (!clean) { toast.error("Informe o número (com DDD e DDI) ou o ID do grupo"); return; }
    if (!isGroup && clean.length < 12) { toast.error("Use o formato internacional. Ex.: 5511999999999"); return; }
    setSaving(true);
    try {
      const { error } = await table().insert({
        label: label.trim() || (isGroup ? "Grupo de admins" : "Administrador"),
        target: isGroup && !clean.endsWith("@g.us") ? `${clean}@g.us` : clean,
        is_group: isGroup,
      });
      if (error) throw error;
      await logAudit("sistema", `Contato de WhatsApp adicionado: ${label || clean}`);
      toast.success("Contato adicionado");
      setLabel(""); setTarget("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally { setSaving(false); }
  };

  const toggle = async (r: Recipient) => {
    await table().update({ active: !r.active }).eq("id", r.id);
    refresh();
  };

  const remove = async (r: Recipient) => {
    await table().delete().eq("id", r.id);
    await logAudit("sistema", `Contato de WhatsApp removido: ${r.label || r.target}`);
    toast.success("Contato removido");
    refresh();
  };

  return (
    <div className="rounded-xl border bg-card p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-emerald-500" />
        <h2 className="text-sm font-semibold">Notificações WhatsApp</h2>
        <span className="hidden text-xs text-muted-foreground sm:inline">— quem recebe os avisos de pedidos e devoluções</span>
        <div className="ml-auto flex items-center gap-2">
          <Badge className={`border ${status?.configured
            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
            : "border-amber-500/40 bg-amber-500/15 text-amber-400"}`}>
            {status?.configured
              ? (status.provider === "evolution" ? "Evolution/Z-API ativa" : "Cloud API ativa")
              : "Provedor não configurado"}
          </Badge>
          <Button size="sm" variant="outline" onClick={runTest} disabled={testing || !status?.configured}>
            <Send className="mr-1 h-3.5 w-3.5" />Testar
          </Button>
        </div>
      </div>
      {!status?.configured && (
        <p className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-300">
          Cadastre os contatos abaixo e informe as credenciais da Evolution API / Z-API para os avisos saírem no WhatsApp.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
        <div className="space-y-1">
          <Label className="text-xs">Nome / apelido</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Bruno" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{isGroup ? "ID do grupo (…@g.us)" : "Número com DDI + DDD"}</Label>
          <Input value={target} onChange={(e) => setTarget(e.target.value)}
            placeholder={isGroup ? "1203630000000000@g.us" : "5511999999999"} />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Switch checked={isGroup} onCheckedChange={setIsGroup} id="wpp-group" />
          <Label htmlFor="wpp-group" className="text-xs">Grupo</Label>
        </div>
        <Button onClick={add} disabled={saving} size="sm"><Plus className="h-4 w-4" /> Adicionar</Button>
      </div>

      <div className="mt-3 space-y-1.5">
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum contato cadastrado — nenhum aviso de WhatsApp será enviado.</p>
        ) : rows.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-lg border bg-muted/20 px-2 py-1.5">
            <Badge className={`border ${r.is_group ? "border-violet-500/40 bg-violet-500/15 text-violet-400" : "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"}`}>
              {r.is_group ? <><Users className="mr-1 h-3 w-3" />Grupo</> : "Número"}
            </Badge>
            <span className="truncate text-sm font-medium">{r.label}</span>
            <span className="truncate text-xs text-muted-foreground">{r.target}</span>
            <div className="ml-auto flex items-center gap-2">
              <Switch checked={r.active} onCheckedChange={() => toggle(r)} />
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => remove(r)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
