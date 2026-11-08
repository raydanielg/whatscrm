import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppTopbar } from "@/components/app/app-topbar";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { getLivechatAnalytics, type LivechatAnalytics } from "@/lib/livechat/analytics.functions";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Activity,
  Download,
  RefreshCw,
  Radio,
  Users,
  MessageCircle,
  Clock,
  Star,
  Bot,
  Award,
  TrendingUp,
  Globe,
  MapPin,
  Smartphone,
} from "lucide-react";

// The `useQuery` hook works with server functions, but the raw builder pattern
// needs `useServerFn` to wrap. We use the query key + a wrapper here.
export const Route = createFileRoute("/_authenticated/livechat-analytics")({
  head: () => ({
    meta: [
      { title: "Live Chat Analytics" },
      {
        name: "description",
        content:
          "Interactive analytics for visitors, conversations, AI resolution, agent performance and widget engagement.",
      },
    ],
  }),
  component: LivechatAnalyticsPage,
});

const PALETTE = [
  "#075E54",
  "#128C7E",
  "#25D366",
  "#161A1D",
  "#B1A7A6",
  "#D3D3D3",
  "#F59E0B",
  "#6366F1",
  "#0EA5E9",
  "#10B981",
];

function fmtSec(sec: number): string {
  if (!sec || sec < 1) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "live";
}) {
  return (
    <Card className="border">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase text-muted-foreground">{label}</span>
          <Icon
            className={`h-4 w-4 ${tone === "live" ? "text-[#075E54]" : "text-muted-foreground"}`}
          />
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-semibold ">{value}</span>
          {tone === "live" && (
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-[#075E54]" />
          )}
        </div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function downloadCsv(name: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const header = cols.join(",");
  const body = rows
    .map((r) =>
      cols
        .map((c) => {
          const v = r[c];
          const s = v === null || v === undefined ? "" : String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
  const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function LivechatAnalyticsPage() {
  const fmtZoned = useZonedDateFormatter();
  const { active: workspace } = useCurrentWorkspace();
  const workspaceId = workspace?.id;
  const [days, setDays] = useState(30);
  const fetchAnalytics = useServerFn(getLivechatAnalytics);

  const q = useQuery({
    queryKey: ["livechat-analytics", workspaceId, days],
    queryFn: () => fetchAnalytics({ data: { workspaceId: workspaceId!, days } }),
    enabled: !!workspaceId,
    refetchInterval: 30_000,
  });

  const data = q.data as LivechatAnalytics | undefined;

  const exportAll = () => {
    if (!data) return;
    const rows = [{ report: "kpis", ...data.kpis }];
    downloadCsv("livechat-analytics", rows);
  };

  return (
    <>
      <AppTopbar
        title="Live Chat Analytics"
        subtitle="Visitors, conversations, AI resolution, engagement & agent performance"
        actions={
          <div className="flex items-center gap-2">
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="h-9 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="60">Last 60 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => q.refetch()}>
              <RefreshCw className={`h-4 w-4 mr-2 ${q.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={exportAll} disabled={!data}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        }
      />

      <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {!workspaceId && (
          <div className="text-sm text-muted-foreground">Select a workspace to view analytics.</div>
        )}
        {q.isLoading && <div className="text-sm text-muted-foreground">Loading analytics</div>}
        {q.error && <div className="text-sm text-red-600">Failed to load analytics.</div>}

        {data && (
          <>
            {/* Realtime strip */}
            <Card className="border">
              <CardContent className="p-4 flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-[#075E54] animate-pulse" />
                  <span className="text-sm font-medium">Realtime</span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Visitors online: </span>
                  <span className="font-semibold ">{data.kpis.visitorsOnline}</span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Active conversations: </span>
                  <span className="font-semibold ">{data.kpis.activeSessions}</span>
                </div>
                <div className="ml-auto">
                  <Badge variant="secondary">Auto refresh · 30s</Badge>
                </div>
              </CardContent>
            </Card>

            {/* KPI grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard
                icon={Users}
                label="Visitors"
                value={data.kpis.totalVisitors}
                hint={`${data.kpis.returningVisitors} returning`}
              />
              <KpiCard icon={MessageCircle} label="Conversations" value={data.kpis.conversations} />
              <KpiCard icon={Clock} label="Avg response" value={fmtSec(data.kpis.avgResponseSec)} />
              <KpiCard
                icon={Clock}
                label="Avg resolution"
                value={fmtSec(data.kpis.avgResolutionSec)}
              />
              <KpiCard icon={Bot} label="AI resolution" value={`${data.kpis.aiResolutionRate}%`} />
              <KpiCard
                icon={Award}
                label="Human resolution"
                value={`${data.kpis.humanResolutionRate}%`}
              />
              <KpiCard
                icon={Star}
                label="CSAT"
                value={data.kpis.ratingsAvg || "—"}
                hint={`${data.kpis.ratingsCount} rated`}
              />
              <KpiCard icon={TrendingUp} label="Leads generated" value={data.kpis.leads} />
            </div>

            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="conversations">Conversations</TabsTrigger>
                <TabsTrigger value="engagement">Engagement</TabsTrigger>
                <TabsTrigger value="sources">Sources</TabsTrigger>
                <TabsTrigger value="agents">Agents</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center justify-between">
                        Visitors & Conversations
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            downloadCsv(
                              "visitors-conversations",
                              data.series.visitors.map((v, i) => ({
                                day: v.day,
                                visitors: v.value,
                                conversations: data.series.conversations[i]?.value ?? 0,
                              })),
                            )
                          }
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent style={{ height: 260 }}>
                      <ResponsiveContainer>
                        <AreaChart
                          data={data.series.visitors.map((v, i) => ({
                            day: v.day,
                            visitors: v.value,
                            conversations: data.series.conversations[i]?.value ?? 0,
                          }))}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                          <XAxis dataKey="day" fontSize={11} />
                          <YAxis fontSize={11} />
                          <Tooltip />
                          <Legend />
                          <Area
                            type="monotone"
                            dataKey="visitors"
                            stroke="#075E54"
                            fill="#075E54"
                            fillOpacity={0.2}
                          />
                          <Area
                            type="monotone"
                            dataKey="conversations"
                            stroke="#161A1D"
                            fill="#161A1D"
                            fillOpacity={0.15}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Returning visitors</CardTitle>
                    </CardHeader>
                    <CardContent style={{ height: 260 }}>
                      <ResponsiveContainer>
                        <LineChart data={data.series.returning}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                          <XAxis dataKey="day" fontSize={11} />
                          <YAxis fontSize={11} />
                          <Tooltip />
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke="#128C7E"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">AI vs Human resolution</CardTitle>
                    </CardHeader>
                    <CardContent style={{ height: 260 }}>
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie
                            data={[
                              { name: "AI resolved", value: data.kpis.aiResolutionRate },
                              { name: "Human resolved", value: data.kpis.humanResolutionRate },
                            ]}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={60}
                            outerRadius={90}
                            label
                          >
                            <Cell fill="#075E54" />
                            <Cell fill="#161A1D" />
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">CSAT distribution</CardTitle>
                    </CardHeader>
                    <CardContent style={{ height: 260 }}>
                      <ResponsiveContainer>
                        <BarChart data={data.ratings}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                          <XAxis dataKey="name" fontSize={11} />
                          <YAxis fontSize={11} />
                          <Tooltip />
                          <Bar dataKey="value" fill="#075E54" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="conversations" className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Conversations per day</CardTitle>
                    </CardHeader>
                    <CardContent style={{ height: 300 }}>
                      <ResponsiveContainer>
                        <BarChart data={data.series.conversations}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                          <XAxis dataKey="day" fontSize={11} />
                          <YAxis fontSize={11} />
                          <Tooltip />
                          <Bar dataKey="value" fill="#161A1D" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center justify-between">
                        By language <Globe className="h-3.5 w-3.5" />
                      </CardTitle>
                    </CardHeader>
                    <CardContent style={{ height: 300 }}>
                      <ResponsiveContainer>
                        <BarChart layout="vertical" data={data.byLanguage}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                          <XAxis type="number" fontSize={11} />
                          <YAxis type="category" dataKey="name" fontSize={11} width={80} />
                          <Tooltip />
                          <Bar dataKey="value" fill="#075E54" radius={[0, 6, 6, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="engagement" className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Widget engagement funnel</CardTitle>
                    </CardHeader>
                    <CardContent style={{ height: 320 }}>
                      <ResponsiveContainer>
                        <FunnelChart>
                          <Tooltip />
                          <Funnel
                            dataKey="value"
                            data={data.funnel.map((f, i) => ({ ...f, fill: PALETTE[i] }))}
                            isAnimationActive
                          >
                            <LabelList position="right" dataKey="name" />
                          </Funnel>
                        </FunnelChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center justify-between">
                        Top pages <Activity className="h-3.5 w-3.5" />
                      </CardTitle>
                    </CardHeader>
                    <CardContent style={{ height: 320 }}>
                      <ResponsiveContainer>
                        <BarChart layout="vertical" data={data.topPages}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                          <XAxis type="number" fontSize={11} />
                          <YAxis type="category" dataKey="name" fontSize={10} width={180} />
                          <Tooltip />
                          <Bar dataKey="value" fill="#128C7E" radius={[0, 6, 6, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center justify-between">
                        By device <Smartphone className="h-3.5 w-3.5" />
                      </CardTitle>
                    </CardHeader>
                    <CardContent style={{ height: 260 }}>
                      <ResponsiveContainer>
                        <PieChart>
                          <Pie
                            data={data.byDevice}
                            dataKey="value"
                            nameKey="name"
                            outerRadius={90}
                            label
                          >
                            {data.byDevice.map((_, i) => (
                              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">By browser</CardTitle>
                    </CardHeader>
                    <CardContent style={{ height: 260 }}>
                      <ResponsiveContainer>
                        <BarChart data={data.byBrowser}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                          <XAxis dataKey="name" fontSize={11} />
                          <YAxis fontSize={11} />
                          <Tooltip />
                          <Bar dataKey="value" fill="#161A1D" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="sources" className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Top referrers</CardTitle>
                    </CardHeader>
                    <CardContent style={{ height: 320 }}>
                      <ResponsiveContainer>
                        <BarChart layout="vertical" data={data.topReferrers}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                          <XAxis type="number" fontSize={11} />
                          <YAxis type="category" dataKey="name" fontSize={10} width={180} />
                          <Tooltip />
                          <Bar dataKey="value" fill="#075E54" radius={[0, 6, 6, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Top UTM source</CardTitle>
                    </CardHeader>
                    <CardContent style={{ height: 320 }}>
                      <ResponsiveContainer>
                        <BarChart layout="vertical" data={data.topUtmSource}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                          <XAxis type="number" fontSize={11} />
                          <YAxis type="category" dataKey="name" fontSize={10} width={140} />
                          <Tooltip />
                          <Bar dataKey="value" fill="#128C7E" radius={[0, 6, 6, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="lg:col-span-2">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center justify-between">
                        By country <MapPin className="h-3.5 w-3.5" />
                      </CardTitle>
                    </CardHeader>
                    <CardContent style={{ height: 320 }}>
                      <ResponsiveContainer>
                        <BarChart data={data.byCountry}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                          <XAxis dataKey="name" fontSize={11} />
                          <YAxis fontSize={11} />
                          <Tooltip />
                          <Bar dataKey="value" fill="#075E54" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="agents" className="space-y-4">
                <Card>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm">Agent performance</CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => downloadCsv("agent-performance", data.agents as never)}
                    >
                      <Download className="h-3.5 w-3.5 mr-2" /> CSV
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-xs text-muted-foreground border-b">
                          <tr>
                            <th className="text-left py-2 pr-4">Agent</th>
                            <th className="text-right py-2 pr-4">Handled</th>
                            <th className="text-right py-2 pr-4">Avg response</th>
                            <th className="text-right py-2 pr-4">Avg resolution</th>
                            <th className="text-right py-2">CSAT</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.agents.map((a) => (
                            <tr key={a.id} className="border-b last:border-0">
                              <td className="py-2 pr-4">{a.name}</td>
                              <td className="py-2 pr-4 text-right ">{a.handled}</td>
                              <td className="py-2 pr-4 text-right ">
                                {fmtSec(a.avgResponseSec)}
                              </td>
                              <td className="py-2 pr-4 text-right ">
                                {fmtSec(a.avgResolutionSec)}
                              </td>
                              <td className="py-2 text-right ">{a.rating ?? "—"}</td>
                            </tr>
                          ))}
                          {!data.agents.length && (
                            <tr>
                              <td colSpan={5} className="py-6 text-center text-muted-foreground">
                                No agent activity in this range.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Handled by agent</CardTitle>
                  </CardHeader>
                  <CardContent style={{ height: 320 }}>
                    <ResponsiveContainer>
                      <BarChart data={data.agents}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                        <XAxis
                          dataKey="name"
                          fontSize={11}
                          interval={0}
                          angle={-15}
                          textAnchor="end"
                          height={60}
                        />
                        <YAxis fontSize={11} />
                        <Tooltip />
                        <Bar dataKey="handled" fill="#075E54" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <div className="text-xs text-muted-foreground">
              Generated{" "}
              {fmtZoned(new Date(data.generatedAt), { dateStyle: "medium", timeStyle: "short" })} ·
              Range: last {data.range.days} days
            </div>
          </>
        )}
      </div>
    </>
  );
}
