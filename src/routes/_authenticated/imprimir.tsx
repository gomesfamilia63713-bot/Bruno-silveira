import { Fragment } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Printer, RefreshCw, FileSpreadsheet, MapPin } from "lucide-react";
import { downloadXls, xlsTable, xlsSectionHeader } from "@/lib/html-xls";

export const Route = createFileRoute("/_authenticated/imprimir")({
  head: () => ({
    meta: [
      { title: "Impressão de Inventário — BS TOOLS" },
      { name: "description", content: "Inventário de ferramentas e materiais para impressão." },
      { property: "og:title", content: "Impressão de Inventário — BS TOOLS" },
      { property: "og:description", content: "Inventário de ferramentas e materiais para impressão." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImprimirPage,
});

type Row = {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
  unit: string;
  condition: string | null;
  price: number | null;
  kind: "tool" | "material";
  codigo: string | null;
  caracteristicas: string | null;
};

type ToolLoc = { id: string; name: string; category: string; quantity: number; unit: string; location: string };

function ImprimirPage() {
  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["items", "all-print"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("items")
        .select("id, name, category, quantity, unit, condition, price, kind, codigo, caracteristicas")
        .order("kind").order("category").order("name");
      if (error) throw error;
      return data as Row[];
    },
  });

  const { data: toolLocations = [] } = useQuery({
    queryKey: ["tool-locations"],
    queryFn: async () => {
      const [toolsRes, allocsRes] = await Promise.all([
        supabase.from("items").select("id, name, category, quantity, unit").eq("kind", "tool").order("category").order("name"),
        supabase.from("obra_items")
          .select("item_id, obra:obras(name), holder:employees!obra_items_holder_employee_id_fkey(name)")
          .gt("quantity", 0),
      ]);
      if (toolsRes.error) throw toolsRes.error;
      if (allocsRes.error) throw allocsRes.error;
      const byItem = new Map<string, { obras: string[]; holders: string[] }>();
      for (const a of (allocsRes.data ?? []) as Array<{ item_id: string; obra: { name: string } | null; holder: { name: string } | null }>) {
        const entry = byItem.get(a.item_id) ?? { obras: [], holders: [] };
        if (a.obra?.name) entry.obras.push(a.obra.name);
        if (a.holder?.name) entry.holders.push(a.holder.name);
        byItem.set(a.item_id, entry);
      }
      return (toolsRes.data ?? []).map((t) => {
        const info = byItem.get(t.id);
        return {
          id: t.id, name: t.name, category: t.category ?? "", unit: t.unit ?? "un",
          quantity: t.quantity,
          location: info?.obras.join(", ") || "Almoxarifado",
          holder: info?.holders.join(", ") || "—",
        };
      }) as (ToolLoc & { holder: string })[];
    },
  });

  const tools = rows.filter((r) => r.kind === "tool");
  const materials = rows.filter((r) => r.kind === "material");
  const now = new Date();

  const totalTools = tools.reduce((s, r) => s + (r.price ?? 0) * r.quantity, 0);
  const totalMats = materials.reduce((s, r) => s + (r.price ?? 0) * r.quantity, 0);

  const holdersByItem = new Map<string, string>();
  const obrasByItem = new Map<string, string>();
  for (const t of toolLocations as (ToolLoc & { holder?: string })[]) {
    if ((t as any).holder) holdersByItem.set(t.id, (t as any).holder);
    if (t.location && t.location !== "Almoxarifado") obrasByItem.set(t.id, t.location);
  }

  const exportXls = () => {
    const fmt = (n: number | null | undefined) => n != null ? `R$ ${Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "";
    const itemRows = (list: Row[]) => list.map((r) => [
      r.codigo ?? "",
      r.name,
      r.caracteristicas ?? r.condition ?? "",
      r.category ?? "",
      obrasByItem.get(r.id) ?? "Almoxarifado",
      holdersByItem.get(r.id) ?? "—",
      r.quantity, r.unit, fmt(r.price), fmt(r.price != null ? Number(r.price) * r.quantity : null),
    ]);
    const headers = ["Código", "Item", "Características", "Categoria", "Obra", "Responsável", "Qtd", "Un", "Preço", "Subtotal"];
    let html = xlsSectionHeader("🔧 Ferramentas");
    html += xlsTable(headers, itemRows(tools));
    html += xlsSectionHeader("📦 Materiais");
    html += xlsTable(headers, itemRows(materials));
    html += xlsSectionHeader("📍 Localização das ferramentas");
    html += xlsTable(["Ferramenta", "Categoria", "Obra", "Responsável", "Qtd", "Un"],
      (toolLocations as (ToolLoc & { holder: string })[]).map((t) => [t.name, t.category, t.location, t.holder, t.quantity, t.unit]));
    html += `<p style="font-weight:bold;text-align:right">Total geral: ${fmt(totalTools + totalMats)}</p>`;
    downloadXls("Planilha de Estoque — BS TOOLS", html);
  };

  return (
    <div className="space-y-6 print:space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between no-print">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">Imprimir Estoque</h1>
          <p className="text-sm text-muted-foreground">Lista automática de tudo no estoque, separada em ferramentas e materiais.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /> Atualizar</Button>
          <Button variant="outline" onClick={exportXls}><FileSpreadsheet className="h-4 w-4" /> Planilha (Excel/Word)</Button>
          <Button onClick={() => window.print()}><Printer className="h-4 w-4" /> Imprimir</Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <div className="rounded-xl border bg-card p-5 print:border-0 print:p-0 print:bg-white print:text-black">
          <div className="mb-4 border-b border-border pb-3 print:border-black">
            <h2 className="flex items-center gap-2 text-2xl font-bold">
              <FileSpreadsheet className="h-6 w-6" /> Planilha de Estoque — BS TOOLS
            </h2>
            <p className="text-xs text-muted-foreground print:text-black/70">
              {now.toLocaleDateString("pt-BR")} {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>

          <Section title="🔧 Ferramentas" rows={tools} total={totalTools} showCondition />
          <Section title="📦 Materiais" rows={materials} total={totalMats} />

          {/* Tool locations */}
          <section className="mb-6">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground print:text-black">
              <MapPin className="h-4 w-4" /> Localização das ferramentas
            </h3>
            {toolLocations.length === 0 ? (
              <p className="text-xs text-muted-foreground print:text-black/70">Nenhuma ferramenta cadastrada.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-border text-left text-xs uppercase tracking-wider text-muted-foreground print:border-black print:text-black">
                    <th className="py-2">Ferramenta</th>
                    <th className="py-2 hidden sm:table-cell">Categoria</th>
                    <th className="py-2">Localização</th>
                    <th className="w-16 py-2 text-right">Qtd</th>
                  </tr>
                </thead>
                <tbody>
                  {toolLocations.map((t) => (
                    <tr key={t.id} className="border-b border-border/60 print:border-black/40">
                      <td className="py-1.5 pr-2 print:text-black">{t.name}</td>
                      <td className="py-1.5 pr-2 hidden sm:table-cell text-muted-foreground print:text-black/70">{t.category || "—"}</td>
                      <td className="py-1.5 pr-2 font-medium print:text-black">{t.location}</td>
                      <td className="py-1.5 text-right print:text-black">{t.quantity} {t.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <div className="mt-6 border-t border-border pt-3 text-right print:border-black">
            <p className="text-sm font-semibold print:text-black">
              Total geral: R$ {(totalTools + totalMats).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, rows, total, showCondition }: { title: string; rows: Row[]; total: number; showCondition?: boolean }) {
  if (rows.length === 0) {
    return (
      <section className="mb-6">
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-foreground print:text-black">{title}</h3>
        <p className="text-xs text-muted-foreground print:text-black/70">Nenhum item.</p>
      </section>
    );
  }
  const groups: Record<string, Row[]> = {};
  for (const r of rows) {
    const k = r.category?.trim() || "Sem categoria";
    (groups[k] ||= []).push(r);
  }
  const cats = Object.keys(groups).sort((a, b) => a.localeCompare(b, "pt-BR"));

  return (
    <section className="mb-6">
      <h3 className="mb-2 flex items-center justify-between text-sm font-bold uppercase tracking-wider text-foreground print:text-black">
        <span>{title}</span>
        <span className="text-xs text-muted-foreground print:text-black/70">{rows.length} {rows.length === 1 ? "item" : "itens"}</span>
      </h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-border text-left text-xs uppercase tracking-wider text-muted-foreground print:border-black print:text-black">
            <th className="py-2">Item</th>
            <th className="py-2 hidden sm:table-cell">Categoria</th>
            {showCondition && <th className="w-24 py-2 hidden sm:table-cell">Estado</th>}
            <th className="w-20 py-2 text-right">Qtd</th>
            <th className="w-16 py-2 text-center">Un</th>
            <th className="w-24 py-2 text-right">Preço</th>
            <th className="w-28 py-2 text-right">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {cats.map((cat) => (
            <Fragment key={`cat-${cat}`}>
              <tr className="bg-muted/30 print:bg-black/5">
                <td colSpan={showCondition ? 7 : 6} className="px-1 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground print:text-black">
                  {cat}
                </td>
              </tr>
              {groups[cat].map((r) => {
                const sub = (r.price ?? 0) * r.quantity;
                return (
                  <tr key={r.id} className="border-b border-border/60 print:border-black/30">
                    <td className="py-1.5 pr-2 print:text-black">{r.name}</td>
                    <td className="py-1.5 pr-2 hidden sm:table-cell text-muted-foreground print:text-black/70">{r.category ?? "—"}</td>
                    {showCondition && <td className="py-1.5 pr-2 hidden sm:table-cell text-muted-foreground print:text-black/70">{r.condition ?? "—"}</td>}
                    <td className={`py-1.5 pr-2 text-right font-medium ${r.quantity === 0 ? "text-destructive print:text-black" : "print:text-black"}`}>{r.quantity}</td>
                    <td className="py-1.5 text-center text-xs text-muted-foreground print:text-black/70">{r.unit}</td>
                    <td className="py-1.5 pr-2 text-right print:text-black">{r.price != null ? `R$ ${Number(r.price).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</td>
                    <td className="py-1.5 text-right font-medium print:text-black">{r.price != null ? `R$ ${sub.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
          <tr className="border-t-2 border-border print:border-black">
            <td colSpan={showCondition ? 6 : 5} className="py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground print:text-black">
              Subtotal
            </td>
            <td className="py-2 text-right font-bold print:text-black">
              R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
