import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Loader2, MessageSquare, MousePointerClick, Timer, Target, Star, Users, Globe, TrendingUp } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { useState } from "react";
import { getWidgetAnalytics } from "@/lib/widgets/widgets.functions";

function fmtMs(ms: number) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}
function fmtSec(sec: number) {
  if (!sec) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}
function fmtPct(n: number) { return `${(n * 100).toFixed(1)}%`; }

export function WidgetAnalyticsDashboard({ widgetId }: { widgetId: string }) {
  const [days, setDays] = useState<number>(14);
  const q = useQuery({
    queryKey: ["widget-analytics", widgetId, days],
    queryFn: () => getWidgetAnalytics({ data: { widgetId, days } }),
  });

  if (q.isLoading) return <div className="grid h-40 place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  const data = q.data;
  if (!data) return null;

  const kpis = [
    { label: "Page loads", value: data.totals.loads.toLocaleString(), icon: MousePointerClick, hint: "Widget script served" },
    { label: "Widget opens", value: data.totals.opens.toLocaleString(), icon: TrendingUp, hint: fmtPct(data.derived.engagementRate) + " engagement" },
    { label: "Messages", value: data.totals.messages.toLocaleString(), icon: MessageSquare, hint: `${data.derived.messagesPerSession.toFixed(1)} / session` },
    { label: "Sessions", value: data.totals.sessions.toLocaleString(), icon: Users, hint: fmtSec(data.derived.avgSessionSec) + " avg" },
    { label: "Conversions", value: data.totals.conversions.toLocaleString(), icon: Target, hint: fmtPct(data.derived.conversionRate) + " rate" },
    { label: "Avg response", value: fmtMs(data.derived.avgResponseMs), icon: Timer, hint: `p50 ${fmtMs(data.derived.medianResponseMs)}` },
    { label: "CSAT", value: data.derived.csatAvg != null ? `${data.derived.csatAvg} / 5` : "—", icon: Star, hint: `${data.derived.csatCount} ratings` },
    { label: "Countries", value: data.topCountries.length.toLocaleString(), icon: Globe, hint: data.topCountries[0]?.country ?? "No data yet" },
  ];

  const maxHourly = Math.max(1, ...data.hourly.map((h) => h.messages + h.opens));

  return (
    <div className="grid gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-xl">Analytics</h2>
          <p className="text-muted-foreground text-sm">Message counts, response times, and conversions for this widget.</p>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="14">Last 14 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="60">Last 60 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI grid */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map(({ label, value, icon: Icon, hint }) => (
          <Card key={label} className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-xs uppercase tracking-wide">{label}</p>
              <Icon className="size-4 text-muted-foreground" />
            </div>
            <p className="mt-2 font-bold text-xl">{value}</p>
            <p className="mt-1 text-muted-foreground text-xs">{hint}</p>
          </Card>
        ))}
      </div>

      {/* Conversion funnel */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">Conversion funnel</h3>
          <Badge variant="secondary">{fmtPct(data.derived.conversionRate)} end-to-end</Badge>
        </div>
        <div className="mt-4 grid gap-3">
          {[
            { label: "Loads", value: data.totals.loads, base: data.totals.loads },
            { label: "Opens", value: data.totals.opens, base: data.totals.loads },
            { label: "Messages", value: data.totals.messages, base: data.totals.loads },
            { label: "Conversions", value: data.totals.conversions, base: data.totals.loads },
          ].map((s) => {
            const pct = s.base ? (s.value / s.base) * 100 : 0;
            return (
              <div key={s.label}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{s.label}</span>
                  <span className="text-muted-foreground">{s.value.toLocaleString()} · {pct.toFixed(1)}%</span>
                </div>
                <Progress value={pct} className="mt-1 h-2" />
              </div>
            );
          })}
        </div>
      </Card>

      {/* Time series */}
      <Card className="p-6">
        <h3 className="font-bold text-lg">Volume over time</h3>
        <div className="mt-4 h-72">
          <ResponsiveContainer>
            <AreaChart data={data.series}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="day" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="loads" name="Loads" stroke="hsl(var(--chart-1))" fill="hsl(var(--chart-1))" fillOpacity={0.2} />
              <Area type="monotone" dataKey="opens" name="Opens" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2))" fillOpacity={0.2} />
              <Area type="monotone" dataKey="messages" name="Messages" stroke="hsl(var(--chart-3))" fill="hsl(var(--chart-3))" fillOpacity={0.2} />
              <Area type="monotone" dataKey="conversions" name="Conversions" stroke="hsl(var(--chart-4))" fill="hsl(var(--chart-4))" fillOpacity={0.3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Hourly activity */}
      <Card className="p-6">
        <h3 className="font-bold text-lg">Activity by hour (UTC)</h3>
        <div className="mt-4 h-64">
          <ResponsiveContainer>
            <BarChart data={data.hourly}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="hour" fontSize={11} />
              <YAxis fontSize={11} domain={[0, maxHourly]} />
              <Tooltip />
              <Legend />
              <Bar dataKey="opens" name="Opens" fill="hsl(var(--chart-2))" />
              <Bar dataKey="messages" name="Messages" fill="hsl(var(--chart-3))" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Breakdowns */}
      <div className="grid gap-6 lg:grid-cols-3">
        <BreakdownCard title="Top pages" empty="No page data yet." rows={data.topPages.map((p) => ({ label: p.url, count: p.count, href: p.url }))} />
        <BreakdownCard title="Top referrers" empty="No referrer data yet." rows={data.topReferrers.map((r) => ({ label: r.host, count: r.count }))} />
        <BreakdownCard title="Top countries" empty="No country data yet." rows={data.topCountries.map((c) => ({ label: c.country, count: c.count }))} />
      </div>
    </div>
  );
}

function BreakdownCard({ title, rows, empty }: { title: string; rows: { label: string; count: number; href?: string }[]; empty: string }) {
  const total = rows.reduce((a, b) => a + b.count, 0);
  return (
    <Card className="p-6">
      <h3 className="font-bold text-lg">{title}</h3>
      <div className="mt-4 grid gap-2">
        {rows.length === 0 && <p className="text-muted-foreground text-sm">{empty}</p>}
        {rows.map((r) => {
          const pct = total ? (r.count / total) * 100 : 0;
          return (
            <div key={r.label} className="text-sm">
              <div className="flex items-center justify-between gap-2">
                {r.href ? (
                  <a href={r.href} target="_blank" rel="noreferrer" className="truncate hover:underline">{r.label}</a>
                ) : (
                  <span className="truncate">{r.label}</span>
                )}
                <Badge variant="secondary">{r.count.toLocaleString()}</Badge>
              </div>
              <Progress value={pct} className="mt-1 h-1.5" />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
