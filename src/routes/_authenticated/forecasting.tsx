import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
} from "recharts";
import {
  TrendingUp,
  DollarSign,
  Target,
  Trophy,
  Zap,
  Percent,
  Clock,
  Activity,
  Download,
  PieChart as PieIcon,
  BarChart3,
} from "lucide-react";
import { useForecasting, downloadCsv, type ForecastPeriod } from "@/hooks/use-forecasting";

import { useCurrencyFormatter } from "@/hooks/use-currency";
export const Route = createFileRoute("/_authenticated/forecasting")({
  component: ForecastingPage,
  staticData: { breadcrumb: "Forecasting" },
  head: () => ({
    meta: [
      { title: "Forecasting & Analytics" },
      {
        name: "description",
        content:
          "Real-time revenue forecast, pipeline value, win rate, sales velocity, forecast accuracy, agent leaderboards, and sales goals.",
      },
    ],
  }),
});

function ForecastingPage() {
  const money = useCurrencyFormatter({ maximumFractionDigits: 0 });
  const [period, setPeriod] = useState<ForecastPeriod>("month");
  const f = useForecasting(period);

  const forecastChartData = useMemo(
    () => [
      { name: "Worst case", value: f.forecast.worstCase, color: "hsl(var(--muted-foreground))" },
      { name: "Commit", value: f.forecast.commit, color: "hsl(var(--primary))" },
      { name: "Weighted", value: f.forecast.weighted, color: "hsl(217 91% 60%)" },
      { name: "Best case", value: f.forecast.bestCase, color: "hsl(142 76% 45%)" },
    ],
    [f.forecast],
  );

  const dealStageData = useMemo(() => {
    const byProb = { "0-25%": 0, "26-50%": 0, "51-75%": 0, "76-99%": 0 };
    for (const d of f.deals) {
      if (d.status !== "open") continue;
      const p = Number(d.probability);
      if (p <= 25) byProb["0-25%"] += Number(d.amount);
      else if (p <= 50) byProb["26-50%"] += Number(d.amount);
      else if (p <= 75) byProb["51-75%"] += Number(d.amount);
      else byProb["76-99%"] += Number(d.amount);
    }
    return Object.entries(byProb).map(([name, value]) => ({ name, value }));
  }, [f.deals]);

  const goalProgress = useMemo(() => {
    // Simple revenue-metric goal progress against current period range
    return f.goals
      .filter((g) => g.metric === "revenue" || g.metric === "deals_won" || g.metric === "pipeline")
      .slice(0, 4)
      .map((g) => {
        const start = new Date(g.starts_on);
        const end = new Date(g.ends_on);
        const value = f.deals
          .filter((d) => {
            if (g.metric === "pipeline")
              return (
                d.status === "open" &&
                d.expected_close_date &&
                new Date(d.expected_close_date) >= start &&
                new Date(d.expected_close_date) <= end
              );
            if (d.status !== "won") return false;
            const at = new Date(d.actual_close_date ?? d.updated_at);
            return at >= start && at <= end;
          })
          .reduce((s, d) => s + (g.metric === "deals_won" ? 1 : Number(d.amount)), 0);
        return {
          ...g,
          value,
          pct: g.target_amount > 0 ? Math.min(100, (value / Number(g.target_amount)) * 100) : 0,
        };
      });
  }, [f.goals, f.deals]);

  const exportForecast = () => {
    downloadCsv(`forecast-${period}.csv`, [
      { metric: "Best case", value: f.forecast.bestCase },
      { metric: "Commit", value: f.forecast.commit },
      { metric: "Worst case", value: f.forecast.worstCase },
      { metric: "Weighted", value: f.forecast.weighted },
      { metric: "Closed won", value: f.forecast.closedWon },
      { metric: "Open deals", value: f.forecast.openCount },
      { metric: "Win rate %", value: f.kpis.winRate.toFixed(1) },
      { metric: "Avg cycle days", value: f.kpis.avgCycleDays.toFixed(1) },
      { metric: "Sales velocity/day", value: f.kpis.salesVelocity.toFixed(0) },
      { metric: "Pipeline value", value: f.kpis.pipelineValue },
    ]);
  };

  const exportLeaderboard = () => {
    downloadCsv(
      `leaderboard-${period}.csv`,
      f.leaderboard.map((r) => ({
        agent: r.name,
        revenue: r.revenue,
        deals_won: r.wonCount,
        open_deals: r.openCount,
        weighted_pipeline: Math.round(r.weighted),
      })),
    );
  };

  return (
    <>
      <AppTopbar
        title="Forecasting"
        subtitle="Real-time revenue, pipeline health, and team performance"
        actions={
          <Button variant="outline" size="sm" onClick={exportForecast} className="gap-2">
            <Download className="h-4 w-4" />
            Export report
          </Button>
        }
      />
      <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as ForecastPeriod)}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">This month</SelectItem>
              <SelectItem value="quarter">This quarter</SelectItem>
              <SelectItem value="year">This year</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="outline" className="gap-1">
            <Activity className="h-3 w-3 text-emerald-500 animate-pulse" />
            live
          </Badge>
          <span className="text-sm text-muted-foreground">{f.range.label}</span>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi
            label="Weighted forecast"
            value={money(f.forecast.weighted)}
            icon={<TrendingUp className="h-4 w-4" />}
            tone="text-primary"
            sub={`${f.forecast.openCount} open deals`}
          />
          <Kpi
            label="Pipeline value"
            value={money(f.kpis.pipelineValue)}
            icon={<DollarSign className="h-4 w-4" />}
            tone="text-blue-500"
          />
          <Kpi
            label="Win rate"
            value={`${f.kpis.winRate.toFixed(1)}%`}
            icon={<Trophy className="h-4 w-4" />}
            tone="text-amber-500"
            sub={`${f.kpis.wonCount} won · ${f.kpis.lostCount} lost`}
          />
          <Kpi
            label="Sales velocity"
            value={money(f.kpis.salesVelocity)}
            icon={<Zap className="h-4 w-4" />}
            tone="text-emerald-500"
            sub="per day"
          />
          <Kpi
            label="Avg cycle"
            value={`${f.kpis.avgCycleDays.toFixed(0)}d`}
            icon={<Clock className="h-4 w-4" />}
            tone="text-purple-500"
          />
          <Kpi
            label="Conversion rate"
            value={`${f.kpis.conversionRate.toFixed(1)}%`}
            icon={<Percent className="h-4 w-4" />}
            tone="text-pink-500"
          />
          <Kpi
            label="Closed this period"
            value={money(f.forecast.closedWon)}
            icon={<Target className="h-4 w-4" />}
            tone="text-emerald-500"
          />
          <Kpi
            label="Avg deal size"
            value={money(f.kpis.avgDealSize)}
            icon={<BarChart3 className="h-4 w-4" />}
            tone="text-orange-500"
          />
        </div>

        {/* Revenue snapshot */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <RevenueCard
            label="Monthly revenue"
            value={f.monthly_revenue}
            sub={f.monthRange.label}
            tone="from-primary/20"
          />
          <RevenueCard
            label="Quarterly revenue"
            value={f.quarterly_revenue}
            sub={f.quarterRange.label}
            tone="from-blue-500/20"
          />
          <RevenueCard
            label="Yearly revenue"
            value={f.yearly_revenue}
            sub={f.yearRange.label}
            tone="from-emerald-500/20"
          />
        </div>

        <Tabs defaultValue="forecast" className="w-full">
          <TabsList>
            <TabsTrigger value="forecast">Forecast</TabsTrigger>
            <TabsTrigger value="accuracy">Accuracy</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="goals">Goals</TabsTrigger>
          </TabsList>

          {/* --- Forecast tab --- */}
          <TabsContent value="forecast" className="space-y-3 mt-3">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="h-4 w-4" />
                    Revenue trend (last 12 months)
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer>
                    <AreaChart data={f.monthly}>
                      <defs>
                        <linearGradient id="gWon" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(142 76% 45%)" stopOpacity={0.6} />
                          <stop offset="100%" stopColor="hsl(142 76% 45%)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gWeighted" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="label" fontSize={11} />
                      <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: number) => money(v)} />
                      <Legend />
                      <Area
                        type="monotone"
                        dataKey="won"
                        name="Closed won"
                        stroke="hsl(142 76% 45%)"
                        fill="url(#gWon)"
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        dataKey="weighted"
                        name="Weighted forecast"
                        stroke="hsl(var(--primary))"
                        fill="url(#gWeighted)"
                        strokeWidth={2}
                      />
                      <Line
                        type="monotone"
                        dataKey="forecast"
                        name="Best-case pipeline"
                        stroke="hsl(217 91% 60%)"
                        strokeDasharray="4 4"
                        strokeWidth={2}
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <PieIcon className="h-4 w-4" />
                    Forecast scenarios
                  </CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer>
                    <BarChart data={forecastChartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis
                        type="number"
                        fontSize={11}
                        tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                      />
                      <YAxis type="category" dataKey="name" fontSize={11} width={90} />
                      <Tooltip formatter={(v: number) => money(v)} />
                      <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                        {forecastChartData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Deal forecast by probability</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer>
                  <BarChart data={dealStageData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="name" fontSize={11} />
                    <YAxis fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => money(v)} />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* --- Accuracy tab --- */}
          <TabsContent value="accuracy" className="space-y-3 mt-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Forecast accuracy — last 6 months</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Compares weighted forecast against actual closed-won revenue.
                </p>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer>
                  <LineChart data={f.accuracy}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="label" fontSize={11} />
                    <YAxis
                      yAxisId="left"
                      fontSize={11}
                      tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      fontSize={11}
                      tickFormatter={(v) => `${v}%`}
                      domain={[0, 100]}
                    />
                    <Tooltip
                      formatter={(v: number, name: string) =>
                        name === "Accuracy" ? `${v.toFixed(0)}%` : money(v)
                      }
                    />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="predicted"
                      name="Predicted"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                    />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="actual"
                      name="Actual"
                      stroke="hsl(142 76% 45%)"
                      strokeWidth={2}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="accuracy"
                      name="Accuracy"
                      stroke="hsl(45 100% 55%)"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* --- Team tab --- */}
          <TabsContent value="team" className="space-y-3 mt-3">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Trophy className="h-4 w-4" />
                  Leaderboard — {f.range.label}
                </CardTitle>
                <Button variant="outline" size="sm" onClick={exportLeaderboard} className="gap-2">
                  <Download className="h-3.5 w-3.5" />
                  Export
                </Button>
              </CardHeader>
              <CardContent>
                {f.leaderboard.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    No agent activity in this period yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {f.leaderboard.map((row, i) => {
                      const topRevenue = f.leaderboard[0]?.revenue || 1;
                      const pct = topRevenue ? (row.revenue / topRevenue) * 100 : 0;
                      return (
                        <div
                          key={row.id}
                          className="flex items-center gap-3 p-2 rounded-control hover:bg-muted/50 transition-colors"
                        >
                          <div className="w-8 text-center font-bold text-muted-foreground">
                            {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                          </div>
                          <Avatar className="h-9 w-9">
                            {row.avatar_url && <AvatarImage src={row.avatar_url} />}
                            <AvatarFallback>{row.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium truncate">{row.name}</p>
                              <p className="font-semibold ">{money(row.revenue)}</p>
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                              <Progress value={pct} className="h-1.5 flex-1" />
                              <span className="text-[11px] text-muted-foreground shrink-0">
                                {row.wonCount} won · {row.openCount} open · {money(row.weighted)}{" "}
                                weighted
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Revenue split by agent</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={f.leaderboard.filter((r) => r.revenue > 0).slice(0, 8)}
                      dataKey="revenue"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={(e) => e.name}
                    >
                      {f.leaderboard.slice(0, 8).map((_, i) => (
                        <Cell key={i} fill={`hsl(${(i * 45) % 360} 70% 55%)`} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => money(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* --- Goals tab --- */}
          <TabsContent value="goals" className="space-y-3 mt-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Active sales goals
                </CardTitle>
              </CardHeader>
              <CardContent>
                {goalProgress.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    No active goals yet. Create goals from Settings → Sales goals to track team
                    targets.
                  </p>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {goalProgress.map((g) => (
                      <div key={g.id} className="rounded-control border p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{g.name}</p>
                            <p className="text-xs text-muted-foreground capitalize">
                              {g.metric.replace(/_/g, " ")} · {g.period}
                            </p>
                          </div>
                          <Badge
                            variant={
                              g.pct >= 100 ? "default" : g.pct >= 70 ? "secondary" : "outline"
                            }
                          >
                            {g.pct.toFixed(0)}%
                          </Badge>
                        </div>
                        <Progress value={g.pct} className="h-2" />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {g.metric === "deals_won"
                              ? `${g.value} deals`
                              : money(g.value, g.currency)}
                          </span>
                          <span>
                            Target:{" "}
                            {g.metric === "deals_won"
                              ? `${g.target_amount}`
                              : money(Number(g.target_amount), g.currency)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function Kpi({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-[11px] uppercase text-muted-foreground truncate">{label}</p>
          <p className="text-xl font-bold mt-0.5 ">{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
        </div>
        <div className={`shrink-0 ${tone}`}>{icon}</div>
      </div>
    </Card>
  );
}

function RevenueCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub: string;
  tone: string;
}) {
  const money = useCurrencyFormatter({ maximumFractionDigits: 0 });
  return (
    <Card className={`p-5 bg-gradient-to-br ${tone} to-transparent border`}>
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="text-3xl font-bold mt-1 ">{money(value)}</p>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
    </Card>
  );
}
