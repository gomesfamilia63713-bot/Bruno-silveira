import { createFileRoute } from "@tanstack/react-router";
import { InventoryPage } from "@/components/inventory-page";
import { EpiPage } from "@/components/epi-page";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/estoque")({
  head: () => ({
    meta: [
      { title: "Ferramentas — BS TOOLS" },
      { name: "description", content: "Inventário de ferramentas com códigos, fotos e alocações." },
      { property: "og:title", content: "Ferramentas — BS TOOLS" },
      { property: "og:description", content: "Inventário de ferramentas com códigos, fotos e alocações." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <Tabs defaultValue="tools" className="space-y-4">
      <TabsList><TabsTrigger value="tools">Ferramentas</TabsTrigger><TabsTrigger value="epi">EPI</TabsTrigger></TabsList>
      <TabsContent value="tools"><InventoryPage
      config={{
        kind: "tool",
        title: "Ferramentas",
        subtitle: "Suas ferramentas em um só lugar.",
        unitLabel: "Unidades",
        categoryPlaceholder: "Ex.: Elétrica",
        itemPlaceholder: "ferramenta",
        newItemLabel: "Nova ferramenta",
        showCondition: true,
        excludeConditions: ["Manutenção", "Descarte"],
      }}
    /></TabsContent>
      <TabsContent value="epi"><EpiPage /></TabsContent>
    </Tabs>
  ),
});
