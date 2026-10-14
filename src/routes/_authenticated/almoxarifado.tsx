import { createFileRoute } from "@tanstack/react-router";
import { InventoryPage } from "@/components/inventory-page";

export const Route = createFileRoute("/_authenticated/almoxarifado")({
  head: () => ({
    meta: [
      { title: "Materiais — BS TOOLS" },
      { name: "description", content: "Inventário e movimentações dos materiais de consumo." },
      { property: "og:title", content: "Materiais — BS TOOLS" },
      { property: "og:description", content: "Inventário e movimentações dos materiais de consumo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <InventoryPage
      config={{
        kind: "material",
        title: "Materiais",
        subtitle: "Materiais de consumo: tinta, cimento, areia e mais.",
        unitLabel: "Total",
        categoryPlaceholder: "Ex.: Pintura, Construção",
        itemPlaceholder: "material",
        newItemLabel: "Novo material",
        showCondition: false,
        excludeConditions: ["Descarte"],
      }}
    />
  ),
});
