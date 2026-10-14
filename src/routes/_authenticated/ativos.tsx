import { createFileRoute } from "@tanstack/react-router";
import { AssetManagementPage } from "@/components/asset-management-page";

export const Route = createFileRoute("/_authenticated/ativos")({
  head: () => ({
    meta: [
      { title: "Gestão de Ativos — BS TOOLS" },
      { name: "description", content: "Fotos, responsáveis e movimentações dos ativos." },
      { property: "og:title", content: "Gestão de Ativos — BS TOOLS" },
      { property: "og:description", content: "Fotos, responsáveis e movimentações dos ativos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssetManagementPage,
});
