import { AppTopbar } from "@/components/app/app-topbar";
import { requireOrgRole } from "@/lib/rbac";
import { DeveloperOrgSwitcher } from "@/components/app/developer/developer-org-switcher";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  getApiAnalytics,
  listApiLogs,
  exportApiLogsCsv,
  type ApiAnalyticsFilters,
} from "@/lib/api/analytics.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  Zap,
  Download,
  RefreshCw,
  Webhook,
  KeyRound,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/developer/api-analytics")({
  beforeLoad: requireOrgRole("owner", "admin"),
  staticData: { breadcrumb: "API Analytics" },
  component: ApiAnalyticsPage,
});

const STATUS_COLORS: Record<string, string> = {
  "2xx": "hsl(142 71% 45%)",
  "3xx": "hsl(217 91% 60%)",
  "4xx": "hsl(38 92% 50%)",
  "5xx": "hsl(0 84% 60%)",
  unknown: "hsl(var(--muted-foreground))",
};

function ApiAnalyticsPage() {
  const formatZoned = useZonedDateFormatter();
  const [filters, setFilters] = useState<ApiAnalyticsFilters>({ days: 7 });
  const [live, setLive] = useState(true);
  const analytics = useServerFn(getApiAnalytics);
  const logs = useServerFn(listApiLogs);
  const exportCsv = useServerFn(exportApiLogsCsv);
  const queryClient = useQueryClient();

  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);

  const { data: stats, isFetching } = useQuery({
    queryKey: ["api-analytics", filterKey],
    queryFn: () => analytics({ data: filters }),
    refetchInterval: live ? 15000 : false,
  });
  const { data: recent } = useQuery({
    queryKey: ["api-logs", filterKey],
    queryFn: () => logs({ data: { ...filters, limit: 200 } }),
    refetchInterval: live ? 15000 : false,
  });

  // Realtime: invalidate on new log inserts
  useEffect(() => {
    if (!live) return;
    const channel = supabase
      .channel("api-analytics-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "api_gateway_logs" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["api-analytics"] });
          queryClient.invalidateQueries({ queryKey: ["api-logs"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [live, queryClient]);

  async function handleExport() {
    const csv = await exportCsv({ data: filters });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `api-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const t = stats?.totals;
  const successRate = t?.success_rate ?? 0;

  return (
    <>
      <AppTopbar
        title="API Analytics"
        subtitle="Usage, latency, error rates, and top consumers."
        actions={
          <div className="flex items-center gap-2">
            <DeveloperOrgSwitcher />
            <Button
              variant={live ? "default" : "outline"}
              size="sm"
              onClick={() => setLive((v) => !v)}
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              {live ? "Live" : "Paused"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        }
      />
      <div className="container mx-auto px-4 md:px-6 py-8 space-y-6">
        <FilterBar filters={filters} onChange={setFilters} apiKeys={stats?.apiKeyUsage ?? []} />

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Activity className="h-4 w-4" />}
            label="Requests"
            value={t?.requests ?? 0}
          />
          <StatCard
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Success rate"
            value={`${successRate}%`}
            tone="success"
          />
          <StatCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Failure rate"
            value={`${t?.failure_rate ?? 0}%`}
            tone={t && t.failure_rate > 5 ? "destructive" : undefined}
          />
          <StatCard
            icon={<Gauge className="h-4 w-4" />}
            label="Avg latency"
            value={`${t?.avg_latency_ms ?? 0}ms`}
          />
          <StatCard
            icon={<Zap className="h-4 w-4" />}
            label="p50"
            value={`${t?.p50_latency_ms ?? 0}ms`}
          />
          <StatCard
            icon={<Zap className="h-4 w-4" />}
            label="p95"
            value={`${t?.p95_latency_ms ?? 0}ms`}
          />
          <StatCard
            icon={<Zap className="h-4 w-4" />}
            label="p99"
            value={`${t?.p99_latency_ms ?? 0}ms`}
          />
          <StatCard
            icon={<ShieldAlert className="h-4 w-4" />}
            label="Rate limit hits"
            value={stats?.rateLimit.hits ?? 0}
            tone={stats && stats.rateLimit.hits > 0 ? "destructive" : undefined}
          />
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="flex-wrap">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
            <TabsTrigger value="latency">Latency</TabsTrigger>
            <TabsTrigger value="errors">Errors</TabsTrigger>
            <TabsTrigger value="keys">API Keys & OAuth</TabsTrigger>
            <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
            <TabsTrigger value="usage">Usage</TabsTrigger>
            <TabsTrigger value="logs">Live Log</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Requests per day">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats?.byDay ?? []}>
                    <defs>
                      <linearGradient id="reqGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="day" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="hsl(var(--primary))"
                      fill="url(#reqGrad)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Status distribution">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats?.byStatus ?? []}
                      dataKey="count"
                      nameKey="bucket"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {(stats?.byStatus ?? []).map((s) => (
                        <Cell
                          key={s.bucket}
                          fill={STATUS_COLORS[s.bucket] ?? "hsl(var(--muted))"}
                        />
                      ))}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            <ChartCard title="Requests — last 24 hours">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats?.byHour ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="hour" fontSize={11} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </TabsContent>

          <TabsContent value="endpoints">
            <Card>
              <CardHeader>
                <CardTitle>Top endpoints</CardTitle>
              </CardHeader>
              <CardContent>
                {(stats?.topPaths?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No API traffic yet. Send a request with your API key to see it here.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {(stats?.topPaths ?? []).map((p) => {
                      const max = stats?.topPaths[0]?.count ?? 1;
                      const pct = Math.max(4, Math.round((p.count / max) * 100));
                      return (
                        <div key={p.path} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <code className="font-mono truncate max-w-[70%]">{p.path}</code>
                            <Badge variant="secondary">{p.count}</Badge>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="latency">
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Average latency per day">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats?.byDay ?? []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="day" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="avg_latency"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Response time distribution">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats?.latencyBuckets ?? []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" fontSize={11} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          </TabsContent>

          <TabsContent value="errors">
            <ChartCard title="Error trends (4xx vs 5xx)">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats?.errorTrends ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Bar
                    dataKey="4xx"
                    stackId="e"
                    fill={STATUS_COLORS["4xx"]}
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="5xx"
                    stackId="e"
                    fill={STATUS_COLORS["5xx"]}
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </TabsContent>

          <TabsContent value="keys" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard
                icon={<KeyRound className="h-4 w-4" />}
                label="API keys in use"
                value={stats?.apiKeyUsage.length ?? 0}
              />
              <StatCard
                icon={<KeyRound className="h-4 w-4" />}
                label="OAuth tokens active"
                value={stats?.oauth.active_tokens ?? 0}
              />
              <StatCard
                icon={<TrendingUp className="h-4 w-4" />}
                label="OAuth used (24h)"
                value={stats?.oauth.recently_used ?? 0}
              />
            </div>
            <Card>
              <CardHeader>
                <CardTitle>API key usage</CardTitle>
              </CardHeader>
              <CardContent>
                {(stats?.apiKeyUsage.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">No key activity in this range.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-muted-foreground">
                      <tr className="text-left">
                        <th className="py-2 pr-4">Name</th>
                        <th className="pr-4">Prefix</th>
                        <th className="pr-4">Requests</th>
                        <th>Last used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(stats?.apiKeyUsage ?? []).map((k) => (
                        <tr key={k.id} className="border-t">
                          <td className="py-2 pr-4">{k.name}</td>
                          <td className="pr-4 font-mono text-xs">{k.prefix}</td>
                          <td className="pr-4">
                            <Badge variant="secondary">{k.count}</Badge>
                          </td>
                          <td className="text-muted-foreground text-xs">
                            {k.last_used_at
                              ? formatZoned(new Date(k.last_used_at), {
                                  dateStyle: "short",
                                  timeStyle: "medium",
                                })
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="webhooks">
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
              <StatCard
                icon={<Webhook className="h-4 w-4" />}
                label="Total"
                value={stats?.webhookStats.total ?? 0}
              />
              <StatCard
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="Succeeded"
                value={stats?.webhookStats.succeeded ?? 0}
                tone="success"
              />
              <StatCard
                icon={<AlertTriangle className="h-4 w-4" />}
                label="Failed"
                value={stats?.webhookStats.failed ?? 0}
                tone="destructive"
              />
              <StatCard
                icon={<AlertTriangle className="h-4 w-4" />}
                label="Dead-letter"
                value={stats?.webhookStats.dead_letter ?? 0}
                tone="destructive"
              />
              <StatCard
                icon={<Activity className="h-4 w-4" />}
                label="Pending"
                value={stats?.webhookStats.pending ?? 0}
              />
              <StatCard
                icon={<Gauge className="h-4 w-4" />}
                label="Avg duration"
                value={`${stats?.webhookStats.avg_duration_ms ?? 0}ms`}
              />
            </div>
          </TabsContent>

          <TabsContent value="usage" className="space-y-4">
            <ChartCard title="Daily usage">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats?.byDay ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="day" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="success" stackId="u" fill={STATUS_COLORS["2xx"]} />
                  <Bar
                    dataKey="failure"
                    stackId="u"
                    fill={STATUS_COLORS["5xx"]}
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Monthly usage">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats?.monthly ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </TabsContent>

          <TabsContent value="logs">
            <Card>
              <CardHeader>
                <CardTitle>Recent requests</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground">
                    <tr className="text-left">
                      <th className="py-2 pr-4">Time</th>
                      <th className="pr-4">Method</th>
                      <th className="pr-4">Path</th>
                      <th className="pr-4">Status</th>
                      <th className="pr-4">Latency</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(recent ?? []).map((r) => (
                      <tr key={r.id} className="border-t hover:bg-muted/40 transition-colors">
                        <td className="py-2 pr-4 whitespace-nowrap">
                          {r.created_at
                            ? formatZoned(new Date(r.created_at), {
                                dateStyle: "short",
                                timeStyle: "medium",
                              })
                            : "—"}
                        </td>
                        <td className="pr-4 font-mono">{r.method}</td>
                        <td className="pr-4 font-mono truncate max-w-xs">{r.path}</td>
                        <td className="pr-4">
                          <Badge
                            variant={(r.status_code ?? 0) >= 400 ? "destructive" : "secondary"}
                          >
                            {r.status_code ?? "-"}
                          </Badge>
                        </td>
                        <td className="pr-4">{r.latency_ms ?? "-"}ms</td>
                        <td className="text-destructive text-xs truncate max-w-[16rem]">
                          {r.error ?? ""}
                        </td>
                      </tr>
                    ))}
                    {(recent?.length ?? 0) === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-muted-foreground">
                          No requests matching filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function FilterBar({
  filters,
  onChange,
  apiKeys,
}: {
  filters: ApiAnalyticsFilters;
  onChange: (f: ApiAnalyticsFilters) => void;
  apiKeys: Array<{ id: string; name: string; prefix: string }>;
}) {
  return (
    <Card>
      <CardContent className="pt-6 grid gap-3 md:grid-cols-5">
        <div className="space-y-1">
          <Label className="text-xs">Range</Label>
          <Select
            value={String(filters.days)}
            onValueChange={(v) => onChange({ ...filters, days: Number(v) })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 24 hours</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Method</Label>
          <Select
            value={filters.method ?? "all"}
            onValueChange={(v) => onChange({ ...filters, method: v === "all" ? undefined : v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select
            value={filters.statusBucket ?? "all"}
            onValueChange={(v) =>
              onChange({ ...filters, statusBucket: v === "all" ? undefined : v })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="2xx">2xx Success</SelectItem>
              <SelectItem value="3xx">3xx Redirect</SelectItem>
              <SelectItem value="4xx">4xx Client error</SelectItem>
              <SelectItem value="5xx">5xx Server error</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">API key</Label>
          <Select
            value={filters.apiKeyId ?? "all"}
            onValueChange={(v) => onChange({ ...filters, apiKeyId: v === "all" ? undefined : v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All keys</SelectItem>
              {apiKeys.map((k) => (
                <SelectItem key={k.id} value={k.id}>
                  {k.name} ({k.prefix})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Path contains</Label>
          <Input
            placeholder="/v1/contacts"
            value={filters.pathContains ?? ""}
            onChange={(e) => onChange({ ...filters, pathContains: e.target.value || undefined })}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-72">{children}</CardContent>
    </Card>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone?: "destructive" | "success";
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          {icon}
          {label}
        </div>
        <div
          className={`mt-2 text-3xl font-semibold ${
            tone === "destructive"
              ? "text-destructive"
              : tone === "success"
                ? "text-emerald-500"
                : ""
          }`}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
