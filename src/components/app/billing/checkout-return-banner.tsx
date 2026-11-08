/**
 * Return leg of the upgrade/downgrade flow.
 *
 * The gateway sends the browser back to /billing?checkout=success&intent=
 * We then poll `finalizePlanChange` until the webhook has moved the
 * subscription onto the new plan, and refresh entitlement queries.
 */

import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { finalizePlanChange } from "@/lib/billing/plan-change.functions";

type State = { status: "working" | "confirmed" | "pending" | "canceled" | "error"; message: string };

export function CheckoutReturnBanner({
  organizationId,
  intentId,
  canceled,
  onSettled,
  onDismiss,
}: {
  organizationId: string;
  intentId: string;
  canceled: boolean;
  onSettled: () => void;
  onDismiss: () => void;
}) {
  const finalizeFn = useServerFn(finalizePlanChange);
  const [state, setState] = useState<State>({
    status: "working",
    message: canceled ? "Cancelling checkout" : "Confirming your payment",
  });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let cancelled = false;
    let attempt = 0;

    const tick = async () => {
      attempt += 1;
      try {
        const res = await finalizeFn({ data: { organization_id: organizationId, intent_id: intentId, canceled } });
        if (cancelled) return;
        if (res.status === "pending" && attempt < 10) {
          setState({ status: "working", message: res.message });
          setTimeout(tick, 2000);
          return;
        }
        setState({
          status: res.status === "confirmed" ? "confirmed" : res.status === "canceled" ? "canceled" : "pending",
          message: res.message,
        });
        onSettled();
      } catch (err) {
        if (cancelled) return;
        setState({ status: "error", message: (err as Error).message });
      }
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [finalizeFn, organizationId, intentId, canceled, onSettled]);

  const tone =
    state.status === "confirmed"
      ? "border-whatsapp/40 bg-whatsapp/5"
      : state.status === "canceled" || state.status === "error"
        ? "border-destructive/40 bg-destructive/5"
        : "border-accent/40 bg-accent/5";

  return (
    <section className={`flex items-start gap-3 rounded-control border p-5 ${tone}`} role="status" aria-live="polite">
      <div className="mt-0.5 shrink-0">
        {state.status === "working" ? (
          <Loader2 className="size-5 animate-spin text-accent" />
        ) : state.status === "confirmed" ? (
          <CheckCircle2 className="size-5 text-whatsapp" />
        ) : (
          <XCircle className="size-5 text-destructive" />
        )}
      </div>
      <div className="flex-1">
        <h4 className="font-medium">
          {state.status === "confirmed"
            ? "Plan updated"
            : state.status === "canceled"
              ? "Checkout canceled"
              : state.status === "error"
                ? "We couldn't confirm the change"
                : "Finishing up"}
        </h4>
        <p className="mt-1 text-sm text-muted-foreground">{state.message}</p>
      </div>
      {state.status !== "working" && (
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      )}
    </section>
  );
}
