import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2, Receipt } from "lucide-react";
import { listMyInvoices } from "@/lib/client-portal/portal.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { useCurrencyFormatter } from "@/hooks/use-currency";
export const Route = createFileRoute("/_authenticated/client/invoices")({
  component: InvoicesPage,
});

function InvoicesPage() {
  const money = useCurrencyFormatter({ locale: "en-US" });
  const fn = useServerFn(listMyInvoices);
  const q = useQuery({ queryKey: ["portal-invoices"], queryFn: () => fn() });
  const invs = q.data ?? [];

  return (
    <div className="space-y-4">
      <header>
        <h2 className="font-display text-2xl font-semibold">Invoices</h2>
        <p className="text-sm text-muted-foreground">Download or pay your invoices.</p>
      </header>

      {q.isLoading ? (
        <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading</div>
      ) : invs.length === 0 ? (
        <div className="rounded-control border border-border bg-surface p-10 text-center">
          <Receipt className="w-8 h-8 mx-auto text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">No invoices.</p>
        </div>
      ) : (
        <div className="rounded-control border border-border bg-surface overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-background/60 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Invoice</th>
                <th className="text-left px-4 py-2.5 font-medium">Issued</th>
                <th className="text-left px-4 py-2.5 font-medium">Due</th>
                <th className="text-right px-4 py-2.5 font-medium">Amount</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-right px-4 py-2.5 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {invs.map((i) => (
                <tr key={i.id} className="border-t border-border">
                  <td className="px-4 py-3 font-mono text-xs">{i.invoice_number}</td>
                  <td className="px-4 py-3">{i.issue_date ? new Date(i.issue_date).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3">{i.due_date ? new Date(i.due_date).toLocaleDateString() : "—"}</td>
                  <td className="px-4 py-3 text-right font-medium">{money(i.total, i.currency)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={i.status === "paid" ? "default" : i.status === "overdue" ? "destructive" : "outline"} className="capitalize">
                      {i.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {i.public_token && (
                      <a href={`/invoices/public/${i.public_token}`} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="ghost"><Download className="w-3.5 h-3.5 " /> View</Button>
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
