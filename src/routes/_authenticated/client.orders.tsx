import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShoppingBag } from "lucide-react";
import { listMyOrders } from "@/lib/client-portal/portal.functions";
import { Badge } from "@/components/ui/badge";

import { useCurrencyFormatter } from "@/hooks/use-currency";
export const Route = createFileRoute("/_authenticated/client/orders")({
  component: OrdersPage,
});

function OrdersPage() {
  const money = useCurrencyFormatter({ locale: "en-US" });
  const fn = useServerFn(listMyOrders);
  const q = useQuery({ queryKey: ["portal-orders"], queryFn: () => fn() });
  const orders = q.data ?? [];

  return (
    <div className="space-y-4">
      <header>
        <h2 className="font-display text-2xl font-semibold">Orders</h2>
        <p className="text-sm text-muted-foreground">Your active deals and orders.</p>
      </header>

      {q.isLoading ? (
        <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading</div>
      ) : orders.length === 0 ? (
        <div className="rounded-control border border-border bg-surface p-10 text-center">
          <ShoppingBag className="w-8 h-8 mx-auto text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">No orders yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <div key={o.id} className="rounded-control border border-border bg-surface p-4 flex items-start justify-between">
              <div className="min-w-0">
                <p className="font-medium">{o.title}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Created {new Date(o.created_at).toLocaleDateString()}
                  {o.expected_close_date && ` · Expected ${new Date(o.expected_close_date).toLocaleDateString()}`}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <p className="font-semibold">{money(o.amount, o.currency)}</p>
                <Badge variant="outline" className="capitalize">{o.status}</Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
