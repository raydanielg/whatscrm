import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search } from "lucide-react";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { listOrders } from "@/lib/commerce/commerce.functions";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/commerce/orders")({
  component: OrdersPage,
  staticData: { breadcrumb: "Orders" },
  head: () => ({ meta: [{ title: "Orders — Commerce" }] }),
});

function OrdersPage() {
  const { active } = useCurrentWorkspace();
  const [search, setSearch] = useState("");
  const zonedDate = useZonedDateFormatter();
  const fn = useServerFn(listOrders);
  const { data, isLoading } = useQuery({
    queryKey: ["commerce-orders", active?.id, search],
    enabled: !!active?.id,
    queryFn: () => fn({ data: { workspaceId: active!.id, search: search || undefined } }),
  });

  return (
    <>
      <AppTopbar title="Orders" />
      <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="relative max-w-sm">
          <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search order number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Card>
          {isLoading && (
            <div className="p-4">
              <Skeleton className="h-40 w-full" />
            </div>
          )}
          {!isLoading && !data?.length && (
            <p className="text-center text-sm text-muted-foreground py-12">No orders found.</p>
          )}
          <div className="divide-y">
            {(data ?? []).map((o) => (
              <Link
                key={o.id}
                to="/commerce/orders/$orderId"
                params={{ orderId: o.id }}
                className="flex items-center justify-between p-4 hover:bg-muted"
              >
                <div className="flex items-center gap-3">
                  <div className="font-medium">{o.order_number}</div>
                  <Badge variant="outline">{o.status}</Badge>
                  <Badge variant={o.payment_status === "paid" ? "default" : "secondary"}>
                    {o.payment_status}
                  </Badge>
                  {o.channel && <Badge variant="outline">{o.channel}</Badge>}
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">
                    {o.created_at ? zonedDate(o.created_at, { dateStyle: "short" }) : ""}
                  </span>
                  <span className="font-semibold">
                    {o.currency} {Number(o.total ?? 0).toFixed(2)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
