import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppTopbar } from "@/components/app/app-topbar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShoppingBag,
  CreditCard,
  Clock,
  TrendingUp,
  Package,
  Link2,
  Percent,
  Sparkles,
} from "lucide-react";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { getCommerceOverview } from "@/lib/commerce/commerce.functions";
import { useCurrencyFormatter } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/commerce/")({
  component: CommercePage,
  staticData: { breadcrumb: "Commerce" },
  head: () => ({
    meta: [
      { title: "Commerce" },
      { name: "description", content: "Catalog, orders, and payment links for WhatsApp Commerce." },
    ],
  }),
});

function CommercePage() {
  const { active } = useCurrentWorkspace();
  // Overview totals come back without a currency of their own, so the tenant's
  // is the right label — it was showing dollars to every tenant before.
  const money = useCurrencyFormatter({ minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const zonedDate = useZonedDateFormatter();
  const overview = useServerFn(getCommerceOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["commerce-overview", active?.id],
    enabled: !!active?.id,
    queryFn: () => overview({ data: { workspaceId: active!.id } }),
  });

  return (
    <>
      <AppTopbar title="Commerce" />
      <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <KpiCard
            icon={<ShoppingBag className="h-4 w-4" />}
            label="Orders this month"
            value={data?.ordersThisMonth ?? 0}
            loading={isLoading}
          />
          <KpiCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Revenue"
            value={money(data?.revenueThisMonth ?? 0)}
            loading={isLoading}
          />
          <KpiCard
            icon={<Clock className="h-4 w-4" />}
            label="Pending orders"
            value={data?.pendingOrders ?? 0}
            loading={isLoading}
          />
          <KpiCard
            icon={<CreditCard className="h-4 w-4" />}
            label="Active payment links"
            value={data?.activePaymentLinks ?? 0}
            loading={isLoading}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <QuickCard
            to="/commerce/orders"
            icon={<Package className="h-5 w-5" />}
            title="Orders"
            description="View, fulfill, and track orders across channels."
          />
          <QuickCard
            to="/products"
            icon={<ShoppingBag className="h-5 w-5" />}
            title="Catalog"
            description="Manage products, variants, and pricing."
          />
          <QuickCard
            to="/commerce/payment-links"
            icon={<Link2 className="h-5 w-5" />}
            title="Payment Links"
            description="Create tokenized payment links to send in chat."
          />
          <QuickCard
            to="/commerce/promotions"
            icon={<Percent className="h-5 w-5" />}
            title="Promotions"
            description="Coupons, BXGY, bundles, and automatic discounts."
          />
          <QuickCard
            to="/commerce/ai"
            icon={<Sparkles className="h-5 w-5" />}
            title="AI Commerce"
            description="Recommendations, forecasts, and abandoned cart recovery."
          />
        </div>

        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Recent orders</h3>
            <Button asChild size="sm" variant="outline">
              <Link to="/commerce/orders">View all</Link>
            </Button>
          </div>
          {isLoading && <Skeleton className="h-24 w-full" />}
          {!isLoading && !data?.recentOrders?.length && (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No orders yet. Create your first payment link to start selling.
            </p>
          )}
          <div className="space-y-2">
            {(data?.recentOrders ?? [])
              .slice(0, 8)
              .map(
                (o: {
                  id: string;
                  total?: number;
                  status?: string;
                  payment_status?: string;
                  created_at?: string;
                }) => (
                  <Link
                    key={o.id}
                    to="/commerce/orders/$orderId"
                    params={{ orderId: o.id }}
                    className="flex items-center justify-between p-3 rounded-control border hover:bg-muted"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">{o.status ?? "pending"}</Badge>
                      <span className="text-sm">
                        {o.created_at ? zonedDate(o.created_at, { dateStyle: "short" }) : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={o.payment_status === "paid" ? "default" : "secondary"}>
                        {o.payment_status}
                      </Badge>
                      <span className="font-medium">{money(o.total ?? 0)}</span>
                    </div>
                  </Link>
                ),
              )}
          </div>
        </Card>
      </div>
    </>
  );
}

function KpiCard({
  icon,
  label,
  value,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  loading?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        {icon}
        {label}
      </div>
      {loading ? (
        <Skeleton className="h-9 w-20" />
      ) : (
        <div className="text-2xl font-semibold">{value}</div>
      )}
    </Card>
  );
}

function QuickCard({
  to,
  icon,
  title,
  description,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link to={to} className="block">
      <Card className="p-4 hover:border-primary transition-colors h-full">
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <h3 className="font-semibold">{title}</h3>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </Card>
    </Link>
  );
}
