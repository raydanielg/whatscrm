import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  Activity,
  CheckCheck,
  Clock,
  Loader2,
  MessageCircle,
  MessageSquare,
  Send,
  Smile,
  TrendingUp,
  Users,
  XCircle,
  Zap,
  Radio,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getWhatsAppAnalytics } from "@/lib/bi/whatsapp-analytics.functions";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2, 173 58% 39%))",
  "hsl(var(--chart-3, 197 37% 24%))",
  "hsl(var(--chart-4, 43 74% 66%))",
  "hsl(var(--chart-5, 27 87% 67%))",
  "hsl(var(--destructive))",
  "hsl(var(--muted-foreground))",
];

const fmtNumber = (n: number) => new Intl.NumberFormat().format(Math.round(n));
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtDuration = (seconds: number) => {
  if (!seconds || seconds < 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  pulse,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tone?: "positive" | "negative" | "neutral";
  pulse?: boolean;
}) {
  const toneCls =
    tone === "positive"
      ? "text-emerald-500"
      : tone === "negative"
        ? "text-destructive"
        : "text-foreground";
  return (
    <Card className="transition-all hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className={`mt-2 text-2xl font-bold tracking-tight ${toneCls}`}>{value}</p>
            {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
          </div>
          <div className="relative">
            <Icon className="h-5 w-5 text-muted-foreground" />
            {pulse && (
              <span className="absolute -right-1 -top-1 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HeatCell({ intensity, value }: { intensity: number; value: number }) {
  return (
    <div
      className="h-6 rounded-control border border-border/40 transition-colors"
      style={{
        backgroundColor: `hsl(var(--primary) / ${Math.min(0.85, intensity * 0.85 + (value > 0 ? 0.08 : 0))})`,
      }}
      title={`${value} messages`}
    />
  );
}

export function WhatsAppAnalytics({ workspaceId }: { workspaceId: string }) {
  const [days, setDays] = useState(30);
  const [live, setLive] = useState(true);
  const fn = useServerFn(getWhatsAppAnalytics);
  const qc = useQueryClient();
  const fmtZoned = useZonedDateFormatter();

  const key = ["bi.whatsapp", workspaceId, days];
  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: key,
    enabled: !!workspaceId,
    queryFn: () => fn({ data: { workspaceId, days } }),
    staleTime: 30_000,
    refetchInterval: live ? 30_000 : false,
    refetchOnWindowFocus: false,
  });

  // Realtime invalidation on new messages/conversations
  useEffect(() => {
    if (!workspaceId || !live) return;
    let scheduled: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (scheduled) return;
      scheduled = setTimeout(() => {
        scheduled = null;
        qc.invalidateQueries({ queryKey: ["bi.whatsapp", workspaceId] });
      }, 2000);
    };
    const channel = supabase
      .channel(`bi-whatsapp-${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        bump,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        bump,
      )
      .subscribe();
    return () => {
      if (scheduled) clearTimeout(scheduled);
      supabase.removeChannel(channel);
    };
  }, [workspaceId, live, qc]);

  const maxHeat = useMemo(
    () => Math.max(1, ...(data?.peakDayHour ?? []).map((c) => c.messages)),
    [data],
  );

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Failed to load WhatsApp analytics.
        </CardContent>
      </Card>
    );
  }

  const sentimentData = [
    { name: "Positive", value: data.csat.positive, color: "hsl(142 71% 45%)" },
    { name: "Neutral", value: data.csat.neutral, color: "hsl(var(--muted-foreground))" },
    { name: "Negative", value: data.csat.negative, color: "hsl(var(--destructive))" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            WhatsApp Analytics
            {live && (
              <span className="inline-flex items-center gap-1 rounded-control bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500">
                <Radio className="h-3 w-3 animate-pulse" /> Live
              </span>
            )}
          </h2>
          <p className="text-sm text-muted-foreground">
            Realtime messaging, SLA, agent, and conversation metrics — last {days} days.
            {dataUpdatedAt && (
              <span className="ml-2">
                Updated{" "}
                {fmtZoned(new Date(dataUpdatedAt), {
                  hour: "numeric",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLive((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-control border px-3 py-1.5 text-xs font-medium transition-colors ${
              live
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <Radio className={`h-3.5 w-3.5 ${live ? "animate-pulse" : ""}`} />
            {live ? "Live" : "Paused"}
          </button>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 24h</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <KpiCard
          icon={Send}
          label="Messages sent"
          value={fmtNumber(data.messages.sent)}
          hint={`${fmtNumber(data.messages.outbound)} outbound total`}
          pulse={live}
        />
        <KpiCard
          icon={CheckCheck}
          label="Delivery rate"
          value={fmtPct(data.messages.deliveryRate)}
          hint={`${fmtNumber(data.messages.delivered)} delivered`}
          tone={data.messages.deliveryRate >= 95 ? "positive" : "neutral"}
        />
        <KpiCard
          icon={MessageCircle}
          label="Read rate"
          value={fmtPct(data.messages.readRate)}
          hint={`${fmtNumber(data.messages.read)} read`}
        />
        <KpiCard
          icon={XCircle}
          label="Failed"
          value={fmtNumber(data.messages.failed)}
          hint={fmtPct(data.messages.failureRate)}
          tone={data.messages.failureRate > 5 ? "negative" : "neutral"}
        />
        <KpiCard
          icon={Clock}
          label="Avg first response"
          value={fmtDuration(data.conversations.avgResponseSeconds)}
        />
        <KpiCard
          icon={Zap}
          label="Avg resolution"
          value={fmtDuration(data.conversations.avgResolutionSeconds)}
          hint={`${fmtPct(data.conversations.resolutionRate)} resolved`}
        />
      </div>

      <Tabs defaultValue="volume" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="volume">Volume & Delivery</TabsTrigger>
          <TabsTrigger value="response">Response & SLA</TabsTrigger>
          <TabsTrigger value="peak">Peak Hours</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        {/* VOLUME */}
        <TabsContent value="volume" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4" /> Conversation Volume
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.volume}>
                  <defs>
                    <linearGradient id="sentG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="inG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS[1]} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={CHART_COLORS[1]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeOpacity={0.2} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="sent"
                    stroke={CHART_COLORS[0]}
                    fill="url(#sentG)"
                    strokeWidth={2}
                    name="Sent"
                  />
                  <Area
                    type="monotone"
                    dataKey="inbound"
                    stroke={CHART_COLORS[1]}
                    fill="url(#inG)"
                    strokeWidth={2}
                    name="Inbound"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Delivery Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.volume}>
                    <CartesianGrid strokeOpacity={0.2} vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="delivered" name="Delivered" stackId="a" fill={CHART_COLORS[1]} />
                    <Bar dataKey="read" name="Read" stackId="a" fill={CHART_COLORS[0]} />
                    <Bar
                      dataKey="failed"
                      name="Failed"
                      stackId="a"
                      fill="hsl(var(--destructive))"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Message Status Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { label: "Sent", value: data.messages.sent, color: CHART_COLORS[0] },
                    { label: "Delivered", value: data.messages.delivered, color: CHART_COLORS[1] },
                    { label: "Read", value: data.messages.read, color: "hsl(142 71% 45%)" },
                    { label: "Queued", value: data.messages.queued, color: CHART_COLORS[4] },
                    {
                      label: "Failed",
                      value: data.messages.failed,
                      color: "hsl(var(--destructive))",
                    },
                  ].map((row) => {
                    const total = Math.max(1, data.messages.outbound);
                    const pct = (row.value / total) * 100;
                    return (
                      <div key={row.label}>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="font-medium">{row.label}</span>
                          <span className="text-muted-foreground">
                            {fmtNumber(row.value)} · {fmtPct(pct)}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-control bg-muted">
                          <div
                            className="h-full rounded-control transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: row.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* RESPONSE */}
        <TabsContent value="response" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <KpiCard
              icon={Clock}
              label="Avg first response"
              value={fmtDuration(data.conversations.avgResponseSeconds)}
            />
            <KpiCard
              icon={Zap}
              label="Avg resolution"
              value={fmtDuration(data.conversations.avgResolutionSeconds)}
            />
            <KpiCard
              icon={MessageSquare}
              label="Avg conversation"
              value={fmtDuration(data.conversations.avgDurationSeconds)}
            />
            <KpiCard
              icon={TrendingUp}
              label="Resolution rate"
              value={fmtPct(data.conversations.resolutionRate)}
              hint={`${data.conversations.resolved}/${data.conversations.total}`}
              tone={data.conversations.resolutionRate >= 70 ? "positive" : "neutral"}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Response Time Trends (minutes)</CardTitle>
            </CardHeader>
            <CardContent className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.responseTrend}>
                  <CartesianGrid strokeOpacity={0.2} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => `${v.toFixed(1)} min`} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="avgResponseMinutes"
                    stroke={CHART_COLORS[0]}
                    strokeWidth={2}
                    dot={false}
                    name="First response"
                  />
                  <Line
                    type="monotone"
                    dataKey="avgResolutionMinutes"
                    stroke={CHART_COLORS[1]}
                    strokeWidth={2}
                    dot={false}
                    name="Resolution"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PEAK HOURS */}
        <TabsContent value="peak" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Peak Hours (messages per hour of day)</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.peakHours}>
                  <CartesianGrid strokeOpacity={0.2} vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}:00`} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip labelFormatter={(v) => `${v}:00`} />
                  <Legend />
                  <Bar
                    dataKey="messages"
                    name="Messages"
                    fill={CHART_COLORS[0]}
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="conversations"
                    name="Conversations"
                    fill={CHART_COLORS[1]}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity Heatmap (day × hour)</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <div className="min-w-[720px]">
                <div className="mb-1 grid grid-cols-[40px_repeat(24,minmax(0,1fr))] gap-1 pl-1 text-[11px] text-muted-foreground">
                  <div />
                  {Array.from({ length: 24 }).map((_, h) => (
                    <div key={h} className="text-center">
                      {h}
                    </div>
                  ))}
                </div>
                {DAYS.map((label, day) => (
                  <div
                    key={day}
                    className="mb-1 grid grid-cols-[40px_repeat(24,minmax(0,1fr))] items-center gap-1"
                  >
                    <div className="text-[11px] text-muted-foreground">{label}</div>
                    {Array.from({ length: 24 }).map((_, h) => {
                      const cell = data.peakDayHour.find((c) => c.day === day && c.hour === h);
                      const v = cell?.messages ?? 0;
                      return <HeatCell key={h} value={v} intensity={v / maxHeat} />;
                    })}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AGENTS */}
        <TabsContent value="agents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" /> Agent Utilization
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead className="text-right">Conversations</TableHead>
                    <TableHead className="text-right">Messages</TableHead>
                    <TableHead className="text-right">Avg response</TableHead>
                    <TableHead className="text-right">Resolved</TableHead>
                    <TableHead>Utilization</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.agents.map((a) => (
                    <TableRow key={a.userId}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="text-right">{a.conversations}</TableCell>
                      <TableCell className="text-right">{fmtNumber(a.messages)}</TableCell>
                      <TableCell className="text-right">
                        {a.avgResponseMinutes > 0 ? `${a.avgResponseMinutes.toFixed(1)} min` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-emerald-500">{a.resolved}</TableCell>
                      <TableCell className="min-w-[160px]">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-control bg-muted">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${a.utilization}%` }}
                            />
                          </div>
                          <span className="w-10 text-right text-xs text-muted-foreground">
                            {a.utilization.toFixed(0)}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {data.agents.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No agent activity.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* INSIGHTS */}
        <TabsContent value="insights" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <KpiCard
              icon={Smile}
              label="Avg CSAT"
              value={data.csat.avgScore > 0 ? `${data.csat.avgScore.toFixed(1)}/5` : "—"}
              hint={`${data.csat.sampled} analyzed`}
              tone={data.csat.avgScore >= 4 ? "positive" : "neutral"}
            />
            <KpiCard
              icon={Smile}
              label="Positive"
              value={fmtNumber(data.csat.positive)}
              tone="positive"
            />
            <KpiCard icon={Activity} label="Neutral" value={fmtNumber(data.csat.neutral)} />
            <KpiCard
              icon={XCircle}
              label="Negative"
              value={fmtNumber(data.csat.negative)}
              tone="negative"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sentiment Distribution</CardTitle>
              </CardHeader>
              <CardContent className="h-[280px]">
                {data.csat.sampled === 0 ? (
                  <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No sentiment data yet.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip formatter={(v: number) => fmtNumber(v)} />
                      <Pie
                        data={sentimentData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={100}
                        paddingAngle={2}
                      >
                        {sentimentData.map((s, i) => (
                          <Cell key={i} fill={s.color} />
                        ))}
                      </Pie>
                      <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Conversation Categories</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">Sentiment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.categories.map((c) => (
                      <TableRow key={c.category}>
                        <TableCell className="font-medium">{c.category}</TableCell>
                        <TableCell className="text-right">{c.count}</TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={
                              c.avgSentiment > 0.2
                                ? "default"
                                : c.avgSentiment < -0.2
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {c.avgSentiment.toFixed(2)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {data.categories.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          No categories yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Issues</CardTitle>
              </CardHeader>
              <CardContent>
                {data.topIssues.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No issues detected.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {data.topIssues.map((t) => (
                      <Badge
                        key={t.topic}
                        variant="secondary"
                        className="text-xs"
                        style={{
                          fontSize: `${Math.min(1.1, 0.75 + t.count / 40)}rem`,
                        }}
                      >
                        {t.topic}
                        <span className="ml-1 text-muted-foreground">{t.count}</span>
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
