import { AppTopbar } from "@/components/app/app-topbar";
import { ActionBar } from "@/components/app/action-bar";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { getCommerceAnalyticsReport } from "@/lib/commerce/analytics.functions";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";
import {
  DollarSign,
  ShoppingBag,
  TrendingUp,
  TrendingDown,
  Target,
  Download,
  RotateCcw,
  Tag,
  CreditCard,
  Package,
  Percent,
  RefreshCw,
} from "lucide-react";

import { useCurrencyFormatter } from "@/hooks/use-currency";
export const Route = createFileRoute("/_authenticated/commerce/analytics")({
  component: Analytics,
  staticData: { breadcrumb: "Commerce Analytics" },
  head: () => ({ meta: [{ title: "Commerce Analytics" }] }),
});

const COLORS = [
  "#075E54",
  "#F59E0B",
  "#10B981",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#F97316",
];
const CHANNELS = ["all", "direct", "whatsapp", "instagram", "messenger", "web", "email"];

function pct(n: number) {
  return `${(n || 0).toFixed(1)}%`;
}

function delta(cur: number, prev: number | undefined | null) {
  if (prev === undefined || prev === null) return null;
  if (!prev) return cur > 0 ? 100 : 0;
  return ((cur - prev) / prev) * 100;
}

function DeltaBadge({ value }: { value: number | null }) {
  if (value === null) return null;
  const up = value >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${up ? "text-emerald-600" : "text-red-600"}`}
    >
      <Icon className="h-3 w-3" /> {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [keys.join(","), ...rows.map((r) => keys.map((k) => escape(r[k])).join(","))].join("\n");
}

function download(name: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function Analytics() {
  const money = useCurrencyFormatter({ locale: "en-US", maximumFractionDigits: 2 });
  const { active: workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  const [days, setDays] = useState(30);
  const [channel, setChannel] = useState("all");
  const [compare, setCompare] = useState(true);
  const [realtime, setRealtime] = useState(true);

  const range = useMemo(() => ({ from: isoDaysAgo(days), to: new Date().toISOString() }), [days]);

  const fetchReport = useServerFn(getCommerceAnalyticsReport);
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["commerce-analytics-v2", workspace?.id, days, channel, compare],
    queryFn: () =>
      fetchReport({
        data: { workspaceId: workspace!.id, from: range.from, to: range.to, channel, compare },
      }),
    enabled: !!workspace?.id,
  });

  // Realtime: refetch on orders/payments/carts changes
  useEffect(() => {
    if (!realtime || !workspace?.id) return;
    const ch = supabase
      .channel(`commerce-analytics-${workspace.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "commerce_orders",
          filter: `workspace_id=eq.${workspace.id}`,
        },
        () => qc.invalidateQueries({ queryKey: ["commerce-analytics-v2"] }),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "commerce_payment_links",
          filter: `workspace_id=eq.${workspace.id}`,
        },
        () => qc.invalidateQueries({ queryKey: ["commerce-analytics-v2"] }),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "commerce_carts",
          filter: `workspace_id=eq.${workspace.id}`,
        },
        () => qc.invalidateQueries({ queryKey: ["commerce-analytics-v2"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [realtime, workspace?.id, qc]);

  if (isLoading || !data) {
    return (
      <>
        <AppTopbar title="Commerce Analytics" subtitle="Sales performance across every channel" />
        <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
          <Skeleton className="h-24" />
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-80" />
        </main>
      </>
    );
  }

  const c = data.current;
  const p = data.previous;

  const kpis = [
    {
      key: "revenue",
      label: "Revenue",
      icon: DollarSign,
      value: money(c.totals.revenue),
      d: delta(c.totals.revenue, p?.totals.revenue),
    },
    {
      key: "orders",
      label: "Orders",
      icon: ShoppingBag,
      value: c.totals.orders,
      d: delta(c.totals.orders, p?.totals.orders),
    },
    {
      key: "aov",
      label: "Avg Order Value",
      icon: TrendingUp,
      value: money(c.totals.aov),
      d: delta(c.totals.aov, p?.totals.aov),
    },
    {
      key: "conv",
      label: "Conversion Rate",
      icon: Target,
      value: pct(c.totals.conversionRate),
      d: delta(c.totals.conversionRate, p?.totals.conversionRate),
    },
    {
      key: "abandon",
      label: "Abandoned Carts",
      icon: RotateCcw,
      value: c.totals.abandonedCarts,
      d: delta(c.totals.abandonedCarts, p?.totals.abandonedCarts),
    },
    {
      key: "refund",
      label: "Refund Rate",
      icon: Percent,
      value: pct(c.totals.refundRate),
      d: delta(c.totals.refundRate, p?.totals.refundRate),
    },
    {
      key: "pay",
      label: "Payment Success",
      icon: CreditCard,
      value: pct(c.totals.paymentSuccessRate),
      d: delta(c.totals.paymentSuccessRate, p?.totals.paymentSuccessRate),
    },
    {
      key: "coupon",
      label: "Coupon Uses",
      icon: Tag,
      value: c.totals.couponUses,
      d: delta(c.totals.couponUses, p?.totals.couponUses),
    },
  ];

  const exportAll = () => {
    const rows = [
      { metric: "Revenue", value: c.totals.revenue, previous: p?.totals.revenue ?? "" },
      { metric: "Orders", value: c.totals.orders, previous: p?.totals.orders ?? "" },
      { metric: "AOV", value: c.totals.aov, previous: p?.totals.aov ?? "" },
      {
        metric: "Conversion %",
        value: c.totals.conversionRate,
        previous: p?.totals.conversionRate ?? "",
      },
      {
        metric: "Abandoned Carts",
        value: c.totals.abandonedCarts,
        previous: p?.totals.abandonedCarts ?? "",
      },
      { metric: "Refund Rate %", value: c.totals.refundRate, previous: p?.totals.refundRate ?? "" },
      {
        metric: "Payment Success %",
        value: c.totals.paymentSuccessRate,
        previous: p?.totals.paymentSuccessRate ?? "",
      },
      { metric: "Coupon Uses", value: c.totals.couponUses, previous: p?.totals.couponUses ?? "" },
    ];
    download(`commerce-summary-${days}d.csv`, toCSV(rows));
  };

  return (
    <>
      <AppTopbar
        title="Commerce Analytics"
        subtitle="Sales performance across every channel"
        actions={
          <ActionBar
            primary={[
              <Button
                key="refresh"
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => refetch()}
              >
                <RefreshCw className="h-4 w-4 " /> Refresh
              </Button>,
              <Button key="export" variant="outline" size="sm" className="h-9" onClick={exportAll}>
                <Download className="h-4 w-4 " /> Export
              </Button>,
            ]}
          />
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {/* Filters & view-state controls (not actions — moved out of the header) */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger className="w-40 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANNELS.map((ch) => (
                <SelectItem key={ch} value={ch}>
                  {ch === "all" ? "All channels" : ch}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-36 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="180">Last 180 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 h-9 px-3 rounded-control border">
            <Switch id="compare" checked={compare} onCheckedChange={setCompare} />
            <Label htmlFor="compare" className="text-xs">
              Compare
            </Label>
          </div>
          <div className="flex items-center gap-2 h-9 px-3 rounded-control border">
            <Switch id="rt" checked={realtime} onCheckedChange={setRealtime} />
            <Label htmlFor="rt" className="text-xs">
              Realtime
            </Label>
          </div>
        </div>

        {isFetching && (
          <p className="text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1 text-xs">
              <RefreshCw className="h-3 w-3 animate-spin" /> updating
            </span>
          </p>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map((k) => (
            <Card key={k.key} className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{k.label}</span>
                <k.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-semibold mt-2">{k.value}</div>
              {compare && (
                <div className="mt-1">
                  <DeltaBadge value={k.d} />
                </div>
              )}
            </Card>
          ))}
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="customers">Customers</TabsTrigger>
            <TabsTrigger value="channels">Channels & Agents</TabsTrigger>
            <TabsTrigger value="promos">Coupons & Refunds</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium">Revenue & Orders</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => download("daily.csv", toCSV(c.daily as any))}
                >
                  <Download className="h-3 w-3 " /> CSV
                </Button>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={c.daily}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#075E54" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#075E54" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#075E54"
                    fill="url(#rev)"
                    name="Revenue"
                  />
                  <Line
                    type="monotone"
                    dataKey="orders"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    name="Orders"
                  />
                  <Line
                    type="monotone"
                    dataKey="refunds"
                    stroke="#F59E0B"
                    strokeWidth={2}
                    name="Refunds"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          </TabsContent>

          <TabsContent value="products" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ReportCard
                title="Best Selling Products"
                rows={c.topProducts}
                columns={[
                  ["name", "Product"],
                  ["qty", "Units"],
                  ["revenue", "Revenue", money],
                ]}
              />
              <ReportCard
                title="Top Categories"
                rows={c.topCategories}
                columns={[
                  ["name", "Category"],
                  ["qty", "Units"],
                  ["revenue", "Revenue", money],
                ]}
              />
            </div>
            <Card className="p-4">
              <h2 className="text-sm font-medium mb-3">Product Revenue</h2>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={c.topProducts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis type="number" fontSize={11} />
                  <YAxis type="category" dataKey="name" width={140} fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="revenue" fill="#075E54" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </TabsContent>

          <TabsContent value="customers" className="mt-4">
            <ReportCard
              title="Top Customers"
              rows={c.topCustomers}
              columns={[
                ["name", "Customer"],
                ["orders", "Orders"],
                ["revenue", "Revenue", money],
              ]}
            />
          </TabsContent>

          <TabsContent value="channels" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="p-4">
                <h2 className="text-sm font-medium mb-3">Revenue by Channel</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={c.byChannel}
                      dataKey="revenue"
                      nameKey="channel"
                      outerRadius={100}
                      label
                    >
                      {c.byChannel.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Legend />
                    <Tooltip formatter={(v: number) => money(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
              <ReportCard
                title="Channel Breakdown"
                rows={c.byChannel}
                columns={[
                  ["channel", "Channel"],
                  ["orders", "Orders"],
                  ["revenue", "Revenue", money],
                ]}
              />
            </div>
            <ReportCard
              title="Revenue by Agent"
              rows={c.byAgent}
              columns={[
                ["agent", "Agent"],
                ["orders", "Orders"],
                ["revenue", "Revenue", money],
              ]}
            />
          </TabsContent>

          <TabsContent value="promos" className="space-y-4 mt-4">
            <ReportCard
              title="Coupon Usage"
              rows={c.coupons}
              columns={[
                ["code", "Code"],
                ["uses", "Uses"],
                ["discount", "Discount", money],
              ]}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4">
                <div className="text-xs text-muted-foreground">Refunded Orders</div>
                <div className="text-2xl font-semibold mt-1">{c.totals.refundedOrders}</div>
                <Badge variant="outline" className="mt-2">
                  {pct(c.totals.refundRate)}
                </Badge>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-muted-foreground">Cancelled Orders</div>
                <div className="text-2xl font-semibold mt-1">{c.totals.cancelledOrders}</div>
              </Card>
              <Card className="p-4">
                <div className="text-xs text-muted-foreground">Total Discounts</div>
                <div className="text-2xl font-semibold mt-1">{money(c.totals.couponDiscount)}</div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}

type Col = [string, string, ((v: any) => string)?];

function ReportCard({ title, rows, columns }: { title: string; rows: any[]; columns: Col[] }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium">{title}</h2>
        <Button variant="ghost" size="sm" onClick={() => download(`${title}.csv`, toCSV(rows))}>
          <Download className="h-3 w-3 " /> CSV
        </Button>
      </div>
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
          No data for the selected period
        </div>
      ) : (
        <div className="overflow-auto max-h-96">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b">
              <tr>
                {columns.map(([, l]) => (
                  <th key={l} className="text-left font-medium py-2 pr-4">
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  {columns.map(([k, l, fmt]) => (
                    <td key={l} className="py-2 pr-4">
                      {fmt ? fmt(r[k]) : String(r[k] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
