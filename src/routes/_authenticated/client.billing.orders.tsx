import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShoppingBag } from "lucide-react";
import { listMyOrders } from "@/lib/client-portal/portal.functions";
import { Badge } from "@/components/ui/badge";

import { useCurrencyFormatter } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
export const Route = createFileRoute("/_authenticated/client/billing/orders")({
  component: OrdersPage,
});

function OrdersPage() {
  const money = useCurrencyFormatter({ locale: "en-US" });
  const zonedDate = useZonedDateFormatter();
  const fn = useServerFn(listMyOrders);
  const q = useQuery({ queryKey: ["portal-orders"], queryFn: () => fn() });
  const rows = q.data ?? [];
  if (q.isLoading)
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading
      </div>
    );
  if (rows.length === 0)
    return (
      <div className="rounded-control border border-border bg-surface p-10 text-center">
        <ShoppingBag className="w-8 h-8 mx-auto text-muted-foreground/50" />
        <p className="mt-3 text-sm text-muted-foreground">No orders yet.</p>
      </div>
    );
  return (
    <div className="rounded-control border border-border bg-surface overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-background/60 text-xs text-muted-foreground">
          <tr>
            <th className="text-left px-4 py-2.5 font-medium">Order</th>
            <th className="text-left px-4 py-2.5 font-medium">Created</th>
            <th className="text-left px-4 py-2.5 font-medium">Expected close</th>
            <th className="text-right px-4 py-2.5 font-medium">Amount</th>
            <th className="text-left px-4 py-2.5 font-medium">Status</th>
            <th className="text-right px-4 py-2.5 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className="border-t border-border">
              <td className="px-4 py-3 font-medium">{o.title}</td>
              <td className="px-4 py-3">{zonedDate(o.created_at, { dateStyle: "short" })}</td>
              <td className="px-4 py-3">
                {o.expected_close_date
                  ? zonedDate(o.expected_close_date, { dateStyle: "short" })
                  : "—"}
              </td>
              <td className="px-4 py-3 text-right">{money(o.amount ?? 0, o.currency)}</td>
              <td className="px-4 py-3">
                <Badge
                  variant={
                    o.status === "won" ? "default" : o.status === "lost" ? "destructive" : "outline"
                  }
                  className="capitalize"
                >
                  {o.status ?? "open"}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right">
                <Link
                  to="/client/billing/order/$id"
                  params={{ id: o.id }}
                  className="text-xs text-accent hover:underline"
                >
                  Track
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
