import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, PackageCheck, Trash2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MobileItemPhotoDialog } from "@/components/inventory-page";
import { assertItemCodeAvailable, itemSaveError } from "@/lib/item-codes";
import { bumpInventory } from "@/lib/inventory-store";
import type { Database } from "@/integrations/supabase/types";

type Epi = Database["public"]["Tables"]["items"]["Row"];
const localDay = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const dateLabel = (value: string | null) => value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString("pt-BR") : "—";
const emptyForm = () => ({ name: "", codigo: "", ca: "", characteristics: "", quantity: "1", received: localDay(), expires: "" });

export function EpiPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("active");
  const [editor, setEditor] = useState<{ item: Epi | null } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [action, setAction] = useState<{ item: Epi; type: "delivery" | "discard"; id: string } | null>(null);
  const [employee, setEmployee] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [day, setDay] = useState(localDay);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const changed = () => { bumpInventory(); void qc.invalidateQueries({queryKey:["items"]}); void qc.invalidateQueries({queryKey:["epi-events"]}); };
  const inventory = useQuery({ queryKey: ["items", "epi"], enabled: !!user, queryFn: async () => {
    const { data, error } = await supabase.from("items").select("*").eq("kind","epi").order("name");
    if (error) throw error; return data;
  }});
  const history = useQuery({ queryKey: ["epi-events"], enabled: !!user, queryFn: async () => {
    const { data, error } = await supabase.from("epi_events").select("*").order("occurred_at",{ascending:false});
    if (error) throw error; return data;
  }});
  const employees = useQuery({ queryKey: ["employees-active-list"], enabled: !!action && action.type === "delivery", queryFn: async () => {
    const { data, error } = await supabase.from("employees").select("id,name").eq("active",true).order("name");
    if (error) throw error; return data;
  }});
  const visible = (inventory.data ?? []).filter(item => {
    const discarded = item.condition === "Descarte";
    const expired = !!item.epi_expires_at && item.epi_expires_at < localDay();
    return (filter === "discarded" ? discarded : !discarded && (filter !== "expired" || expired)) && [item.name,item.codigo,item.caracteristicas,item.epi_ca].join(" ").toLocaleLowerCase().includes(search.toLocaleLowerCase());
  });
  function openEditor(item: Epi | null) {
    setForm(item ? { name:item.name, codigo:item.codigo ?? "", ca:item.epi_ca ?? "", characteristics:item.caracteristicas ?? "", quantity:String(item.quantity), received:item.epi_received_at ?? item.created_at.slice(0,10), expires:item.epi_expires_at ?? "" } : emptyForm());
    setEditor({item});
  }
  function openAction(item: Epi, type: "delivery" | "discard") {
    setEmployee(""); setQuantity("1"); setDay(localDay()); setNotes(""); setAction({item,type,id:crypto.randomUUID()});
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!editor || !user) return;
    const qty = Number(form.quantity);
    if (!Number.isInteger(qty) || qty < 0) { toast.error("Informe um estoque inteiro válido."); return; }
    if (!form.name.trim() || !form.ca.trim() || !form.received || form.received > localDay() || (form.expires && form.expires < form.received)) { toast.error("Confira o nome, CA e as datas do EPI."); return; }
    setSaving(true);
    try {
      await assertItemCodeAvailable(form.codigo || null, editor.item?.id);
      const payload = { name:form.name.trim(), codigo:form.codigo.trim() || null, epi_ca:form.ca.trim(), caracteristicas:form.characteristics.trim() || null, epi_received_at:form.received, epi_expires_at:form.expires || null };
      const result = editor.item ? await supabase.from("items").update(payload).eq("id",editor.item.id) : await supabase.from("items").insert({...payload, kind:"epi", quantity:qty, unit:"un", location:"estoque", condition:"Bom", created_by:user.id});
      if (result.error) throw result.error;
      changed(); setEditor(null); toast.success("EPI salvo");
    } catch(error) { toast.error(itemSaveError(error)); } finally { setSaving(false); }
  }
  async function submitAction(event: React.FormEvent) {
    event.preventDefault(); if (!action) return;
    setSaving(true);
    try {
      const occurred = day === localDay() ? new Date().toISOString() : new Date(`${day}T12:00:00`).toISOString();
      const { error } = await supabase.rpc("record_epi_event", { _event_id:action.id, _item_id:action.item.id, _event_type:action.type, _quantity:Number(quantity), _occurred_at:occurred, _employee_id:action.type === "delivery" ? employee : undefined, _notes:notes.trim() || undefined });
      if (error) throw error;
      changed(); setAction(null); toast.success(action.type === "delivery" ? "Entrega registrada e estoque atualizado" : "EPI descartado e código liberado");
    } catch(error) { toast.error(itemSaveError(error)); } finally { setSaving(false); }
  }
  const actions = (item: Epi) => isAdmin && item.condition !== "Descarte" ? <div className="flex flex-wrap gap-1">
    <Button size="sm" variant="outline" title="Editar EPI" aria-label={`Editar ${item.name}`} onClick={() => openEditor(item)}><Pencil className="h-4 w-4" /></Button>
    <Button size="sm" variant="outline" disabled={item.quantity <= 0 || (!!item.epi_expires_at && item.epi_expires_at < localDay())} onClick={() => openAction(item,"delivery")}><PackageCheck className="h-4 w-4" />Entregar</Button>
    <Button size="sm" variant="outline" title="Descartar EPI" aria-label={`Descartar ${item.name}`} disabled={item.quantity <= 0} onClick={() => openAction(item,"discard")}><Trash2 className="h-4 w-4" /></Button>
  </div> : null;
  const itemName = (item: Epi) => <div className="min-w-0"><p className="break-words font-medium">{item.name}</p>{item.caracteristicas && <p className="break-words text-xs font-medium text-primary">{item.caracteristicas}</p>}<p className="text-xs text-muted-foreground">{item.codigo ? `Código ${item.codigo} · ` : ""}CA {item.epi_ca ?? "—"}</p></div>;
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="flex items-center gap-2 text-2xl font-semibold"><ShieldCheck className="h-6 w-6 text-primary" />EPI</h1>{isAdmin && <Button onClick={() => openEditor(null)}><Plus className="h-4 w-4" />Novo EPI</Button>}</div>
    <Tabs defaultValue="inventory"><TabsList><TabsTrigger value="inventory">Estoque</TabsTrigger><TabsTrigger value="history">Histórico</TabsTrigger></TabsList>
      <TabsContent value="inventory" className="space-y-4">
        <div className="flex flex-wrap gap-2"><Input className="min-w-0 flex-1" placeholder="Buscar EPI, CA ou código" aria-label="Buscar EPI" value={search} onChange={e => setSearch(e.target.value)} /><Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Estoque ativo</SelectItem><SelectItem value="expired">Vencidos</SelectItem><SelectItem value="discarded">Descartados</SelectItem></SelectContent></Select></div>
        {inventory.isLoading ? <p className="text-muted-foreground">Carregando EPIs…</p> : inventory.error ? <div><p className="text-destructive">Não foi possível carregar os EPIs.</p><Button variant="outline" onClick={() => void inventory.refetch()}>Tentar novamente</Button></div> : !visible.length ? <p className="py-8 text-center text-muted-foreground">Nenhum EPI encontrado.</p> : <>
          <div className="space-y-3 md:hidden">{visible.map(item => <article key={item.id} className="space-y-3 rounded-md border p-3"><div className="flex items-start gap-3"><MobileItemPhotoDialog item={item} canEdit={isAdmin && item.condition !== "Descarte"} onChanged={changed} />{itemName(item)}</div><dl className="grid grid-cols-2 gap-2 text-sm"><div><dt className="text-muted-foreground">{item.condition === "Descarte" ? "Descartados" : "Disponíveis"}</dt><dd>{item.quantity} un</dd></div><div><dt className="text-muted-foreground">Validade</dt><dd className={item.epi_expires_at && item.epi_expires_at < localDay() ? "text-destructive" : ""}>{dateLabel(item.epi_expires_at)}</dd></div><div><dt className="text-muted-foreground">Entrada</dt><dd>{dateLabel(item.epi_received_at)}</dd></div>{item.discarded_at && <div><dt className="text-muted-foreground">Descarte</dt><dd>{dateLabel(item.discarded_at)}</dd></div>}</dl>{actions(item)}</article>)}</div>
          <div className="hidden overflow-x-auto md:block"><Table><TableHeader><TableRow><TableHead>Foto</TableHead><TableHead>EPI / Característica</TableHead><TableHead>Saldo</TableHead><TableHead>Entrada</TableHead><TableHead>Validade</TableHead><TableHead>Descarte</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody>{visible.map(item => <TableRow key={item.id}><TableCell><MobileItemPhotoDialog item={item} canEdit={isAdmin && item.condition !== "Descarte"} onChanged={changed} /></TableCell><TableCell>{itemName(item)}</TableCell><TableCell>{item.quantity} un</TableCell><TableCell>{dateLabel(item.epi_received_at)}</TableCell><TableCell className={item.epi_expires_at && item.epi_expires_at < localDay() ? "text-destructive" : ""}>{dateLabel(item.epi_expires_at)}</TableCell><TableCell>{dateLabel(item.discarded_at)}</TableCell><TableCell>{actions(item)}</TableCell></TableRow>)}</TableBody></Table></div>
        </>}
      </TabsContent>
      <TabsContent value="history" className="space-y-3">{history.isLoading ? <p>Carregando histórico…</p> : history.error ? <p className="text-destructive">Não foi possível carregar o histórico.</p> : !history.data?.length ? <p className="py-8 text-center text-muted-foreground">Nenhuma entrega ou descarte registrado.</p> : history.data.map(row => <article key={row.id} className="rounded-md border p-3"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{row.item_name}</p><span className="text-sm text-muted-foreground">{dateLabel(row.occurred_at)}</span></div>{row.caracteristicas && <p className="text-xs font-medium text-primary">{row.caracteristicas}</p>}<p className="text-xs text-muted-foreground">CA {row.ca ?? "—"}{row.item_code ? ` · Código ${row.item_code}` : ""}</p><p className="mt-2 text-sm">{row.event_type === "delivery" ? `Entrega para ${row.employee_name}` : "Descarte"} · {row.quantity} un</p><p className="text-xs text-muted-foreground">Entrada: {dateLabel(row.received_at)}{row.event_type === "discard" ? ` · Durabilidade: ${Math.max(0,Math.floor((new Date(row.occurred_at).getTime()-new Date(`${row.received_at}T00:00:00`).getTime())/86400000))} dias` : ""}</p>{row.notes && <p className="mt-1 break-words text-sm">{row.notes}</p>}</article>)}</TabsContent>
    </Tabs>
    <Dialog open={!!editor} onOpenChange={open => {if (!open && !saving) setEditor(null);}}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"><form onSubmit={save} className="space-y-4"><DialogHeader><DialogTitle>{editor?.item ? "Editar EPI" : "Novo EPI"}</DialogTitle><DialogDescription>Equipamento de Proteção Individual</DialogDescription></DialogHeader>
      <div className="space-y-2"><Label htmlFor="epi-name">Nome do EPI *</Label><Input id="epi-name" required value={form.name} onChange={e => setForm({...form,name:e.target.value})} /></div>
      <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="epi-ca">CA *</Label><Input id="epi-ca" required value={form.ca} onChange={e => setForm({...form,ca:e.target.value})} /></div><div className="space-y-2"><Label htmlFor="epi-code">Código</Label><Input id="epi-code" value={form.codigo} onChange={e => setForm({...form,codigo:e.target.value})} /></div></div>
      <div className="space-y-2"><Label htmlFor="epi-characteristics">Tamanho / Característica</Label><Input id="epi-characteristics" value={form.characteristics} onChange={e => setForm({...form,characteristics:e.target.value})} /></div>
      {!editor?.item && <div className="space-y-2"><Label htmlFor="epi-stock">Estoque inicial *</Label><Input id="epi-stock" type="number" min="0" step="1" required value={form.quantity} onChange={e => setForm({...form,quantity:e.target.value})} /></div>}
      <div className="grid grid-cols-2 gap-3"><div className="min-w-0 space-y-2"><Label htmlFor="epi-received">Data de entrada *</Label><Input className="min-w-0" id="epi-received" type="date" required max={localDay()} value={form.received} onChange={e => setForm({...form,received:e.target.value})} /></div><div className="min-w-0 space-y-2"><Label htmlFor="epi-expires">Validade</Label><Input className="min-w-0" id="epi-expires" type="date" min={form.received} value={form.expires} onChange={e => setForm({...form,expires:e.target.value})} /></div></div>
      <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setEditor(null)}>Cancelar</Button><Button disabled={saving} type="submit">{saving ? "Salvando…" : "Salvar EPI"}</Button></DialogFooter>
    </form></DialogContent></Dialog>
    <Dialog open={!!action} onOpenChange={open => {if (!open && !saving) setAction(null);}}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md"><form onSubmit={submitAction} className="space-y-4"><DialogHeader><DialogTitle>{action?.type === "delivery" ? "Entregar EPI" : "Descartar EPI"}</DialogTitle><DialogDescription>{action?.item.name} · {action?.item.quantity} un disponíveis</DialogDescription>{action?.item.caracteristicas && <p className="text-xs font-medium text-primary">{action.item.caracteristicas}</p>}</DialogHeader>
      {action?.type === "delivery" ? <><div className="space-y-2"><Label>Funcionário *</Label><Select value={employee} onValueChange={setEmployee}><SelectTrigger aria-label="Funcionário"><SelectValue placeholder="Selecione o funcionário" /></SelectTrigger><SelectContent>{employees.data?.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent></Select>{employees.error && <p className="text-sm text-destructive">Não foi possível carregar os funcionários.</p>}</div><div className="space-y-2"><Label htmlFor="epi-quantity">Quantidade *</Label><Input id="epi-quantity" type="number" required min="1" step="1" max={action.item.quantity} value={quantity} onChange={e => setQuantity(e.target.value)} /></div></> : <p className="text-sm text-destructive">Descartar todo o saldo de {action?.item.quantity} un e liberar o código {action?.item.codigo ?? "—"}?</p>}
      <div className="space-y-2"><Label htmlFor="epi-day">Data *</Label><Input id="epi-day" type="date" required max={localDay()} min={action?.item.epi_received_at ?? action?.item.created_at.slice(0,10)} value={day} onChange={e => setDay(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="epi-notes">{action?.type === "discard" ? "Motivo do descarte *" : "Observação"}</Label><Textarea id="epi-notes" required={action?.type === "discard"} value={notes} onChange={e => setNotes(e.target.value)} /></div>
      <DialogFooter><Button type="button" variant="outline" disabled={saving} onClick={() => setAction(null)}>Cancelar</Button><Button type="submit" variant={action?.type === "discard" ? "destructive" : "default"} disabled={saving || (action?.type === "delivery" && !employee)}>{saving ? "Registrando…" : action?.type === "delivery" ? "Confirmar entrega" : "Confirmar descarte"}</Button></DialogFooter>
    </form></DialogContent></Dialog>
  </section>;
}