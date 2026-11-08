import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Sparkles, TrendingUp, TrendingDown, Minus, Activity, Zap, DollarSign,
  Clock, CheckCircle2, Timer, Cpu, Download, Loader2, AlertTriangle,
  ArrowUpRight, LineChart as LineIcon, PieChart as PieIcon,
} from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useAiAnalytics, type AiAnalyticsReport } from "@/hooks/use-ai-analytics";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const searchSchema = z.object({
  days: fallback(z.number().int(), 30).default(30),
  tab: fallback(z.string(), "overview").default("overview"),
});

const PALETTE = [
  "hsl(var(--accent))",
  "hsl(217 91% 60%)",
  "hsl(142 71% 45%)",
  "hsl(38 92% 50%)",
  "hsl(0 84% 60%)",
  "hsl(280 65% 60%)",
  "hsl(190 90% 45%)",
  "hsl(320 70% 55%)",
];

export const Route = createFileRoute("/_authenticated/ai-analytics")({
  staticData: { breadcrumb: "AI Analytics" },
  head: () => ({
    meta: [
      { title: "AI Analytics" },
      { name: "description", content: "Usage, cost, quality, and outcome analytics for your AI features." },
    ],
  }),
  validateSearch: zodValidator(searchSchema),
  component: AiAnalyticsPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">Analytics failed: {(error as Error).message}</div>
  ),
  notFoundComponent: () => <div className="p-8">Not found.</div>,
});

function AiAnalyticsPage() {
  const { days, tab } = Route.useSearch();
  const ws = useCurrentWorkspace();
  const workspaceId = ws.data?.id;
  const query = useAiAnalytics(workspaceId, days);
  const [exportOpen, setExportOpen] = useState(false);

  const setDays = (d: number) => {
    window.history.replaceState({}, "", `?days=${d}&tab=${tab}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  const setTab = (t: string) => {
    window.history.replaceState({}, "", `?days=${days}&tab=${t}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <>
      <AppTopbar
        title="AI Analytics"
        subtitle="Usage, cost, quality, and outcomes across every AI feature."
        actions={
          <div className="flex items-center gap-2">
            <RangePicker value={days} onChange={setDays} />
            <ExportMenu
              report={query.data}
              disabled={!query.data}
              open={exportOpen}
              onOpenChange={setExportOpen}
            />
          </div>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {query.isLoading && !query.data && (
          <div className="rounded-control border border-border bg-surface p-10 text-center text-sm text-muted-foreground">
            <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin" /> Aggregating AI analytics
          </div>
        )}
        {query.isError && (
          <div className="rounded-control border border-destructive/40 bg-destructive/5 p-4 flex items-start gap-2 text-sm">
            <AlertTriangle className="w-4 h-4 text-destructive mt-0.5" />
            <p>Failed to load analytics: {query.error instanceof Error ? query.error.message : "Unknown error"}</p>
          </div>
        )}
        {query.data && (
          <>
            <KpiRow r={query.data} />
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="usage">Usage &amp; Cost</TabsTrigger>
                <TabsTrigger value="performance">Performance</TabsTrigger>
                <TabsTrigger value="quality">Quality</TabsTrigger>
                <TabsTrigger value="outcomes">Outcomes</TabsTrigger>
                <TabsTrigger value="forecasts">Forecasts</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4 space-y-4">
                <OverviewTab r={query.data} />
              </TabsContent>
              <TabsContent value="usage" className="mt-4 space-y-4">
                <UsageTab r={query.data} />
              </TabsContent>
              <TabsContent value="performance" className="mt-4 space-y-4">
                <PerformanceTab r={query.data} />
              </TabsContent>
              <TabsContent value="quality" className="mt-4 space-y-4">
                <QualityTab r={query.data} />
              </TabsContent>
              <TabsContent value="outcomes" className="mt-4 space-y-4">
                <OutcomesTab r={query.data} />
              </TabsContent>
              <TabsContent value="forecasts" className="mt-4 space-y-4">
                <ForecastsTab r={query.data} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </>
  );
}

// ==================== Range picker & export ====================

function RangePicker({ value, onChange }: { value: number; onChange: (d: number) => void }) {
  const options = [7, 14, 30, 60, 90];
  return (
    <div className="inline-flex rounded-control border border-border bg-surface p-0.5">
      {options.map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={cn(
            "px-2.5 py-1 text-xs rounded-control transition-colors",
            value === d ? "bg-accent/15 text-foreground font-medium" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {d}d
        </button>
      ))}
    </div>
  );
}

function ExportMenu({
  report, disabled, open, onOpenChange,
}: {
  report: AiAnalyticsReport | undefined;
  disabled: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  function download(name: string, mime: string, content: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${name}`);
  }
  function toCsv(rows: ReadonlyArray<Record<string, unknown>>): string {
    if (!rows.length) return "";
    const cols = Object.keys(rows[0]);
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  }
  const asRows = <T,>(arr: readonly T[]): Record<string, unknown>[] =>
    arr as unknown as Record<string, unknown>[];
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} className="gap-1.5">
          <Download className="h-3.5 w-3.5" /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>CSV</DropdownMenuLabel>
        <DropdownMenuItem
          disabled={!report}
          onClick={() => report && download("ai-usage.csv", "text/csv", toCsv(asRows(report.usage)))}
        >
          Daily usage
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!report}
          onClick={() => report && download("ai-providers.csv", "text/csv", toCsv(asRows(report.providers)))}
        >
          Provider breakdown
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!report}
          onClick={() => report && download("ai-latency.csv", "text/csv", toCsv(asRows(report.latency)))}
        >
          Latency
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!report}
          onClick={() => report && download("ai-acceptance.csv", "text/csv", toCsv(asRows(report.acceptance)))}
        >
          Acceptance rate
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!report}
          onClick={() => report && download("ai-sentiment.csv", "text/csv", toCsv(asRows(report.sentiment)))}
        >
          Sentiment trends
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!report}
          onClick={() => report && download("ai-topics.csv", "text/csv", toCsv(asRows(report.topics)))}
        >
          Topic trends
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>JSON</DropdownMenuLabel>
        <DropdownMenuItem
          disabled={!report}
          onClick={() => report && download("ai-analytics.json", "application/json", JSON.stringify(report, null, 2))}
        >
          Full report
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ==================== KPI row ====================

function KpiRow({ r }: { r: AiAnalyticsReport }) {
  const k = r.kpis;
  return (
    <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-2">
      <Kpi icon={Zap} label="AI requests" value={k.totalRequests.toLocaleString()} delta={k.requestsDelta} deltaGoodDir="up" />
      <Kpi icon={Cpu} label="Tokens" value={fmtCompact(k.totalTokens)} sub={`${fmtCompact(k.totalTokens)} total`} />
      <Kpi icon={DollarSign} label="Cost (USD)" value={`$${k.totalCostUsd.toFixed(2)}`} delta={k.costDelta} deltaGoodDir="down" />
      <Kpi icon={Timer} label="Avg latency" value={`${k.avgLatencyMs} ms`} delta={k.latencyDelta} deltaGoodDir="down" />
      <Kpi icon={Clock} label="Saved time" value={fmtDuration(k.savedMinutes)} sub={`${k.savedMinutes.toLocaleString()} min`} />
      <Kpi icon={CheckCircle2} label="Acceptance" value={`${k.acceptanceRate}%`} sub={`${k.resolvedConversations} resolved`} delta={k.acceptanceDelta} deltaGoodDir="up" />
    </section>
  );
}

function Kpi({
  icon: Icon, label, value, sub, delta, deltaGoodDir,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  delta?: number;
  deltaGoodDir?: "up" | "down";
}) {
  const showDelta = typeof delta === "number" && delta !== 0;
  const good = showDelta && ((deltaGoodDir === "up" && delta! > 0) || (deltaGoodDir === "down" && delta! < 0));
  const bad = showDelta && ((deltaGoodDir === "up" && delta! < 0) || (deltaGoodDir === "down" && delta! > 0));
  const Arrow = !showDelta ? Minus : (delta! > 0 ? TrendingUp : TrendingDown);
  return (
    <div className="rounded-control border border-border bg-surface p-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" />{label}</span>
        {showDelta && (
          <span className={cn(
            "inline-flex items-center gap-0.5 text-[11px] font-medium",
            good && "text-emerald-500",
            bad && "text-destructive",
            !good && !bad && "text-muted-foreground",
          )}>
            <Arrow className="h-3 w-3" />
            {Math.abs(delta!)}%
          </span>
        )}
      </div>
      <p className="text-xl font-semibold mt-1 truncate">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

// ==================== Cards ====================

function Card({
  title, subtitle, icon: Icon, actions, className, children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-control border border-border bg-surface p-4", className)}>
      <header className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-medium flex items-center gap-2">
            {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
            {title}
          </h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

// ==================== Overview ====================

function OverviewTab({ r }: { r: AiAnalyticsReport }) {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="AI Usage" subtitle="Requests per day" icon={Activity} className="lg:col-span-2">
          <ChartWrap>
            <AreaChart data={r.usage} margin={{ top: 4, right: 6, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="reqGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PALETTE[0]} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={PALETTE[0]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDay} fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <Tooltip content={<TT format={(v) => Number(v).toLocaleString()} />} />
              <Area type="monotone" dataKey="requests" stroke={PALETTE[0]} strokeWidth={2} fill="url(#reqGradient)" />
              <Area type="monotone" dataKey="errors" stroke={PALETTE[4]} strokeWidth={1} fillOpacity={0} />
            </AreaChart>
          </ChartWrap>
        </Card>

        <Card title="Provider Usage" subtitle="Share of requests" icon={PieIcon}>
          <ChartWrap>
            <PieChart>
              <Pie
                data={r.providers}
                dataKey="requests"
                nameKey="providerKind"
                cx="50%" cy="50%"
                innerRadius={45}
                outerRadius={80}
                paddingAngle={2}
              >
                {r.providers.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip content={<TT />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ChartWrap>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Tokens Consumed" subtitle="Prompt vs completion" icon={Cpu}>
          <ChartWrap>
            <BarChart data={r.usage} margin={{ top: 4, right: 6, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDay} fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" tickFormatter={fmtCompact} />
              <Tooltip content={<TT format={fmtCompact} />} />
              <Bar dataKey="promptTokens" stackId="tok" fill={PALETTE[1]} radius={[0, 0, 0, 0]} />
              <Bar dataKey="completionTokens" stackId="tok" fill={PALETTE[2]} radius={[4, 4, 0, 0]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </BarChart>
          </ChartWrap>
        </Card>

        <Card title="Cost Analysis" subtitle="USD per day" icon={DollarSign}>
          <ChartWrap>
            <AreaChart data={r.usage} margin={{ top: 4, right: 6, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PALETTE[3]} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={PALETTE[3]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDay} fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${Number(v).toFixed(2)}`} />
              <Tooltip content={<TT format={(v) => `$${Number(v).toFixed(4)}`} />} />
              <Area type="monotone" dataKey="costUsd" stroke={PALETTE[3]} strokeWidth={2} fill="url(#costGradient)" />
            </AreaChart>
          </ChartWrap>
        </Card>

        <Card title="Avg Response Time" subtitle="p50 & p95 latency" icon={Timer}>
          <ChartWrap>
            <LineChart data={r.latency} margin={{ top: 4, right: 6, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDay} fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v}ms`} />
              <Tooltip content={<TT format={(v) => `${v} ms`} />} />
              <Line type="monotone" dataKey="avgLatencyMs" stroke={PALETTE[0]} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="p95LatencyMs" stroke={PALETTE[4]} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </LineChart>
          </ChartWrap>
        </Card>
      </div>

      <RecommendedActions actions={r.recommendedActions} />
    </>
  );
}

// ==================== Usage & Cost ====================

function UsageTab({ r }: { r: AiAnalyticsReport }) {
  return (
    <>
      <Card title="Requests & Cost" icon={LineIcon}>
        <ChartWrap height={280}>
          <LineChart data={r.usage} margin={{ top: 4, right: 40, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDay} fontSize={11} stroke="hsl(var(--muted-foreground))" />
            <YAxis yAxisId="left" fontSize={11} stroke="hsl(var(--muted-foreground))" />
            <YAxis yAxisId="right" orientation="right" fontSize={11} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `$${Number(v).toFixed(2)}`} />
            <Tooltip content={<TT />} />
            <Line yAxisId="left" type="monotone" dataKey="requests" stroke={PALETTE[0]} strokeWidth={2} dot={false} />
            <Line yAxisId="right" type="monotone" dataKey="costUsd" stroke={PALETTE[3]} strokeWidth={2} dot={false} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </LineChart>
        </ChartWrap>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Provider Breakdown" subtitle="Requests · tokens · cost per provider" icon={Cpu}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left py-2 font-medium">Provider</th>
                  <th className="text-right font-medium">Requests</th>
                  <th className="text-right font-medium">Tokens</th>
                  <th className="text-right font-medium">Cost</th>
                  <th className="text-right font-medium">Errors</th>
                  <th className="text-right font-medium">Avg ms</th>
                </tr>
              </thead>
              <tbody>
                {r.providers.length === 0 && (
                  <tr><td colSpan={6} className="py-6 text-center text-xs text-muted-foreground">No provider activity in this window.</td></tr>
                )}
                {r.providers.map((p, i) => (
                  <tr key={p.providerKind} className="border-b border-border/40">
                    <td className="py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                        {p.providerKind}
                      </span>
                    </td>
                    <td className="text-right ">{p.requests.toLocaleString()}</td>
                    <td className="text-right ">{fmtCompact(p.tokens)}</td>
                    <td className="text-right ">${p.costUsd.toFixed(4)}</td>
                    <td className={cn("text-right ", p.errorRate > 0 && "text-destructive")}>{p.errorRate}%</td>
                    <td className="text-right ">{p.avgLatencyMs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Operations" subtitle="Chat vs image vs embedding" icon={Sparkles}>
          <ChartWrap>
            <BarChart data={r.operations} margin={{ top: 4, right: 6, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="operation" fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <Tooltip content={<TT />} />
              <Bar dataKey="requests" fill={PALETTE[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartWrap>
        </Card>
      </div>
    </>
  );
}

// ==================== Performance ====================

function PerformanceTab({ r }: { r: AiAnalyticsReport }) {
  const total = r.kpis.totalRequests;
  const errors = r.kpis.totalErrors;
  const successRate = total ? Math.round(((total - errors) / total) * 1000) / 10 : 0;
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Success Rate" subtitle="Errors vs success">
          <div className="flex items-center justify-center py-2">
            <ChartWrap height={180} width="60%">
              <PieChart>
                <Pie
                  data={[
                    { name: "Success", value: total - errors },
                    { name: "Errors", value: errors },
                  ]}
                  dataKey="value"
                  innerRadius={45}
                  outerRadius={70}
                >
                  <Cell fill={PALETTE[2]} />
                  <Cell fill={PALETTE[4]} />
                </Pie>
              </PieChart>
            </ChartWrap>
            <div className="flex-1 text-center">
              <p className="text-3xl font-semibold">{successRate}%</p>
              <p className="text-xs text-muted-foreground">success rate</p>
              <p className="text-xs text-muted-foreground mt-2">{errors.toLocaleString()} errors of {total.toLocaleString()}</p>
            </div>
          </div>
        </Card>

        <Card title="Latency distribution" subtitle="Average & p95 over time" icon={Timer} className="lg:col-span-2">
          <ChartWrap>
            <AreaChart data={r.latency} margin={{ top: 4, right: 6, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="latGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PALETTE[0]} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={PALETTE[0]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDay} fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v}ms`} />
              <Tooltip content={<TT format={(v) => `${v} ms`} />} />
              <Area type="monotone" dataKey="p95LatencyMs" stroke={PALETTE[4]} strokeWidth={1.5} fillOpacity={0} strokeDasharray="4 4" />
              <Area type="monotone" dataKey="avgLatencyMs" stroke={PALETTE[0]} strokeWidth={2} fill="url(#latGradient)" />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </AreaChart>
          </ChartWrap>
        </Card>
      </div>

      <Card title="AI Acceptance Rate" subtitle="Applied vs rejected suggestions" icon={CheckCircle2}>
        <ChartWrap height={260}>
          <BarChart data={r.acceptance} margin={{ top: 4, right: 40, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" tickFormatter={fmtDay} fontSize={11} stroke="hsl(var(--muted-foreground))" />
            <YAxis yAxisId="left" fontSize={11} stroke="hsl(var(--muted-foreground))" />
            <YAxis yAxisId="right" orientation="right" fontSize={11} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v}%`} />
            <Tooltip content={<TT />} />
            <Bar yAxisId="left" dataKey="applied" stackId="a" fill={PALETTE[2]} />
            <Bar yAxisId="left" dataKey="rejected" stackId="a" fill={PALETTE[4]} radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="acceptanceRate" stroke={PALETTE[0]} strokeWidth={2} dot={false} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </BarChart>
        </ChartWrap>
      </Card>
    </>
  );
}

// ==================== Quality ====================

function QualityTab({ r }: { r: AiAnalyticsReport }) {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Customer Satisfaction Trends" subtitle="Predicted CSAT (0-1)" icon={CheckCircle2}>
          <ChartWrap>
            <AreaChart data={r.satisfaction} margin={{ top: 4, right: 6, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="satGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PALETTE[2]} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={PALETTE[2]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDay} fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={11} domain={[0, 1]} stroke="hsl(var(--muted-foreground))" />
              <Tooltip content={<TT />} />
              <ReferenceLine y={0.7} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
              <Area type="monotone" dataKey="avgScore" stroke={PALETTE[2]} strokeWidth={2} fill="url(#satGrad)" />
            </AreaChart>
          </ChartWrap>
        </Card>

        <Card title="Lead Quality Trends" subtitle="Avg lead score & temperature" icon={TrendingUp}>
          <ChartWrap>
            <BarChart data={r.leadQuality} margin={{ top: 4, right: 40, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDay} fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis yAxisId="left" fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis yAxisId="right" orientation="right" fontSize={11} stroke="hsl(var(--muted-foreground))" domain={[0, 100]} />
              <Tooltip content={<TT />} />
              <Bar yAxisId="left" dataKey="hot" stackId="t" fill={PALETTE[4]} />
              <Bar yAxisId="left" dataKey="warm" stackId="t" fill={PALETTE[3]} />
              <Bar yAxisId="left" dataKey="cold" stackId="t" fill={PALETTE[6]} radius={[4, 4, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="avgScore" stroke={PALETTE[0]} strokeWidth={2} dot={false} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </BarChart>
          </ChartWrap>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Sentiment Trends" subtitle="Positive / neutral / negative / mixed" icon={Sparkles}>
          <ChartWrap>
            <AreaChart data={r.sentiment} margin={{ top: 4, right: 6, bottom: 0, left: -20 }} stackOffset="expand">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDay} fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={11} tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`} stroke="hsl(var(--muted-foreground))" />
              <Tooltip content={<TT />} />
              <Area type="monotone" dataKey="positive" stackId="s" stroke={PALETTE[2]} fill={PALETTE[2]} fillOpacity={0.7} />
              <Area type="monotone" dataKey="neutral" stackId="s" stroke={PALETTE[6]} fill={PALETTE[6]} fillOpacity={0.7} />
              <Area type="monotone" dataKey="mixed" stackId="s" stroke={PALETTE[3]} fill={PALETTE[3]} fillOpacity={0.7} />
              <Area type="monotone" dataKey="negative" stackId="s" stroke={PALETTE[4]} fill={PALETTE[4]} fillOpacity={0.7} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </AreaChart>
          </ChartWrap>
        </Card>

        <Card title="Topic Trends" subtitle="Most discussed topics" icon={Activity}>
          {r.topics.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">No topics detected yet.</p>
          ) : (
            <ChartWrap>
              <BarChart data={r.topics} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis type="category" dataKey="topic" fontSize={11} width={110} stroke="hsl(var(--muted-foreground))" />
                <Tooltip content={<TT />} />
                <Bar dataKey="positive" stackId="tp" fill={PALETTE[2]} />
                <Bar dataKey="negative" stackId="tp" fill={PALETTE[4]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </BarChart>
            </ChartWrap>
          )}
        </Card>
      </div>
    </>
  );
}

// ==================== Outcomes ====================

function OutcomesTab({ r }: { r: AiAnalyticsReport }) {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Saved Agent Time" subtitle="Estimated minutes saved" icon={Clock}>
          <ChartWrap>
            <AreaChart
              data={r.acceptance.map((a, i) => ({
                date: a.date,
                savedMin: Math.round(
                  (a.applied * 3.5) +
                  (r.usage[i]?.requests ?? 0) * 0.5,
                ),
              }))}
              margin={{ top: 4, right: 6, bottom: 0, left: -20 }}
            >
              <defs>
                <linearGradient id="savedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={PALETTE[5]} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={PALETTE[5]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDay} fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v}m`} />
              <Tooltip content={<TT format={(v) => `${v} min`} />} />
              <Area type="monotone" dataKey="savedMin" stroke={PALETTE[5]} strokeWidth={2} fill="url(#savedGrad)" />
            </AreaChart>
          </ChartWrap>
        </Card>

        <Card title="Resolved Conversations" subtitle="Total & AI-assisted" icon={CheckCircle2} className="lg:col-span-2">
          <ChartWrap>
            <BarChart data={r.resolutions} margin={{ top: 4, right: 6, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDay} fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <Tooltip content={<TT />} />
              <Bar dataKey="aiAssisted" stackId="r" fill={PALETTE[0]} />
              <Bar dataKey="resolved" stackId="r" fill={PALETTE[6]} radius={[4, 4, 0, 0]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </BarChart>
          </ChartWrap>
        </Card>
      </div>

      <RecommendedActions actions={r.recommendedActions} />
    </>
  );
}

function RecommendedActions({ actions }: { actions: AiAnalyticsReport["recommendedActions"] }) {
  return (
    <Card title="Recommended Actions" subtitle="Top AI suggestions pending review" icon={Sparkles}
      actions={
        actions.length > 0 ? (
          <a href="/automations" className="text-xs text-accent hover:underline inline-flex items-center gap-1">
            Open queue <ArrowUpRight className="h-3 w-3" />
          </a>
        ) : null
      }
    >
      {actions.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">
          No pending AI suggestions. New ones will appear here automatically.
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {actions.map((a) => (
            <li key={a.id} className="py-2.5 flex items-start gap-3">
              <div className="w-8 h-8 rounded-control bg-accent/10 text-accent flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{a.title}</p>
                {a.summary && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{a.summary}</p>}
                <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Badge variant="outline" className="text-[11px]">{a.type.replace(/_/g, " ")}</Badge>
                  {a.confidence !== null && (
                    <span>· confidence {Math.round((a.confidence ?? 0) * 100)}%</span>
                  )}
                  <span>· {fmtRelative(a.createdAt)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ==================== Forecasts ====================

function ForecastsTab({ r }: { r: AiAnalyticsReport }) {
  return (
    <div className="grid gap-4">
      {r.forecasts.map((f) => (
        <ForecastCard key={f.metric} forecast={f} />
      ))}
    </div>
  );
}

function ForecastCard({ forecast }: { forecast: AiAnalyticsReport["forecasts"][number] }) {
  const combined = useMemo(() => {
    const hist = forecast.history.map((h) => ({ date: h.date, historical: h.value }));
    const fut = forecast.forecast.map((f) => ({ date: f.date, forecast: f.value, lower: f.lower, upper: f.upper }));
    return [...hist, ...fut];
  }, [forecast]);

  const label = forecast.metric === "cost" ? "Cost (USD)" : forecast.metric === "tokens" ? "Tokens" : "Requests";
  const fmt = forecast.metric === "cost" ? (v: number) => `$${v.toFixed(2)}` : fmtCompact;
  const TrendIcon = forecast.trend === "up" ? TrendingUp : forecast.trend === "down" ? TrendingDown : Minus;
  const trendColor = forecast.trend === "up" ? "text-emerald-500" : forecast.trend === "down" ? "text-destructive" : "text-muted-foreground";

  return (
    <Card
      title={`Forecast · ${label}`}
      subtitle="Linear projection with 1.5σ uncertainty band, next 30 days"
      icon={LineIcon}
      actions={
        <div className="flex items-center gap-3 text-xs">
          <span className={cn("inline-flex items-center gap-1 font-medium", trendColor)}>
            <TrendIcon className="h-3.5 w-3.5" />
            {forecast.changePct > 0 ? "+" : ""}{forecast.changePct}%
          </span>
          <div className="text-right">
            <p className="text-muted-foreground">Next 7d</p>
            <p className="font-semibold">{fmt(forecast.next7dTotal)}</p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground">Next 30d</p>
            <p className="font-semibold">{fmt(forecast.next30dTotal)}</p>
          </div>
        </div>
      }
    >
      <ChartWrap height={280}>
        <AreaChart data={combined} margin={{ top: 4, right: 6, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id={`hist-${forecast.metric}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PALETTE[0]} stopOpacity={0.35} />
              <stop offset="100%" stopColor={PALETTE[0]} stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`band-${forecast.metric}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PALETTE[3]} stopOpacity={0.18} />
              <stop offset="100%" stopColor={PALETTE[3]} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="date" tickFormatter={fmtDay} fontSize={11} stroke="hsl(var(--muted-foreground))" />
          <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" tickFormatter={fmt} />
          <Tooltip content={<TT format={(v) => fmt(Number(v))} />} />
          <Area type="monotone" dataKey="upper" stroke="transparent" fill={`url(#band-${forecast.metric})`} />
          <Area type="monotone" dataKey="lower" stroke="transparent" fill="hsl(var(--surface))" />
          <Area type="monotone" dataKey="historical" stroke={PALETTE[0]} strokeWidth={2} fill={`url(#hist-${forecast.metric})`} />
          <Line type="monotone" dataKey="forecast" stroke={PALETTE[3]} strokeWidth={2} strokeDasharray="5 4" dot={false} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </AreaChart>
      </ChartWrap>
    </Card>
  );
}

// ==================== Chart primitives ====================

function ChartWrap({ children, height = 220, width = "100%" }: { children: React.ReactElement; height?: number; width?: string | number }) {
  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

function TT({ active, payload, label, format }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number | string; color?: string }>;
  label?: string | number;
  format?: (v: number | string) => string;
}) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-control border border-border bg-popover shadow-md px-2.5 py-1.5 text-xs">
      {label !== undefined && <p className="font-medium mb-1">{typeof label === "string" && /^\d{4}-\d{2}-\d{2}$/.test(label) ? fmtDay(label) : label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 ">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto font-medium">{format ? format(p.value) : String(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ==================== Formatters ====================

function fmtDay(v: string): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtCompact(v: number | string): string {
  const n = Number(v);
  if (!isFinite(n)) return String(v);
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  if (h < 48) return `${h}h ${minutes % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function fmtRelative(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const days = Math.round(h / 24);
  return `${days}d ago`;
}
