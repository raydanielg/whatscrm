import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2, Users, UserCheck, UserPlus, DollarSign, TrendingUp, HardDrive, Sparkles,
  MessageSquare, Megaphone, Workflow, Cable, TrendingDown, Download, RefreshCw, Loader2,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  getPlatformOverview, getGrowthTrends, getTopTenants, getChurnTrend, exportAnalyticsCsv,
  type TopTenant,
} from "@/lib/admin/analytics.functions";
import { toast } from "sonner";
import { useCurrencyFormatter, useTenantCurrency } from "@/hooks/use-currency";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/analytics")({
  head: () => ({ meta: [{ title: "Super Admin — Platform Analytics" }, { name: "robots", content: "noindex" }] }),
  component: AnalyticsPage,
});

const nf = new Intl.NumberFormat("en-US");
/**
 * AI provider spend really is billed in dollars — the field is `aiCostUsd` —
 * so it keeps a USD formatter. Platform revenue (MRR/ARR) follows the currency
 * set in Super Admin instead, which is what these two used to get wrong.
 */
const usdSmall = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function formatBytes(n: number) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${u[i]}`;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function AnalyticsPage() {
  const platformCurrency = useTenantCurrency();
  const cf = useCurrencyFormatter({ locale: "en-US", maximumFractionDigits: 0 });
  const cfSmall = useCurrencyFormatter({ locale: "en-US", maximumFractionDigits: 2 });
  const [range, setRange] = useState<30 | 60 | 90 | 180 | 365>(30);
  const [tenantMetric, setTenantMetric] = useState<"mrr" | "messages" | "ai" | "users">("mrr");

  const overviewFn = useServerFn(getPlatformOverview);
  const growthFn = useServerFn(getGrowthTrends);
  const tenantsFn = useServerFn(getTopTenants);
  const churnFn = useServerFn(getChurnTrend);
  const exportFn = useServerFn(exportAnalyticsCsv);

  const overview = useQuery({
    queryKey: ["platform_overview"],
    queryFn: () => overviewFn(),
    refetchInterval: 60_000,
  });
  const growth = useQuery({
    queryKey: ["platform_growth", range],
    queryFn: () => growthFn({ data: { days: range } }),
  });
  const tenants = useQuery({
    queryKey: ["platform_top_tenants", tenantMetric],
    queryFn: () => tenantsFn({ data: { metric: tenantMetric, limit: 10 } }),
  });
  const churn = useQuery({
    queryKey: ["platform_churn", range],
    queryFn: () => churnFn({ data: { days: Math.max(range, 30) } }),
  });

  const kpis = useMemo(() => {
    const t = overview.data?.totals;
    const d = overview.data?.deltas;
    if (!t || !d) return [];
    return [
      { label: "Organizations", value: nf.format(t.organizations), delta: d.organizationsPct ?? undefined, icon: Building2 },
      { label: "Users", value: nf.format(t.users), delta: d.usersPct ?? undefined, icon: Users },
      { label: "Active users (30d)", value: nf.format(t.activeUsers30d), icon: UserCheck },
      { label: "New signups (7d)", value: nf.format(t.newSignups7d), icon: UserPlus },
      { label: "MRR", value: cf(t.mrrCents / 100), delta: d.mrrPct ?? undefined, icon: DollarSign, accent: true },
      { label: "ARR", value: cf(t.arrCents / 100), icon: TrendingUp, accent: true },
      { label: "Storage", value: formatBytes(t.storageBytes), icon: HardDrive },
      { label: "AI cost (30d)", value: usdSmall.format(t.aiCostUsd), delta: d.aiCostPct ?? undefined, icon: Sparkles },
      { label: "WhatsApp msgs (30d)", value: nf.format(t.whatsappMessages30d), delta: d.messagesPct ?? undefined, icon: MessageSquare },
      { label: "Campaigns (30d)", value: nf.format(t.campaigns30d), icon: Megaphone },
      { label: "Workflow runs (30d)", value: nf.format(t.workflowExecutions30d), icon: Workflow },
      { label: "API requests (30d)", value: nf.format(t.apiRequests30d), icon: Cable },
    ];
  }, [overview.data]);

  const handleExport = async (dataset: "overview" | "growth" | "top_tenants" | "churn") => {
    try {
      const res = await exportFn({ data: { dataset, days: range } });
      downloadCsv(res.filename, res.csv);
      toast.success("Exported CSV");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  return (
    <AdminPageShell
      title="Platform Analytics"
      description="Business intelligence across every tenant, workspace, and integration. All series refresh in real time."
      actions={
        <div className="flex items-center gap-2">
          <Select value={String(range)} onValueChange={(v) => setRange(Number(v) as 30 | 60 | 90 | 180 | 365)}>
            <SelectTrigger className="h-9 w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="180">Last 6 months</SelectItem>
              <SelectItem value="365">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              overview.refetch();
              growth.refetch();
              tenants.refetch();
              churn.refetch();
            }}
            className="gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${overview.isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={() => handleExport("overview")} className="gap-1.5">
            <Download className="w-4 h-4" /> Export
          </Button>
        </div>
      }
    >
      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {overview.isLoading
          ? Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-24 rounded-control border border-border bg-surface animate-pulse" />
            ))
          : kpis.map((k) => (
              <div
                key={k.label}
                className={`rounded-control border p-4 bg-surface transition-colors ${
                  k.accent ? "border-accent/30 bg-accent/5" : "border-border"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{k.label}</span>
                  <k.icon className={`w-4 h-4 ${k.accent ? "text-accent" : "text-muted-foreground"}`} />
                </div>
                <div className="mt-2 text-2xl font-display font-semibold">{k.value}</div>
                {k.delta !== undefined && (
                  <div
                    className={`text-[11px] mt-1 flex items-center gap-1 ${
                      k.delta >= 0 ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {k.delta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {k.delta >= 0 ? "+" : ""}
                    {k.delta.toFixed(1)}% vs prior
                  </div>
                )}
              </div>
            ))}
      </div>

      <Tabs defaultValue="growth" className="mt-6 space-y-4">
        <TabsList>
          <TabsTrigger value="growth">Growth trends</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="tenants">Top tenants</TabsTrigger>
          <TabsTrigger value="churn">Churn</TabsTrigger>
        </TabsList>

        <TabsContent value="growth">
          <ChartCard
            title="Organizations & Users"
            onExport={() => handleExport("growth")}
            loading={growth.isLoading}
          >
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={growth.data ?? []}>
                <defs>
                  <linearGradient id="gOrgs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="organizations" stroke="hsl(var(--accent))" fill="url(#gOrgs)" name="New orgs" />
                <Area type="monotone" dataKey="users" stroke="hsl(var(--primary))" fill="url(#gUsers)" name="New users" />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </TabsContent>

        <TabsContent value="revenue">
          <ChartCard
            title="Monthly Recurring Revenue"
            onExport={() => handleExport("growth")}
            loading={growth.isLoading}
          >
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={(growth.data ?? []).map((p) => ({ ...p, mrr: p.mrrCents / 100 }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="hsl(var(--muted-foreground))"
                  tickFormatter={(v) => cf(v as number)}
                />
                <Tooltip
                  formatter={(v) => cfSmall(v as number)}
                  contentStyle={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                />
                <Line type="monotone" dataKey="mrr" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} name={`MRR (${platformCurrency})`} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </TabsContent>

        <TabsContent value="usage">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="WhatsApp messages" loading={growth.isLoading} onExport={() => handleExport("growth")}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={growth.data ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                  <Bar dataKey="messages" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Workflow executions" loading={growth.isLoading} onExport={() => handleExport("growth")}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={growth.data ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                  <Bar dataKey="workflowRuns" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <ChartCard title="AI spend (USD)" loading={growth.isLoading} onExport={() => handleExport("growth")} className="lg:col-span-2">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={growth.data ?? []}>
                  <defs>
                    <linearGradient id="gAi" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => usdSmall.format(v as number)} />
                  <Tooltip formatter={(v) => usdSmall.format(v as number)} contentStyle={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                  <Area type="monotone" dataKey="aiCostUsd" stroke="hsl(var(--accent))" fill="url(#gAi)" name="AI cost" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </TabsContent>

        <TabsContent value="tenants">
          <div className="rounded-control border border-border bg-surface">
            <div className="p-3 border-b border-border flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Rank by</span>
                {(["mrr", "messages", "ai", "users"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setTenantMetric(m)}
                    className={`px-2 py-1 rounded-control border capitalize transition-colors ${
                      tenantMetric === m ? "border-accent bg-accent/10 text-accent" : "border-border hover:bg-muted"
                    }`}
                  >
                    {m === "ai" ? "AI spend" : m === "mrr" ? "MRR" : m}
                  </button>
                ))}
              </div>
              <Button size="sm" variant="outline" onClick={() => handleExport("top_tenants")} className="gap-1.5">
                <Download className="w-4 h-4" /> Export CSV
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="px-4 py-2 font-medium">#</th>
                    <th className="px-4 py-2 font-medium">Tenant</th>
                    <th className="px-4 py-2 font-medium">Plan</th>
                    <th className="px-4 py-2 font-medium text-right">MRR</th>
                    <th className="px-4 py-2 font-medium text-right">Users</th>
                    <th className="px-4 py-2 font-medium text-right">Msgs (30d)</th>
                    <th className="px-4 py-2 font-medium text-right">AI spend</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.isLoading ? (
                    <tr><td colSpan={7} className="p-6 text-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline" />Loading</td></tr>
                  ) : (tenants.data ?? []).length === 0 ? (
                    <tr><td colSpan={7} className="p-10 text-center text-muted-foreground">No tenants yet.</td></tr>
                  ) : (
                    (tenants.data as TopTenant[]).map((t, i) => (
                      <tr key={t.organizationId} className="border-b border-border last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{t.name}</div>
                          {t.slug && <div className="text-[11px] text-muted-foreground">{t.slug}</div>}
                        </td>
                        <td className="px-4 py-3">
                          {t.plan ? (
                            <Badge variant="outline" className="text-[11px]">{t.plan}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                          {t.status && (
                            <Badge className="ml-1 text-[11px] capitalize" variant={t.status === "active" ? "default" : "secondary"}>
                              {t.status}
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs">{cf(t.mrrCents / 100)}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs">{nf.format(t.users)}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs">{nf.format(t.messages30d)}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs">{usdSmall.format(t.aiCostUsd)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="churn">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1 rounded-control border border-border bg-surface p-5">
              <div className="text-xs text-muted-foreground">Current churn rate</div>
              <div className="mt-2 text-4xl font-display font-semibold">
                {overview.data?.totals.churnRatePct?.toFixed(2) ?? "0.00"}%
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                Active: {nf.format(overview.data?.totals.activeSubscriptions ?? 0)} · Trialing:{" "}
                {nf.format(overview.data?.totals.trialingSubscriptions ?? 0)}
              </div>
            </div>
            <ChartCard
              title="Churn & net movement"
              onExport={() => handleExport("churn")}
              loading={churn.isLoading}
              className="lg:col-span-2"
            >
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={churn.data ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis yAxisId="left" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v}%`} />
                  <Tooltip contentStyle={{ background: "hsl(var(--surface))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line yAxisId="left" type="monotone" dataKey="new" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} name="New" />
                  <Line yAxisId="left" type="monotone" dataKey="churned" stroke="#dc2626" strokeWidth={2} dot={false} name="Churned" />
                  <Line yAxisId="right" type="monotone" dataKey="churnRatePct" stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" strokeWidth={1.5} dot={false} name="Churn %" />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </TabsContent>
      </Tabs>
    </AdminPageShell>
  );
}

function ChartCard({
  title,
  children,
  onExport,
  loading,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  onExport?: () => void;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={`rounded-control border border-border bg-surface p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="font-display font-semibold text-sm">{title}</div>
        {onExport && (
          <Button size="sm" variant="ghost" onClick={onExport} className="h-7 gap-1 text-xs">
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
        )}
      </div>
      {loading ? (
        <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading
        </div>
      ) : (
        children
      )}
    </div>
  );
}
