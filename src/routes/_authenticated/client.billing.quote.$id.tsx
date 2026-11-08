import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, Download, Loader2, X } from "lucide-react";
import { getMyQuoteDetail, respondToQuote } from "@/lib/client-portal/portal.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

import { useCurrencyFormatter } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
export const Route = createFileRoute("/_authenticated/client/billing/quote/$id")({
  component: QuoteDetailPage,
});

function QuoteDetailPage() {
  const money = useCurrencyFormatter({ locale: "en-US" });
  const zonedDate = useZonedDateFormatter();
  const { id } = Route.useParams();
  const router = useRouter();
  const fn = useServerFn(getMyQuoteDetail);
  const respond = useServerFn(respondToQuote);
  const q = useQuery({ queryKey: ["portal-quote", id], queryFn: () => fn({ data: { id } }) });
  const m = useMutation({
    mutationFn: (action: "accept" | "reject") => respond({ data: { id, action } }),
    onSuccess: () => {
      toast.success("Response recorded");
      router.invalidate();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (q.isLoading)
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading
      </div>
    );
  if (q.isError || !q.data)
    return <div className="p-8 text-sm text-muted-foreground">Quote not found.</div>;
  const { quote: qt, items } = q.data;
  const canRespond = ["sent", "viewed", "draft"].includes(qt.status);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link
          to="/client/billing/quotes"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </Link>
        {qt.public_token && (
          <a href={`/quotes/public/${qt.public_token}`} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline">
              <Download className="w-3.5 h-3.5 " /> Download PDF
            </Button>
          </a>
        )}
      </div>

      <header className="rounded-control border border-border bg-surface p-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase text-muted-foreground">Quote</p>
          <h1 className="font-display text-2xl font-semibold">{qt.title}</h1>
          <p className="text-xs text-muted-foreground mt-1 font-mono">{qt.quote_number}</p>
          {qt.valid_until && (
            <p className="text-xs text-muted-foreground mt-1">
              Valid until {zonedDate(qt.valid_until, { dateStyle: "short" })}
            </p>
          )}
        </div>
        <div className="text-right">
          <Badge
            variant={
              qt.status === "accepted"
                ? "default"
                : qt.status === "rejected"
                  ? "destructive"
                  : "outline"
            }
            className="capitalize"
          >
            {qt.status}
          </Badge>
          <p className="mt-3 font-display text-2xl font-semibold">{money(qt.total, qt.currency)}</p>
        </div>
      </header>

      <section className="rounded-control border border-border bg-surface overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border text-sm font-semibold">Line items</div>
        <table className="w-full text-sm">
          <thead className="bg-background/60 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Description</th>
              <th className="text-right px-4 py-2 font-medium">Qty</th>
              <th className="text-right px-4 py-2 font-medium">Unit</th>
              <th className="text-right px-4 py-2 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-t border-border">
                <td className="px-4 py-2.5">
                  <div className="font-medium">{it.name}</div>
                  {it.description && (
                    <div className="text-xs text-muted-foreground">{it.description}</div>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">{it.quantity}</td>
                <td className="px-4 py-2.5 text-right">{money(it.unit_price, qt.currency)}</td>
                <td className="px-4 py-2.5 text-right font-medium">
                  {money(it.total, qt.currency)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-sm">
            <tr className="border-t border-border">
              <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground">
                Subtotal
              </td>
              <td className="px-4 py-2 text-right">{money(qt.subtotal, qt.currency)}</td>
            </tr>
            {qt.discount_total > 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground">
                  Discount
                </td>
                <td className="px-4 py-2 text-right">-{money(qt.discount_total, qt.currency)}</td>
              </tr>
            )}
            {qt.tax_total > 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground">
                  Tax
                </td>
                <td className="px-4 py-2 text-right">{money(qt.tax_total, qt.currency)}</td>
              </tr>
            )}
            <tr className="border-t border-border">
              <td colSpan={3} className="px-4 py-2 text-right font-semibold">
                Total
              </td>
              <td className="px-4 py-2 text-right font-semibold">{money(qt.total, qt.currency)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      {qt.terms && (
        <section className="rounded-control border border-border bg-surface p-4">
          <h4 className="text-sm font-semibold mb-1">Terms</h4>
          <p className="text-sm text-muted-foreground whitespace-pre-line">{qt.terms}</p>
        </section>
      )}

      {canRespond && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => m.mutate("reject")} disabled={m.isPending}>
            <X className="w-3.5 h-3.5 " /> Decline
          </Button>
          <Button onClick={() => m.mutate("accept")} disabled={m.isPending}>
            <Check className="w-3.5 h-3.5 " /> Accept quote
          </Button>
        </div>
      )}
    </div>
  );
}
