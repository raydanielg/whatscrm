import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Wallet, RotateCcw } from "lucide-react";
import { listMyPayments } from "@/lib/client-portal/portal.functions";
import { Badge } from "@/components/ui/badge";

import { useCurrencyFormatter } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
export const Route = createFileRoute("/_authenticated/client/billing/payments")({
  component: PaymentsPage,
});

function PaymentsPage() {
  const money = useCurrencyFormatter({ locale: "en-US" });
  const zonedDate = useZonedDateFormatter();
  const fn = useServerFn(listMyPayments);
  const q = useQuery({ queryKey: ["portal-payments"], queryFn: () => fn() });
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
        <Wallet className="w-8 h-8 mx-auto text-muted-foreground/50" />
        <p className="mt-3 text-sm text-muted-foreground">No payment history yet.</p>
      </div>
    );
  return (
    <div className="rounded-control border border-border bg-surface overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-background/60 text-xs text-muted-foreground">
          <tr>
            <th className="text-left px-4 py-2.5 font-medium">Date</th>
            <th className="text-left px-4 py-2.5 font-medium">Reference</th>
            <th className="text-left px-4 py-2.5 font-medium">Method</th>
            <th className="text-left px-4 py-2.5 font-medium">Invoice</th>
            <th className="text-right px-4 py-2.5 font-medium">Amount</th>
            <th className="text-left px-4 py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-t border-border">
              <td className="px-4 py-3">
                {p.paid_at ? zonedDate(p.paid_at, { dateStyle: "short" }) : "—"}
              </td>
              <td className="px-4 py-3 font-mono text-xs">{p.reference ?? p.id.slice(0, 8)}</td>
              <td className="px-4 py-3 capitalize">{p.method ?? "—"}</td>
              <td className="px-4 py-3">
                {p.invoice_id ? (
                  <Link
                    to="/client/billing/invoice/$id"
                    params={{ id: p.invoice_id }}
                    className="text-xs text-accent hover:underline"
                  >
                    View
                  </Link>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-4 py-3 text-right font-medium">{money(p.amount, p.currency)}</td>
              <td className="px-4 py-3">
                <Badge
                  variant={
                    p.status === "refunded" || p.status === "failed" || p.status === "cancelled"
                      ? p.status === "refunded"
                        ? "destructive"
                        : "outline"
                      : "default"
                  }
                  className="capitalize"
                >
                  {p.status === "refunded" && <RotateCcw className="w-3 h-3 " />}
                  {p.status}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
