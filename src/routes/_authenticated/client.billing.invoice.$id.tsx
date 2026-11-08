import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  CreditCard,
  Download,
  Loader2,
  CheckCircle2,
  Eye,
  Send,
  XCircle,
  RotateCcw,
  DollarSign,
  Circle,
} from "lucide-react";
import { getMyInvoiceDetail, initiateInvoicePayment } from "@/lib/client-portal/portal.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

import { useCurrencyFormatter } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
export const Route = createFileRoute("/_authenticated/client/billing/invoice/$id")({
  component: InvoiceDetailPage,
});

const ICONS: Record<string, typeof Circle> = {
  created: Circle,
  sent: Send,
  viewed: Eye,
  payment: DollarSign,
  refunded: RotateCcw,
  paid: CheckCircle2,
  voided: XCircle,
};

function InvoiceDetailPage() {
  const money = useCurrencyFormatter({ locale: "en-US" });
  const zonedDate = useZonedDateFormatter();
  const { id } = Route.useParams();
  const fn = useServerFn(getMyInvoiceDetail);
  const payFn = useServerFn(initiateInvoicePayment);
  const q = useQuery({ queryKey: ["portal-invoice", id], queryFn: () => fn({ data: { id } }) });
  const pay = useMutation({
    mutationFn: () => payFn({ data: { invoice_id: id } }),
    onSuccess: (r) => {
      if (r.checkout_url) window.open(r.checkout_url, "_blank");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Payment failed"),
  });

  if (q.isLoading)
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading
      </div>
    );
  if (q.isError || !q.data)
    return <div className="p-8 text-sm text-muted-foreground">Invoice not found.</div>;

  const { invoice: inv, items, payments, timeline, refunded_total } = q.data;
  const balance = Math.max(0, (inv.total ?? 0) - (inv.amount_paid ?? 0));
  const canPay = ["sent", "overdue", "partial"].includes(inv.status) && balance > 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/client/billing/invoices"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </Link>
        <div className="flex items-center gap-2">
          {inv.public_token && (
            <a href={`/invoices/public/${inv.public_token}`} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline">
                <Download className="w-3.5 h-3.5 " /> Download PDF
              </Button>
            </a>
          )}
          {canPay && (
            <Button size="sm" onClick={() => pay.mutate()} disabled={pay.isPending}>
              <CreditCard className="w-3.5 h-3.5 " /> Pay {money(balance, inv.currency)}
            </Button>
          )}
        </div>
      </div>

      <header className="rounded-control border border-border bg-surface p-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase text-muted-foreground">Invoice</p>
          <h1 className="font-display text-2xl font-semibold">{inv.invoice_number}</h1>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
            <span>
              Issued {inv.issue_date ? zonedDate(inv.issue_date, { dateStyle: "short" }) : "—"}
            </span>
            <span>Due {inv.due_date ? zonedDate(inv.due_date, { dateStyle: "short" }) : "—"}</span>
          </div>
        </div>
        <div className="text-right">
          <Badge
            variant={
              inv.status === "paid"
                ? "default"
                : inv.status === "overdue"
                  ? "destructive"
                  : "outline"
            }
            className="capitalize"
          >
            {inv.status}
          </Badge>
          <p className="mt-3 font-display text-2xl font-semibold">
            {money(inv.total, inv.currency)}
          </p>
          <p className="text-xs text-muted-foreground">Balance {money(balance, inv.currency)}</p>
          {refunded_total > 0 && (
            <p className="text-xs text-destructive">
              Refunded {money(refunded_total, inv.currency)}
            </p>
          )}
        </div>
      </header>

      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
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
                  <td className="px-4 py-2.5 text-right">{money(it.unit_price, inv.currency)}</td>
                  <td className="px-4 py-2.5 text-right font-medium">
                    {money(it.total, inv.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-sm">
              <tr className="border-t border-border">
                <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground">
                  Subtotal
                </td>
                <td className="px-4 py-2 text-right">{money(inv.subtotal, inv.currency)}</td>
              </tr>
              {inv.discount_total > 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground">
                    Discount
                  </td>
                  <td className="px-4 py-2 text-right">
                    -{money(inv.discount_total, inv.currency)}
                  </td>
                </tr>
              )}
              {inv.tax_total > 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground">
                    Tax
                  </td>
                  <td className="px-4 py-2 text-right">{money(inv.tax_total, inv.currency)}</td>
                </tr>
              )}
              <tr className="border-t border-border">
                <td colSpan={3} className="px-4 py-2 text-right font-semibold">
                  Total
                </td>
                <td className="px-4 py-2 text-right font-semibold">
                  {money(inv.total, inv.currency)}
                </td>
              </tr>
              <tr>
                <td colSpan={3} className="px-4 py-2 text-right text-muted-foreground">
                  Paid
                </td>
                <td className="px-4 py-2 text-right">{money(inv.amount_paid, inv.currency)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        <aside className="space-y-4">
          <section className="rounded-control border border-border bg-surface">
            <div className="px-4 py-2.5 border-b border-border text-sm font-semibold">Timeline</div>
            <ol className="p-4 space-y-3">
              {timeline.length === 0 && (
                <li className="text-xs text-muted-foreground">No events yet.</li>
              )}
              {timeline.map((ev, idx) => {
                const Icon = ICONS[ev.kind] ?? Circle;
                return (
                  <li key={idx} className="flex gap-3">
                    <div className="mt-0.5 w-6 h-6 rounded-full bg-accent/10 text-accent flex items-center justify-center">
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{ev.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {zonedDate(ev.at, { dateStyle: "medium", timeStyle: "short" })}
                        {ev.detail ? ` · ${ev.detail}` : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          {payments.length > 0 && (
            <section className="rounded-control border border-border bg-surface">
              <div className="px-4 py-2.5 border-b border-border text-sm font-semibold">
                Receipts & refunds
              </div>
              <ul className="divide-y divide-border">
                {payments.map((p) => (
                  <li
                    key={p.id}
                    className="px-4 py-2.5 text-sm flex items-center justify-between gap-2"
                  >
                    <div>
                      <p className="font-medium">{money(p.amount, p.currency)}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.method ?? "manual"} · {p.reference ?? p.id.slice(0, 8)}
                      </p>
                    </div>
                    <Badge
                      variant={p.status === "refunded" ? "destructive" : "outline"}
                      className="capitalize"
                    >
                      {p.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
