import { createFileRoute } from "@tanstack/react-router";
import { requireOrgRole } from "@/lib/rbac";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getVendorDashboard } from "@/lib/plugins/licensing.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DollarSign, Download, Key, Package, TrendingUp } from "lucide-react";
import { AppTopbar } from "@/components/app/app-topbar";
import { DeveloperOrgSwitcher } from "@/components/app/developer/developer-org-switcher";

import { useCurrencyFormatter } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
export const Route = createFileRoute("/_authenticated/developer/vendor-dashboard")({
  beforeLoad: requireOrgRole("owner", "admin"),
  staticData: { breadcrumb: "Vendor Dashboard" },
  head: () => ({ meta: [{ title: "Vendor Dashboard — the Marketplace" }] }),
  component: VendorDashboard,
});

function VendorDashboard() {
  const fmt = useCurrencyFormatter({ locale: "en-US", fromCents: true });
  const formatZoned = useZonedDateFormatter();
  const fn = useServerFn(getVendorDashboard);
  const { data, isLoading } = useQuery({ queryKey: ["vendor-dashboard"], queryFn: () => fn() });

  if (isLoading || !data)
    return <div className="p-8 text-muted-foreground">Loading vendor dashboard</div>;
  const s = data.stats;

  return (
    <>
      <AppTopbar
        title="Vendor Dashboard"
        subtitle="Revenue, installs, and licensing for your plugins."
        actions={<DeveloperOrgSwitcher />}
      />
      <div className="container max-w-6xl py-8 space-y-6 mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={<DollarSign className="h-4 w-4" />}
            label="Gross revenue (30d)"
            value={fmt(s.grossRevenue)}
          />
          <StatCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Net earned"
            value={fmt(s.netRevenue)}
            sub={`Pending ${fmt(s.pendingRevenue)}`}
          />
          <StatCard
            icon={<Key className="h-4 w-4" />}
            label="Active licenses"
            value={String(s.activeLicenses)}
          />
          <StatCard
            icon={<Download className="h-4 w-4" />}
            label="Downloads (30d)"
            value={String(s.downloadCount30d)}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-4 w-4" /> Your plugins ({s.totalPlugins})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plugin</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.plugins.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      {p.pricing_model !== "free" ? fmt(p.price_cents ?? 0, p.currency) : "Free"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{p.pricing_model ?? "free"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge>{p.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {data.plugins.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No plugins published yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent sales (last 30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentSales.slice(0, 20).map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell>
                      {formatZoned(new Date(sale.purchased_at), { dateStyle: "short" })}
                    </TableCell>
                    <TableCell>{fmt(sale.amount_cents, sale.currency)}</TableCell>
                    <TableCell>
                      <Badge variant={sale.status === "paid" ? "default" : "secondary"}>
                        {sale.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {data.recentSales.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No sales yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payouts</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Paid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.payouts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      {formatZoned(new Date(p.period_start), { dateStyle: "short" })} →{" "}
                      {formatZoned(new Date(p.period_end), { dateStyle: "short" })}
                    </TableCell>
                    <TableCell>{fmt(p.total_cents, p.currency)}</TableCell>
                    <TableCell>
                      <Badge>{p.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {p.paid_at ? formatZoned(new Date(p.paid_at), { dateStyle: "short" }) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {data.payouts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No payouts scheduled.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs text-muted-foreground flex items-center gap-2">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}
