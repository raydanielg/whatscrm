import { useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  Webhook,
  Gauge,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Zap,
  Server,
  Radio,
  ShieldAlert,
  FileText,
  KeyRound,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Signal,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import {
  useMonitoringOverview,
  useOutboxJobs,
  useWebhookEvents,
  useProviderLogs,
  useApiKeyUsage,
  useRetryOutbox,
  useRetryWebhook,
} from "@/hooks/use-monitoring";

export type TabId = "overview" | "api" | "webhooks" | "queues" | "logs" | "health" | "alerts";

const TABS: { id: TabId; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "api", label: "API", icon: KeyRound },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
  { id: "queues", label: "Queues & Retry", icon: RefreshCw },
  { id: "logs", label: "Error Logs", icon: FileText },
  { id: "health", label: "Health Checks", icon: Server },
  { id: "alerts", label: "Alerts", icon: AlertTriangle },
];

export function MonitoringTabs({ tab, onChange }: { tab: TabId; onChange: (tab: TabId) => void }) {
  return (
    <div className="border-b border-border">
      <ScrollArea orientation="horizontal" type="hover" className="w-full">
        <div className="flex w-max items-center gap-1 px-6">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onChange(t.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors rounded-none",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

export function MonitoringDashboard({ tab }: { tab: TabId }) {
  const { data: ws } = useCurrentWorkspace();
  const workspaceId = ws?.id;
  const overview = useMonitoringOverview(workspaceId);

  return (
    <div className="flex flex-col gap-6">
      {tab === "overview" && <OverviewTab data={overview.data} loading={overview.isLoading} />}
      {tab === "api" && <ApiTab workspaceId={workspaceId} />}
      {tab === "webhooks" && <WebhooksTab workspaceId={workspaceId} />}
      {tab === "queues" && <QueuesTab workspaceId={workspaceId} />}
      {tab === "logs" && <LogsTab workspaceId={workspaceId} />}
      {tab === "health" && <HealthTab data={overview.data} loading={overview.isLoading} />}
      {tab === "alerts" && <AlertsTab data={overview.data} loading={overview.isLoading} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function OverviewTab({ data, loading }: { data: any; loading: boolean }) {
  if (loading || !data) return <SkeletonGrid />;
  const o = data.outbox;
  const w = data.webhooks;
  const series = (data.timeSeries ?? []).map((b: any) => ({
    hour: new Date(b.hour).toLocaleTimeString([], { hour: "2-digit" }),
    sent: b.sent,
    failed: b.failed,
    wh: b.wh,
    whFail: b.whFail,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          icon={Zap}
          label="Success rate"
          value={`${o.successRate}%`}
          trend={o.successRate >= 95 ? "up" : "down"}
          tone={o.successRate >= 95 ? "success" : "warning"}
        />
        <Kpi
          icon={XCircle}
          label="Failure rate"
          value={`${o.failureRate}%`}
          trend={o.failureRate < 5 ? "up" : "down"}
          tone={o.failureRate < 5 ? "success" : "danger"}
        />
        <Kpi
          icon={Clock}
          label="Avg latency"
          value={`${o.avgLatencyMs}ms`}
          sub={`p95 ${o.p95}ms`}
        />
        <Kpi
          icon={Radio}
          label="Messages (24h)"
          value={data.messages.total.toLocaleString()}
          sub={`${data.messages.inbound} in · ${data.messages.outbound} out`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ChartCard
          title="Message throughput"
          subtitle="Sent vs failed · last 24 hours"
          className="lg:col-span-2"
        >
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={series}>
              <defs>
                <linearGradient id="grad-sent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="grad-fail" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="sent"
                stroke="hsl(var(--primary))"
                fill="url(#grad-sent)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="failed"
                stroke="hsl(var(--destructive))"
                fill="url(#grad-fail)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Webhook health" subtitle="Received vs failed">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
              <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="wh" name="Received" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
              <Bar
                dataKey="whFail"
                name="Failed"
                fill="hsl(var(--destructive))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniStat
          icon={Server}
          label="Queue length"
          value={o.pending + o.retrying}
          accent="warning"
        />
        <MiniStat icon={RefreshCw} label="Retry queue" value={o.retrying} accent="primary" />
        <MiniStat icon={ShieldAlert} label="Dead letter" value={w.deadLetter} accent="danger" />
        <MiniStat
          icon={Signal}
          label="Connected accounts"
          value={`${(data.accounts ?? []).filter((a: any) => a.healthy).length}/${(data.accounts ?? []).length}`}
          accent="success"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

function ApiTab({ workspaceId }: { workspaceId: string | undefined }) {
  const keys = useApiKeyUsage(workspaceId);
  const overview = useMonitoringOverview(workspaceId);
  const o = overview.data?.outbox;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={Zap} label="API calls (24h)" value={String(o?.total ?? 0)} />
        <Kpi
          icon={CheckCircle2}
          label="Success rate"
          value={`${o?.successRate ?? 100}%`}
          tone="success"
        />
        <Kpi icon={Gauge} label="Rate limit" value="—" sub="Meta enforced per-number" />
        <Kpi icon={Clock} label="p95 latency" value={`${o?.p95 ?? 0}ms`} />
      </div>

      <Panel title="API keys" subtitle="Personal access tokens for the workspace organization">
        {keys.isLoading ? (
          <RowSkeleton />
        ) : (
          <div className="divide-y divide-border">
            {(keys.data?.rows ?? []).length === 0 && (
              <EmptyState icon={KeyRound} label="No API keys yet" />
            )}
            {(keys.data?.rows ?? []).map((k: any) => {
              const revoked = !!k.revoked_at;
              const expired = k.expires_at && new Date(k.expires_at) < new Date();
              return (
                <div key={k.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <div className="font-medium">{k.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{k.prefix}••••</div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      Last used{" "}
                      {k.last_used_at
                        ? formatDistanceToNow(new Date(k.last_used_at), { addSuffix: true })
                        : "never"}
                    </span>
                    <Badge tone={revoked ? "danger" : expired ? "warning" : "success"}>
                      {revoked ? "revoked" : expired ? "expired" : "active"}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

function WebhooksTab({ workspaceId }: { workspaceId: string | undefined }) {
  const [onlyFailures, setOnlyFailures] = useState(false);
  const events = useWebhookEvents(workspaceId, onlyFailures);
  const retry = useRetryWebhook(workspaceId);
  const overview = useMonitoringOverview(workspaceId);
  const w = overview.data?.webhooks;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={Webhook} label="Received (24h)" value={String(w?.total ?? 0)} />
        <Kpi
          icon={CheckCircle2}
          label="Processed"
          value={String(w?.processed ?? 0)}
          tone="success"
        />
        <Kpi
          icon={ShieldAlert}
          label="Invalid signature"
          value={String(w?.invalidSignature ?? 0)}
          tone={w?.invalidSignature ? "danger" : undefined}
        />
        <Kpi
          icon={XCircle}
          label="Dead letter"
          value={String(w?.deadLetter ?? 0)}
          tone={w?.deadLetter ? "danger" : undefined}
        />
      </div>

      <Panel
        title="Webhook events"
        subtitle="Live stream of provider callbacks"
        action={
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              id="only-failures"
              checked={onlyFailures}
              onCheckedChange={(v) => setOnlyFailures(v === true)}
            />
            <Label htmlFor="only-failures" className="font-normal text-xs text-muted-foreground">
              Failures only
            </Label>
          </div>
        }
      >
        {events.isLoading ? (
          <RowSkeleton />
        ) : (
          <div className="divide-y divide-border max-h-[520px] overflow-auto">
            {(events.data?.rows ?? []).length === 0 && (
              <EmptyState icon={Webhook} label="No webhook events" />
            )}
            {(events.data?.rows ?? []).map((e: any) => {
              const ok = e.processed && e.signature_valid && !e.dead_letter_at;
              const tone = e.dead_letter_at
                ? "danger"
                : !e.signature_valid
                  ? "warning"
                  : ok
                    ? "success"
                    : "muted";
              return (
                <div key={e.id} className="flex items-start justify-between py-3 gap-4 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge tone={tone as any}>{e.event_type ?? "event"}</Badge>
                      <span className="text-xs text-muted-foreground">{e.provider}</span>
                      {e.attempts > 1 && (
                        <span className="text-[11px] text-muted-foreground">× {e.attempts}</span>
                      )}
                    </div>
                    {e.last_error && (
                      <div className="text-xs text-destructive/80 mt-1 truncate">
                        {e.last_error_kind}: {e.last_error}
                      </div>
                    )}
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(e.received_at), { addSuffix: true })}
                      {e.external_event_id && (
                        <span className="ml-2 font-mono">
                          id: {String(e.external_event_id).slice(0, 12)}
                        </span>
                      )}
                    </div>
                  </div>
                  {(e.dead_letter_at || !e.processed) && (
                    <button
                      onClick={() => retry.mutate(e.id)}
                      disabled={retry.isPending}
                      className="text-xs px-2 py-1 rounded-control border border-border hover:bg-muted transition-colors flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" /> Retry
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Queues / Retry
// ---------------------------------------------------------------------------

function QueuesTab({ workspaceId }: { workspaceId: string | undefined }) {
  const [status, setStatus] = useState<string | undefined>(undefined);
  const jobs = useOutboxJobs(workspaceId, status);
  const retry = useRetryOutbox(workspaceId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {["all", "pending", "sending", "sent", "failed"].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s === "all" ? undefined : s)}
            className={cn(
              "text-xs px-3 py-1.5 rounded-control border transition-colors",
              (status ?? "all") === s
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      <Panel title="Outbox queue" subtitle="Outbound message pipeline">
        {jobs.isLoading ? (
          <RowSkeleton />
        ) : (
          <div className="divide-y divide-border max-h-[520px] overflow-auto">
            {(jobs.data?.rows ?? []).length === 0 && (
              <EmptyState icon={Server} label="Nothing queued" />
            )}
            {(jobs.data?.rows ?? []).map((j: any) => {
              const tone =
                j.status === "failed"
                  ? "danger"
                  : j.status === "sent"
                    ? "success"
                    : j.status === "pending"
                      ? "warning"
                      : "muted";
              return (
                <div key={j.id} className="flex items-start justify-between py-3 gap-4 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge tone={tone as any}>{j.status}</Badge>
                      <span className="font-mono text-xs">{j.to_address}</span>
                      <span className="text-[11px] text-muted-foreground">
                        attempt {j.attempts}/{j.max_attempts}
                      </span>
                    </div>
                    {j.last_error && (
                      <div className="text-xs text-destructive/80 mt-1 truncate">
                        {j.last_error_code}: {j.last_error}
                      </div>
                    )}
                    <div className="text-[11px] text-muted-foreground mt-1">
                      created {formatDistanceToNow(new Date(j.created_at), { addSuffix: true })}
                      {j.next_attempt_at && j.status !== "sent" && (
                        <span className="ml-2">
                          · next{" "}
                          {formatDistanceToNow(new Date(j.next_attempt_at), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </div>
                  {(j.status === "failed" || j.status === "pending") && (
                    <button
                      onClick={() => retry.mutate(j.id)}
                      disabled={retry.isPending}
                      className="text-xs px-2 py-1 rounded-control border border-border hover:bg-muted transition-colors flex items-center gap-1"
                    >
                      {retry.isPending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                      Retry now
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

function LogsTab({ workspaceId }: { workspaceId: string | undefined }) {
  const [level, setLevel] = useState<string | undefined>("error");
  const logs = useProviderLogs(workspaceId, level);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {["all", "error", "warn", "info", "debug"].map((l) => (
          <button
            key={l}
            onClick={() => setLevel(l === "all" ? undefined : l)}
            className={cn(
              "text-xs px-3 py-1.5 rounded-control border transition-colors",
              (level ?? "all") === l
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {l}
          </button>
        ))}
      </div>
      <Panel title="Provider logs" subtitle="Structured event stream from providers">
        {logs.isLoading ? (
          <RowSkeleton />
        ) : (
          <div className="max-h-[540px] overflow-auto font-mono text-xs">
            {(logs.data?.rows ?? []).length === 0 && (
              <EmptyState icon={FileText} label="No log entries" />
            )}
            {(logs.data?.rows ?? []).map((l: any) => {
              const tone =
                l.level === "error"
                  ? "text-destructive"
                  : l.level === "warn" || l.level === "warning"
                    ? "text-amber-500"
                    : l.level === "info"
                      ? "text-primary"
                      : "text-muted-foreground";
              return (
                <div
                  key={l.id}
                  className="grid grid-cols-[auto_auto_1fr] gap-3 py-1.5 border-b border-border/50"
                >
                  <span className="text-muted-foreground shrink-0">
                    {new Date(l.created_at).toLocaleTimeString()}
                  </span>
                  <span className={cn("uppercase font-semibold shrink-0 w-12", tone)}>
                    {l.level}
                  </span>
                  <div className="min-w-0">
                    <span className="text-muted-foreground">
                      [{l.provider}/{l.scope}]
                    </span>{" "}
                    <span className="text-foreground">{l.message}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

function HealthTab({ data, loading }: { data: any; loading: boolean }) {
  if (loading || !data) return <SkeletonGrid />;
  const accounts = data.accounts ?? [];
  const checks = [
    {
      name: "Message outbox",
      status: data.outbox.failureRate < 5 ? "healthy" : "degraded",
      detail: `${data.outbox.failureRate}% failure rate`,
    },
    {
      name: "Webhook receiver",
      status: data.webhooks.deadLetter === 0 ? "healthy" : "degraded",
      detail: `${data.webhooks.deadLetter} dead letters`,
    },
    {
      name: "Sync services",
      status: data.syncs.failed === 0 ? "healthy" : "degraded",
      detail: `${data.syncs.failed} failed jobs`,
    },
    {
      name: "Signature validation",
      status: data.webhooks.invalidSignature === 0 ? "healthy" : "critical",
      detail: `${data.webhooks.invalidSignature} invalid signatures`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {checks.map((c) => (
          <div key={c.name} className="rounded-control border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">{c.name}</div>
              <StatusPill status={c.status as any} />
            </div>
            <div className="text-xs text-muted-foreground mt-2">{c.detail}</div>
          </div>
        ))}
      </div>

      <Panel title="Connection status" subtitle="WhatsApp Business accounts">
        <div className="divide-y divide-border">
          {accounts.length === 0 && <EmptyState icon={Server} label="No channel accounts" />}
          {accounts.map((a: any) => (
            <div key={a.id} className="flex items-center justify-between py-3 text-sm">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "w-2 h-2 rounded-full",
                    a.healthy ? "bg-success" : "bg-destructive",
                  )}
                />
                <div>
                  <div className="font-medium">{a.display_name || a.phone_number}</div>
                  <div className="text-xs text-muted-foreground">
                    {a.provider} · {a.phone_number}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone={a.healthy ? "success" : "danger"}>{a.status}</Badge>
                <span className="text-[11px] text-muted-foreground">
                  {a.last_verified_at
                    ? `verified ${formatDistanceToNow(new Date(a.last_verified_at), { addSuffix: true })}`
                    : "not verified"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

function AlertsTab({ data, loading }: { data: any; loading: boolean }) {
  if (loading || !data) return <SkeletonGrid />;
  const alerts: { severity: "critical" | "warning" | "info"; title: string; detail: string }[] = [];
  if (data.outbox.failureRate >= 10)
    alerts.push({
      severity: "critical",
      title: "Elevated failure rate",
      detail: `${data.outbox.failureRate}% of outbound messages failed in the last 24h`,
    });
  else if (data.outbox.failureRate >= 5)
    alerts.push({
      severity: "warning",
      title: "Rising failures",
      detail: `${data.outbox.failureRate}% of outbound messages failed in the last 24h`,
    });
  if (data.webhooks.deadLetter > 0)
    alerts.push({
      severity: "critical",
      title: "Webhooks in dead letter",
      detail: `${data.webhooks.deadLetter} events exhausted retries`,
    });
  if (data.webhooks.invalidSignature > 0)
    alerts.push({
      severity: "critical",
      title: "Invalid webhook signatures",
      detail: `${data.webhooks.invalidSignature} events rejected — check app secret`,
    });
  if (data.outbox.p95 > 5000)
    alerts.push({
      severity: "warning",
      title: "High p95 latency",
      detail: `${data.outbox.p95}ms p95 send latency`,
    });
  const unhealthyAccounts = (data.accounts ?? []).filter((a: any) => !a.healthy);
  if (unhealthyAccounts.length)
    alerts.push({
      severity: "warning",
      title: `${unhealthyAccounts.length} account(s) unhealthy`,
      detail: unhealthyAccounts.map((a: any) => a.display_name || a.phone_number).join(", "),
    });
  if (data.providerLogs.errors > 20)
    alerts.push({
      severity: "warning",
      title: "Provider error spike",
      detail: `${data.providerLogs.errors} error logs in the last 24h`,
    });

  return (
    <Panel title="Active alerts" subtitle="Auto-generated from thresholds">
      {alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
          <CheckCircle2 className="w-8 h-8 text-success" />
          <div className="font-medium">All systems nominal</div>
          <div className="text-xs text-muted-foreground">
            No thresholds crossed in the last 24 hours.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className={cn(
                "flex items-start gap-3 p-4 rounded-control border",
                a.severity === "critical"
                  ? "border-destructive/40 bg-destructive/5"
                  : a.severity === "warning"
                    ? "border-amber-500/40 bg-amber-500/5"
                    : "border-border bg-surface",
              )}
            >
              <AlertTriangle
                className={cn(
                  "w-4 h-4 mt-0.5 shrink-0",
                  a.severity === "critical"
                    ? "text-destructive"
                    : a.severity === "warning"
                      ? "text-amber-500"
                      : "text-muted-foreground",
                )}
              />
              <div className="min-w-0">
                <div className="text-sm font-medium">{a.title}</div>
                <div className="text-xs text-muted-foreground">{a.detail}</div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone,
  trend,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  sub?: string;
  tone?: "success" | "warning" | "danger";
  trend?: "up" | "down";
}) {
  const toneCls =
    tone === "success"
      ? "text-success"
      : tone === "danger"
        ? "text-destructive"
        : tone === "warning"
          ? "text-amber-500"
          : "text-foreground";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-control border border-border bg-surface p-4 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground ">{label}</div>
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className={cn("mt-2 text-2xl font-display font-semibold", toneCls)}>{value}</div>
      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
        {trend === "up" && <ArrowUpRight className="w-3 h-3 text-success" />}
        {trend === "down" && <ArrowDownRight className="w-3 h-3 text-destructive" />}
        {sub}
      </div>
    </motion.div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  accent: "success" | "warning" | "danger" | "primary";
}) {
  const cls =
    accent === "success"
      ? "bg-success/10 text-success"
      : accent === "danger"
        ? "bg-destructive/10 text-destructive"
        : accent === "warning"
          ? "bg-amber-500/10 text-amber-500"
          : "bg-primary/10 text-primary";
  return (
    <div className="rounded-control border border-border bg-surface p-4 flex items-center gap-3">
      <div className={cn("w-9 h-9 grid place-items-center", cls)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold">{value}</div>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-control border border-border bg-surface p-4 shadow-sm", className)}>
      <div className="mb-3">
        <div className="text-sm font-semibold">{title}</div>
        {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
      </div>
      {children}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-control border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
        </div>
        {action}
      </div>
      <div className="px-4">{children}</div>
    </div>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: "success" | "danger" | "warning" | "muted";
  children: React.ReactNode;
}) {
  const cls =
    tone === "success"
      ? "bg-success/10 text-success"
      : tone === "danger"
        ? "bg-destructive/10 text-destructive"
        : tone === "warning"
          ? "bg-amber-500/10 text-amber-500"
          : "bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "text-[11px] px-2 py-0.5 rounded-control font-medium uppercase tracking-wide",
        cls,
      )}
    >
      {children}
    </span>
  );
}

function StatusPill({ status }: { status: "healthy" | "degraded" | "critical" }) {
  const map = {
    healthy: { cls: "bg-success/10 text-success", label: "Healthy" },
    degraded: { cls: "bg-amber-500/10 text-amber-500", label: "Degraded" },
    critical: { cls: "bg-destructive/10 text-destructive", label: "Critical" },
  } as const;
  const v = map[status];
  return (
    <span className={cn("text-[11px] px-2 py-0.5 rounded-control font-medium uppercase", v.cls)}>
      {v.label}
    </span>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="rounded-control border border-border bg-surface p-4 h-24 animate-pulse"
        />
      ))}
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="py-4 space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-10 rounded-control bg-muted/50 animate-pulse" />
      ))}
    </div>
  );
}

function EmptyState({ icon: Icon, label }: { icon: typeof Activity; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
      <Icon className="w-6 h-6" />
      <div className="text-sm">{label}</div>
    </div>
  );
}
