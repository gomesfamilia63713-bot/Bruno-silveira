import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Acesso Administrativo — BS TOOLS" },
      { name: "description", content: "Entrada no painel administrativo BS TOOLS." },
      { property: "og:title", content: "Acesso Administrativo — BS TOOLS" },
      { property: "og:description", content: "Entrada no painel administrativo BS TOOLS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/login" });
  },
});
