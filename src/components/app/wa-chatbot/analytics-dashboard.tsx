import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import {
  Bot,
  Clock,
  Download,
  Loader2,
  MessageSquare,
  RefreshCw,
  UserRound,
  Zap,
} from "lucide-react";

import { getWaChatbotAnalytics, type WaAnalytics } from "@/lib/messaging/wa-analytics.functions";
import { WA_TRIGGER_LABEL, type WaTriggerType } from "@/lib/messaging/wa-trigger-matching";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const RANGES = [
  { value: 7, label: "Last 7 days" },
  { value: 14, label: "Last 14 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
];

const SERIES_COLORS = {
  inbound: "hsl(var(--primary))",
  bot: "hsl(var(--chart-2, 173 58% 39%))",
  agent: "hsl(var(--chart-4, 43 74% 66%))",
  contacts: "hsl(var(--chart-5, 27 87% 67%))",
};

const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 173 58% 39%))",
  "hsl(var(--chart-3, 197 37% 24%))",
  "hsl(var(--chart-4, 43 74% 66%))",
  "hsl(var(--chart-5, 27 87% 67%))",
  "hsl(var(--muted-foreground))",
];

function ms(v: number | null | undefined) {
  if (v == null) return "—";
  if (v < 1000) return `${v} ms`;
  if (v < 60_000) return `${(v / 1000).toFixed(1)}s`;
  if (v < 3_600_000) return `${Math.round(v / 60_000)}m`;
  return `${(v / 3_600_000).toFixed(1)}h`;
}

function shortDate(d: string) {
  return d.slice(5);
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Zap;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="mt-1 text-2xl font-semibold ">{value}</div>
        {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export function WaChatbotAnalytics({
  workspaceId,
  instances,
}: {
  workspaceId: string | null;
  instances: Array<{ id: string; phone_number: string | null; display_name?: string | null }>;
}) {
  const [days, setDays] = useState(30);
  const [instance, setInstance] = useState<string>("all");

  const run = useServerFn(getWaChatbotAnalytics);
  const q = useQuery<WaAnalytics>({
    enabled: !!workspaceId,
    queryKey: ["wa-chatbot-analytics", workspaceId, days, instance],
    queryFn: () =>
      run({
        data: {
          workspaceId: workspaceId!,
          days,
          sessionId: instance === "all" ? null : instance,
        },
      }),
    refetchInterval: 60_000,
  });

  const d = q.data;

  const engagement = useMemo(
    () =>
      (d?.series ?? []).map((s) => ({
        ...s,
        date: shortDate(s.date),
        avgBotResponseSec:
          s.avgBotResponseMs == null ? null : Math.round(s.avgBotResponseMs / 100) / 10,
      })),
    [d],
  );

  const exportCsv = () => {
    if (!d) return;
    const lines = [
      "Date,Inbound,Bot replies,Agent replies,Unique contacts,New conversations,Avg bot response (ms)",
      ...d.series.map((s) =>
        [
          s.date,
          s.inbound,
          s.botReplies,
          s.agentReplies,
          s.contacts,
          s.newConversations,
          s.avgBotResponseMs ?? "",
        ].join(","),
      ),
      "",
      "Rule,Trigger,Enabled,Hits,Share %,Last triggered",
      ...d.rules.map((r) =>
        [
          `"${r.name.replace(/"/g, '""')}"`,
          r.triggerType,
          r.enabled,
          r.hits,
          r.share,
          r.lastTriggeredAt ?? "",
        ].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wa-chatbot-analytics-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (q.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading analytics
      </div>
    );
  }

  if (q.isError) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">
          Could not load analytics: {(q.error as Error).message}
        </CardContent>
      </Card>
    );
  }

  if (!d) return null;

  const maxHits = Math.max(1, ...d.rules.map((r) => r.hits));

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGES.map((r) => (
              <SelectItem key={r.value} value={String(r.value)}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={instance} onValueChange={setInstance}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All instances" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All instances</SelectItem>
            {instances.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.display_name || i.phone_number || i.id.slice(0, 8)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={MessageSquare}
          label="Inbound messages"
          value={d.totals.inbound}
          hint={`${d.totals.outbound} replies sent`}
        />
        <Kpi
          icon={Bot}
          label="Bot coverage"
          value={`${d.totals.botCoverage}%`}
          hint={`${d.totals.botReplies} bot · ${d.totals.agentReplies} agent replies`}
        />
        <Kpi
          icon={Clock}
          label="Avg bot response"
          value={ms(d.totals.avgBotResponseMs)}
          hint={`median ${ms(d.totals.medianBotResponseMs)} · p95 ${ms(d.totals.p95BotResponseMs)}`}
        />
        <Kpi
          icon={UserRound}
          label="Unique customers"
          value={d.totals.uniqueContacts}
          hint={`${d.totals.returningContacts} returning · ${d.totals.newConversations} new chats`}
        />
      </div>

      {/* Engagement over time */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Engagement over time</CardTitle>
          <CardDescription>
            Inbound customer messages versus bot and agent replies.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={engagement}>
              <defs>
                <linearGradient id="wa-inbound" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIES_COLORS.inbound} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={SERIES_COLORS.inbound} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Area
                type="monotone"
                dataKey="inbound"
                name="Inbound"
                stroke={SERIES_COLORS.inbound}
                fill="url(#wa-inbound)"
              />
              <Line
                type="monotone"
                dataKey="botReplies"
                name="Bot replies"
                stroke={SERIES_COLORS.bot}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="agentReplies"
                name="Agent replies"
                stroke={SERIES_COLORS.agent}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Trigger hit rates */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Trigger hit rates</CardTitle>
            <CardDescription>
              {d.totals.ruleHits} total rule triggers across {d.rules.length} rules.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {d.rules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No auto-reply rules yet.</p>
            ) : (
              d.rules.slice(0, 8).map((r) => (
                <div key={r.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{r.name}</span>
                      <Badge variant="outline" className="rounded-control text-[11px]">
                        {WA_TRIGGER_LABEL[r.triggerType as WaTriggerType] ?? r.triggerType}
                      </Badge>
                      {!r.enabled && (
                        <Badge variant="secondary" className="rounded-control text-[11px]">
                          off
                        </Badge>
                      )}
                    </span>
                    <span className="shrink-0  text-muted-foreground">
                      {r.hits} · {r.share}%
                    </span>
                  </div>
                  <Progress value={(r.hits / maxHits) * 100} className="h-1.5" />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Trigger type mix */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Triggers by type</CardTitle>
            <CardDescription>Which matching strategies actually fire.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {d.triggerTypes.every((t) => t.hits === 0) ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No triggers recorded yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={d.triggerTypes.map((t) => ({
                      name: WA_TRIGGER_LABEL[t.type as WaTriggerType] ?? t.type,
                      value: t.hits,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {d.triggerTypes.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Response performance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Response performance</CardTitle>
            <CardDescription>
              Time from an inbound message to the first reply. Agent average:{" "}
              {ms(d.totals.avgAgentResponseMs)}.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.responseBuckets}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" name="Replies" fill={SERIES_COLORS.bot} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Avg bot latency trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bot latency trend</CardTitle>
            <CardDescription>Average bot response time per day (seconds).</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={engagement}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="avgBotResponseSec"
                  name="Avg response (s)"
                  stroke={SERIES_COLORS.inbound}
                  connectNulls
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Customer engagement */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customers reached</CardTitle>
            <CardDescription>Unique customers messaging per day and new chats.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={engagement}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="contacts"
                  name="Unique customers"
                  fill={SERIES_COLORS.contacts}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="newConversations"
                  name="New chats"
                  fill={SERIES_COLORS.bot}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top customers + hourly */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Busiest hours & top customers</CardTitle>
            <CardDescription>When people write, and who writes the most.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.hourly}>
                  <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={2} />
                  <Tooltip />
                  <Bar dataKey="inbound" name="Inbound" fill={SERIES_COLORS.inbound} radius={2} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {d.topContacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No customer activity in this range.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {d.topContacts.map((c) => (
                  <li key={c.name} className="flex items-center justify-between gap-2">
                    <span className="truncate">{c.name}</span>
                    <span className=" text-muted-foreground">{c.messages}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
