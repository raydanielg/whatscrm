import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getRedemptionHistory, listPromotions } from "@/lib/commerce/promotions.functions";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Download, Search, TrendingUp, Users, Ticket, DollarSign } from "lucide-react";

import { useCurrencyFormatter } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
export const Route = createFileRoute("/_authenticated/commerce/promotions/redemptions")({
  component: RedemptionHistoryPage,
  head: () => ({
    meta: [
      { title: "Promotion Redemptions · Commerce" },
      {
        name: "description",
        content:
          "Detailed promotion redemption history: usage per promotion, per customer, and revenue impact.",
      },
    ],
  }),
});

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

function downloadCsv(name: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function RedemptionHistoryPage() {
  const money = useCurrencyFormatter({ locale: "en-US", fromCents: true });
  const zonedDate = useZonedDateFormatter();
  const fmtDate = (iso: string | null) =>
    iso ? zonedDate(iso, { dateStyle: "medium", timeStyle: "short" }) : "—";
  const { active: workspace } = useCurrentWorkspace();
  const workspaceId = workspace?.id;
  const [promotionId, setPromotionId] = useState<string>("all");
  const [days, setDays] = useState<string>("90");
  const [search, setSearch] = useState("");

  const fetchHistory = useServerFn(getRedemptionHistory);
  const fetchPromos = useServerFn(listPromotions);

  const promos = useQuery({
    queryKey: ["promotions", workspaceId],
    queryFn: () => fetchPromos({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });

  const history = useQuery({
    queryKey: ["promo-redemptions", workspaceId, promotionId, days],
    queryFn: () =>
      fetchHistory({
        data: {
          workspaceId: workspaceId!,
          promotionId: promotionId === "all" ? undefined : promotionId,
          days: Number(days),
        },
      }),
    enabled: !!workspaceId,
  });

  const data = history.data;

  const filteredTimeline = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.timeline;
    return data.timeline.filter(
      (t) =>
        (t.promotion_name ?? "").toLowerCase().includes(q) ||
        (t.promotion_code ?? "").toLowerCase().includes(q) ||
        (t.code_used ?? "").toLowerCase().includes(q) ||
        (t.contact_name ?? "").toLowerCase().includes(q) ||
        (t.contact_email ?? "").toLowerCase().includes(q) ||
        (t.order_number ?? "").toLowerCase().includes(q),
    );
  }, [data, search]);

  return (
    <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/commerce/promotions">
              <ArrowLeft className="h-4 w-4 " /> Promotions
            </Link>
          </Button>
          <h1 className="font-bold text-xl">Redemption History</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={promotionId} onValueChange={setPromotionId}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="All promotions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All promotions</SelectItem>
              {(promos.data ?? []).map((p: any) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.code ? ` · ${p.code}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="180">Last 180 days</SelectItem>
              <SelectItem value="365">Last 365 days</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            disabled={!filteredTimeline.length}
            onClick={() =>
              downloadCsv(
                `promotion-redemptions-${new Date().toISOString().slice(0, 10)}.csv`,
                toCsv(
                  filteredTimeline.map((t) => ({
                    date: t.created_at,
                    promotion: t.promotion_name,
                    code: t.promotion_code ?? "",
                    code_used: t.code_used ?? "",
                    customer: t.contact_name ?? "",
                    email: t.contact_email ?? "",
                    order_number: t.order_number ?? "",
                    order_total:
                      t.order_total_cents != null ? (t.order_total_cents / 100).toFixed(2) : "",
                    discount: (t.amount_off_cents / 100).toFixed(2),
                    currency: t.currency,
                  })),
                ),
              )
            }
          >
            <Download className="h-4 w-4 " /> Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat
          icon={<Ticket className="h-4 w-4" />}
          label="Redemptions"
          value={data?.totals.redemptions ?? 0}
        />
        <Stat
          icon={<Users className="h-4 w-4" />}
          label="Unique customers"
          value={data?.totals.unique_customers ?? 0}
        />
        <Stat
          icon={<TrendingUp className="h-4 w-4" />}
          label="Promotions used"
          value={data?.totals.unique_promotions ?? 0}
        />
        <Stat
          icon={<DollarSign className="h-4 w-4" />}
          label="Discount given"
          value={money(data?.totals.discount_cents ?? 0)}
        />
        <Stat
          icon={<DollarSign className="h-4 w-4" />}
          label="Revenue attributed"
          value={money(data?.totals.revenue_cents ?? 0)}
        />
      </div>

      <Card className="p-3">
        <div className="flex items-center gap-2 mb-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search promotion, code, customer or order"
            className="max-w-sm"
          />
        </div>

        <Tabs defaultValue="timeline">
          <TabsList>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="by-promotion">By promotion</TabsTrigger>
            <TabsTrigger value="by-customer">By customer</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="mt-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-3">When</th>
                    <th className="py-2 pr-3">Promotion</th>
                    <th className="py-2 pr-3">Code used</th>
                    <th className="py-2 pr-3">Customer</th>
                    <th className="py-2 pr-3">Order</th>
                    <th className="py-2 pr-3 text-right">Order total</th>
                    <th className="py-2 pr-3 text-right">Discount</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTimeline.map((t) => (
                    <tr key={t.id} className="border-b hover:bg-muted/40">
                      <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(t.created_at)}</td>
                      <td className="py-2 pr-3">
                        <div className="font-medium">{t.promotion_name}</div>
                        {t.promotion_code && (
                          <div className="text-xs text-muted-foreground">{t.promotion_code}</div>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {t.code_used ? (
                          <Badge variant="outline">{t.code_used}</Badge>
                        ) : (
                          <span className="text-muted-foreground">auto</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {t.contact_id ? (
                          <div>
                            <div>{t.contact_name ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">
                              {t.contact_email ?? t.contact_phone ?? ""}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Guest</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {t.order_id ? (
                          <Link
                            to="/commerce/orders/$orderId"
                            params={{ orderId: t.order_id }}
                            className="text-primary hover:underline"
                          >
                            {t.order_number ?? t.order_id.slice(0, 8)}
                          </Link>
                        ) : (
                          "—"
                        )}
                        {t.payment_status && (
                          <div className="text-xs text-muted-foreground capitalize">
                            {t.payment_status}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {t.order_total_cents != null ? money(t.order_total_cents, t.currency) : "—"}
                      </td>
                      <td className="py-2 pr-3 text-right text-emerald-600">
                        −{money(t.amount_off_cents, t.currency)}
                      </td>
                    </tr>
                  ))}
                  {!filteredTimeline.length && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground">
                        {history.isLoading ? "Loading" : "No redemptions in this range."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="by-promotion" className="mt-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-3">Promotion</th>
                    <th className="py-2 pr-3 text-right">Redemptions</th>
                    <th className="py-2 pr-3 text-right">Unique customers</th>
                    <th className="py-2 pr-3 text-right">Discount</th>
                    <th className="py-2 pr-3 text-right">Revenue</th>
                    <th className="py-2 pr-3">Last used</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.byPromotion ?? []).map((p) => (
                    <tr key={p.promotion_id} className="border-b hover:bg-muted/40">
                      <td className="py-2 pr-3">
                        <div className="font-medium">{p.name}</div>
                        {p.code && <div className="text-xs text-muted-foreground">{p.code}</div>}
                      </td>
                      <td className="py-2 pr-3 text-right">{p.redemptions}</td>
                      <td className="py-2 pr-3 text-right">{p.unique_customers}</td>
                      <td className="py-2 pr-3 text-right text-emerald-600">
                        −{money(p.discount_cents)}
                      </td>
                      <td className="py-2 pr-3 text-right">{money(p.revenue_cents)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(p.last_used_at)}</td>
                    </tr>
                  ))}
                  {!(data?.byPromotion ?? []).length && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        No data.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="by-customer" className="mt-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-3">Customer</th>
                    <th className="py-2 pr-3 text-right">Redemptions</th>
                    <th className="py-2 pr-3 text-right">Promotions used</th>
                    <th className="py-2 pr-3 text-right">Discount</th>
                    <th className="py-2 pr-3 text-right">Revenue</th>
                    <th className="py-2 pr-3">Last used</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.byCustomer ?? []).map((c, i) => (
                    <tr key={c.contact_id ?? `anon-${i}`} className="border-b hover:bg-muted/40">
                      <td className="py-2 pr-3">
                        {c.contact_id ? (
                          <Link
                            to="/contacts/$contactId"
                            params={{ contactId: c.contact_id }}
                            className="text-primary hover:underline"
                          >
                            {c.name ?? c.email ?? c.phone ?? c.contact_id.slice(0, 8)}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Guest checkouts</span>
                        )}
                        {c.contact_id && (c.email || c.phone) && (
                          <div className="text-xs text-muted-foreground">{c.email ?? c.phone}</div>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right">{c.redemptions}</td>
                      <td className="py-2 pr-3 text-right">{c.promotions_used}</td>
                      <td className="py-2 pr-3 text-right text-emerald-600">
                        −{money(c.discount_cents)}
                      </td>
                      <td className="py-2 pr-3 text-right">{money(c.revenue_cents)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(c.last_used_at)}</td>
                    </tr>
                  ))}
                  {!(data?.byCustomer ?? []).length && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        No data.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 font-bold text-xl">{value}</div>
    </Card>
  );
}
