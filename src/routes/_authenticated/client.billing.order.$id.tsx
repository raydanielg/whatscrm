import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, CheckCircle2, Truck, PackageCheck, Package } from "lucide-react";
import { getMyOrderDetail } from "@/lib/client-portal/portal.functions";
import { Badge } from "@/components/ui/badge";

import { useCurrencyFormatter } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
export const Route = createFileRoute("/_authenticated/client/billing/order/$id")({
  component: OrderDetailPage,
});

function OrderDetailPage() {
  const money = useCurrencyFormatter({ locale: "en-US" });
  const zonedDate = useZonedDateFormatter();
  const { id } = Route.useParams();
  const fn = useServerFn(getMyOrderDetail);
  const q = useQuery({ queryKey: ["portal-order", id], queryFn: () => fn({ data: { id } }) });
  if (q.isLoading)
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading
      </div>
    );
  if (q.isError || !q.data)
    return <div className="p-8 text-sm text-muted-foreground">Order not found.</div>;
  const { order, stages, history, invoices } = q.data;

  const stageMap = new Map(stages.map((s) => [s.id, s]));
  const currentStage = order.stage_id ? stageMap.get(order.stage_id) : null;
  const reachedIds = new Set<string>();
  for (const h of history) if (h.to_stage_id) reachedIds.add(h.to_stage_id);
  if (order.stage_id) reachedIds.add(order.stage_id);

  return (
    <div className="space-y-5">
      <Link
        to="/client/billing/orders"
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back
      </Link>

      <header className="rounded-control border border-border bg-surface p-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase text-muted-foreground">Order</p>
          <h1 className="font-display text-2xl font-semibold">{order.title}</h1>
          {order.description && (
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">{order.description}</p>
          )}
        </div>
        <div className="text-right">
          <Badge
            variant={
              order.status === "won"
                ? "default"
                : order.status === "lost"
                  ? "destructive"
                  : "outline"
            }
            className="capitalize"
          >
            {order.status ?? "open"}
          </Badge>
          <p className="mt-3 font-display text-2xl font-semibold">
            {money(order.amount ?? 0, order.currency)}
          </p>
        </div>
      </header>

      <section className="rounded-control border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
          <Truck className="w-4 h-4" /> Order tracking
        </h3>
        {stages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pipeline stages configured.</p>
        ) : (
          <ol className="relative flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            {stages.map((s, idx) => {
              const reached = reachedIds.has(s.id);
              const current = currentStage?.id === s.id;
              const Icon = s.is_won ? PackageCheck : idx === 0 ? Package : Truck;
              return (
                <li
                  key={s.id}
                  className="flex md:flex-col items-center md:items-center gap-2 md:flex-1 md:text-center"
                >
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center border ${
                      current
                        ? "bg-accent text-accent-foreground border-accent"
                        : reached
                          ? "bg-accent/15 text-accent border-accent/40"
                          : "bg-background text-muted-foreground border-border"
                    }`}
                  >
                    {reached && !current ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <Icon className="w-4 h-4" />
                    )}
                  </div>
                  <div className="md:mt-1">
                    <p
                      className={`text-xs font-medium ${current ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {s.name}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-control border border-border bg-surface">
          <div className="px-4 py-2.5 border-b border-border text-sm font-semibold">
            Status history
          </div>
          <ol className="p-4 space-y-3">
            {history.length === 0 && (
              <li className="text-xs text-muted-foreground">No history yet.</li>
            )}
            {history.map((h) => {
              const to = h.to_stage_id ? stageMap.get(h.to_stage_id)?.name : h.to_status;
              const from = h.from_stage_id ? stageMap.get(h.from_stage_id)?.name : h.from_status;
              return (
                <li key={h.id} className="flex gap-3 text-sm">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 text-accent" />
                  <div>
                    <p>
                      <span className="text-muted-foreground">{from ?? "—"} →</span>{" "}
                      <span className="font-medium">{to ?? "—"}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {zonedDate(h.created_at, { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
        <div className="rounded-control border border-border bg-surface">
          <div className="px-4 py-2.5 border-b border-border text-sm font-semibold">
            Related invoices
          </div>
          <ul className="divide-y divide-border">
            {invoices.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                No invoices for this order.
              </li>
            )}
            {invoices.map((i) => (
              <li key={i.id} className="px-4 py-2.5 flex items-center justify-between text-sm">
                <Link
                  to="/client/billing/invoice/$id"
                  params={{ id: i.id }}
                  className="font-mono text-xs hover:text-accent"
                >
                  {i.invoice_number}
                </Link>
                <span className="text-muted-foreground text-xs">
                  {i.issue_date ? zonedDate(i.issue_date, { dateStyle: "short" }) : "—"}
                </span>
                <span className="font-medium">{money(i.total, i.currency)}</span>
                <Badge variant={i.status === "paid" ? "default" : "outline"} className="capitalize">
                  {i.status}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
