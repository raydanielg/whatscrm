import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Receipt, Plus, ExternalLink } from "lucide-react";
import { useQuotes, QUOTE_STATUS_META } from "@/hooks/use-quotes";
import { useInvoices, INVOICE_STATUS_META } from "@/hooks/use-invoices";

import { useCurrencyFormatter } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
export function DealDocumentsPanel({ dealId }: { dealId: string }) {
  const money = useCurrencyFormatter();
  const formatZonedDate = useZonedDateFormatter();
  const { data: quotes = [], isLoading: qLoading } = useQuotes({ dealId });
  const { data: invoices = [], isLoading: iLoading } = useInvoices({ dealId });

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <FileText className="w-4 h-4" /> Quotes
            <span className="text-xs text-muted-foreground font-normal">({quotes.length})</span>
          </h3>
          <Link to="/quotes">
            <Button size="sm" variant="outline" className="h-7">
              <Plus className="w-3.5 h-3.5 " /> New quote
            </Button>
          </Link>
        </div>
        {qLoading ? (
          <p className="text-sm text-muted-foreground">Loading</p>
        ) : quotes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No quotes generated yet.</p>
        ) : (
          <ul className="divide-y divide-border/50 -mx-1">
            {quotes.map((q) => {
              const meta = QUOTE_STATUS_META[q.status] ?? {
                label: q.status,
                tone: "default" as const,
              };
              return (
                <li key={q.id}>
                  <Link
                    to="/quotes/$quoteId"
                    params={{ quoteId: q.id }}
                    className="flex items-center gap-3 px-1 py-2 hover:bg-muted/50 rounded transition-colors"
                  >
                    <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {q.quote_number} — {q.title ?? "Quote"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {money(Number(q.total ?? 0), q.currency)} · v{q.version ?? 1}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[11px]">
                      {meta.label}
                    </Badge>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Receipt className="w-4 h-4" /> Invoices
            <span className="text-xs text-muted-foreground font-normal">({invoices.length})</span>
          </h3>
          <Link to="/invoices">
            <Button size="sm" variant="outline" className="h-7">
              <Plus className="w-3.5 h-3.5 " /> New invoice
            </Button>
          </Link>
        </div>
        {iLoading ? (
          <p className="text-sm text-muted-foreground">Loading</p>
        ) : invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invoices for this deal.</p>
        ) : (
          <ul className="divide-y divide-border/50 -mx-1">
            {invoices.map((i) => {
              const meta = INVOICE_STATUS_META[i.status] ?? {
                label: i.status,
                tone: "default" as const,
              };
              const overdue = i.status === "overdue";
              return (
                <li key={i.id}>
                  <Link
                    to="/invoices/$invoiceId"
                    params={{ invoiceId: i.id }}
                    className="flex items-center gap-3 px-1 py-2 hover:bg-muted/50 rounded transition-colors"
                  >
                    <Receipt
                      className={`w-4 h-4 flex-shrink-0 ${overdue ? "text-destructive" : "text-muted-foreground"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {i.invoice_number} — {money(Number(i.total ?? 0), i.currency)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Due {money(Number(i.amount_due ?? 0), i.currency)}
                        {i.due_date ? ` · ${formatZonedDate(i.due_date, {})}` : ""}
                      </div>
                    </div>
                    <Badge variant={overdue ? "destructive" : "outline"} className="text-[11px]">
                      {meta.label}
                    </Badge>
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
