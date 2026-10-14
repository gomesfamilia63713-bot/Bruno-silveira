import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import { lazyWithRetry } from "@/lib/lazy-with-retry";

const DashboardView = lazyWithRetry(() => import("@/components/dashboard/dashboard-view"));

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Painel Administrativo — BS TOOLS" },
      { name: "description", content: "Visão geral de estoque, obras e produção." },
      { property: "og:title", content: "Painel Administrativo — BS TOOLS" },
      { property: "og:description", content: "Visão geral de estoque, obras e produção." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

function ChartSkeleton() {
  return (
    <div className="grid gap-4">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-80 w-full" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

function DashboardPage() {
  return (
    <ErrorBoundary label="Dashboard">
      <Suspense fallback={<ChartSkeleton />}>
        <DashboardView />
      </Suspense>
    </ErrorBoundary>
  );
}
