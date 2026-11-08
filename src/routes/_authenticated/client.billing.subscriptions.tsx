import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Repeat } from "lucide-react";
import { listMySubscriptions } from "@/lib/client-portal/portal.functions";
import { Badge } from "@/components/ui/badge";

import { useCurrencyFormatter } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
export const Route = createFileRoute("/_authenticated/client/billing/subscriptions")({
  component: SubscriptionsPage,
});

function SubscriptionsPage() {
  const money = useCurrencyFormatter({ locale: "en-US", fromCents: true });
  const zonedDate = useZonedDateFormatter();
  const fn = useServerFn(listMySubscriptions);
  const q = useQuery({ queryKey: ["portal-subscriptions"], queryFn: () => fn() });
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
        <Repeat className="w-8 h-8 mx-auto text-muted-foreground/50" />
        <p className="mt-3 text-sm text-muted-foreground">No active subscriptions.</p>
      </div>
    );
  return (
    <div className="grid md:grid-cols-2 gap-3">
      {rows.map((s) => (
        <div key={s.id} className="rounded-control border border-border bg-surface p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-display text-lg font-semibold">{s.plan?.name ?? "Subscription"}</p>
              <p className="text-xs text-muted-foreground">
                {s.plan
                  ? `${money(s.plan.price_cents, s.plan.currency)} / ${s.plan.interval}`
                  : "—"}
              </p>
            </div>
            <Badge
              variant={
                s.status === "active"
                  ? "default"
                  : s.status === "canceled"
                    ? "destructive"
                    : "outline"
              }
              className="capitalize"
            >
              {s.status}
            </Badge>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <dt className="text-muted-foreground">Seats</dt>
            <dd>{s.seats ?? 1}</dd>
            <dt className="text-muted-foreground">Current period</dt>
            <dd>
              {s.current_period_start
                ? zonedDate(s.current_period_start, { dateStyle: "short" })
                : "—"}
              {" – "}
              {s.current_period_end ? zonedDate(s.current_period_end, { dateStyle: "short" }) : "—"}
            </dd>
            {s.trial_ends_at && (
              <>
                <dt className="text-muted-foreground">Trial ends</dt>
                <dd>{zonedDate(s.trial_ends_at, { dateStyle: "short" })}</dd>
              </>
            )}
            {s.cancel_at && (
              <>
                <dt className="text-muted-foreground">Cancels on</dt>
                <dd>{zonedDate(s.cancel_at, { dateStyle: "short" })}</dd>
              </>
            )}
          </dl>
        </div>
      ))}
    </div>
  );
}
