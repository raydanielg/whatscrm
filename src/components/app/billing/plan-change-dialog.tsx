/**
 * Upgrade / downgrade dialog.
 *
 * Step 1 — pick a plan (monthly / yearly)
 * Step 2 — review the change: direction, proration, what you gain or lose,
 *          and whether the gateway will ask for payment
 * Step 3 — confirm → applied locally, scheduled for renewal, or redirected to
 *          the hosted checkout page (which returns to /billing?checkout=)
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDownRight, ArrowUpRight, Check, ExternalLink, Loader2, Minus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { beginPlanChange, previewPlanChange } from "@/lib/billing/plan-change.functions";

import { useCurrencyFormatter } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
export type CatalogPlan = {
  code: string;
  name: string;
  price_cents: number;
  currency: string;
  interval: string;
  tier: string;
  highlight: boolean;
};

export function PlanChangeDialog({
  open,
  onOpenChange,
  plans,
  currentCode,
  organizationId,
  workspaceId,
  initialPlanCode,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plans: CatalogPlan[];
  currentCode: string | null;
  organizationId: string;
  workspaceId?: string | null;
  initialPlanCode?: string | undefined;
  onApplied: () => void;
}) {
  const money = useCurrencyFormatter({
    locale: "en-US",
    fromCents: true,
    maximumFractionDigits: 0,
  });
  const zonedDate = useZonedDateFormatter();
  const [interval, setBillingInterval] = useState<"month" | "year">("month");
  const [selected, setSelected] = useState<string | null>(initialPlanCode ?? null);
  const [atPeriodEnd, setAtPeriodEnd] = useState<boolean | null>(null);

  const previewFn = useServerFn(previewPlanChange);
  const beginFn = useServerFn(beginPlanChange);

  useEffect(() => {
    if (!open) return;
    setSelected(initialPlanCode ?? null);
    setAtPeriodEnd(null);
    const p = plans.find((x) => x.code === initialPlanCode);
    if (p?.interval === "year") setBillingInterval("year");
  }, [open, initialPlanCode, plans]);

  const previewQ = useQuery({
    queryKey: ["plan-change-preview", organizationId, workspaceId, selected],
    queryFn: () =>
      previewFn({
        data: {
          organization_id: organizationId,
          workspace_id: workspaceId ?? null,
          plan_code: selected!,
        },
      }),
    enabled: open && !!selected,
  });
  const preview = previewQ.data;

  const effectiveAtPeriodEnd = atPeriodEnd ?? preview?.recommended_at_period_end ?? false;
  // Paid plan with no gateway to sell it: only the platform team can activate it.
  const manualActivationNeeded =
    !!preview && !preview.requires_checkout && Number(preview.target_plan.price_cents ?? 0) > 0;

  const beginMut = useMutation({
    mutationFn: () =>
      beginFn({
        data: {
          organization_id: organizationId,
          workspace_id: workspaceId ?? null,
          plan_code: selected!,
          at_period_end: effectiveAtPeriodEnd,
          return_url: `${window.location.origin}/billing`,
          cancel_url: `${window.location.origin}/billing`,
        },
      }),
    onSuccess: (res) => {
      if (res.mode === "checkout") {
        toast.info("Redirecting to secure checkout");
        window.location.assign(res.url);
        return;
      }
      onOpenChange(false);
      toast.success(
        res.mode === "scheduled"
          ? `Change scheduled${res.effective_date ? ` for ${zonedDate(res.effective_date, { dateStyle: "short" })}` : " for your renewal date"}.`
          : "Your plan has been updated.",
      );
      onApplied();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const items = useMemo(() => plans.filter((p) => p.interval === interval), [plans, interval]);

  const dirIcon =
    preview?.direction === "upgrade" ? (
      <ArrowUpRight className="size-4 text-whatsapp" />
    ) : preview?.direction === "downgrade" ? (
      <ArrowDownRight className="size-4 text-muted-foreground" />
    ) : (
      <Minus className="size-4 text-muted-foreground" />
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{selected ? "Review your change" : "Change plan"}</DialogTitle>
          <DialogDescription>
            {selected
              ? "Confirm what changes, when it takes effect, and what you'll be charged today."
              : "Pick the plan you want to move to."}
          </DialogDescription>
        </DialogHeader>

        {!selected ? (
          <>
            <div className="mx-auto inline-flex items-center rounded-control border border-border p-1 text-sm">
              {(["month", "year"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setBillingInterval(v)}
                  className={`rounded-control px-4 py-1 ${interval === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >
                  {v === "month" ? "Monthly" : "Yearly"}
                </button>
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {items.map((p) => {
                const isCurrent = p.code === currentCode;
                return (
                  <button
                    key={p.code}
                    type="button"
                    disabled={isCurrent}
                    onClick={() => setSelected(p.code)}
                    className={`rounded-control border p-4 text-left transition disabled:opacity-60 ${
                      p.highlight ? "border-accent" : "border-border"
                    } ${isCurrent ? "" : "hover:border-border-strong"}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs capitalize text-muted-foreground">{p.tier}</div>
                      </div>
                      {isCurrent ? (
                        <Badge variant="outline">Current</Badge>
                      ) : p.highlight ? (
                        <Badge variant="secondary">Popular</Badge>
                      ) : null}
                    </div>
                    <div className="mt-2 text-sm">
                      {money(p.price_cents, p.currency)} / {p.interval}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        ) : previewQ.isLoading ? (
          <div className="flex items-center gap-2 p-6 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Calculating your change
          </div>
        ) : previewQ.isError ? (
          <p className="p-4 text-sm text-destructive">{(previewQ.error as Error).message}</p>
        ) : preview ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-control border border-border bg-surface p-4">
              <span className="text-sm text-muted-foreground">
                {preview.current_plan?.name ?? "No plan"}
              </span>
              {dirIcon}
              <span className="font-medium">{preview.target_plan.name}</span>
              <Badge
                variant={preview.direction === "downgrade" ? "outline" : "secondary"}
                className="capitalize"
              >
                {preview.direction}
              </Badge>
              <span className="ml-auto text-sm">
                {money(preview.target_plan.price_cents, preview.target_plan.currency)} /{" "}
                {preview.target_plan.interval}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-control border border-border p-4 text-sm">
                <p className="font-medium">Billing</p>
                {preview.proration_credit_cents > 0 && (
                  <p className="mt-1 text-muted-foreground">
                    Unused credit from your current period:{" "}
                    {money(preview.proration_credit_cents, preview.currency)}
                  </p>
                )}
                <p className="mt-1 text-muted-foreground">
                  {effectiveAtPeriodEnd
                    ? "Nothing is charged today — the new price applies at your next renewal."
                    : preview.requires_checkout
                      ? `Due today at checkout: ${money(preview.amount_due_now_cents, preview.currency)}`
                      : manualActivationNeeded
                        ? "Online payment isn't available for this plan. Contact the platform administrator to activate this paid plan."
                        : "No payment required — entitlement updates immediately."}
                </p>
                {preview.checkout_provider && !effectiveAtPeriodEnd && (
                  <p className="mt-1 text-xs text-muted-foreground capitalize">
                    via {preview.checkout_provider}
                  </p>
                )}
              </div>
              <div className="rounded-control border border-border p-4 text-sm">
                <p className="font-medium">Takes effect</p>
                <p className="mt-1 text-muted-foreground">
                  {effectiveAtPeriodEnd && preview.effective_date
                    ? zonedDate(preview.effective_date, { dateStyle: "short" })
                    : effectiveAtPeriodEnd
                      ? "At your next renewal"
                      : "Immediately"}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant={!effectiveAtPeriodEnd ? "default" : "outline"}
                    onClick={() => setAtPeriodEnd(false)}
                  >
                    Now
                  </Button>
                  <Button
                    size="sm"
                    variant={effectiveAtPeriodEnd ? "default" : "outline"}
                    onClick={() => setAtPeriodEnd(true)}
                    disabled={!preview.current_plan}
                  >
                    At renewal
                  </Button>
                </div>
              </div>
            </div>

            {(preview.gains.length > 0 || preview.losses.length > 0) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {preview.gains.length > 0 && (
                  <ul className="space-y-1 text-sm">
                    {preview.gains.map((g) => (
                      <li
                        key={g}
                        className="flex items-start gap-2 capitalize text-muted-foreground"
                      >
                        <Check className="mt-0.5 size-4 shrink-0 text-whatsapp" /> {g}
                      </li>
                    ))}
                  </ul>
                )}
                {preview.losses.length > 0 && (
                  <ul className="space-y-1 text-sm">
                    {preview.losses.map((l) => (
                      <li
                        key={l}
                        className="flex items-start gap-2 capitalize text-muted-foreground"
                      >
                        <Minus className="mt-0.5 size-4 shrink-0 text-destructive" /> You lose {l}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter>
          {selected && (
            <Button
              variant="outline"
              onClick={() => setSelected(null)}
              disabled={beginMut.isPending}
            >
              Back
            </Button>
          )}
          <Button
            disabled={
              !selected || previewQ.isLoading || beginMut.isPending || preview?.direction === "same"
            }
            onClick={() => beginMut.mutate()}
          >
            {beginMut.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}
            {preview?.requires_checkout && !effectiveAtPeriodEnd ? (
              <>
                Continue to checkout <ExternalLink className="ml-1 size-3.5" />
              </>
            ) : effectiveAtPeriodEnd ? (
              "Schedule change"
            ) : (
              "Confirm change"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
