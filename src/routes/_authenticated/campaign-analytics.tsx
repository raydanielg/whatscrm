import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Send,
  CheckCircle2,
  Eye,
  XCircle,
  MessageSquareReply,
  MousePointerClick,
  Target,
  UserMinus,
  DollarSign,
  Wallet,
  Download,
  FileSpreadsheet,
  FileText,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { AppTopbar } from "@/components/app/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMarketingRealtime } from "@/hooks/use-marketing";
import { useCampaignAnalytics, type Range } from "@/hooks/use-campaign-analytics";
import { useTenantCurrency } from "@/hooks/use-currency";
import { exportAnalyticsPdf, exportAnalyticsXlsx } from "@/lib/marketing/analytics-export";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/campaign-analytics")({
  component: CampaignAnalyticsPage,
  head: () => ({
    meta: [
      { title: "Campaign Analytics" },
      {
        name: "description",
        content: "Real-time campaign performance, engagement trends, revenue and cost.",
      },
    ],
  }),
});

const RANGE_OPTIONS: { id: Range; label: string }[] = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
  { id: "ytd", label: "Year to date" },
  { id: "all", label: "All time" },
];

const fmtInt = (n: number) => n.toLocaleString();
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

function CampaignAnalyticsPage() {
  useMarketingRealtime();
  const [range, setRange] = useState<Range>("30d");
  const { metrics, trend, audience, top, isLoading } = useCampaignAnalytics(range);
  const formatZoned = useZonedDateFormatter();
  const shortDate = (d: string) => formatZoned(new Date(d), { month: "short", day: "numeric" });
  // Bound to the tenant's currency rather than a hardcoded USD — see
  // use-currency.ts. Kept in the component because it needs the hook.
  const tenantCurrency = useTenantCurrency();
  const fmtCur = (n: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: tenantCurrency,
      maximumFractionDigits: 2,
    }).format(n);

  const widgets = [
    {
      key: "sent",
      label: "Sent Messages",
      value: fmtInt(metrics.sent),
      icon: Send,
      tint: "bg-primary/10 text-primary",
    },
    {
      key: "delivered",
      label: "Delivered",
      value: fmtInt(metrics.delivered),
      sub: fmtPct(metrics.deliveryRate),
      icon: CheckCircle2,
      tint: "bg-success/10 text-success",
    },
    {
      key: "read",
      label: "Read",
      value: fmtInt(metrics.read),
      sub: fmtPct(metrics.readRate),
      icon: Eye,
      tint: "bg-accent/10 text-accent",
    },
    {
      key: "failed",
      label: "Failed",
      value: fmtInt(metrics.failed),
      icon: XCircle,
      tint: "bg-destructive/10 text-destructive",
    },
    {
      key: "response",
      label: "Response Rate",
      value: fmtPct(metrics.responseRate),
      sub: `${fmtInt(metrics.replied)} replies`,
      icon: MessageSquareReply,
      tint: "bg-primary/10 text-primary",
    },
    {
      key: "click",
      label: "Click Rate",
      value: fmtPct(metrics.clickRate),
      sub: `${fmtInt(metrics.clicked)} clicks`,
      icon: MousePointerClick,
      tint: "bg-accent/10 text-accent",
    },
    {
      key: "conv",
      label: "Conversion Rate",
      value: fmtPct(metrics.conversionRate),
      sub: `${fmtInt(metrics.conversions)} conversions`,
      icon: Target,
      tint: "bg-success/10 text-success",
    },
    {
      key: "opt",
      label: "Opt-outs",
      value: fmtInt(metrics.optedOut),
      sub: fmtPct(metrics.optOutRate),
      icon: UserMinus,
      tint: "bg-warning/15 text-warning-foreground",
    },
    {
      key: "rev",
      label: "Revenue Generated",
      value: fmtCur(metrics.revenue),
      icon: DollarSign,
      tint: "bg-success/10 text-success",
    },
    {
      key: "cost",
      label: "Cost per Campaign",
      value: fmtCur(metrics.costPerCampaign),
      sub: `${fmtCur(metrics.cost)} total`,
      icon: Wallet,
      tint: "bg-muted text-muted-foreground",
    },
  ];

  return (
    <>
      <AppTopbar
        title="Campaign Analytics"
        subtitle="Delivery, engagement, revenue — updated in real time"
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 " /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportAnalyticsPdf({ range, metrics, trend, top })}>
                <FileText className="w-4 h-4" /> Export PDF
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  void exportAnalyticsXlsx({ range, metrics, trend, top, audience }).catch(
                    (error: unknown) =>
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Failed to export campaign analytics",
                      ),
                  )
                }
              >
                <FileSpreadsheet className="w-4 h-4" /> Export Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={range} onValueChange={(v) => setRange(v as Range)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="outline" className="gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Live
          </Badge>
        </div>

        {/* Widgets */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {widgets.map((w) => {
            const Icon = w.icon;
            return (
              <Card key={w.key} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground truncate">{w.label}</div>
                    <div className="text-2xl font-display font-semibold  mt-1">
                      {isLoading ? "—" : w.value}
                    </div>
                    {w.sub && <div className="text-xs text-muted-foreground mt-0.5">{w.sub}</div>}
                  </div>
                  <div className={`w-9 h-9 grid place-items-center flex-shrink-0 ${w.tint}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Engagement trend */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="font-display font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" /> Engagement trends
              </h3>
              <p className="text-xs text-muted-foreground">Daily sent, delivered, read, replied</p>
            </div>
          </div>
          <div className="h-72">
            <ResponsiveContainer>
              <AreaChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="a-sent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="a-del" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="a-read" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={shortDate} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--surface))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                  }}
                  labelFormatter={(l) => shortDate(String(l))}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="sent"
                  stroke="hsl(var(--primary))"
                  fill="url(#a-sent)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="delivered"
                  stroke="hsl(var(--success))"
                  fill="url(#a-del)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="read"
                  stroke="hsl(var(--accent))"
                  fill="url(#a-read)"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="replied"
                  stroke="hsl(var(--warning))"
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Audience growth */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-display font-semibold flex items-center gap-2">
                  <Users className="w-4 h-4 text-accent" /> Audience growth
                </h3>
                <p className="text-xs text-muted-foreground">Cumulative contacts over time</p>
              </div>
              <Badge variant="outline" className="gap-1">
                +{audience.reduce((s, a) => s + a.added, 0)} new
              </Badge>
            </div>
            <div className="h-64">
              <ResponsiveContainer>
                <AreaChart data={audience}>
                  <defs>
                    <linearGradient id="aud" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={shortDate} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--surface))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                    }}
                    labelFormatter={(l) => shortDate(String(l))}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="hsl(var(--accent))"
                    fill="url(#aud)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Funnel bar */}
          <Card className="p-5">
            <div className="mb-2">
              <h3 className="font-display font-semibold">Delivery funnel</h3>
              <p className="text-xs text-muted-foreground">
                Sent → Delivered → Read → Replied → Converted
              </p>
            </div>
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart
                  data={[
                    { stage: "Sent", value: metrics.sent },
                    { stage: "Delivered", value: metrics.delivered },
                    { stage: "Read", value: metrics.read },
                    { stage: "Replied", value: metrics.replied },
                    { stage: "Clicked", value: metrics.clicked },
                    { stage: "Converted", value: metrics.conversions },
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--surface))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        {/* Top campaigns */}
        <Card className="overflow-hidden">
          <div className="p-5 pb-3 flex items-center justify-between">
            <div>
              <h3 className="font-display font-semibold flex items-center gap-2">
                <Trophy className="w-4 h-4 text-success" /> Top campaigns
              </h3>
              <p className="text-xs text-muted-foreground">Ranked by revenue and engagement</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs  text-muted-foreground">
                <tr>
                  <th className="text-left px-5 py-2.5">Campaign</th>
                  <th className="text-left px-5 py-2.5">Status</th>
                  <th className="text-right px-5 py-2.5">Sent</th>
                  <th className="text-right px-5 py-2.5">Delivered</th>
                  <th className="text-right px-5 py-2.5">Replied</th>
                  <th className="text-right px-5 py-2.5">Clicked</th>
                  <th className="text-right px-5 py-2.5">Conversions</th>
                  <th className="text-right px-5 py-2.5">Revenue</th>
                  <th className="text-right px-5 py-2.5">Engagement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {top.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center px-5 py-8 text-muted-foreground">
                      No campaign activity in this range.
                    </td>
                  </tr>
                )}
                {top.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <td className="px-5 py-3 font-medium">{c.name}</td>
                    <td className="px-5 py-3">
                      <Badge variant="outline" className="text-xs">
                        {c.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right ">{fmtInt(c.sent)}</td>
                    <td className="px-5 py-3 text-right ">{fmtInt(c.delivered)}</td>
                    <td className="px-5 py-3 text-right ">{fmtInt(c.replied)}</td>
                    <td className="px-5 py-3 text-right ">{fmtInt(c.clicked)}</td>
                    <td className="px-5 py-3 text-right ">{fmtInt(c.conversions)}</td>
                    <td className="px-5 py-3 text-right  font-medium">
                      {fmtCur(c.revenue)}
                    </td>
                    <td className="px-5 py-3 text-right ">{fmtPct(c.engagement)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </main>
    </>
  );
}
