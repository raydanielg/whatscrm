import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
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
  TrendingUp,
  Target,
  DollarSign,
  Users,
  Activity,
  Percent,
  Timer,
  Award,
  Trophy,
  XCircle,
  Loader2,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getCrmSalesAnalytics } from "@/lib/bi/crm-sales.functions";
import { useCurrencyFormatter } from "@/hooks/use-currency";

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
const fmtDays = (n: number) => `${n.toFixed(1)}d`;

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  tone?: "positive" | "negative" | "neutral";
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
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

export function CrmSalesAnalytics({ workspaceId }: { workspaceId: string }) {
  // Pipeline, LTV and CAC are tenant-level aggregates, so they render in the
  // tenant's currency rather than a hardcoded USD.
  const fmtCurrency = useCurrencyFormatter({ maximumFractionDigits: 0 });
  const [days, setDays] = useState(90);
  const fn = useServerFn(getCrmSalesAnalytics);
  const { data, isLoading, error } = useQuery({
    queryKey: ["bi.crm-sales", workspaceId, days],
    enabled: !!workspaceId,
    queryFn: () => fn({ data: { workspaceId, days } }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const funnelData = useMemo(
    () =>
      (data?.funnel ?? [])
        .filter((f) => f.deals > 0)
        .sort((a, b) => a.position - b.position)
        .map((f, i) => ({ ...f, fill: CHART_COLORS[i % CHART_COLORS.length] })),
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
          Failed to load CRM & Sales analytics.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">CRM & Sales Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Lead sources, pipeline health, revenue, and forecast — last {days} days.
          </p>
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="180">Last 6 months</SelectItem>
            <SelectItem value="365">Last 12 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI strip */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <KpiCard
          icon={DollarSign}
          label="Pipeline value"
          value={fmtCurrency(data.pipeline.totalValue)}
          hint={`${fmtCurrency(data.pipeline.weightedValue)} weighted`}
        />
        <KpiCard
          icon={Trophy}
          label="Revenue (won)"
          value={fmtCurrency(data.winLoss.wonValue)}
          hint={`${data.winLoss.won} deals`}
          tone="positive"
        />
        <KpiCard
          icon={Percent}
          label="Win rate"
          value={fmtPct(data.winLoss.winRate)}
          hint={`${data.winLoss.won} won · ${data.winLoss.lost} lost`}
        />
        <KpiCard
          icon={Target}
          label="Avg deal size"
          value={fmtCurrency(data.pipeline.avgDealSize)}
        />
        <KpiCard
          icon={Timer}
          label="Sales cycle"
          value={fmtDays(data.winLoss.avgSalesCycleDays)}
          hint={`Velocity ${fmtDays(data.pipeline.avgVelocityDays)}/stage`}
        />
        <KpiCard
          icon={Users}
          label="Customer LTV"
          value={fmtCurrency(data.ltv.avgLtv)}
          hint={`${data.ltv.totalCustomers} customers`}
        />
      </div>

      <Tabs defaultValue="pipeline" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="pipeline">Pipeline & Funnel</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="forecast">Forecast</TabsTrigger>
        </TabsList>

        {/* PIPELINE & FUNNEL */}
        <TabsContent value="pipeline" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4" /> Sales Funnel
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[320px]">
                {funnelData.length === 0 ? (
                  <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No pipeline data yet.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <FunnelChart>
                      <Tooltip
                        formatter={(value: number, name: string) =>
                          name === "value" ? fmtCurrency(value) : fmtNumber(value)
                        }
                      />
                      <Funnel dataKey="deals" data={funnelData} isAnimationActive>
                        <LabelList
                          position="right"
                          dataKey="stage"
                          className="fill-foreground text-xs"
                          stroke="none"
                        />
                        <LabelList
                          position="center"
                          dataKey="deals"
                          className="fill-primary-foreground text-xs font-semibold"
                          stroke="none"
                        />
                      </Funnel>
                    </FunnelChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pipeline Value by Stage</CardTitle>
              </CardHeader>
              <CardContent className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnelData} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid horizontal={false} strokeOpacity={0.2} />
                    <XAxis type="number" tickFormatter={(v) => fmtCurrency(v as number)} tick={{ fontSize: 11 }} />
                    <YAxis dataKey="stage" type="category" width={110} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => fmtCurrency(v)} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {funnelData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <KpiCard icon={Activity} label="Open deals" value={fmtNumber(data.pipeline.openDeals)} />
            <KpiCard
              icon={TrendingUp}
              label="Weighted pipeline"
              value={fmtCurrency(data.pipeline.weightedValue)}
            />
            <KpiCard
              icon={Timer}
              label="Avg stage velocity"
              value={fmtDays(data.pipeline.avgVelocityDays)}
            />
            <KpiCard
              icon={XCircle}
              label="Stagnant deals"
              value={fmtNumber(data.pipeline.stagnantDeals)}
              hint=">30 days idle"
              tone={data.pipeline.stagnantDeals > 0 ? "negative" : "neutral"}
            />
          </div>
        </TabsContent>

        {/* LEADS */}
        <TabsContent value="leads" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <KpiCard icon={Users} label="Total leads" value={fmtNumber(data.leadConversion.total)} />
            <KpiCard
              icon={Target}
              label="Qualification rate"
              value={fmtPct(data.leadConversion.qualificationRate)}
              hint={`${data.leadConversion.qualified} qualified`}
            />
            <KpiCard
              icon={Trophy}
              label="Conversion rate"
              value={fmtPct(data.leadConversion.conversionRate)}
              hint={`${data.leadConversion.converted} converted`}
              tone="positive"
            />
            <KpiCard
              icon={Timer}
              label="Avg time to convert"
              value={fmtDays(data.leadConversion.avgDaysToConvert)}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-base">Lead Sources</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.leadSources}>
                      <CartesianGrid strokeOpacity={0.2} vertical={false} />
                      <XAxis dataKey="source" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="total" name="Leads" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                      <Bar
                        dataKey="converted"
                        name="Converted"
                        fill={CHART_COLORS[1]}
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Source Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Leads</TableHead>
                      <TableHead className="text-right">Conv. rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.leadSources.slice(0, 8).map((s) => (
                      <TableRow key={s.source}>
                        <TableCell className="font-medium">{s.source}</TableCell>
                        <TableCell className="text-right">{fmtNumber(s.total)}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={s.conversionRate > 20 ? "default" : "secondary"}>
                            {fmtPct(s.conversionRate)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {data.leadSources.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          No leads
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* PERFORMANCE */}
        <TabsContent value="performance" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Award className="h-4 w-4" /> Top Sales Agents
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Agent</TableHead>
                      <TableHead className="text-right">Won</TableHead>
                      <TableHead className="text-right">Lost</TableHead>
                      <TableHead className="text-right">Open</TableHead>
                      <TableHead className="text-right">Win %</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.agents.map((a) => (
                      <TableRow key={a.ownerId}>
                        <TableCell className="font-medium">{a.name}</TableCell>
                        <TableCell className="text-right text-emerald-500">{a.won}</TableCell>
                        <TableCell className="text-right text-destructive">{a.lost}</TableCell>
                        <TableCell className="text-right">{a.open}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={a.winRate >= 50 ? "default" : "secondary"}>
                            {fmtPct(a.winRate)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {fmtCurrency(a.revenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {data.agents.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No agent activity in this period.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <XCircle className="h-4 w-4" /> Loss Reasons
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[300px]">
                {data.lossReasons.length === 0 ? (
                  <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No lost deals in this range.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip formatter={(v: number) => fmtNumber(v)} />
                      <Pie
                        data={data.lossReasons}
                        dataKey="count"
                        nameKey="reason"
                        outerRadius={100}
                        innerRadius={50}
                        paddingAngle={2}
                      >
                        {data.lossReasons.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Legend
                        verticalAlign="bottom"
                        wrapperStyle={{ fontSize: 11 }}
                        formatter={(v) => v}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* REVENUE */}
        <TabsContent value="revenue" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <KpiCard
              icon={DollarSign}
              label="Total revenue"
              value={fmtCurrency(data.ltv.totalRevenue)}
              tone="positive"
            />
            <KpiCard
              icon={Users}
              label="Paying customers"
              value={fmtNumber(data.ltv.totalCustomers)}
            />
            <KpiCard
              icon={TrendingUp}
              label="Customer LTV"
              value={fmtCurrency(data.ltv.avgLtv)}
            />
            <KpiCard
              icon={Target}
              label="Est. CAC"
              value={fmtCurrency(data.cac.estimatedCac)}
              hint={`Spend ${fmtCurrency(data.cac.totalSpend)}`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revenue Trend</CardTitle>
            </CardHeader>
            <CardContent className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.revenueTrend}>
                  <CartesianGrid strokeOpacity={0.2} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtCurrency(v as number)} />
                  <Tooltip formatter={(v: number) => fmtCurrency(v)} />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke={CHART_COLORS[0]}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {data.dealSizeTrend.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Average Deal Size Trend</CardTitle>
              </CardHeader>
              <CardContent className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.dealSizeTrend}>
                    <CartesianGrid strokeOpacity={0.2} vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtCurrency(v as number)} />
                    <Tooltip formatter={(v: number) => fmtCurrency(v)} />
                    <Bar dataKey="avg" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* FORECAST */}
        <TabsContent value="forecast" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4" /> Revenue Forecast (next 6 months)
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.forecast}>
                  <CartesianGrid strokeOpacity={0.2} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtCurrency(v as number)} />
                  <Tooltip formatter={(v: number) => fmtCurrency(v)} />
                  <Legend />
                  <Bar
                    dataKey="projected"
                    name="Projected (pipeline)"
                    fill={CHART_COLORS[2]}
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="weightedPipeline"
                    name="Weighted (probability)"
                    fill={CHART_COLORS[0]}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Forecast Details</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Projected</TableHead>
                    <TableHead className="text-right">Weighted (probability)</TableHead>
                    <TableHead className="text-right">Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.forecast.map((f) => {
                    const conf = f.projected > 0 ? (f.weightedPipeline / f.projected) * 100 : 0;
                    return (
                      <TableRow key={f.month}>
                        <TableCell className="font-medium">{f.month}</TableCell>
                        <TableCell className="text-right">{fmtCurrency(f.projected)}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {fmtCurrency(f.weightedPipeline)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={conf >= 60 ? "default" : "secondary"}>
                            {fmtPct(conf)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
