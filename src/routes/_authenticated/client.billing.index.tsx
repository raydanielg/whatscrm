import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listMyInvoices,
  listMyOrders,
  listMyQuotes,
  listMySubscriptions,
  listMyPayments,
  listMyUpcomingPayments,
} from "@/lib/client-portal/portal.functions";
import { Badge } from "@/components/ui/badge";

import { useCurrencyFormatter } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
export const Route = createFileRoute("/_authenticated/client/billing/")({
  component: BillingOverview,
});

function BillingOverview() {
  const money = useCurrencyFormatter({ locale: "en-US" });
  const zonedDate = useZonedDateFormatter();
  const fnInv = useServerFn(listMyInvoices);
  const fnOrd = useServerFn(listMyOrders);
  const fnQ = useServerFn(listMyQuotes);
  const fnSub = useServerFn(listMySubscriptions);
  const fnPay = useServerFn(listMyPayments);
  const fnUp = useServerFn(listMyUpcomingPayments);

  const [invs, ords, qts, subs, , up] = useQueries({
    queries: [
      { queryKey: ["portal-invoices"], queryFn: () => fnInv() },
      { queryKey: ["portal-orders"], queryFn: () => fnOrd() },
      { queryKey: ["portal-quotes"], queryFn: () => fnQ() },
      { queryKey: ["portal-subscriptions"], queryFn: () => fnSub() },
      { queryKey: ["portal-payments"], queryFn: () => fnPay() },
      { queryKey: ["portal-upcoming"], queryFn: () => fnUp() },
    ],
  });

  const openInvoices = (invs.data ?? []).filter((i) =>
    ["sent", "overdue", "partial"].includes(i.status),
  );
  const outstanding = openInvoices.reduce(
    (s, i) => s + Math.max(0, (i.total ?? 0) - (i.amount_paid ?? 0)),
    0,
  );
  const ccy = invs.data?.[0]?.currency ?? null;

  const cards = [
    {
      label: "Outstanding balance",
      value: money(outstanding, ccy),
      sub: `${openInvoices.length} open invoices`,
    },
    {
      label: "Orders",
      value: String((ords.data ?? []).length),
      sub: `${(ords.data ?? []).filter((o) => o.status === "won").length} completed`,
    },
    {
      label: "Active subscriptions",
      value: String(
        (subs.data ?? []).filter((s) => ["active", "trialing"].includes(s.status)).length,
      ),
      sub: `${(subs.data ?? []).length} total`,
    },
    {
      label: "Open quotes",
      value: String(
        (qts.data ?? []).filter((q) => ["sent", "draft", "viewed"].includes(q.status)).length,
      ),
      sub: `${(qts.data ?? []).length} total`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-control border border-border bg-surface p-4">
            <p className="text-xs uppercase text-muted-foreground">{c.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold">{c.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      <section className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-control border border-border bg-surface">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold">Recent invoices</h3>
            <Link to="/client/billing/invoices" className="text-xs text-accent">
              View all
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {(invs.data ?? []).slice(0, 5).map((i) => (
              <li key={i.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                <Link
                  to="/client/billing/invoice/$id"
                  params={{ id: i.id }}
                  className="font-mono text-xs hover:text-accent"
                >
                  {i.invoice_number}
                </Link>
                <span className="flex items-center gap-2">
                  <span className="font-medium">{money(i.total, i.currency)}</span>
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
                </span>
              </li>
            ))}
            {(invs.data ?? []).length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                No invoices yet.
              </li>
            )}
          </ul>
        </div>
        <div className="rounded-control border border-border bg-surface">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold">Upcoming payments</h3>
            <Link to="/client/billing/upcoming" className="text-xs text-accent">
              View all
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {(up.data?.invoices ?? []).slice(0, 5).map((i) => (
              <li
                key={i.id}
                className="px-4 py-2.5 flex items-center justify-between text-sm gap-3"
              >
                <span className="font-mono text-xs">{i.invoice_number}</span>
                <span className="text-muted-foreground text-xs">
                  Due {i.due_date ? zonedDate(i.due_date, { dateStyle: "short" }) : "—"}
                </span>
                <span className="font-medium">{money(i.amount_due ?? i.total, i.currency)}</span>
              </li>
            ))}
            {(up.data?.subscriptions ?? []).slice(0, 3).map((s) => (
              <li
                key={s.id}
                className="px-4 py-2.5 flex items-center justify-between text-sm gap-3"
              >
                <span>{s.plan?.name ?? "Subscription"}</span>
                <span className="text-muted-foreground text-xs">
                  Renews{" "}
                  {s.current_period_end
                    ? zonedDate(s.current_period_end, { dateStyle: "short" })
                    : "—"}
                </span>
                <span className="font-medium">
                  {s.plan ? money(s.plan.price_cents / 100, s.plan.currency) : "—"}
                </span>
              </li>
            ))}
            {(up.data?.invoices?.length ?? 0) + (up.data?.subscriptions?.length ?? 0) === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                Nothing scheduled.
              </li>
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}
