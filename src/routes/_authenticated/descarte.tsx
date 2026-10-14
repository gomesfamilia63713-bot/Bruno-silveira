import { createFileRoute } from "@tanstack/react-router";
import { InventoryPage } from "@/components/inventory-page";

export const Route = createFileRoute("/_authenticated/descarte")({
  head: () => ({
    meta: [
      { title: "Descarte — BS TOOLS" },
      { name: "description", content: "Itens descartados e seu histórico preservado." },
      { property: "og:title", content: "Descarte — BS TOOLS" },
      { property: "og:description", content: "Itens descartados e seu histórico preservado." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <InventoryPage
      config={{
        kind: "material",
        kinds: ["material", "tool"],
        title: "Descarte",
        subtitle: "Ferramentas e materiais marcados para descarte — registro, preço e histórico preservados.",
        unitLabel: "Total",
        categoryPlaceholder: "Ex.: Pintura, Construção",
        itemPlaceholder: "item",
        newItemLabel: "Novo item",
        showCondition: true,
        includeConditions: ["Descarte"],
      }}
    />
  ),
});
