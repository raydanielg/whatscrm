import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2, Receipt, CreditCard } from "lucide-react";
import { listMyInvoices, initiateInvoicePayment } from "@/lib/client-portal/portal.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

import { useCurrencyFormatter } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
export const Route = createFileRoute("/_authenticated/client/billing/invoices")({
  component: InvoicesPage,
});

function InvoicesPage() {
  const money = useCurrencyFormatter({ locale: "en-US" });
  const zonedDate = useZonedDateFormatter();
  const fn = useServerFn(listMyInvoices);
  const payFn = useServerFn(initiateInvoicePayment);
  const q = useQuery({ queryKey: ["portal-invoices"], queryFn: () => fn() });
  const pay = useMutation({
    mutationFn: (invoice_id: string) => payFn({ data: { invoice_id } }),
    onSuccess: (r) => {
      if (r.checkout_url) window.open(r.checkout_url, "_blank");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Payment failed"),
  });
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
        <Receipt className="w-8 h-8 mx-auto text-muted-foreground/50" />
        <p className="mt-3 text-sm text-muted-foreground">No invoices.</p>
      </div>
    );
  return (
    <div className="rounded-control border border-border bg-surface overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-background/60 text-xs text-muted-foreground">
          <tr>
            <th className="text-left px-4 py-2.5 font-medium">Invoice</th>
            <th className="text-left px-4 py-2.5 font-medium">Issued</th>
            <th className="text-left px-4 py-2.5 font-medium">Due</th>
            <th className="text-right px-4 py-2.5 font-medium">Amount</th>
            <th className="text-right px-4 py-2.5 font-medium">Balance</th>
            <th className="text-left px-4 py-2.5 font-medium">Status</th>
            <th className="text-right px-4 py-2.5 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => {
            const balance = Math.max(0, (i.total ?? 0) - (i.amount_paid ?? 0));
            const canPay = ["sent", "overdue", "partial"].includes(i.status) && balance > 0;
            return (
              <tr key={i.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <Link
                    to="/client/billing/invoice/$id"
                    params={{ id: i.id }}
                    className="font-mono text-xs hover:text-accent"
                  >
                    {i.invoice_number}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {i.issue_date ? zonedDate(i.issue_date, { dateStyle: "short" }) : "—"}
                </td>
                <td className="px-4 py-3">
                  {i.due_date ? zonedDate(i.due_date, { dateStyle: "short" }) : "—"}
                </td>
                <td className="px-4 py-3 text-right font-medium">{money(i.total, i.currency)}</td>
                <td className="px-4 py-3 text-right">{money(balance, i.currency)}</td>
                <td className="px-4 py-3">
                  <Badge
                    variant={
                      i.status === "paid"
                        ? "default"
                        : i.status === "overdue"
                          ? "destructive"
                          : "outline"
                    }
                    className="capitalize"
                  >
                    {i.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right space-x-1">
                  {i.public_token && (
                    <a href={`/invoices/public/${i.public_token}`} target="_blank" rel="noreferrer">
                      <Button size="sm" variant="ghost">
                        <Download className="w-3.5 h-3.5 " /> PDF
                      </Button>
                    </a>
                  )}
                  {canPay && (
                    <Button size="sm" onClick={() => pay.mutate(i.id)} disabled={pay.isPending}>
                      <CreditCard className="w-3.5 h-3.5 " /> Pay
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
