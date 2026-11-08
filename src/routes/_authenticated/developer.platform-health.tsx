import { AppTopbar } from "@/components/app/app-topbar";
import { requireOrgRole } from "@/lib/rbac";
import { DeveloperOrgSwitcher } from "@/components/app/developer/developer-org-switcher";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getPlatformHealth } from "@/lib/api/platform-health.functions";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Zap,
  Webhook,
  KeyRound,
  ShieldCheck,
  Boxes,
  Timer,
} from "lucide-react";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/developer/platform-health")({
  beforeLoad: requireOrgRole("owner", "admin"),
  staticData: { breadcrumb: "Platform Health" },
  head: () => ({
    meta: [
      { title: "Platform Health" },
      {
        name: "description",
        content:
          "Enterprise integration platform readiness — API, OAuth, webhooks, keys, and integrations.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PlatformHealthPage,
  errorComponent: ({ error }) => (
    <div className="p-6" role="alert">
      <h1 className="font-display text-xl font-semibold">Platform Health</h1>
      <p className="text-sm text-destructive mt-2">{String((error as Error).message)}</p>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Not found.</div>,
});

function pct(n: number) {
  return `${(n * 100).toFixed(2)}%`;
}

function StatusPill({ status }: { status: "operational" | "degraded" | "down" }) {
  const map = {
    operational: {
      icon: CheckCircle2,
      cls: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
      label: "Operational",
    },
    degraded: {
      icon: AlertTriangle,
      cls: "bg-amber-500/10 text-amber-600 border-amber-500/20",
      label: "Degraded",
    },
    down: { icon: XCircle, cls: "bg-red-500/10 text-red-600 border-red-500/20", label: "Down" },
  }[status];
  const Icon = map.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control text-xs border ${map.cls}`}
    >
      <Icon className="w-3.5 h-3.5" /> {map.label}
    </span>
  );
}

function PlatformHealthPage() {
  const formatZoned = useZonedDateFormatter();
  const fn = useServerFn(getPlatformHealth);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["platform-health"],
    queryFn: () => fn(),
    refetchInterval: 30_000,
  });

  if (isLoading || !data) {
    return <div className="p-6 text-sm text-muted-foreground">Loading platform health</div>;
  }

  return (
    <>
      <AppTopbar
        title="Platform Health"
        subtitle="API, OAuth, webhooks, keys, and integrations readiness."
        actions={
          <div className="flex items-center gap-3">
            <DeveloperOrgSwitcher />
            <StatusPill status={data.status} />
            <button
              onClick={() => refetch()}
              className="text-xs px-3 py-1.5 rounded-control border border-border hover:bg-surface transition"
              disabled={isFetching}
            >
              {isFetching ? "Refreshing" : "Refresh"}
            </button>
          </div>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi
            icon={Zap}
            label="API success"
            value={pct(data.api.success_rate)}
            sub={`${data.api.total.toLocaleString()} requests`}
          />
          <Kpi
            icon={Timer}
            label="Avg latency"
            value={`${data.api.avg_latency_ms} ms`}
            sub={`${data.api.rate_limit_hits} rate-limited`}
          />
          <Kpi
            icon={Webhook}
            label="Webhook delivery"
            value={pct(data.webhooks.delivery_rate)}
            sub={`${data.webhooks.deliveries.toLocaleString()} attempts`}
          />
          <Kpi
            icon={ShieldCheck}
            label="Active OAuth tokens"
            value={data.oauth.active_tokens.toLocaleString()}
            sub={`${data.oauth.clients} clients`}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="w-4 h-4" /> API Gateway
              </CardTitle>
              <CardDescription>
                Versioned REST API traffic across all keys and OAuth tokens.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Success rate</span>
                  <span className="font-mono">{pct(data.api.success_rate)}</span>
                </div>
                <Progress value={data.api.success_rate * 100} />
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <Stat label="2xx / 3xx" value={data.api.success} tone="ok" />
                <Stat label="4xx" value={data.api.errors_4xx} tone="warn" />
                <Stat label="5xx" value={data.api.errors_5xx} tone="err" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Webhook className="w-4 h-4" /> Webhooks
              </CardTitle>
              <CardDescription>
                Outbound delivery reliability with HMAC signing and exponential backoff.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Delivery rate</span>
                  <span className="font-mono">{pct(data.webhooks.delivery_rate)}</span>
                </div>
                <Progress value={data.webhooks.delivery_rate * 100} />
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <Stat label="Delivered" value={data.webhooks.delivered} tone="ok" />
                <Stat label="Failed" value={data.webhooks.failed} tone="err" />
                <Stat label="Pending" value={data.webhooks.pending} tone="warn" />
              </div>
              <div className="text-xs text-muted-foreground">
                {data.webhooks.active_endpoints}/{data.webhooks.endpoints} endpoints active
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="w-4 h-4" /> API Keys
              </CardTitle>
              <CardDescription>SHA-256 hashed, scoped, rotatable.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <Stat label="Total" value={data.keys.total} />
                <Stat label="Active" value={data.keys.active} tone="ok" />
                <Stat label="Expiring ≤14d" value={data.keys.expiring_soon} tone="warn" />
                <Stat label="Revoked" value={data.keys.revoked} />
              </div>
              {data.keys.expiring_soon > 0 && (
                <div className="mt-3 text-xs text-amber-600 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Rotate keys expiring in the next 14
                  days.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Boxes className="w-4 h-4" /> Integrations
              </CardTitle>
              <CardDescription>
                Modular providers registered through the abstraction layer.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 text-center">
                <Stat label="Installed" value={data.integrations.installed} tone="ok" />
                <Stat label="Available" value={data.integrations.available} />
                <Stat label="OAuth codes 24h" value={data.oauth.codes_last_24h} />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Production readiness checklist</CardTitle>
            <CardDescription>
              Automated checks; each item reflects the live state above.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="text-sm space-y-2">
              <Check ok={data.api.success_rate >= 0.99}>API success rate ≥ 99%</Check>
              <Check ok={data.api.avg_latency_ms < 500}>Average API latency &lt; 500 ms</Check>
              <Check ok={data.webhooks.delivery_rate >= 0.98 || data.webhooks.deliveries === 0}>
                Webhook delivery rate ≥ 98%
              </Check>
              <Check ok={data.keys.expiring_soon === 0}>No API keys expiring in ≤14 days</Check>
              <Check ok={data.webhooks.pending < 100}>
                Webhook queue drained (&lt; 100 pending)
              </Check>
              <Check ok={data.api.errors_5xx === 0}>No 5xx errors in the last 24h</Check>
            </ul>
            <div className="mt-4 text-xs text-muted-foreground">
              Checked at{" "}
              {formatZoned(new Date(data.checked_at), { dateStyle: "short", timeStyle: "medium" })}
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="w-3.5 h-3.5" /> {label}
        </div>
        <div className="font-display text-2xl font-semibold mt-1">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn" | "err";
}) {
  const cls =
    tone === "ok"
      ? "text-emerald-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "err"
          ? "text-red-600"
          : "";
  return (
    <div className="rounded-control border border-border p-2.5">
      <div className={`font-mono text-lg font-semibold ${cls}`}>{value.toLocaleString()}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
      ) : (
        <AlertTriangle className="w-4 h-4 text-amber-600" />
      )}
      <span className={ok ? "" : "text-amber-700"}>{children}</span>
      {!ok && (
        <Badge variant="outline" className="ml-auto text-xs">
          Action needed
        </Badge>
      )}
    </li>
  );
}
