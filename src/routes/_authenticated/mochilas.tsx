import { createFileRoute } from "@tanstack/react-router";
import { MochilasPanel } from "@/components/mochilas-panel";

export const Route = createFileRoute("/_authenticated/mochilas")({
  head: () => ({
    meta: [
      { title: "Mochilas — BS TOOLS" },
      { name: "description", content: "Gerencie os itens sob responsabilidade de cada funcionário." },
      { property: "og:title", content: "Mochilas — BS TOOLS" },
      { property: "og:description", content: "Gerencie os itens sob responsabilidade de cada funcionário." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MochilasRoute,
});

function MochilasRoute() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Mochilas</h1>
        <p className="text-sm text-muted-foreground">
          Kits por funcionário — alocação manual item a item (debita do estoque ativo).
        </p>
      </div>
      <MochilasPanel />
    </div>
  );
}
