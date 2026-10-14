import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Trash2, Plus, Activity, Users, Calculator, Pencil, Printer, FileSpreadsheet, FileText, Sparkles, Wand2, CalendarDays, Building2, UserRound } from "lucide-react";
import { useConfirmDelete } from "@/components/password-gate";
import { downloadXls, xlsTable, xlsSectionHeader } from "@/lib/html-xls";
import { toast } from "sonner";
import { parseProductionNoteLocally } from "@/lib/production-note-parser";
import { ProductionVoiceInput } from "@/components/production-voice-input";
import { useAuth } from "@/hooks/use-auth";

import { format } from "date-fns";
import { UNITS, UNIT_LABEL, categoryColor, type Unit } from "@/lib/service-categories";
import { roleLabel, computeRateio } from "@/lib/roles";

function diffHours(hi: string, hf: string): number {
  if (!hi || !hf) return 0;
  const [h1, m1] = hi.split(":").map(Number);
  const [h2, m2] = hf.split(":").map(Number);
  const mins = (h2 * 60 + m2) - (h1 * 60 + m1);
  return mins > 0 ? Math.round((mins / 60) * 100) / 100 : 0;
}

export const Route = createFileRoute("/_authenticated/producao")({
  head: () => ({
    meta: [
      { title: "Produção Diária — BS TOOLS" },
      { name: "description", content: "Registros de produção por data, serviço, funcionário e obra." },
      { property: "og:title", content: "Produção Diária — BS TOOLS" },
      { property: "og:description", content: "Registros de produção por data, serviço, funcionário e obra." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProducaoPage,
});

type Emp = { id: string; name: string; active: boolean; role: string | null; role_other: string | null };
type Obra = { id: string; name: string; status?: string | null };
type RateioCat = { id: string; key: string; label: string; includes_helper: boolean };
type Entry = {
  id: string; employee_id: string | null; obra_id: string | null;
  category: string; specification: string | null;
  unit: Unit; quantity: number; hours: number | null;
  hora_inicio: string | null; hora_fim: string | null;
  entry_date: string; notes: string | null; created_at: string;
};
type Participant = {
  id: string; entry_id: string; employee_id: string;
  role_snapshot: string | null; included_in_rateio: boolean;
  quantity_share?: number | null; hours_share?: number | null;
};
type ProductionDraft = {
  id: string;
  label: string;
  entry: {
    obra_id: string; employee_id: string | null; category: string; specification: string | null;
    unit: Unit; quantity: number; hours: number | null; hora_inicio: string | null;
    hora_fim: string | null; total_value: number; effort_unit: string; effort_amount: number;
    entry_date: string; notes: string | null;
  };
  participants: Array<{
    employee_id: string; role_snapshot: string | null; included_in_rateio: boolean;
    valor_individual: number; quantity_share: number; hours_share: number;
  }>;
};

// Sem cálculo automático de rateio: o usuário digita manualmente os valores por funcionário.

function toNum(s: string): number {
  return Math.max(0, parseFloat(String(s).replace(",", ".")) || 0);
}


function formatQty(n: number, unit: Unit) {
  return `${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}${UNIT_LABEL[unit] ?? unit}`;
}

function ProducaoPage() {
  const { isAdmin } = useIsAdmin();
  const { session, loading: authLoading } = useAuth();
  const accessToken = session?.access_token;
  const qc = useQueryClient();
  const askDelete = useConfirmDelete();
  const today = format(new Date(), "yyyy-MM-dd");

  const [form, setForm] = useState({
    obra_id: "",
    category_key: "reboco",
    category_other: "",
    specification: "",
    unit: "m" as Unit,
    quantity: "",
    hora_inicio: "",
    hora_fim: "",
    hoursManual: "", // override editável (vazio = usa cálculo automático com almoço)
    entry_date: today,
    notes: "",
  });
  // Calculadora dinâmica de medidas: m² (2 campos) / m³ (3 campos)
  const [calc, setCalc] = useState({ mode: "m2" as "m2" | "m3", op: "*" as "*" | "+" | "-" | "/", a: "", b: "", c: "" });
  const calcResult = (() => {
    const nums = [calc.a, calc.b, ...(calc.mode === "m3" ? [calc.c] : [])]
      .filter((v) => String(v).trim() !== "")
      .map((v) => parseFloat(String(v).replace(",", ".")) || 0);
    if (nums.length === 0) return 0;
    const r = nums.reduce((acc, n) =>
      calc.op === "*" ? acc * n : calc.op === "+" ? acc + n : calc.op === "-" ? acc - n : (n === 0 ? acc : acc / n));
    return Math.round((Number.isFinite(r) ? r : 0) * 100) / 100;
  })();

  const [selectedEmp, setSelectedEmp] = useState<Record<string, boolean>>({});
  const [shares, setShares] = useState<Record<string, { q: string; h: string }>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printMode, setPrintMode] = useState<"geral" | "funcionario">("geral");
  const [printEmpId, setPrintEmpId] = useState<string>("");
  const [drafts, setDrafts] = useState<ProductionDraft[]>([]);
  const [selectedReportDate, setSelectedReportDate] = useState(today);


  const { data: employees = [] } = useQuery({
    queryKey: ["employees-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees")
        .select("id,name,active,role,role_other").eq("active", true).order("name");
      if (error) throw error;
      return (data ?? []) as Emp[];
    },
  });

  const { data: obras = [] } = useQuery({
    queryKey: ["obras-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("obras").select("id,name,status").order("name");
      if (error) throw error;
      return (data ?? []) as (Obra & { status?: string | null })[];
    },
  });

  // Apenas obras em aberto podem receber novos lançamentos
  const openObras = useMemo(
    () => obras.filter((o) => (o.status ?? "") !== "concluida"),
    [obras],
  );


  const { data: cats = [] } = useQuery({
    queryKey: ["rateio-cats"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("rateio_categories")
        .select("id,key,label,includes_helper").order("label");
      if (error) throw error;
      return (data ?? []) as RateioCat[];
    },
  });

  const { data: entries = [] } = useQuery({
    queryKey: ["production_entries_all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("production_entries")
        .select("id,employee_id,obra_id,category,specification,unit,quantity,hours,hora_inicio,hora_fim,entry_date,notes,created_at")
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
    staleTime: 30_000,
    gcTime: 60_000,
  });

  const entryIds = useMemo(() => entries.map((e) => e.id), [entries]);
  const { data: participants = [] } = useQuery({
    queryKey: ["production_participants", entryIds],
    enabled: entryIds.length > 0,
    queryFn: async () => {
      // Consulta em lotes: histórico longo (1 ano+) sem estourar o limite da URL.
      const out: Participant[] = [];
      for (let i = 0; i < entryIds.length; i += 200) {
        const chunk = entryIds.slice(i, i + 200);
        const { data, error } = await (supabase as any)
          .from("production_entry_participants")
          .select("id,entry_id,employee_id,role_snapshot,included_in_rateio,quantity_share,hours_share")
          .in("entry_id", chunk);
        if (error) throw error;
        out.push(...((data ?? []) as Participant[]));
      }
      return out;
    },
  });

  // Tempo real: qualquer lançamento/rateio (inclusive vindo de outro device ou
  // sincronizado após o modo offline) atualiza relatório e gráfico sem refresh.
  useEffect(() => {
    if (authLoading || !accessToken) return;
    supabase.realtime.setAuth(accessToken);
    const refresh = () => {
      qc.invalidateQueries({ queryKey: ["production_entries_all"] });
      qc.invalidateQueries({ queryKey: ["production_participants"] });
    };
    const ch = (supabase as any)
      .channel("producao-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "production_entries" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "production_entry_participants" }, refresh)
      .subscribe();
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
      (supabase as any).removeChannel(ch);
    };
  }, [qc, authLoading, accessToken]);

  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const obraMap = useMemo(() => new Map(obras.map((o) => [o.id, o.name])), [obras]);
  const catMap = useMemo(() => new Map(cats.map((c) => [c.key, c])), [cats]);
  const partsByEntry = useMemo(() => {
    const m = new Map<string, Participant[]>();
    participants.forEach((p) => {
      const arr = m.get(p.entry_id) ?? [];
      arr.push(p); m.set(p.entry_id, arr);
    });
    return m;
  }, [participants]);

  const selectedList = useMemo(
    () => employees.filter((e) => selectedEmp[e.id]),
    [employees, selectedEmp],
  );
  const qtyNum = Math.max(0, parseFloat(form.quantity.replace(",", ".")) || 0);
  const rawHours = diffHours(form.hora_inicio, form.hora_fim);
  // Total de horas = SEMPRE o que o usuário digitou (ou o bruto entre início/fim).
  // Sem dedução automática de almoço. Se o usuário quiser descontar, ele digita manualmente.
  const hoursTotal = form.hoursManual.trim() !== "" ? toNum(form.hoursManual) : rawHours;

  const currentCategoryKey = form.category_key === "outros"
    ? (form.category_other.trim() || "outros")
    : form.category_key;

  // Ao adicionar/remover funcionários, inicializa os campos vazios ("0").
  // NUNCA sobrescreve valores digitados pelo usuário.
  useEffect(() => {
    setShares((prev) => {
      const next: Record<string, { q: string; h: string }> = {};
      selectedList.forEach((e) => {
        next[e.id] = prev[e.id] ?? { q: "0", h: "0" };
      });
      return next;
    });
    setTouched((t) => {
      const next: Record<string, boolean> = {};
      selectedList.forEach((e) => { if (t[e.id]) next[e.id] = true; });
      return next;
    });
  }, [selectedList.map((e) => e.id).join(",")]);

  const sumSharesQ = selectedList.reduce((a, e) => a + toNum(shares[e.id]?.q ?? "0"), 0);
  const sumSharesH = selectedList.reduce((a, e) => a + toNum(shares[e.id]?.h ?? "0"), 0);
  const qtyDiff = Math.abs(sumSharesQ - qtyNum);
  const hDiff = Math.abs(sumSharesH - hoursTotal);
  // Aviso apenas; o save é permitido mesmo quando a soma não bate (autonomia total).
  const rateioValido = qtyDiff < 0.01 && (hoursTotal === 0 || hDiff < 0.01);

  // ----- Rateio inteligente -----
  // Serviços técnicos: divide só entre profissionais qualificados.
  // Serviços braçais (includes_helper): ajudantes entram na divisão.
  const currentCat = catMap.get(currentCategoryKey);
  const includesHelper = currentCat?.includes_helper ?? false;
  const eligibleList = useMemo(
    () => selectedList.filter((e) => includesHelper || e.role !== "ajudante"),
    [selectedList, includesHelper],
  );

  function applySmartRateio() {
    if (selectedList.length === 0) return toast.error("Selecione os funcionários");
    const elig = eligibleList.length ? eligibleList : selectedList;
    const n = elig.length;
    const qEach = qtyNum > 0 ? qtyNum / n : 0;
    setShares((prev) => {
      const next = { ...prev };
      selectedList.forEach((e) => {
        const isElig = elig.some((x) => x.id === e.id);
        const cur = next[e.id] ?? { q: "0", h: "0" };
        // horas individuais informadas são preservadas
        const hInd = toNum(cur.h);
        next[e.id] = {
          q: isElig ? String(Number(qEach.toFixed(2))) : "0",
          h: hInd > 0 ? cur.h : (isElig && hoursTotal > 0 ? String(Number(hoursTotal.toFixed(2))) : cur.h),
        };
      });
      return next;
    });
    toast.success(`Rateio dividido entre ${n} ${includesHelper ? "participante(s)" : "profissional(is) qualificado(s)"}`);
  }

  // Rateio proporcional às horas individuais informadas
  function applyProportionalRateio() {
    const elig = eligibleList.length ? eligibleList : selectedList;
    const totalH = elig.reduce((a, e) => a + toNum(shares[e.id]?.h ?? "0"), 0);
    if (totalH <= 0) return toast.error("Informe as horas individuais primeiro");
    setShares((prev) => {
      const next = { ...prev };
      selectedList.forEach((e) => {
        const isElig = elig.some((x) => x.id === e.id);
        const h = toNum(prev[e.id]?.h ?? "0");
        const q = isElig && qtyNum > 0 ? (qtyNum * h) / totalH : 0;
        next[e.id] = { q: String(Number(q.toFixed(2))), h: prev[e.id]?.h ?? "0" };
      });
      return next;
    });
    toast.success("Rateio proporcional às horas aplicado");
  }

  // ----- Preenchimento local a partir da transcrição -----
  const [transcriptText, setTranscriptText] = useState("");
  const [parseWarning, setParseWarning] = useState("");

  function fillFromNote(text = transcriptText) {
    if (text.trim().length < 3) return;
    setParseWarning("");
    try {
      const r = parseProductionNoteLocally({
          text: text.trim(),
          categories: cats.map((c) => ({ key: c.key, label: c.label })),
          employees: employees.filter((e) => e.active).map((e) => ({ id: e.id, name: e.name })),
          obras: openObras.map((o) => ({ id: o.id, name: o.name })),
      });
      setForm((f) => ({
        ...f,
        obra_id: r.obra_id && openObras.some((o) => o.id === r.obra_id) ? r.obra_id : f.obra_id,
        category_key: r.category_key && cats.some((c) => c.key === r.category_key) ? r.category_key : f.category_key,
        specification: r.specification ?? f.specification,
        unit: r.unit ?? f.unit,
        quantity: r.quantity != null ? String(r.quantity) : f.quantity,
        notes: r.notes ?? f.notes,
      }));
      const list = r.employees;
      if (list.length) {
        const sel: Record<string, boolean> = {};
        const sh: Record<string, { q: string; h: string }> = {};
        list.forEach((p) => {
          if (!employees.some((e) => e.id === p.id)) return;
          sel[p.id] = true;
          sh[p.id] = { q: p.quantity != null ? String(p.quantity) : "0", h: p.hours != null ? String(p.hours) : "0" };
        });
        setSelectedEmp(sel);
        setShares(sh);
      }
      setParseWarning(r.warnings.join(" "));
      toast.success("Campos preenchidos — revise antes de salvar");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao interpretar";
      setParseWarning(message);
      toast.error(message);
    }
  }

  const makeDraft = (): ProductionDraft => {
      if (!form.obra_id) throw new Error("Selecione a obra");
      if (selectedList.length === 0) throw new Error("Selecione ao menos 1 funcionário");
      if (qtyNum <= 0) throw new Error("Quantidade inválida");

      const participants = selectedList.map((e) => {
        const q = toNum(shares[e.id]?.q ?? "0");
        const h = toNum(shares[e.id]?.h ?? "0");
        return { employee_id: e.id, role_snapshot: e.role, included_in_rateio: q > 0 || h > 0, valor_individual: 0, quantity_share: q, hours_share: h };
      });
      return {
        id: crypto.randomUUID(),
        label: `${form.specification.trim() || catMap.get(currentCategoryKey)?.label || currentCategoryKey} — ${obraMap.get(form.obra_id) ?? "Obra"}`,
        entry: {
        obra_id: form.obra_id,
        employee_id: selectedList[0]?.id ?? null,
        category: currentCategoryKey,
        specification: form.specification.trim() || null,
        unit: form.unit,
        quantity: qtyNum,
        hours: hoursTotal || null,
        hora_inicio: form.hora_inicio || null,
        hora_fim: form.hora_fim || null,
        total_value: 0,
        effort_unit: "dia",
        effort_amount: 1,
        entry_date: form.entry_date,
        notes: form.notes.trim() || null,
        },
        participants,
      };
  };

  const clearTaskFields = () => {
    setForm((f) => ({ ...f, quantity: "", hora_inicio: "", hora_fim: "", hoursManual: "", notes: "", specification: "", category_other: "" }));
    setShares({});
    setTouched({});
  };

  const addDraft = () => {
    try {
      setDrafts((current) => [...current, makeDraft()]);
      clearTaskFields();
      toast.success("Tarefa adicionada à lista");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Revise os campos");
    }
  };

  const save = useMutation({
    mutationFn: async (batch: ProductionDraft[]) => {
      for (const draft of batch) {
        const { data: entry, error } = await (supabase as any).from("production_entries").insert(draft.entry).select("id").single();
        if (error) throw error;
        const rows = draft.participants.map((participant) => ({ ...participant, entry_id: entry.id }));
        const { error: pe } = await (supabase as any).from("production_entry_participants").insert(rows);
        if (pe) throw pe;
      }
    },
    onSuccess: (_data, batch) => {
      toast.success(batch.length === 1 ? "Produção lançada" : `${batch.length} tarefas lançadas`);
      if (!rateioValido) toast.warning("Aviso: a soma do rateio não bate com o total lançado.");
      setDrafts([]);
      setSelectedReportDate(batch[batch.length - 1]?.entry.entry_date ?? today);
      clearTaskFields();
      setTranscriptText("");
      setParseWarning("");
      setSelectedEmp({});
      qc.invalidateQueries({ queryKey: ["production_entries_all"] });
      qc.invalidateQueries({ queryKey: ["production_participants"] });
      qc.invalidateQueries({ queryKey: ["production_entries"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });




  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("production_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Removido");
      qc.invalidateQueries({ queryKey: ["production_entries_all"] });
      qc.invalidateQueries({ queryKey: ["production_participants"] });
    },
  });

  const toggleEmp = (id: string) => setSelectedEmp((s) => ({ ...s, [id]: !s[id] }));

  // Log puro: uma linha por participante, ordenado por created_at do lançamento (DESC).
  // Sem SUM/GROUP BY — grava e exibe o que foi digitado.
  type FlatRow = {
    key: string;
    created_at: string;
    entry_date: string;
    employee_id: string | null;
    employee_name: string;
    obra_id: string | null;
    obra_name: string;
    category_key: string;
    categoria: string;
    servico: string;
    descricao: string;
    unit: Unit;
    horas: number;
    producao: number;
  };
  const flatRows: FlatRow[] = useMemo(() => {
    const sortedEntries = [...entries].sort(
      (a, b) => (b.created_at || "").localeCompare(a.created_at || ""),
    );
    const rows: FlatRow[] = [];
    sortedEntries.forEach((e) => {
      const parts = partsByEntry.get(e.id) ?? [];
      const list = parts.length
        ? parts
        : (e.employee_id
            ? [{ id: e.id, entry_id: e.id, employee_id: e.employee_id, role_snapshot: null, included_in_rateio: true, quantity_share: Number(e.quantity), hours_share: Number(e.hours) || 0 } as Participant]
            : []);
      list.forEach((p) => {
        const emp = empMap.get(p.employee_id);
        rows.push({
          key: `${e.id}:${p.id}`,
          created_at: e.created_at,
          entry_date: e.entry_date,
          employee_id: p.employee_id,
          employee_name: emp?.name ?? "—",
          obra_id: e.obra_id ?? null,
          obra_name: obraMap.get(e.obra_id ?? "") ?? "—",
          category_key: e.category,
          categoria: catMap.get(e.category)?.label ?? e.category,
          servico: e.specification || (catMap.get(e.category)?.label ?? e.category),
          descricao: e.notes ?? "",
          unit: e.unit,
          horas: p.hours_share != null ? Number(p.hours_share) : 0,
          producao: p.quantity_share != null ? Number(p.quantity_share) : 0,
        });
      });
    });
    return rows;
  }, [entries, partsByEntry, empMap, obraMap, catMap]);
  const dailyRows = useMemo(
    () => flatRows.filter((row) => row.entry_date === selectedReportDate),
    [flatRows, selectedReportDate],
  );

  const printReport = (rows: FlatRow[], titulo: string) => {
    const now = new Date();
    const body = rows.map((r) => `
      <tr>
        <td>${format(new Date(r.entry_date + "T00:00:00"), "dd/MM/yyyy")}</td>
        <td>${r.employee_name}</td>
        <td>${r.obra_name}</td>
        <td>${r.servico}</td>
        <td class="num">${r.horas.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}h</td>
        <td class="num">${r.producao.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}${UNIT_LABEL[r.unit] ?? r.unit}</td>
      </tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${titulo}</title>
      <style>
        @page { size: A4; margin: 14mm; }
        * { box-sizing: border-box; }
        body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color:#000; margin:0; padding:0; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        .meta { font-size: 11px; color:#444; margin-bottom: 12px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #333; padding: 4px 6px; text-align: left; vertical-align: top; }
        th { background: #eee; text-transform: uppercase; font-size: 10px; letter-spacing: .04em; }
        td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
        tfoot td { font-weight: bold; background: #f5f5f5; }
        @media print { .no-print { display:none; } }
      </style></head><body>
      <h1>${titulo}</h1>
      <div class="meta">Emitido em ${now.toLocaleDateString("pt-BR")} ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · ${rows.length} lançamento(s)</div>
      <table>
        <thead><tr>
          <th>Data</th><th>Funcionário</th><th>Obra</th><th>Serviço</th>
          <th class="num">Horas</th><th class="num">Produção (m)</th>
        </tr></thead>
        <tbody>${body || `<tr><td colspan="6" style="text-align:center;padding:12px">Sem lançamentos</td></tr>`}</tbody>
      </table>
      <script>window.onload=()=>{setTimeout(()=>window.print(),200);};</script>
      </body></html>`;
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) { toast.error("Bloqueio de pop-up impediu a impressão"); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };



  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">
            <Activity className="h-6 w-6 text-emerald-400" />
            Lançamento de Produção
          </h1>
          <p className="text-sm text-muted-foreground">
            Registre o serviço e a equipe; a produção é dividida igualmente entre os participantes.
          </p>
        </div>
        <div className="flex gap-2 no-print">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const rows: string[][] = [];
              entries.forEach((e) => {
                const parts = partsByEntry.get(e.id) ?? [];
                const list = parts.length
                  ? parts
                  : (e.employee_id
                      ? [{ id: e.id, entry_id: e.id, employee_id: e.employee_id, role_snapshot: null, included_in_rateio: true, quantity_share: Number(e.quantity), hours_share: Number(e.hours) || 0 } as Participant]
                      : []);
                list.forEach((p) => {
                  const emp = empMap.get(p.employee_id);
                  const q = p.quantity_share != null ? Number(p.quantity_share) : 0;
                  const h = p.hours_share != null ? Number(p.hours_share) : 0;
                  rows.push([
                    format(new Date(e.entry_date + "T00:00:00"), "dd/MM/yyyy"),
                    `${e.hora_inicio ?? "—"}–${e.hora_fim ?? "—"}`,
                    obraMap.get(e.obra_id ?? "") ?? "—",
                    e.specification || (catMap.get(e.category)?.label ?? e.category),
                    emp?.name ?? "—",
                    `${h.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}h`,
                    `${q.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}${UNIT_LABEL[e.unit]}`,
                  ]);
                });
              });
              const body = xlsSectionHeader("Produção — Lançamentos por serviço") +
                xlsTable(["Data", "Horário", "Obra", "Serviço", "Funcionário", "Horas Lançadas", "Produção Lançada"], rows);
              downloadXls("Producao", body);
            }}
          >
            <FileSpreadsheet className="h-4 w-4" /> Exportar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const XLSX = await import("xlsx");
              const rows: any[] = [];
              entries.forEach((e) => {
                const parts = partsByEntry.get(e.id) ?? [];
                const list = parts.length ? parts : (e.employee_id ? [{ employee_id: e.employee_id, quantity_share: Number(e.quantity), hours_share: Number(e.hours) || 0 } as any] : []);
                list.forEach((p: any) => {
                  const emp = empMap.get(p.employee_id);
                  const q = p.quantity_share != null ? Number(p.quantity_share) : 0;
                  const h = p.hours_share != null ? Number(p.hours_share) : 0;
                  rows.push({
                    Data: format(new Date(e.entry_date + "T00:00:00"), "dd/MM/yyyy"),
                    Horário: `${e.hora_inicio ?? "—"}–${e.hora_fim ?? "—"}`,
                    Funcionário: emp?.name ?? "—",
                    Cargo: roleLabel(emp?.role, emp?.role_other),
                    Obra: obraMap.get(e.obra_id ?? "") ?? "—",
                    Serviço: e.specification || (catMap.get(e.category)?.label ?? e.category),
                    "Horas Lançadas": Number(h.toFixed(2)),
                    "Produção Lançada": Number(q.toFixed(2)),
                    Unidade: UNIT_LABEL[e.unit] ?? e.unit,
                  });
                });
              });

              const ws = XLSX.utils.json_to_sheet(rows);
              ws["!cols"] = [{ wch: 12 }, { wch: 24 }, { wch: 16 }, { wch: 20 }, { wch: 26 }, { wch: 16 }, { wch: 14 }, { wch: 8 }, { wch: 12 }];
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, "Produção");
              XLSX.writeFile(wb, "producao.xlsx");
            }}
          >
            <FileSpreadsheet className="h-4 w-4" /> XLSX
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setPrintMode("geral"); setPrintModalOpen(true); }}>
            <Printer className="h-4 w-4" /> Imprimir Relatório
          </Button>


        </div>
      </div>

      <section className="overflow-hidden rounded-md border bg-card">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <CalendarDays className="h-4 w-4 text-primary" /> Produção do dia
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {dailyRows.length} {dailyRows.length === 1 ? "registro" : "registros"} na data escolhida
            </p>
          </div>
          <div className="w-full sm:w-52">
            <Label htmlFor="production-report-date">Escolher data</Label>
            <Input
              id="production-report-date"
              type="date"
              value={selectedReportDate}
              onChange={(event) => setSelectedReportDate(event.target.value)}
            />
          </div>
        </div>

        {dailyRows.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <CalendarDays className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">Nenhum registro nesta data</p>
            <p className="mt-1 text-sm text-muted-foreground">Escolha outro dia para consultar a produção.</p>
          </div>
        ) : (
          <div className="divide-y">
            {dailyRows.map((row) => {
              const entryId = row.key.split(":")[0];
              return (
                <article key={row.key} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,0.7fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="break-words font-semibold">{row.descricao || row.servico}</h3>
                      <Badge variant="secondary" className="whitespace-nowrap text-[10px]">{row.categoria}</Badge>
                    </div>
                    {row.descricao && row.descricao !== row.servico && (
                      <p className="mt-1 text-sm text-muted-foreground">{row.servico}</p>
                    )}
                  </div>
                  <div className="grid gap-1.5 text-sm text-muted-foreground">
                    <span className="flex min-w-0 items-center gap-2">
                      <UserRound className="h-4 w-4 shrink-0" />
                      <span className="truncate">{row.employee_name}</span>
                    </span>
                    <span className="flex min-w-0 items-center gap-2">
                      <Building2 className="h-4 w-4 shrink-0" />
                      <span className="truncate">{row.obra_name}</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <div className="text-left sm:text-right">
                      <p className="text-[11px] uppercase text-muted-foreground">Quantidade</p>
                      <p className="font-mono text-lg font-bold text-primary">{formatQty(row.producao, row.unit)}</p>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1 no-print">
                        <Button size="icon" variant="ghost" aria-label="Editar produção" onClick={() => setEditingId(entryId)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" aria-label="Excluir produção" onClick={() => askDelete("Remover esta produção?", () => remove.mutate(entryId))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {isAdmin && (
        <Card className="border-white/5 bg-slate-950/70 shadow-[0_0_40px_-15px_rgba(34,197,94,0.35)]">
          <CardHeader><CardTitle className="text-sm text-emerald-300/90">Novo lançamento</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {/* Preenchimento local a partir de anotações */}
            <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <ProductionVoiceInput busy={save.isPending}
                onTranscript={setTranscriptText} onComplete={(text) => { void fillFromNote(text); }} />
              <Label htmlFor="production-transcript" className="flex items-center gap-1 text-xs uppercase text-primary">
                <Wand2 className="h-3.5 w-3.5" />Transcrição / Anotações
              </Label>
              <Textarea
                id="production-transcript"
                maxLength={4000}
                rows={3}
                className="mt-1"
                placeholder="Ex.: João fez cinquenta metros quadrados de reboco na obra Centro."
                value={transcriptText}
                onChange={(e) => setTranscriptText(e.target.value)}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" onClick={() => { void fillFromNote(); }} disabled={save.isPending || transcriptText.trim().length < 3}>
                  <Sparkles className="mr-1 h-3.5 w-3.5" />Preencher pela transcrição
                </Button>
              </div>
              {parseWarning && <p role="alert" className="text-sm text-destructive">{parseWarning}</p>}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label>Obra</Label>
                <Select value={form.obra_id} onValueChange={(v) => setForm((f) => ({ ...f, obra_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{openObras.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Categoria</Label>
                <Select value={form.category_key} onValueChange={(v) => setForm((f) => ({ ...f, category_key: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {cats.map((c) => (
                      <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                    ))}
                    <SelectItem value="outros">Outros…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Especificação (serviço)</Label>
                <Input placeholder="Ex.: Escavação de vala"
                       value={form.specification}
                       onChange={(e) => setForm((f) => ({ ...f, specification: e.target.value }))} />
              </div>

              {form.category_key === "outros" && (
                <div className="lg:col-span-3">
                  <Label>Nome da categoria</Label>
                  <Input value={form.category_other} placeholder="Ex.: Impermeabilização"
                         onChange={(e) => setForm((f) => ({ ...f, category_other: e.target.value }))} />
                </div>
              )}

              <div>
                <Label>Produção Total (editável)</Label>
                <Input inputMode="decimal" placeholder="0,00" value={form.quantity}
                       onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
              </div>

              <div className="lg:col-span-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Calculator className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Cálculo de medidas</span>
                  <Select
                    value={calc.mode}
                    onValueChange={(v) => {
                      const mode = v as "m2" | "m3";
                      setCalc((c) => ({ ...c, mode }));
                      setForm((f) => ({ ...f, unit: mode as Unit }));
                    }}
                  >
                    <SelectTrigger className="h-8 w-[170px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="m2">Metros quadrados (m²)</SelectItem>
                      <SelectItem value="m3">Metros cúbicos (m³)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={calc.op} onValueChange={(v) => setCalc((c) => ({ ...c, op: v as typeof c.op }))}>
                    <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="*">Multiplicar (×)</SelectItem>
                      <SelectItem value="+">Somar (+)</SelectItem>
                      <SelectItem value="-">Subtrair (−)</SelectItem>
                      <SelectItem value="/">Dividir (÷)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className={`grid gap-2 ${calc.mode === "m3" ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
                  <div>
                    <Label className="text-xs">Comprimento</Label>
                    <Input inputMode="decimal" placeholder="0,00" value={calc.a}
                           onChange={(e) => setCalc((c) => ({ ...c, a: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Largura</Label>
                    <Input inputMode="decimal" placeholder="0,00" value={calc.b}
                           onChange={(e) => setCalc((c) => ({ ...c, b: e.target.value }))} />
                  </div>
                  {calc.mode === "m3" && (
                    <div>
                      <Label className="text-xs">Altura</Label>
                      <Input inputMode="decimal" placeholder="0,00" value={calc.c}
                             onChange={(e) => setCalc((c) => ({ ...c, c: e.target.value }))} />
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <div className="min-w-0 flex-1 rounded-md border bg-background px-2 py-2 text-sm">
                      <span className="text-muted-foreground text-xs">Resultado: </span>
                      <span className="font-semibold">
                        {calcResult.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{UNIT_LABEL[calc.mode]}
                      </span>
                    </div>
                    <Button type="button" size="sm" variant="secondary"
                            onClick={() => {
                              setForm((f) => ({ ...f, quantity: String(calcResult).replace(".", ","), unit: calc.mode as Unit }));
                              toast.success("Valor aplicado à Produção Total");
                            }}>
                      Aplicar
                    </Button>
                  </div>
                </div>
              </div>
              <div>
                <Label>Unidade</Label>
                <Select value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v as Unit }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{UNIT_LABEL[u]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Hora início *</Label>
                <Input type="time" required value={form.hora_inicio}
                       onChange={(e) => setForm((f) => ({ ...f, hora_inicio: e.target.value }))} />
              </div>
              <div>
                <Label>Hora fim *</Label>
                <Input type="time" required value={form.hora_fim}
                       onChange={(e) => setForm((f) => ({ ...f, hora_fim: e.target.value }))} />
                {rawHours > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Bruto: {rawHours.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}h
                  </p>
                )}
              </div>
              <div>
                <Label>Total Horas (editável)</Label>
                <Input inputMode="decimal"
                       placeholder={rawHours ? rawHours.toString() : "0"}
                       value={form.hoursManual}
                       onChange={(e) => setForm((f) => ({ ...f, hoursManual: e.target.value }))} />
                <p className="mt-1 text-[11px] text-emerald-300/80">
                  Aplicado: {hoursTotal.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}h (sem dedução automática)
                </p>
              </div>
              <div>
                <Label>Data</Label>
                <Input type="date" value={form.entry_date}
                       onChange={(e) => setForm((f) => ({ ...f, entry_date: e.target.value }))} />
              </div>


              <div className="sm:col-span-2 lg:col-span-3">
                <Label>Descrição do serviço executado</Label>
                <Textarea rows={2} placeholder="Ex.: levantado um muro lateral de dois metros" value={form.notes}
                          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>

            {/* Multi-select funcionários */}
            <div className="rounded-lg border border-white/5 bg-slate-900/40 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-sky-300">
                <Users className="h-3.5 w-3.5" /> Funcionários envolvidos ({selectedList.length})
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {employees.map((e) => {
                  const checked = !!selectedEmp[e.id];
                  return (
                    <label key={e.id}
                           className={`flex cursor-pointer items-center gap-2 rounded border px-2 py-1.5 text-sm transition ${
                             checked ? "border-emerald-500/60 bg-emerald-500/10" : "border-white/5 hover:border-white/20"
                           }`}>
                      <Checkbox checked={checked} onCheckedChange={() => toggleEmp(e.id)} />
                      <span className="flex-1 truncate">{e.name}</span>
                      <span className="text-[10px] uppercase text-emerald-400">
                        {roleLabel(e.role, e.role_other)}
                      </span>
                    </label>
                  );
                })}
                {employees.length === 0 && (
                  <p className="col-span-full text-center text-xs text-muted-foreground">Nenhum funcionário ativo.</p>
                )}
              </div>
            </div>

            {/* Rateio editável */}
            {selectedList.length > 0 && (
              <div className={`rounded-lg border p-3 text-sm ${rateioValido ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"}`}>
                <div className="mb-2 flex flex-wrap items-center gap-2 font-semibold text-emerald-300">
                  <Calculator className="h-4 w-4" /> Rateio (editável)
                  <Badge variant="secondary" className="ml-auto">
                    Σ {sumSharesQ.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{UNIT_LABEL[form.unit]} / {qtyNum.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{UNIT_LABEL[form.unit]}
                  </Badge>
                </div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={applySmartRateio}>
                    <Sparkles className="mr-1 h-3.5 w-3.5" />Rateio inteligente
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={applyProportionalRateio}>
                    Proporcional às horas
                  </Button>
                  <span className="text-[11px] text-muted-foreground">
                    {includesHelper
                      ? "Serviço braçal — ajudantes entram na divisão."
                      : "Serviço técnico — divide apenas entre profissionais qualificados."}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {selectedList.map((e) => {
                    const s = shares[e.id] ?? { q: "0", h: "0" };
                    return (
                      <div key={e.id} className="flex flex-wrap items-center gap-2 rounded border border-white/5 bg-slate-900/40 px-2 py-1.5">
                        <span className="min-w-0 flex-1 truncate">{e.name}</span>
                        <span className="text-[10px] uppercase text-emerald-400">{roleLabel(e.role, e.role_other)}</span>
                        <div className="flex items-center gap-1">
                          <Input
                            inputMode="decimal"
                            className="h-7 w-20 text-right"
                            value={s.q}
                            onChange={(ev) => {
                              const v = ev.target.value;
                              setShares((p) => ({ ...p, [e.id]: { ...(p[e.id] ?? { q: "0", h: "0" }), q: v } }));
                              setTouched((t) => ({ ...t, [e.id]: true }));
                            }}
                          />
                          <span className="text-[10px] text-muted-foreground">{UNIT_LABEL[form.unit]}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Input
                            inputMode="decimal"
                            className="h-7 w-16 text-right"
                            value={s.h}
                            onChange={(ev) => {
                              const v = ev.target.value;
                              setShares((p) => ({ ...p, [e.id]: { ...(p[e.id] ?? { q: "0", h: "0" }), h: v } }));
                              setTouched((t) => ({ ...t, [e.id]: true }));
                            }}
                          />
                          <span className="text-[10px] text-muted-foreground">h</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {!rateioValido && qtyNum > 0 && (
                  <p className="mt-2 rounded bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-300">
                    ⚠ Aviso: a soma do rateio não bate com o total lançado (salvamento permitido).
                    <br />
                    <span className="font-normal opacity-80">
                      Metros: Σ {sumSharesQ.toFixed(2)} ≠ {qtyNum.toFixed(2)} · Horas: Σ {sumSharesH.toFixed(2)} ≠ {hoursTotal.toFixed(2)}
                    </span>
                  </p>
                )}
              </div>
            )}


            {drafts.length > 0 && (
              <div className="space-y-2 rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3">
                <div className="text-xs font-semibold uppercase text-cyan-300">Tarefas prontas ({drafts.length})</div>
                {drafts.map((draft, index) => (
                  <div key={draft.id} className="flex items-center justify-between gap-2 rounded border border-white/5 bg-slate-950/50 px-2 py-1.5 text-sm">
                    <span className="min-w-0 truncate">{index + 1}. {draft.label} · {draft.entry.quantity}{UNIT_LABEL[draft.entry.unit]}</span>
                    <Button type="button" size="icon" variant="ghost" aria-label="Remover tarefa" onClick={() => setDrafts((current) => current.filter((item) => item.id !== draft.id))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col justify-end gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={addDraft} disabled={save.isPending}>
                <Plus className="mr-1 h-4 w-4" />Adicionar outra tarefa
              </Button>
              <Button onClick={() => {
                try { save.mutate(drafts.length > 0 ? drafts : [makeDraft()]); }
                catch (error) { toast.error(error instanceof Error ? error.message : "Revise os campos"); }
               }} disabled={save.isPending}
                      className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:opacity-90">
                <Plus className="mr-1 h-4 w-4" />{drafts.length > 0 ? `Salvar ${drafts.length} tarefas` : "Lançar produção"}
              </Button>
            </div>

          </CardContent>
        </Card>
      )}

      <Dialog open={printModalOpen} onOpenChange={setPrintModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Imprimir Relatório
            </DialogTitle>
            <DialogDescription>Escolha o tipo de relatório para impressão em A4.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPrintMode("geral")}
                className={`rounded-lg border p-3 text-left transition ${printMode === "geral" ? "border-emerald-500 bg-emerald-500/10" : "border-white/10 hover:border-white/30"}`}
              >
                <div className="text-sm font-semibold">Relatório Geral</div>
                <div className="text-[11px] text-muted-foreground">Todos os {flatRows.length} lançamentos</div>
              </button>
              <button
                type="button"
                onClick={() => setPrintMode("funcionario")}
                className={`rounded-lg border p-3 text-left transition ${printMode === "funcionario" ? "border-emerald-500 bg-emerald-500/10" : "border-white/10 hover:border-white/30"}`}
              >
                <div className="text-sm font-semibold">Por Funcionário</div>
                <div className="text-[11px] text-muted-foreground">Histórico de um funcionário</div>
              </button>
            </div>
            {printMode === "funcionario" && (
              <div>
                <Label>Funcionário</Label>
                <Select value={printEmpId} onValueChange={setPrintEmpId}>
                  <SelectTrigger><SelectValue placeholder="Selecione um funcionário" /></SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrintModalOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (printMode === "geral") {
                  printReport(flatRows, "Relatório Geral de Produção");
                } else {
                  if (!printEmpId) { toast.error("Selecione um funcionário"); return; }
                  const emp = employees.find((e) => e.id === printEmpId);
                  const filtered = flatRows.filter((r) => r.employee_id === printEmpId);
                  printReport(filtered, `Produção — ${emp?.name ?? "Funcionário"}`);
                }
                setPrintModalOpen(false);
              }}
            >
              <Printer className="mr-1 h-4 w-4" /> Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {editingId && (
        <EditEntryDialog
          entryId={editingId}
          employees={employees}
          obras={obras}
          cats={cats}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  );
}

function EditEntryDialog({ entryId, employees, obras, cats, onClose }: {
  entryId: string;
  employees: Emp[];
  obras: Obra[];
  cats: RateioCat[];
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const { data: entry } = useQuery({
    queryKey: ["entry-edit", entryId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("production_entries")
        .select("id,employee_id,obra_id,category,specification,unit,quantity,hours,hora_inicio,hora_fim,entry_date,notes,created_at")
        .eq("id", entryId).maybeSingle();
      if (error) throw error;
      return data as Entry | null;
    },
  });
  const { data: currentParts = [] } = useQuery({
    queryKey: ["entry-edit-parts", entryId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("production_entry_participants")
        .select("id,entry_id,employee_id,role_snapshot,included_in_rateio,quantity_share,hours_share")
        .eq("entry_id", entryId);
      if (error) throw error;
      return (data ?? []) as Participant[];
    },
  });

  // Somente obras em aberto podem receber/manter lançamentos
  const openObras = useMemo(() => obras.filter((o) => (o.status ?? "") !== "concluida"), [obras]);


  const [form, setForm] = useState({
    obra_id: "", category_key: "reboco", specification: "", unit: "m" as Unit,
    quantity: "", hours: "", entry_date: "", notes: "",
  });
  const [selectedEmp, setSelectedEmp] = useState<Record<string, boolean>>({});
  const [shares, setShares] = useState<Record<string, { q: string; h: string }>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (entry) {
      setForm({
        obra_id: entry.obra_id ?? "",
        category_key: entry.category,
        specification: entry.specification ?? "",
        unit: entry.unit,
        quantity: String(entry.quantity ?? ""),
        hours: entry.hours != null ? String(entry.hours) : "",
        entry_date: entry.entry_date,
        notes: entry.notes ?? "",
      });
    }
  }, [entry]);
  useEffect(() => {
    if (currentParts.length > 0) {
      const sel: Record<string, boolean> = {};
      const sh: Record<string, { q: string; h: string }> = {};
      const tc: Record<string, boolean> = {};
      currentParts.forEach((p) => {
        sel[p.employee_id] = true;
        sh[p.employee_id] = {
          q: p.quantity_share != null ? String(Number(Number(p.quantity_share).toFixed(2))) : "0",
          h: p.hours_share != null ? String(Number(Number(p.hours_share).toFixed(2))) : "0",
        };
        // marca como touched para preservar valores persistidos (não reseedar)
        tc[p.employee_id] = true;
      });
      setSelectedEmp(sel);
      setShares(sh);
      setTouched(tc);
    }
  }, [currentParts]);

  const selectedList = useMemo(() => employees.filter((e) => selectedEmp[e.id]), [employees, selectedEmp]);
  const qtyNum = Math.max(0, parseFloat(form.quantity.replace(",", ".")) || 0);
  const hoursNum = form.hours.trim() === "" ? 0 : Math.max(0, parseFloat(form.hours.replace(",", ".")) || 0);

  // Ao adicionar/remover funcionários, apenas garante a existência dos campos ("0"),
  // sem sobrescrever valores digitados nem aplicar rateio automático.
  useEffect(() => {
    setShares((prev) => {
      const next: Record<string, { q: string; h: string }> = {};
      selectedList.forEach((e) => {
        next[e.id] = prev[e.id] ?? { q: "0", h: "0" };
      });
      return next;
    });
  }, [selectedList.map((e) => e.id).join(",")]);

  const sumQ = selectedList.reduce((a, e) => a + toNum(shares[e.id]?.q ?? "0"), 0);
  const sumH = selectedList.reduce((a, e) => a + toNum(shares[e.id]?.h ?? "0"), 0);
  const qDiff = Math.abs(sumQ - qtyNum);
  const hDiff = Math.abs(sumH - hoursNum);
  // Aviso somente — o salvar é sempre permitido (autonomia total).
  const rateioValido = qDiff < 0.01 && (hoursNum === 0 || hDiff < 0.01);


  const save = useMutation({
    mutationFn: async () => {
      if (!form.obra_id) throw new Error("Selecione a obra");
      if (selectedList.length === 0) throw new Error("Selecione ao menos 1 funcionário");
      // Aviso somente — salvamento permitido mesmo com soma diferente do total.

      const { error: uErr } = await (supabase as any).from("production_entries").update({
        obra_id: form.obra_id,
        employee_id: selectedList[0]?.id ?? null,
        category: form.category_key,
        specification: form.specification.trim() || null,
        unit: form.unit,
        quantity: qtyNum,
        hours: hoursNum || null,
        entry_date: form.entry_date,
        notes: form.notes.trim() || null,
      }).eq("id", entryId);
      if (uErr) throw uErr;

      const { error: dErr } = await (supabase as any).from("production_entry_participants").delete().eq("entry_id", entryId);
      if (dErr) throw dErr;

      const rows = selectedList.map((e) => {
        const q = toNum(shares[e.id]?.q ?? "0");
        const h = toNum(shares[e.id]?.h ?? "0");
        return {
          entry_id: entryId,
          employee_id: e.id,
          role_snapshot: e.role,
          included_in_rateio: q > 0 || h > 0,
          valor_individual: 0,
          quantity_share: q,
          hours_share: h,
        };
      });
      const { error: iErr } = await (supabase as any).from("production_entry_participants").insert(rows);
      if (iErr) throw iErr;
    },
    onSuccess: () => {
      toast.success("Lançamento atualizado");
      if (!rateioValido) toast.warning("Aviso: a soma do rateio não bate com o total lançado.");
      qc.invalidateQueries({ queryKey: ["production_entries_all"] });
      qc.invalidateQueries({ queryKey: ["production_participants"] });
      qc.invalidateQueries({ queryKey: ["emp-entries"] });
      qc.invalidateQueries({ queryKey: ["emp-participations"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: string) => {
    setSelectedEmp((s) => ({ ...s, [id]: !s[id] }));
    setTouched((t) => { const n = { ...t }; delete n[id]; return n; });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar lançamento de produção</DialogTitle></DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Obra</Label>
            <Select value={form.obra_id} onValueChange={(v) => setForm((f) => ({ ...f, obra_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{openObras.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Categoria</Label>
            <Select value={form.category_key} onValueChange={(v) => setForm((f) => ({ ...f, category_key: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {cats.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Especificação (serviço)</Label>
            <Input value={form.specification} onChange={(e) => setForm((f) => ({ ...f, specification: e.target.value }))} />
          </div>
          <div>
            <Label>Produção Total (Metros)</Label>
            <Input inputMode="decimal" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} />
          </div>
          <div>
            <Label>Unidade</Label>
            <Select value={form.unit} onValueChange={(v) => setForm((f) => ({ ...f, unit: v as Unit }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{UNIT_LABEL[u]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Data</Label>
            <Input type="date" value={form.entry_date} onChange={(e) => setForm((f) => ({ ...f, entry_date: e.target.value }))} />
          </div>
          <div>
            <Label>Total Horas (editável)</Label>
            <Input inputMode="decimal" placeholder="Ex.: 6" value={form.hours}
                   onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <Label>Descrição do serviço executado</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>

        <div className="rounded-lg border border-white/5 bg-slate-900/40 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-sky-300">
            <Users className="h-3.5 w-3.5" /> Funcionários ({selectedList.length})
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {employees.map((e) => {
              const checked = !!selectedEmp[e.id];
              return (
                <label key={e.id}
                  className={`flex cursor-pointer items-center gap-2 rounded border px-2 py-1.5 text-sm transition ${
                    checked ? "border-emerald-500/60 bg-emerald-500/10" : "border-white/5 hover:border-white/20"
                  }`}>
                  <Checkbox checked={checked} onCheckedChange={() => toggle(e.id)} />
                  <span className="flex-1 truncate">{e.name}</span>
                  <span className="text-[10px] uppercase text-emerald-400">
                    {roleLabel(e.role, e.role_other)}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {selectedList.length > 0 && (
          <div className={`rounded-lg border p-3 text-sm ${rateioValido ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"}`}>
            <div className="mb-2 flex items-center gap-2 font-semibold text-emerald-300">
              <Calculator className="h-4 w-4" /> Rateio (editável por funcionário)
              <Badge variant="secondary" className="ml-auto">
                Σ {sumQ.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{UNIT_LABEL[form.unit]} / {qtyNum.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{UNIT_LABEL[form.unit]}
              </Badge>
            </div>
            <div className="space-y-1.5">
              {selectedList.map((e) => {
                const s = shares[e.id] ?? { q: "0", h: "0" };
                return (
                  <div key={e.id} className="flex flex-wrap items-center gap-2 rounded border border-white/5 bg-slate-900/40 px-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate">{e.name}</span>
                    <span className="text-[10px] uppercase text-emerald-400">{roleLabel(e.role, e.role_other)}</span>
                    <div className="flex items-center gap-1">
                      <Input
                        inputMode="decimal"
                        className="h-7 w-20 text-right"
                        value={s.q}
                        onChange={(ev) => {
                          const v = ev.target.value;
                          setShares((p) => ({ ...p, [e.id]: { ...(p[e.id] ?? { q: "0", h: "0" }), q: v } }));
                          setTouched((t) => ({ ...t, [e.id]: true }));
                        }}
                      />
                      <span className="text-[10px] text-muted-foreground">{UNIT_LABEL[form.unit]}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Input
                        inputMode="decimal"
                        className="h-7 w-16 text-right"
                        value={s.h}
                        onChange={(ev) => {
                          const v = ev.target.value;
                          setShares((p) => ({ ...p, [e.id]: { ...(p[e.id] ?? { q: "0", h: "0" }), h: v } }));
                          setTouched((t) => ({ ...t, [e.id]: true }));
                        }}
                      />
                      <span className="text-[10px] text-muted-foreground">h</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {!rateioValido && (
              <p className="mt-2 rounded bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-300">
                ⚠ Aviso: a soma do rateio não bate com o total lançado (salvamento permitido).
                <br />
                <span className="font-normal opacity-80">
                  Metros: Σ {sumQ.toFixed(2)} ≠ {qtyNum.toFixed(2)} · Horas: Σ {sumH.toFixed(2)} ≠ {hoursNum.toFixed(2)}
                </span>
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Salvar alterações</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

