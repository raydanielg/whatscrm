import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import {
  channelLabel,
  formatSeconds,
  useAnalyticsSummary,
  type AnalyticsDay,
} from "@/hooks/use-analytics-summary";
import { DEMO_MODE_ENABLED } from "@/lib/demo/mode";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Funnel,
  FunnelChart,
  LabelList,
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
import { Download, RefreshCw, Radio } from "lucide-react";

export const Route = createFileRoute("/_authenticated/omnichannel-analytics")({
  component: OmnichannelAnalyticsPage,
});

// ---------- Channels (real data) ----------
const CHANNELS = [
  "WhatsApp",
  "Instagram",
  "Messenger",
  "Telegram",
  "Email",
  "SMS",
  "Live Chat",
  "Other",
] as const;
const CHANNEL_COLORS: Record<string, string> = {
  WhatsApp: "#25D366",
  Instagram: "#E4405F",
  Messenger: "#0084FF",
  Telegram: "#26A5E4",
  Email: "#075E54",
  SMS: "#F59E0B",
  "Live Chat": "#6366F1",
  Other: "#94A3B8",
};

type SeriesRow = Record<string, number | string | null>;

/** One real day from `analytics_daily_summary`, shaped for the charts below. */
function toSeriesRow(r: AnalyticsDay): SeriesRow {
  const row: SeriesRow = { day: r.day };
  for (const c of CHANNELS) row[c] = 0;
  for (const [key, count] of Object.entries(r.byChannel)) {
    const label = channelLabel(key);
    row[label] = ((row[label] as number) ?? 0) + count;
  }
  row.total = r.messages;
  row.conversations = r.conversations;
  row.responseSec = r.avgFirstResponseSec == null ? null : Math.round(r.avgFirstResponseSec);
  row.resolutionMin = r.avgResolutionMin == null ? null : Math.round(r.avgResolutionMin);
  row.csat = r.csatAvg == null ? null : +r.csatAvg.toFixed(2);
  return row;
}

// ---------- Sample dataset (DEMO MODE ONLY) ----------
// Everything below this line up to the helpers is fabricated and is rendered
// only when the deployment runs with APP_MODE=demo. The tabs it feeds (agents,
// AI usage, revenue, journey, funnel, retention) have no real data source yet,
// so production hides them rather than showing invented numbers.
function seedSeries(
  days = 30,
  fmtDay: (d: Date) => string = (d) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
) {
  const out: Array<Record<string, number | string>> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const row: Record<string, number | string> = {
      day: fmtDay(d),
    };
    let total = 0;
    for (const c of CHANNELS) {
      const v = Math.round(80 + Math.random() * 220 + (c === "WhatsApp" ? 220 : 0));
      row[c] = v;
      total += v;
    }
    row.total = total;
    row.conversations = Math.round(total / 6);
    row.responseSec = Math.round(60 + Math.random() * 240);
    row.resolutionMin = Math.round(15 + Math.random() * 90);
    row.csat = +(4.2 + Math.random() * 0.7).toFixed(2);
    row.aiTokens = Math.round(20_000 + Math.random() * 60_000);
    row.revenue = Math.round(1_500 + Math.random() * 8_500);
    out.push(row);
  }
  return out;
}

const AGENTS = [
  { name: "Sara Kim", handled: 342, avgResp: "1m 44s", csat: 4.9, resolved: 318 },
  { name: "Diego Ruiz", handled: 289, avgResp: "2m 12s", csat: 4.7, resolved: 260 },
  { name: "Amina Yusuf", handled: 271, avgResp: "1m 58s", csat: 4.8, resolved: 251 },
  { name: "Jonas Berg", handled: 244, avgResp: "3m 05s", csat: 4.5, resolved: 210 },
  { name: "Priya Patel", handled: 228, avgResp: "2m 30s", csat: 4.6, resolved: 205 },
];

const FUNNEL = [
  { name: "Visitors", value: 24_500, fill: "#0B090A" },
  { name: "Engaged", value: 12_300, fill: "#128C7E" },
  { name: "Qualified", value: 6_400, fill: "#075E54" },
  { name: "Opportunity", value: 2_800, fill: "#BA181B" },
  { name: "Customer", value: 940, fill: "#25D366" },
];

const RETENTION = [
  { cohort: "Wk 0", retained: 100 },
  { cohort: "Wk 1", retained: 78 },
  { cohort: "Wk 2", retained: 62 },
  { cohort: "Wk 3", retained: 54 },
  { cohort: "Wk 4", retained: 49 },
  { cohort: "Wk 6", retained: 41 },
  { cohort: "Wk 8", retained: 37 },
  { cohort: "Wk 12", retained: 31 },
];

const JOURNEY = [
  { step: "First touch (Instagram)", customers: 4210 },
  { step: "WhatsApp reply", customers: 2870 },
  { step: "Email nurture", customers: 1980 },
  { step: "Live chat session", customers: 1240 },
  { step: "Purchase", customers: 640 },
  { step: "Repeat purchase", customers: 312 },
];

// ---------- Helpers ----------
function toCSV(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join(
    "\n",
  );
}
function downloadCSV(name: string, rows: Array<Record<string, unknown>>) {
  const blob = new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const CHART_TOOLTIP = {
  contentStyle: {
    background: "var(--color-surface-elevated)",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    fontSize: 12,
  },
} as const;

function KpiCard({ label, value, delta }: { label: string; value: string; delta?: string }) {
  return (
    <div className="rounded-control border border-border bg-surface p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-display font-semibold mt-1">{value}</div>
      {delta && <div className="text-xs text-muted-foreground mt-1">{delta}</div>}
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
    <div className="rounded-control border border-border bg-surface p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-display font-semibold">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function ExportBtn({ name, rows }: { name: string; rows: Array<Record<string, unknown>> }) {
  return (
    <Button size="sm" variant="outline" onClick={() => downloadCSV(name, rows)}>
      <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
    </Button>
  );
}

// ---------- Page ----------
function OmnichannelAnalyticsPage() {
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");
  const days = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const [live, setLive] = useState(false);
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  const queryClient = useQueryClient();
  const fmtZoned = useZonedDateFormatter();

  // Real data — every mode.
  const {
    rows,
    totals: real,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useAnalyticsSummary(days);
  const series = useMemo<SeriesRow[]>(() => rows.map(toSeriesRow), [rows]);

  // Fabricated data — demo mode only (feeds the sample-only tabs).
  const [sampleSeries, setSampleSeries] = useState<Array<Record<string, number | string>>>(() =>
    DEMO_MODE_ENABLED ? seedSeries(30, (d) => fmtZoned(d, { month: "short", day: "numeric" })) : [],
  );
  useEffect(() => {
    if (DEMO_MODE_ENABLED)
      setSampleSeries(seedSeries(days, (d) => fmtZoned(d, { month: "short", day: "numeric" })));
  }, [days, fmtZoned]);

  // Realtime: a new message in this workspace invalidates the real series so
  // the charts re-query. Debounced — an import or campaign can insert in bursts.
  useEffect(() => {
    if (!workspaceId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`omni-analytics:${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          setLive(true);
          setLastEvent(
            fmtZoned(new Date(), { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          );
          clearTimeout(timer);
          timer = setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ["analytics-daily-summary", workspaceId] });
          }, 1500);
        },
      )
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [workspaceId, queryClient]);

  // Per-channel totals over the selected window.
  const channelTotals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const c of CHANNELS) t[c] = 0;
    for (const row of series) for (const c of CHANNELS) t[c] += (row[c] as number) ?? 0;
    return t;
  }, [series]);

  // Sample-only aggregates (demo mode).
  const sampleTotals = useMemo(() => {
    let revenue = 0,
      ai = 0;
    for (const row of sampleSeries) {
      revenue += row.revenue as number;
      ai += row.aiTokens as number;
    }
    return { revenue, ai };
  }, [sampleSeries]);

  const channelBreakdown = CHANNELS.map((c) => ({
    name: c,
    value: channelTotals[c],
    fill: CHANNEL_COLORS[c],
  }));
  const mostUsed = [...channelBreakdown].sort((a, b) => b.value - a.value)[0];
  const mostUsedName = mostUsed && mostUsed.value > 0 ? mostUsed.name : "—";
  const conversionRate = ((FUNNEL.at(-1)!.value / FUNNEL[0].value) * 100).toFixed(2);
  const empty = !isLoading && !isError && real.messages === 0 && real.conversations === 0;

  return (
    <>
      <AppTopbar
        title="Omnichannel Analytics"
        subtitle="Unified reports across every channel"
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={isFetching}
              onClick={() => {
                if (DEMO_MODE_ENABLED)
                  setSampleSeries(
                    seedSeries(days, (d) => fmtZoned(d, { month: "short", day: "numeric" })),
                  );
                void refetch();
              }}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />{" "}
              Refresh
            </Button>
            <ExportBtn name="omnichannel-volume" rows={series} />
          </>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={range} onValueChange={(v) => setRange(v as typeof range)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          {live && (
            <Badge variant="outline" className="gap-1.5">
              <Radio className="h-3 w-3 text-[color:var(--color-accent)] animate-pulse" />
              Live · {lastEvent}
            </Badge>
          )}
        </div>

        {isError && (
          <div
            role="alert"
            className="rounded-control border border-destructive/40 bg-destructive/5 p-4 text-sm"
          >
            Couldn&apos;t load analytics: {error instanceof Error ? error.message : "unknown error"}
          </div>
        )}
        {empty && (
          <div className="rounded-control border border-dashed border-border bg-surface p-6 text-center text-sm text-muted-foreground">
            No conversations or messages in the last {days} days. Reports fill in as activity flows
            through your channels.
          </div>
        )}

        {/* Top KPIs — real figures; a dash means there is nothing to average yet. */}
        <div
          className={`grid grid-cols-2 gap-3 ${DEMO_MODE_ENABLED ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}
        >
          <KpiCard label="Messages" value={isLoading ? "" : real.messages.toLocaleString()} />
          <KpiCard
            label="Conversations"
            value={isLoading ? "" : real.conversations.toLocaleString()}
          />
          <KpiCard
            label="Avg. first response"
            value={isLoading ? "" : formatSeconds(real.avgFirstResponseSec)}
          />
          <KpiCard
            label="Avg. resolution"
            value={
              isLoading
                ? ""
                : real.avgResolutionMin == null
                  ? "—"
                  : `${Math.round(real.avgResolutionMin)}m`
            }
          />
          <KpiCard
            label="CSAT"
            value={isLoading ? "" : real.csat == null ? "—" : `${real.csat.toFixed(2)} / 5`}
            delta={real.csatCount > 0 ? `${real.csatCount.toLocaleString()} responses` : undefined}
          />
          {DEMO_MODE_ENABLED && (
            <KpiCard
              label="Revenue (sample)"
              value={`$${sampleTotals.revenue.toLocaleString()}`}
              delta={`Conv. ${conversionRate}%`}
            />
          )}
        </div>

        <Tabs defaultValue="messages">
          <TabsList className="flex flex-wrap  ">
            <TabsTrigger value="messages">Messages</TabsTrigger>
            <TabsTrigger value="volume">Volume</TabsTrigger>
            <TabsTrigger value="channels">Channels</TabsTrigger>
            <TabsTrigger value="response">Response & Resolution</TabsTrigger>
            <TabsTrigger value="csat">CSAT</TabsTrigger>
            {DEMO_MODE_ENABLED && (
              <>
                <TabsTrigger value="agents">Agents (sample)</TabsTrigger>
                <TabsTrigger value="ai">AI Usage (sample)</TabsTrigger>
                <TabsTrigger value="revenue">Revenue (sample)</TabsTrigger>
                <TabsTrigger value="journey">Journey (sample)</TabsTrigger>
                <TabsTrigger value="funnel">Funnel (sample)</TabsTrigger>
                <TabsTrigger value="retention">Retention (sample)</TabsTrigger>
              </>
            )}
          </TabsList>

          {/* MESSAGES */}
          <TabsContent value="messages" className="mt-4">
            <Panel
              title="Messages by channel"
              subtitle="Stacked daily volume"
              action={<ExportBtn name="messages-by-channel" rows={series} />}
            >
              <div className="h-80">
                <ResponsiveContainer>
                  <BarChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="day" fontSize={11} stroke="var(--color-muted-foreground)" />
                    <YAxis
                      fontSize={11}
                      allowDecimals={false}
                      stroke="var(--color-muted-foreground)"
                    />
                    <Tooltip {...CHART_TOOLTIP} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {CHANNELS.map((c) => (
                      <Bar key={c} dataKey={c} stackId="a" fill={CHANNEL_COLORS[c]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </TabsContent>

          {/* VOLUME */}
          <TabsContent value="volume" className="mt-4">
            <Panel
              title="Conversation volume"
              subtitle="Total conversations opened per day"
              action={<ExportBtn name="conversation-volume" rows={series} />}
            >
              <div className="h-80">
                <ResponsiveContainer>
                  <AreaChart data={series}>
                    <defs>
                      <linearGradient id="gv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="day" fontSize={11} stroke="var(--color-muted-foreground)" />
                    <YAxis fontSize={11} stroke="var(--color-muted-foreground)" />
                    <Tooltip {...CHART_TOOLTIP} />
                    <Area
                      type="monotone"
                      dataKey="conversations"
                      stroke="var(--color-accent)"
                      strokeWidth={2}
                      fill="url(#gv)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </TabsContent>

          {/* CHANNELS */}
          <TabsContent value="channels" className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Panel
              title="Channel usage"
              subtitle={`Most used: ${mostUsedName}`}
              action={<ExportBtn name="channel-usage" rows={channelBreakdown} />}
            >
              <div className="h-72">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={channelBreakdown}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={100}
                    >
                      {channelBreakdown.map((c) => (
                        <Cell key={c.name} fill={c.fill} />
                      ))}
                    </Pie>
                    <Tooltip {...CHART_TOOLTIP} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel title="Channel table" subtitle="Sortable, exportable">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground text-left border-b border-border">
                    <tr>
                      <th className="py-2">Channel</th>
                      <th>Messages</th>
                      <th>Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...channelBreakdown]
                      .sort((a, b) => b.value - a.value)
                      .map((c) => (
                        <tr key={c.name} className="border-b border-border/60">
                          <td className="py-2 flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full" style={{ background: c.fill }} />
                            {c.name}
                          </td>
                          <td>{c.value.toLocaleString()}</td>
                          <td>
                            {real.messages > 0
                              ? `${((c.value / real.messages) * 100).toFixed(1)}%`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </TabsContent>

          {/* RESPONSE */}
          <TabsContent value="response" className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Panel
              title="Response time"
              subtitle="Average first response (seconds)"
              action={<ExportBtn name="response-time" rows={series} />}
            >
              <div className="h-72">
                <ResponsiveContainer>
                  <LineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="day" fontSize={11} stroke="var(--color-muted-foreground)" />
                    <YAxis fontSize={11} stroke="var(--color-muted-foreground)" />
                    <Tooltip {...CHART_TOOLTIP} />
                    <Line
                      type="monotone"
                      dataKey="responseSec"
                      stroke="#075E54"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel
              title="Resolution time"
              subtitle="Average time to resolve (minutes)"
              action={<ExportBtn name="resolution-time" rows={series} />}
            >
              <div className="h-72">
                <ResponsiveContainer>
                  <LineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="day" fontSize={11} stroke="var(--color-muted-foreground)" />
                    <YAxis fontSize={11} stroke="var(--color-muted-foreground)" />
                    <Tooltip {...CHART_TOOLTIP} />
                    <Line
                      type="monotone"
                      dataKey="resolutionMin"
                      stroke="#25D366"
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </TabsContent>

          {/* CSAT */}
          <TabsContent value="csat" className="mt-4">
            <Panel
              title="Customer satisfaction"
              subtitle="Daily CSAT (0-5)"
              action={<ExportBtn name="csat" rows={series} />}
            >
              <div className="h-80">
                <ResponsiveContainer>
                  <AreaChart data={series}>
                    <defs>
                      <linearGradient id="gc" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="day" fontSize={11} stroke="var(--color-muted-foreground)" />
                    <YAxis domain={[0, 5]} fontSize={11} stroke="var(--color-muted-foreground)" />
                    <Tooltip {...CHART_TOOLTIP} />
                    <Area
                      type="monotone"
                      dataKey="csat"
                      stroke="#22c55e"
                      strokeWidth={2}
                      fill="url(#gc)"
                      connectNulls
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </TabsContent>

          {/* ------------------------------------------------------------------
              SAMPLE-ONLY TABS (demo mode). No real data source is wired for
              these yet, so production renders none of them.
              ------------------------------------------------------------------ */}
          {DEMO_MODE_ENABLED && (
            <>
              {/* AGENTS */}
              <TabsContent value="agents" className="mt-4">
                <Panel
                  title="Agent performance"
                  subtitle="Top agents by handled conversations (sample data)"
                  action={<ExportBtn name="agent-performance" rows={AGENTS} />}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-xs text-muted-foreground text-left border-b border-border">
                        <tr>
                          <th className="py-2">Agent</th>
                          <th>Handled</th>
                          <th>Resolved</th>
                          <th>Avg. response</th>
                          <th>CSAT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {AGENTS.map((a) => (
                          <tr key={a.name} className="border-b border-border/60">
                            <td className="py-2 font-medium">{a.name}</td>
                            <td>{a.handled}</td>
                            <td>{a.resolved}</td>
                            <td>{a.avgResp}</td>
                            <td>{a.csat}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              </TabsContent>

              {/* AI USAGE */}
              <TabsContent value="ai" className="mt-4">
                <Panel
                  title="AI usage"
                  subtitle={`Tokens consumed · Total ${sampleTotals.ai.toLocaleString()} (sample data)`}
                  action={<ExportBtn name="ai-usage" rows={sampleSeries} />}
                >
                  <div className="h-80">
                    <ResponsiveContainer>
                      <BarChart data={sampleSeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                        <XAxis dataKey="day" fontSize={11} stroke="var(--color-muted-foreground)" />
                        <YAxis fontSize={11} stroke="var(--color-muted-foreground)" />
                        <Tooltip {...CHART_TOOLTIP} />
                        <Bar dataKey="aiTokens" fill="#6366F1" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
              </TabsContent>

              {/* REVENUE */}
              <TabsContent value="revenue" className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Panel
                  title="Revenue"
                  subtitle="Attributed to conversations (sample data)"
                  action={<ExportBtn name="revenue" rows={sampleSeries} />}
                >
                  <div className="h-72">
                    <ResponsiveContainer>
                      <AreaChart data={sampleSeries}>
                        <defs>
                          <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#075E54" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#075E54" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                        <XAxis dataKey="day" fontSize={11} stroke="var(--color-muted-foreground)" />
                        <YAxis fontSize={11} stroke="var(--color-muted-foreground)" />
                        <Tooltip {...CHART_TOOLTIP} />
                        <Area
                          type="monotone"
                          dataKey="revenue"
                          stroke="#075E54"
                          strokeWidth={2}
                          fill="url(#gr)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
                <Panel title="Conversion rate" subtitle="End-to-end funnel">
                  <div className="flex flex-col items-center justify-center h-72">
                    <div className="text-6xl font-display font-semibold">{conversionRate}%</div>
                    <div className="text-sm text-muted-foreground mt-2">Visitor → Customer</div>
                    <div className="text-xs text-muted-foreground mt-6">
                      Most used channel:{" "}
                      <span className="font-medium text-foreground">{mostUsedName}</span>
                    </div>
                  </div>
                </Panel>
              </TabsContent>

              {/* JOURNEY */}
              <TabsContent value="journey" className="mt-4">
                <Panel
                  title="Customer journey"
                  subtitle="Cross-channel path to purchase"
                  action={<ExportBtn name="customer-journey" rows={JOURNEY} />}
                >
                  <div className="h-80">
                    <ResponsiveContainer>
                      <BarChart data={JOURNEY} layout="vertical" margin={{ left: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                        <XAxis type="number" fontSize={11} stroke="var(--color-muted-foreground)" />
                        <YAxis
                          type="category"
                          dataKey="step"
                          fontSize={11}
                          width={180}
                          stroke="var(--color-muted-foreground)"
                        />
                        <Tooltip {...CHART_TOOLTIP} />
                        <Bar dataKey="customers" fill="#075E54" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
              </TabsContent>

              {/* FUNNEL */}
              <TabsContent value="funnel" className="mt-4">
                <Panel
                  title="Conversion funnel"
                  subtitle="Visitors → Customers"
                  action={<ExportBtn name="funnel" rows={FUNNEL} />}
                >
                  <div className="h-96">
                    <ResponsiveContainer>
                      <FunnelChart>
                        <Tooltip {...CHART_TOOLTIP} />
                        <Funnel dataKey="value" data={FUNNEL} isAnimationActive>
                          <LabelList
                            position="right"
                            fill="var(--color-foreground)"
                            stroke="none"
                            dataKey="name"
                          />
                        </Funnel>
                      </FunnelChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
              </TabsContent>

              {/* RETENTION */}
              <TabsContent value="retention" className="mt-4">
                <Panel
                  title="Retention curve"
                  subtitle="Cohort retention over time"
                  action={<ExportBtn name="retention" rows={RETENTION} />}
                >
                  <div className="h-80">
                    <ResponsiveContainer>
                      <LineChart data={RETENTION}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                        <XAxis
                          dataKey="cohort"
                          fontSize={11}
                          stroke="var(--color-muted-foreground)"
                        />
                        <YAxis
                          domain={[0, 100]}
                          unit="%"
                          fontSize={11}
                          stroke="var(--color-muted-foreground)"
                        />
                        <Tooltip {...CHART_TOOLTIP} />
                        <Line type="monotone" dataKey="retained" stroke="#075E54" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
              </TabsContent>
            </>
          )}
        </Tabs>
      </main>
    </>
  );
}
