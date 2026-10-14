import { createFileRoute } from "@tanstack/react-router";
import { InventoryPage } from "@/components/inventory-page";
import { MaintenanceAlerts } from "@/components/maintenance-alerts";

export const Route = createFileRoute("/_authenticated/manutencao")({
  head: () => ({
    meta: [
      { title: "Manutenção — BS TOOLS" },
      { name: "description", content: "Equipamentos em manutenção, justificativas e lembretes." },
      { property: "og:title", content: "Manutenção — BS TOOLS" },
      { property: "og:description", content: "Equipamentos em manutenção, justificativas e lembretes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <>
    <MaintenanceAlerts />
    <InventoryPage
      config={{
        kind: "tool",
        title: "Manutenção",
        subtitle: "Ferramentas em manutenção — histórico, obra e responsável preservados.",
        unitLabel: "Unidades",
        categoryPlaceholder: "Ex.: Elétrica",
        itemPlaceholder: "ferramenta",
        newItemLabel: "Nova ferramenta",
        showCondition: true,
        includeConditions: ["Manutenção"],
      }}
    />
    </>
  ),
});
