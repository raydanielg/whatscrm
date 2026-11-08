import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Building2, Users, MessagesSquare, DollarSign, TrendingUp, TrendingDown, Activity, AlertTriangle } from "lucide-react";
import { getPlatformOverview } from "@/lib/admin/analytics.functions";
import { getMonitoringSnapshot, type MonitoringSnapshot } from "@/lib/admin/monitoring.functions";
import { useCurrencyFormatter } from "@/hooks/use-currency";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/")({
  staticData: { breadcrumb: "Overview" },
  head: () => ({ meta: [{ title: "Super Admin — Dashboard" }, { name: "robots", content: "noindex" }] }),
  component: AdminOverviewPage,
});

type Kpi = {
  icon: typeof Building2;
  label: string;
  value: string;
  /** Percent change vs the previous period; omitted when there is nothing to compare. */
  delta?: number | null;
  sub?: string;
};

type Signal = { label: string; value: string; status: "healthy" | "warning" | "critical" | "unknown" };

const nf = new Intl.NumberFormat("en-US");
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

/**
 * "3 / 3", "2 / 3 (1 unchecked)". A provider that has never been probed is
 * *unknown*, not unhealthy — counting it as a failure would show an amber dot
 * on every fresh install.
 */
function healthSummary(list: MonitoringSnapshot["aiProviders"]): { total: number; label: string; status: Signal["status"] } {
  const healthy = list.filter((p) => p.status === "healthy").length;
  const unknown = list.filter((p) => p.status === "unknown").length;
  const down = list.some((p) => p.status === "down");
  const degraded = list.some((p) => p.status === "degraded");
  return {
    total: list.length,
    label: `${healthy} / ${list.length}${unknown ? ` (${unknown} unchecked)` : ""}`,
    status: down ? "critical" : degraded ? "warning" : healthy === list.length ? "healthy" : "unknown",
  };
}

function signalsFrom(snap: MonitoringSnapshot): Signal[] {
  const q = snap.queues;
  const pending = q.workflow.pending + q.campaigns.pending + q.outbox.pending + q.webhooks.pending;
  const failed = q.workflow.failed + q.campaigns.failed + q.outbox.failed + q.webhooks.failed;
  const hasTraffic = snap.api.requestsLast5m > 0;
  const wa = snap.whatsappProviders;
  const ai = healthSummary(snap.aiProviders);
  const waSummary = healthSummary(wa);

  return [
    {
      label: "API latency (p95, last 5m)",
      value: snap.api.p95ResponseMs != null ? `${snap.api.p95ResponseMs}ms` : "No traffic",
      status: snap.api.p95ResponseMs == null ? "unknown" : snap.api.p95ResponseMs > 1500 ? "warning" : "healthy",
    },
    {
      label: "API success rate (last 5m)",
      value: hasTraffic ? `${(100 - snap.api.errorRatePct).toFixed(1)}%` : "No traffic",
      status: !hasTraffic ? "unknown" : snap.api.errorRatePct > 5 ? "critical" : snap.api.errorRatePct > 1 ? "warning" : "healthy",
    },
    {
      label: "Queue backlog",
      value: `${nf.format(pending)} job${pending === 1 ? "" : "s"}`,
      status: pending > 1000 ? "warning" : "healthy",
    },
    {
      label: "Failed jobs",
      value: nf.format(failed),
      status: failed > 0 ? "warning" : "healthy",
    },
    {
      label: "AI providers healthy",
      value: ai.total ? ai.label : "None configured",
      status: ai.status,
    },
    {
      label: "WhatsApp accounts connected",
      value: wa.length ? waSummary.label : "None connected",
      status: waSummary.status,
    },
  ];
}

const DOT: Record<Signal["status"], string> = {
  healthy: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
  unknown: "bg-muted-foreground/40",
};

const INCIDENT_BORDER: Record<MonitoringSnapshot["incidents"][number]["severity"], string> = {
  down: "border-red-500",
  degraded: "border-amber-500",
  unknown: "border-muted",
  healthy: "border-emerald-500",
};

function AdminOverviewPage() {
  const overviewFn = useServerFn(getPlatformOverview);
  const monitoringFn = useServerFn(getMonitoringSnapshot);
  const money = useCurrencyFormatter({ locale: "en-US", maximumFractionDigits: 0 });

  const overview = useQuery({ queryKey: ["platform_overview"], queryFn: () => overviewFn(), refetchInterval: 60_000 });
  const monitoring = useQuery({ queryKey: ["admin-overview-monitoring"], queryFn: () => monitoringFn(), refetchInterval: 30_000 });

  const t = overview.data?.totals;
  const d = overview.data?.deltas;
  const loading = overview.isLoading;

  const kpis: Kpi[] = [
    {
      icon: Building2,
      label: "Organizations",
      value: t ? nf.format(t.organizations) : "—",
      delta: d?.organizationsPct,
      sub: t ? `${nf.format(t.newSignups30d)} new user${t.newSignups30d === 1 ? "" : "s"} in 30d` : undefined,
    },
    {
      icon: Users,
      label: "Active users (30d)",
      value: t ? nf.format(t.activeUsers30d) : "—",
      delta: d?.usersPct,
      sub: t ? `of ${nf.format(t.users)} total` : undefined,
    },
    {
      icon: MessagesSquare,
      label: "Messages (30d)",
      value: t ? compact.format(t.whatsappMessages30d) : "—",
      delta: d?.messagesPct,
    },
    {
      icon: DollarSign,
      label: "MRR",
      value: t ? money(t.mrrCents / 100) : "—",
      delta: d?.mrrPct,
      sub: t ? `${nf.format(t.activeSubscriptions)} active subscription${t.activeSubscriptions === 1 ? "" : "s"}` : undefined,
    },
  ];

  const signals = monitoring.data ? signalsFrom(monitoring.data) : null;
  const incidents = monitoring.data?.incidents ?? [];

  return (
    <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
      <div>
        <h2 className="font-display text-2xl font-semibold">Platform Overview</h2>
        <p className="text-sm text-muted-foreground">Live metrics across every tenant, integration, and system service.</p>
      </div>

      {overview.isError && (
        <div role="alert" className="rounded-control border border-destructive/40 bg-destructive/5 p-4 text-sm">
          Couldn&apos;t load platform metrics: {overview.error instanceof Error ? overview.error.message : "unknown error"}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((s) => {
          const hasDelta = typeof s.delta === "number" && Number.isFinite(s.delta);
          const up = (s.delta ?? 0) >= 0;
          return (
            <div key={s.label} className="rounded-control border border-border bg-surface p-5">
              <div className="flex items-start justify-between">
                <div className="w-9 h-9 bg-accent/10 text-accent grid place-items-center">
                  <s.icon className="w-4 h-4" />
                </div>
                {hasDelta && (
                  <span className={`inline-flex items-center gap-1 text-xs font-medium ${up ? "text-emerald-600" : "text-red-600"}`}>
                    {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {up ? "+" : ""}{s.delta}%
                  </span>
                )}
              </div>
              <div className="mt-4 text-2xl font-display font-semibold">{loading ? "" : s.value}</div>
              <div className="text-xs text-muted-foreground">{s.label}</div>
              {s.sub && !loading && <div className="text-[11px] text-muted-foreground mt-0.5">{s.sub}</div>}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-control border border-border bg-surface p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-accent" />
            <h3 className="font-display font-semibold">System signals</h3>
            <Link to="/admin/monitoring" className="ml-auto text-xs text-muted-foreground hover:text-foreground">Open monitoring →</Link>
          </div>
          {monitoring.isError ? (
            <p className="text-sm text-muted-foreground">Couldn&apos;t read system signals right now.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {(signals ?? Array.from({ length: 6 }, (): Signal => ({ label: "", value: "", status: "unknown" }))).map((s, i) => (
                <div key={`${s.label}-${i}`} className="flex items-center justify-between rounded-control border border-border/60 px-3 py-2.5">
                  <div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                    <div className="text-sm font-medium mt-0.5">{s.value}</div>
                  </div>
                  <span className={`w-2 h-2 rounded-full ${DOT[s.status]}`} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-control border border-border bg-surface p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h3 className="font-display font-semibold">Needs attention</h3>
          </div>
          {monitoring.isLoading ? (
            <p className="text-sm text-muted-foreground">Checking</p>
          ) : incidents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No issues detected — queues are clear and providers are healthy.</p>
          ) : (
            <div className="space-y-3 text-sm">
              {incidents.slice(0, 6).map((i) => (
                <div key={i.id} className={`border-l-2 pl-3 ${INCIDENT_BORDER[i.severity]}`}>
                  <div className="font-medium">{i.source}</div>
                  <div className="text-xs text-muted-foreground">{i.message}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
