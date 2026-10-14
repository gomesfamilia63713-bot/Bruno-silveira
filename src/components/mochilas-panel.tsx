import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Backpack, Clock, MapPin, Plus, Trash2, User } from "lucide-react";
import { useConfirmDelete } from "@/components/password-gate";
import { bumpInventory } from "@/lib/inventory-store";

type Employee = { id: string; name: string; active: boolean };
type Obra = { id: string; name: string; status: string };
type ItemLite = { id: string; name: string; caracteristicas: string | null; unit: string; kind: "tool" | "material"; quantity: number };
type Alloc = {
  id: string;
  quantity: number;
  obra_id: string | null;
  item_id: string;
  holder_employee_id: string | null;
  origin_label: string | null;
  created_at: string;
  item: { name: string; caracteristicas: string | null; unit: string; kind: string } | null;
  obra: { name: string } | null;
};

export function MochilasPanel() {
  const qc = useQueryClient();
  const [selectedEmp, setSelectedEmp] = useState<string | null>(null);
  const askDelete = useConfirmDelete();

  const { data: employees = [], isLoading: loadingEmployees, isError: employeesError, refetch: refetchEmployees } = useQuery({
    queryKey: ["mochilas:employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees").select("id, name, active").eq("active", true).order("name");
      if (error) throw error;
      return (data ?? []) as Employee[];
    },
  });

  const { data: obras = [] } = useQuery({
    queryKey: ["mochilas:obras"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("obras").select("id, name, status").neq("status", "concluida").order("name");
      if (error) throw error;
      return (data ?? []) as Obra[];
    },
  });

  const { data: allocs = [], isLoading: loadingAllocs, isError: allocsError, refetch } = useQuery({
    queryKey: ["mochilas:allocs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("obra_items")
        .select("id, quantity, obra_id, item_id, holder_employee_id, origin_label, created_at, item:items(name, caracteristicas, unit, kind), obra:obras(name)")
        .gt("quantity", 0)
        .not("holder_employee_id", "is", null);
      if (error) throw error;
      return (data ?? []) as unknown as Alloc[];
    },
  });

  const byEmp = useMemo(() => {
    const m: Record<string, Alloc[]> = {};
    for (const a of allocs) {
      if (!a.holder_employee_id) continue;
      (m[a.holder_employee_id] ||= []).push(a);
    }
    return m;
  }, [allocs]);

  const empCounts = (id: string) => byEmp[id]?.length ?? 0;

  const refreshMochilas = async () => {
    await Promise.all([
      refetch(),
      qc.invalidateQueries({ queryKey: ["mochilas:items-available"] }),
    ]);
  };

  const withdrawalLabel = (value: string | null | undefined) => {
    if (!value) return "Data não informada";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Data não informada" : format(date, "dd/MM/yyyy 'às' HH:mm");
  };

  const removeAlloc = async (a: Alloc) => {
    askDelete(`Remover ${a.item?.name ?? "item"} da mochila?`, async () => {
      try {
        const { error } = await (supabase as any).rpc("return_stock_from_obra_item", {
          _obra_item_id: a.id, _quantity: a.quantity,
        });
        if (error) throw error;
        toast.success("Item devolvido ao estoque");
        bumpInventory();
        await refreshMochilas();
      } catch (e: any) {
        toast.error(e?.message ?? "Erro ao remover");
      }
    });
  };

  const current = selectedEmp ? employees.find((e) => e.id === selectedEmp) : null;
  const currentItems = selectedEmp ? (byEmp[selectedEmp] ?? []) : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <div className="rounded-xl border bg-card p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Backpack className="h-4 w-4" /> Funcionários
        </div>
        <div className="max-h-[60vh] space-y-1 overflow-auto">
          {loadingEmployees && Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="mb-1 h-10 w-full" />
          ))}
          {employeesError && (
            <div className="p-3 text-xs text-destructive">
              <p>Não foi possível carregar os funcionários.</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => void refetchEmployees()}>Tentar novamente</Button>
            </div>
          )}
          {!loadingEmployees && !employeesError && employees.length === 0 && <p className="p-3 text-xs text-muted-foreground">Nenhum funcionário ativo.</p>}
          {employees.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setSelectedEmp(e.id)}
              className={`flex w-full items-center justify-between rounded-md border px-2.5 py-2 text-left text-sm transition-colors ${
                selectedEmp === e.id ? "border-primary bg-primary/10" : "border-border/60 hover:bg-muted/40"
              }`}
            >
              <span className="flex items-center gap-2 truncate">
                <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{e.name}</span>
              </span>
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium">
                {empCounts(e.id)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        {loadingAllocs ? (
          <div className="space-y-3" aria-label="Carregando mochilas">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : allocsError ? (
          <div className="flex min-h-[240px] flex-col items-center justify-center text-center">
            <p className="text-sm text-destructive">Não foi possível carregar as mochilas.</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => void refetch()}>Tentar novamente</Button>
          </div>
        ) : !current ? (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center text-center">
            <Backpack className="h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              Selecione um funcionário para visualizar e gerenciar a mochila dele.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Mochila — {current.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {currentItems.length} {currentItems.length === 1 ? "item alocado" : "itens alocados"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {currentItems.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      askDelete(
                        `Apagar TODOS os ${currentItems.length} itens da mochila de ${current.name}? Cada item retornará ao estoque.`,
                        async () => {
                          const results = await Promise.allSettled(currentItems.map(async (a) => {
                            const { error } = await (supabase as any).rpc("return_stock_from_obra_item", {
                              _obra_item_id: a.id, _quantity: a.quantity,
                            });
                            if (error) throw error;
                          }));
                          const failed = results.filter((result) => result.status === "rejected").length;
                          bumpInventory();
                          await refreshMochilas();
                          if (failed > 0) toast.error(`${failed} item(ns) não puderam ser devolvidos. Os demais foram atualizados.`);
                          else toast.success("Mochila esvaziada");
                        },
                      );
                    }}
                  >
                    <Trash2 className="h-4 w-4" /> Apagar tudo
                  </Button>
                )}
                <AddToMochilaDialog
                  employeeId={current.id}
                  employeeName={current.name}
                  obras={obras}
                  onSaved={() => { void refreshMochilas(); }}
                />
              </div>
            </div>

            {currentItems.length === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Nenhum item na mochila. Clique em <span className="font-medium text-foreground">Alocar item</span>.
              </div>
            ) : (
              <div className="divide-y rounded-lg border">
                {currentItems.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {a.item?.name ?? "(removido)"}{" "}
                        <span className="text-xs text-muted-foreground">
                          · {a.quantity} {a.item?.unit ?? "un"} · {a.item?.kind === "tool" ? "Ferramenta" : "Material"}
                        </span>
                      </p>
                      {a.item?.caracteristicas?.trim() && <p className="break-words text-xs font-medium text-primary">{a.item.caracteristicas}</p>}
                      <p className="text-xs text-muted-foreground">Obra atual: {a.obra?.name ?? "—"}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
                          <MapPin className="h-3 w-3 text-primary" />
                          Origem: {a.origin_label ?? "Estoque Central"}
                        </span>
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          Retirado em {withdrawalLabel(a.created_at)}
                        </span>
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => removeAlloc(a)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AddToMochilaDialog({
  employeeId, employeeName, obras, onSaved,
}: {
  employeeId: string; employeeName: string;
  obras: Obra[]; onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState("");
  const [obraId, setObraId] = useState("");
  const [qty, setQty] = useState("1");
  const [saving, setSaving] = useState(false);

  const { data: items = [] } = useQuery({
    queryKey: ["mochilas:items-available"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items").select("id, name, caracteristicas, unit, kind, quantity")
        .gt("quantity", 0).order("name");
      if (error) throw error;
      return (data ?? []) as ItemLite[];
    },
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemId) { toast.error("Selecione o item"); return; }
    const q = Number(qty);
    if (!q || q <= 0) { toast.error("Quantidade inválida"); return; }
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("allocate_stock_to_obra", {
        _item_id: itemId,
        _obra_id: obraId || null,
        _quantity: q,
        _notes: `Mochila de ${employeeName}`,
        _holder_employee_id: employeeId,
      });
      if (error) throw error;
      toast.success("Item alocado à mochila");
      bumpInventory();
      setOpen(false);
      setItemId(""); setObraId(""); setQty("1");
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao alocar");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4" /> Alocar item</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alocar item na mochila</DialogTitle>
          <DialogDescription>Vincule uma ferramenta ou material à mochila de {employeeName}.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label>Item</Label>
            <ItemAutocomplete items={items} value={itemId} onChange={setItemId} />
          </div>
          <div>
            <Label>Obra (opcional)</Label>
            <Select value={obraId || "none"} onValueChange={(v) => setObraId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Sem obra" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem obra (só funcionário)</SelectItem>
                {obras.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Quantidade</Label>
            <Input type="number" min="0.01" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Alocando..." : "Alocar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ItemAutocomplete({
  items, value, onChange,
}: { items: ItemLite[]; value: string; onChange: (id: string) => void }) {
  const selected = items.find((i) => i.id === value) ?? null;
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);

  const q = text.trim().toLowerCase();
  const matches = useMemo(
    () => (q ? items.filter((i) => [i.name, i.caracteristicas].some((v) => v?.toLowerCase().includes(q))) : items).slice(0, 30),
    [items, q],
  );

  if (selected) {
    return (
      <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
        <span className="min-w-0 flex-1 truncate">
          {selected.name} · {selected.kind === "tool" ? "Ferr." : "Mat."} · saldo {selected.quantity} {selected.unit}
        </span>
        <Button type="button" size="sm" variant="ghost" onClick={() => { onChange(""); setText(""); setOpen(true); }}>
          Trocar
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder="Digite o nome do item..."
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {matches.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">Nenhum item encontrado.</p>
          ) : matches.map((i) => (
            <button
              key={i.id}
              type="button"
              className="block w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(i.id); setText(i.name); setOpen(false); }}
            >
              <span className="block">{i.name}</span>
              {i.caracteristicas?.trim() && <span className="block break-words text-xs font-medium text-primary">{i.caracteristicas}</span>} <span className="text-xs text-muted-foreground">· {i.kind === "tool" ? "Ferr." : "Mat."} · saldo {i.quantity} {i.unit}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
