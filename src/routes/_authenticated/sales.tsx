import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useSalesOverview } from "@/hooks/use-sales";
import {
  TrendingUp,
  Handshake,
  FileText,
  Receipt,
  Wallet,
  Target,
  Package,
  GaugeCircle,
} from "lucide-react";
import { useTenantCurrency } from "@/hooks/use-currency";

export const Route = createFileRoute("/_authenticated/sales")({
  component: SalesOverviewPage,
  staticData: { breadcrumb: "Sales" },
  head: () => ({
    meta: [
      { title: "Sales" },
      {
        name: "description",
        content: "Pipelines, quotes, invoices, payments, and revenue forecasting.",
      },
    ],
  }),
});

const MODULES = [
  {
    key: "pipelines",
    label: "Pipelines",
    icon: GaugeCircle,
    desc: "Visualize and manage deal flow",
  },
  { key: "deals", label: "Deals", icon: Handshake, desc: "Track opportunities end-to-end" },
  { key: "products", label: "Products & Services", icon: Package, desc: "Catalog powering quotes" },
  { key: "quotes", label: "Quotes", icon: FileText, desc: "Draft, send, and track proposals" },
  { key: "invoices", label: "Invoices", icon: Receipt, desc: "Bill customers and follow up" },
  { key: "payments", label: "Payments", icon: Wallet, desc: "Record and reconcile payments" },
  { key: "goals", label: "Sales Goals", icon: Target, desc: "Quotas and team targets" },
  { key: "forecasts", label: "Forecasting", icon: TrendingUp, desc: "AI-assisted revenue outlook" },
] as const;

function SalesOverviewPage() {
  const tenantCurrency = useTenantCurrency();
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id ?? null;
  const { data: kpis, isLoading } = useSalesOverview(workspaceId);

  const formatter = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: kpis?.currency || tenantCurrency,
        maximumFractionDigits: 0,
      }),
    [kpis?.currency],
  );

  return (
    <>
      <AppTopbar title="Sales" subtitle="Pipelines · Quotes · Invoices · Forecasts" />
      <main className="mx-auto max-w-7xl w-full space-y-8 p-6">
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            title="Open pipeline"
            value={isLoading ? null : formatter.format(kpis?.open_deals_value ?? 0)}
            icon={Handshake}
          />
          <Kpi
            title="Won this month"
            value={isLoading ? null : formatter.format(kpis?.won_this_month ?? 0)}
            icon={TrendingUp}
            tone="success"
          />
          <Kpi
            title="Outstanding invoices"
            value={isLoading ? null : formatter.format(kpis?.outstanding_invoices ?? 0)}
            icon={Receipt}
          />
          <Kpi
            title="Overdue"
            value={isLoading ? null : formatter.format(kpis?.overdue_invoices ?? 0)}
            icon={Wallet}
            tone="danger"
          />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Modules
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {MODULES.map((m) => (
              <Card
                key={m.key}
                className="group cursor-default border-border/60 transition hover:border-primary/40 hover:shadow-sm"
              >
                <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                  <div className="grid h-9 w-9 place-items-center rounded-control bg-primary/10 text-primary">
                    <m.icon className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-sm font-medium">{m.label}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-xs text-muted-foreground">{m.desc}</CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

function Kpi({
  title,
  value,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string | null;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "success" | "danger";
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        <Icon
          className={`h-4 w-4 ${tone === "success" ? "text-emerald-500" : tone === "danger" ? "text-red-500" : "text-muted-foreground"}`}
        />
      </CardHeader>
      <CardContent>
        {value === null ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <div className="text-2xl font-semibold ">{value}</div>
        )}
      </CardContent>
    </Card>
  );
}
