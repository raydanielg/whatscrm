import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Loader2 } from "lucide-react";
import { listMyUpcomingPayments } from "@/lib/client-portal/portal.functions";

import { useCurrencyFormatter } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
export const Route = createFileRoute("/_authenticated/client/billing/upcoming")({
  component: UpcomingPage,
});

function UpcomingPage() {
  const money = useCurrencyFormatter({ locale: "en-US" });
  const zonedDate = useZonedDateFormatter();
  const fn = useServerFn(listMyUpcomingPayments);
  const q = useQuery({ queryKey: ["portal-upcoming"], queryFn: () => fn() });
  if (q.isLoading)
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading
      </div>
    );
  const invoices = q.data?.invoices ?? [];
  const subs = q.data?.subscriptions ?? [];
  const empty = invoices.length === 0 && subs.length === 0;

  if (empty)
    return (
      <div className="rounded-control border border-border bg-surface p-10 text-center">
        <CalendarClock className="w-8 h-8 mx-auto text-muted-foreground/50" />
        <p className="mt-3 text-sm text-muted-foreground">Nothing scheduled.</p>
      </div>
    );

  return (
    <div className="space-y-6">
      {invoices.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-2">Invoices due</h3>
          <div className="rounded-control border border-border bg-surface divide-y divide-border">
            {invoices.map((i) => (
              <div key={i.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <Link
                  to="/client/billing/invoice/$id"
                  params={{ id: i.id }}
                  className="font-mono text-xs hover:text-accent"
                >
                  {i.invoice_number}
                </Link>
                <span className="text-muted-foreground text-xs">
                  Due {i.due_date ? zonedDate(i.due_date, { dateStyle: "short" }) : "—"}
                </span>
                <span className="font-medium">{money(i.amount_due ?? i.total, i.currency)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      {subs.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-2">Subscription renewals</h3>
          <div className="rounded-control border border-border bg-surface divide-y divide-border">
            {subs.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3 text-sm">
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
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
