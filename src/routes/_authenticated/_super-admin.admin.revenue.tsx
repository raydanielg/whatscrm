import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
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
  ArrowDown,
  ArrowUp,
  RefreshCw,
  DollarSign,
  TrendingUp,
  Users,
  AlertTriangle,
  CreditCard,
  Repeat,
  Percent,
  Activity,
  Wallet,
  Globe,
} from "lucide-react";
import { getRevenueAnalytics } from "@/lib/billing/revenue-analytics.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTenantCurrency } from "@/hooks/use-currency";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/revenue")({
  head: () => ({ meta: [{ title: "Revenue Analytics · Admin" }] }),
  component: RevenueAnalyticsPage,
});

const RANGES = [
  { d: 30, label: "30D" },
  { d: 90, label: "90D" },
  { d: 180, label: "6M" },
  { d: 365, label: "12M" },
];

const CURRENCIES = ["USD", "EUR", "GBP"];

const PALETTE = [
  "hsl(217 91% 60%)",
  "hsl(160 84% 39%)",
  "hsl(38 92% 50%)",
  "hsl(280 74% 60%)",
  "hsl(0 84% 60%)",
  "hsl(190 80% 48%)",
  "hsl(340 82% 60%)",
  "hsl(120 60% 45%)",
];

function fmtMoney(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}
function fmtPct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}
function fmtNum(v: number) {
  return new Intl.NumberFormat().format(v);
}

function RevenueAnalyticsPage() {
  const platformCurrency = useTenantCurrency();
  const [rangeDays, setRangeDays] = useState(90);
  const [currency, setCurrency] = useState(platformCurrency);
  const fetchAnalytics = useServerFn(getRevenueAnalytics);
  const q = useQuery({
    queryKey: ["revenue-analytics", rangeDays, currency],
    queryFn: () => fetchAnalytics({ data: { range_days: rangeDays, currency } }),
    staleTime: 60_000,
  });

  const kpis = q.data?.kpis;
  const timeseries = q.data?.timeseries ?? [];

  const kpiCards = useMemo(() => {
    if (!kpis) return [];
    return [
      { label: "MRR", value: fmtMoney(kpis.mrr_cents, currency), delta: kpis.monthly_growth, icon: DollarSign, tone: "primary" },
      { label: "ARR", value: fmtMoney(kpis.arr_cents, currency), delta: kpis.annual_growth, icon: TrendingUp, tone: "primary" },
      { label: "Active subs", value: fmtNum(kpis.active_subscriptions), sub: `${kpis.trialing_subscriptions} trialing`, icon: Users },
      { label: "Trial conv.", value: fmtPct(kpis.trial_conversion_rate), sub: `${kpis.trials_converted}/${kpis.trials_started}`, icon: Repeat },
      { label: "Churn rate", value: fmtPct(kpis.churn_rate), sub: `${kpis.churned_in_range} lost`, icon: Percent, tone: "danger" },
      { label: "Expansion", value: fmtMoney(kpis.expansion_revenue_cents, currency), sub: `${kpis.upgrades} upgrades`, icon: ArrowUp, tone: "success" },
      { label: "Downgrades", value: fmtMoney(kpis.downgrade_loss_cents, currency), sub: `${kpis.downgrades} downgrades`, icon: ArrowDown, tone: "danger" },
      { label: "Refunds", value: fmtMoney(kpis.refunds_cents, currency), icon: CreditCard, tone: "danger" },
      { label: "Failed payments", value: fmtNum(kpis.failed_payments), sub: fmtMoney(kpis.failed_payments_amount_cents, currency), icon: AlertTriangle, tone: "danger" },
      { label: "LTV", value: fmtMoney(kpis.ltv_cents, currency), icon: Wallet, tone: "success" },
      { label: "ARPU", value: fmtMoney(kpis.arpu_cents, currency), icon: Activity },
      { label: "Net revenue", value: fmtMoney(kpis.net_revenue_cents, currency), sub: fmtPct(kpis.revenue_growth) + " vs prev.", icon: DollarSign, tone: kpis.revenue_growth >= 0 ? "success" : "danger" },
    ];
  }, [kpis, currency]);

  return (
    <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-display font-semibold">Revenue analytics</h2>
          <p className="text-xs text-muted-foreground">MRR · ARR · churn · LTV — updated in real time</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-control border border-border bg-surface p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.d}
                onClick={() => setRangeDays(r.d)}
                className={`px-2.5 py-1 text-xs rounded ${rangeDays === r.d ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="text-xs border border-border rounded-control bg-surface px-2 py-1.5"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${q.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {q.isLoading
          ? Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-24" />)
          : kpiCards.map((k) => {
              const Icon = k.icon;
              const positive = (k.delta ?? 0) >= 0;
              return (
                <Card key={k.label} className="p-3 space-y-1.5 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span className="text-[11px] uppercase tracking-wide">{k.label}</span>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-lg font-display font-semibold">{k.value}</div>
                  {k.delta !== undefined && (
                    <div className={`text-xs flex items-center gap-1 ${positive ? "text-emerald-600" : "text-rose-600"}`}>
                      {positive ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                      {fmtPct(Math.abs(k.delta))}
                    </div>
                  )}
                  {k.sub && <div className="text-[11px] text-muted-foreground">{k.sub}</div>}
                </Card>
              );
            })}
      </div>

      {/* Main charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* MRR / ARR area */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display font-semibold">MRR & ARR trend</h3>
              <p className="text-xs text-muted-foreground">Recurring revenue over time</p>
            </div>
            <Badge variant="outline">{timeseries.length} snapshots</Badge>
          </div>
          <div className="h-72">
            <ResponsiveContainer>
              <AreaChart data={timeseries}>
                <defs>
                  <linearGradient id="mrrG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PALETTE[0]} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={PALETTE[0]} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="arrG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PALETTE[1]} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={PALETTE[1]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, n: string) => [new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(v), n.toUpperCase()]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="mrr" stroke={PALETTE[0]} strokeWidth={2} fill="url(#mrrG)" name="MRR" />
                <Area type="monotone" dataKey="arr" stroke={PALETTE[1]} strokeWidth={2} fill="url(#arrG)" name="ARR" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Revenue by plan pie */}
        <Card className="p-5">
          <div className="mb-4">
            <h3 className="font-display font-semibold">Revenue by plan</h3>
            <p className="text-xs text-muted-foreground">MRR contribution</p>
          </div>
          <div className="h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={q.data?.revenue_by_plan ?? []}
                  dataKey="mrr_cents"
                  nameKey="plan"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {(q.data?.revenue_by_plan ?? []).map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => fmtMoney(v, currency)}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Second row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gross vs Refunds vs Net */}
        <Card className="p-5">
          <div className="mb-4">
            <h3 className="font-display font-semibold">Gross · refunds · net</h3>
            <p className="text-xs text-muted-foreground">Daily invoiced revenue</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={timeseries}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => fmtMoney(v * 100, currency)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="gross" name="Gross" fill={PALETTE[1]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="refunds" name="Refunds" fill={PALETTE[4]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="net" name="Net" fill={PALETTE[0]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Churn rate line + new/churned bars */}
        <Card className="p-5">
          <div className="mb-4">
            <h3 className="font-display font-semibold">Churn & growth</h3>
            <p className="text-xs text-muted-foreground">New subs, churn, and churn rate</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={timeseries}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis yAxisId="l" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis yAxisId="r" orientation="right" stroke="var(--color-muted-foreground)" fontSize={11} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
                <Tooltip
                  contentStyle={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line yAxisId="l" type="monotone" dataKey="new_subs" stroke={PALETTE[1]} strokeWidth={2} name="New" dot={false} />
                <Line yAxisId="l" type="monotone" dataKey="churned" stroke={PALETTE[4]} strokeWidth={2} name="Churned" dot={false} />
                <Line yAxisId="r" type="monotone" dataKey="churn_rate" stroke={PALETTE[3]} strokeWidth={2} name="Churn %" dot={false} strokeDasharray="4 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Third row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue by country */}
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <div>
              <h3 className="font-display font-semibold">Revenue by country</h3>
              <p className="text-xs text-muted-foreground">Top billing regions</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={(q.data?.revenue_by_country ?? []).slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={11} tickFormatter={(v) => `${(v / 100 / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="country" stroke="var(--color-muted-foreground)" fontSize={11} width={80} />
                <Tooltip
                  contentStyle={{ background: "var(--color-surface-elevated)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => fmtMoney(v, currency)}
                />
                <Bar dataKey="revenue_cents" fill={PALETTE[0]} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Failed payment reasons */}
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500" />
            <div>
              <h3 className="font-display font-semibold">Failed payments</h3>
              <p className="text-xs text-muted-foreground">By reason</p>
            </div>
          </div>
          {(q.data?.failed_by_reason ?? []).length === 0 ? (
            <div className="h-56 flex items-center justify-center text-xs text-muted-foreground">No failures 🎉</div>
          ) : (
            <div className="space-y-2 pt-1">
              {(q.data?.failed_by_reason ?? []).map((r, i) => {
                const total = (q.data?.failed_by_reason ?? []).reduce((s, x) => s + x.count, 0);
                const pct = total ? r.count / total : 0;
                return (
                  <div key={r.reason} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="capitalize">{r.reason.replace(/_/g, " ")}</span>
                      <span className="text-muted-foreground">{r.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct * 100}%`, background: PALETTE[i % PALETTE.length] }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {q.isError && (
        <Card className="p-4 border-destructive/40 text-destructive text-sm">
          Failed to load analytics: {(q.error as Error)?.message}
        </Card>
      )}
    </main>
  );
}
