import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Activity, Database, Radio, Workflow, Webhook, Server, Sparkles, MessageSquare,
  HardDrive, Cpu, AlertTriangle, XCircle, CheckCircle2, Bell, ScrollText,
  Waypoints, LineChart, RefreshCcw, Table2,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { requirePlatformRole } from "@/lib/rbac";

import {
  getMonitoringSnapshot,
  type HealthCheck,
  type HealthStatus,
} from "@/lib/monitoring/monitoring-center.functions";

export const Route = createFileRoute("/_authenticated/monitoring-center")({
  // Platform-wide numbers: staff only. The server function re-checks the role.
  beforeLoad: requirePlatformRole("superadmin", "support"),
  head: () => ({
    meta: [
      { title: "Monitoring Center" },
      { name: "description", content: "Platform health: database, queues, webhooks, API, AI, message delivery, storage and workers — measured, not simulated." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MonitoringCenter,
});

const DOMAIN_ICON: Record<HealthCheck["id"], typeof Activity> = {
  application: Activity,
  database: Database,
  realtime: Radio,
  queue: Workflow,
  webhook: Webhook,
  api: Server,
  "ai-provider": Sparkles,
  "whatsapp-provider": MessageSquare,
  storage: HardDrive,
  worker: Cpu,
};

function statusColor(s: HealthStatus) {
  if (s === "healthy") return "text-emerald-500";
  if (s === "degraded") return "text-amber-500";
  if (s === "down") return "text-red-500";
  return "text-muted-foreground";
}
function statusDot(s: HealthStatus) {
  if (s === "healthy") return "bg-emerald-500";
  if (s === "degraded") return "bg-amber-500";
  if (s === "down") return "bg-red-500";
  return "bg-muted-foreground";
}

const ms = (v: number | null) => (v == null ? "—" : `${v.toLocaleString()}ms`);
const pct = (v: number | null, digits = 2) => (v == null ? "—" : `${(v * 100).toFixed(digits)}%`);

function uptime(seconds: number | null): string {
  if (seconds == null) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function MonitoringCenter() {
  const fetchSnap = useServerFn(getMonitoringSnapshot);
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["monitoring-snapshot"],
    queryFn: () => fetchSnap(),
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: false,
  });

  const [logFilter, setLogFilter] = useState("");
  const filteredLogs = useMemo(() => {
    if (!data) return [];
    const q = logFilter.trim().toLowerCase();
    return q
      ? data.logs.filter((l) => l.message.toLowerCase().includes(q) || l.service.toLowerCase().includes(q))
      : data.logs;
  }, [data, logFilter]);

  const firing = data ? data.alerts.filter((a) => a.firing) : [];

  return (
    <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6" /> Monitoring Center
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Platform health across every tenant — measured from live tables and probes. A dash means there is nothing to measure yet.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCcw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </header>

      {isError ? (
        <Card>
          <CardContent role="alert" className="p-6 text-sm">
            <div className="font-medium flex items-center gap-2"><XCircle className="h-4 w-4 text-red-500" /> Couldn&apos;t load the monitoring snapshot</div>
            <p className="text-muted-foreground mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
          </CardContent>
        </Card>
      ) : isLoading || !data ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">Loading monitoring snapshot</CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Overall status</CardDescription>
                <CardTitle className={`text-2xl capitalize flex items-center gap-2 ${statusColor(data.overallStatus)}`}>
                  <span className={`inline-block h-3 w-3 rounded-full ${statusDot(data.overallStatus)}`} />
                  {data.overallStatus}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Progress value={data.healthScore ?? 0} className="h-2" />
                <p className="text-xs text-muted-foreground mt-2">
                  {data.healthScore == null ? "No check has a signal yet" : `Health score ${data.healthScore}/100`}
                  {data.unmeasured > 0 && ` · ${data.unmeasured} of ${data.checks.length} checks unmeasured`}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>API requests / min (5m)</CardDescription>
                <CardTitle className="text-3xl">{data.metrics.requestsPerMin.toLocaleString()}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                p50 {ms(data.metrics.p50Ms)} · p95 {ms(data.metrics.p95Ms)} · p99 {ms(data.metrics.p99Ms)}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>API 5xx rate (5m)</CardDescription>
                <CardTitle className="text-3xl">{pct(data.metrics.errorRate)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Active users (15m) {data.metrics.activeUsers.toLocaleString()}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Alerts firing now</CardDescription>
                <CardTitle className={`text-3xl ${firing.length > 0 ? "text-red-500" : ""}`}>{firing.length}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                of {data.alerts.length} rules · evaluated on each refresh
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="health">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="health">Health Checks</TabsTrigger>
              <TabsTrigger value="errors">Errors{data.errors.length > 0 ? ` (${data.errors.length})` : ""}</TabsTrigger>
              <TabsTrigger value="traces">Recent activity</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
              <TabsTrigger value="metrics">Metrics</TabsTrigger>
              <TabsTrigger value="alerts">Alerts{firing.length > 0 ? ` (${firing.length})` : ""}</TabsTrigger>
              <TabsTrigger value="sources">Data sources</TabsTrigger>
            </TabsList>

            <TabsContent value="health" className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.checks.map((c) => {
                const Icon = DOMAIN_ICON[c.id];
                return (
                  <Card key={c.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Icon className="h-4 w-4" /> {c.label}
                        </CardTitle>
                        <span className={`inline-flex items-center gap-1.5 text-xs capitalize ${statusColor(c.status)}`}>
                          <span className={`h-2 w-2 rounded-full ${statusDot(c.status)}`} />
                          {c.status}
                        </span>
                      </div>
                      <CardDescription>{c.detail}</CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-4 gap-2 text-xs">
                      <div><div className="text-muted-foreground">Latency</div><div className="font-medium">{ms(c.latencyMs)}</div></div>
                      <div><div className="text-muted-foreground">Failures</div><div className="font-medium">{pct(c.errorRate)}</div></div>
                      {c.metrics.slice(0, 2).map((m) => (
                        <div key={m.label}><div className="text-muted-foreground truncate" title={m.label}>{m.label}</div><div className="font-medium">{m.value}</div></div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}
            </TabsContent>

            <TabsContent value="errors" className="mt-4 space-y-3">
              {data.errors.length === 0 && (
                <Card>
                  <CardContent className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    No errors or warnings recorded in the last 24 hours.
                  </CardContent>
                </Card>
              )}
              {data.errors.map((e) => (
                <Card key={e.id}>
                  <CardContent className="p-4 flex items-start gap-3">
                    {e.level === "warning" ? (
                      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="font-medium text-sm break-words">{e.message}</span>
                        <Badge variant="outline" className="text-[11px]">{e.service}</Badge>
                        <Badge variant="secondary" className="text-[11px]">×{e.count}</Badge>
                      </div>
                      {e.detail && <p className="text-xs text-muted-foreground mt-1 font-mono break-words">{e.detail}</p>}
                      <p className="text-xs text-muted-foreground mt-1">
                        Last seen {formatDistanceToNow(new Date(e.lastSeen), { addSuffix: true })}
                        {e.count > 1 && <> · first seen {formatDistanceToNow(new Date(e.firstSeen), { addSuffix: true })}</>}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="traces" className="mt-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2"><Waypoints className="h-4 w-4" /> Recent activity</CardTitle>
                  <CardDescription>
                    The latest API requests, AI calls, workflow runs and outbound messages, with their measured duration.
                    This app has no distributed tracing, so each row is one unit of work.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.traces.length === 0 && (
                    <p className="text-sm text-muted-foreground py-6 text-center">Nothing has run in the last 24 hours.</p>
                  )}
                  {data.traces.map((t) => (
                    <div key={t.traceId} className="flex items-center justify-between p-2 border rounded-control text-sm gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.status === "ok" ? "bg-emerald-500" : "bg-red-500"}`} />
                        <span className="font-mono text-xs text-muted-foreground shrink-0">{t.traceId}</span>
                        <span className="font-medium truncate">{t.name}</span>
                        <Badge variant="outline" className="text-[11px] shrink-0">{t.service}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0 flex gap-3">
                        {t.spans > 1 && <span>{t.spans} steps</span>}
                        <span>{formatDistanceToNow(new Date(t.startedAt), { addSuffix: true })}</span>
                        <span className="font-medium">{t.durationMs.toLocaleString()}ms</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="logs" className="mt-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2"><ScrollText className="h-4 w-4" /> Log viewer</CardTitle>
                  <CardDescription>Provider logs, AI calls, inbound webhooks and API requests from the last 24 hours, newest first.</CardDescription>
                  <div className="pt-2">
                    <Input placeholder="Filter by message or service" value={logFilter} onChange={(e) => setLogFilter(e.target.value)} />
                  </div>
                </CardHeader>
                <CardContent className="font-mono text-xs space-y-1 max-h-[420px] overflow-auto">
                  {filteredLogs.map((l, i) => (
                    <div key={`${l.ts}-${i}`} className="flex gap-2">
                      <span className="text-muted-foreground shrink-0">{new Date(l.ts).toLocaleTimeString()}</span>
                      <Badge
                        variant="outline"
                        className={`text-[11px] ${l.level === "error" ? "border-red-500 text-red-500" : l.level === "warn" ? "border-amber-500 text-amber-500" : ""}`}
                      >{l.level}</Badge>
                      <span className="text-muted-foreground shrink-0">{l.service}</span>
                      <span className="truncate" title={l.message}>{l.message}</span>
                    </div>
                  ))}
                  {filteredLogs.length === 0 && (
                    <div className="text-muted-foreground">
                      {data.logs.length === 0 ? "No log lines in the last 24 hours." : "No logs match filter."}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="metrics" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><LineChart className="h-4 w-4" /> Metrics</CardTitle>
                  <CardDescription>API figures are for the last 5 minutes.</CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Metric label="Req/min" value={data.metrics.requestsPerMin.toLocaleString()} />
                  <Metric label="p50" value={ms(data.metrics.p50Ms)} />
                  <Metric label="p95" value={ms(data.metrics.p95Ms)} />
                  <Metric label="p99" value={ms(data.metrics.p99Ms)} />
                  <Metric label="5xx rate" value={pct(data.metrics.errorRate)} />
                  <Metric label="Active users (15m)" value={data.metrics.activeUsers.toLocaleString()} />
                  <Metric label="Health score" value={data.healthScore == null ? "—" : `${data.healthScore}/100`} />
                  <Metric label="Server process uptime" value={uptime(data.metrics.processUptimeSeconds)} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="alerts" className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                These rules are evaluated against live measurements each time the page refreshes. No notification is sent from here —
                connect alert delivery separately if you need paging.
              </p>
              {data.alerts.map((a) => (
                <Card key={a.id} className={a.firing ? "border-red-500/50" : undefined}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <Bell className={`h-4 w-4 shrink-0 ${a.firing ? (a.severity === "critical" ? "text-red-500" : "text-amber-500") : "text-muted-foreground"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{a.name}</span>
                        <Badge variant="outline" className="text-[11px]">{a.domain}</Badge>
                        <Badge variant="secondary" className="text-[11px] capitalize">{a.severity}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{a.condition}</p>
                    </div>
                    <div className="text-xs text-right shrink-0">
                      <div className="text-muted-foreground">{a.current}</div>
                      {a.firing ? (
                        <span className="text-red-500 inline-flex items-center gap-1 font-medium"><AlertTriangle className="h-3 w-3" /> Firing</span>
                      ) : (
                        <span className="text-emerald-500 inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Clear</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            <TabsContent value="sources" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2"><Table2 className="h-4 w-4" /> Data sources</CardTitle>
                  <CardDescription>
                    What this page reads. A source with no recent rows explains an &quot;unknown&quot; check above — there is nothing to measure.
                    External providers (Sentry, Datadog, OpenTelemetry) are not integrated.
                  </CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground text-left border-b border-border">
                      <tr><th className="py-2">Source</th><th>Rows (24h)</th><th>Last event</th></tr>
                    </thead>
                    <tbody>
                      {data.sources.map((s) => (
                        <tr key={s.id} className="border-b border-border/60">
                          <td className="py-2">
                            <div className="font-medium">{s.label}</div>
                            <div className="text-xs text-muted-foreground font-mono">{s.id}</div>
                          </td>
                          <td>{s.rows24h.toLocaleString()}</td>
                          <td className="text-muted-foreground">
                            {s.lastAt ? formatDistanceToNow(new Date(s.lastAt), { addSuffix: true }) : "Never"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <p className="text-xs text-muted-foreground text-right">
            Generated {new Date(data.generatedAt).toLocaleString()}
          </p>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-control border">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}
