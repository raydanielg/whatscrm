import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  CreditCard,
  Pause,
  Play,
  XCircle,
  Sparkles,
  Loader2,
  ArrowUpRight,
} from "lucide-react";

import { AppTopbar } from "@/components/app/app-topbar";
import { useActiveOrganization } from "@/hooks/use-organization";
import {
  listPublicPlans,
  getMySubscription,
  cancelSubscriptionForOrg,
  pauseSubscription,
  resumeSubscription,
  startTrial,
  recommendPlan,
} from "@/lib/billing/plans.functions";
import { PlanChangeDialog } from "@/components/app/billing/plan-change-dialog";
import { CheckoutReturnBanner } from "@/components/app/billing/checkout-return-banner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RichTextarea } from "@/shared/components/rich-textarea";
import { toast } from "sonner";

import { useCurrencyFormatter } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
type BillingSearch = { plan?: string; checkout?: "success" | "cancel"; intent?: string };

export const Route = createFileRoute("/_authenticated/billing")({
  staticData: { breadcrumb: "Billing" },
  validateSearch: (search: Record<string, unknown>): BillingSearch => ({
    plan: typeof search["plan"] === "string" ? (search["plan"] as string) : undefined,
    checkout:
      search["checkout"] === "success" || search["checkout"] === "cancel"
        ? (search["checkout"] as "success" | "cancel")
        : undefined,
    intent: typeof search["intent"] === "string" ? (search["intent"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Billing" },
      { name: "description", content: "Manage your subscription, seats, and invoices." },
    ],
  }),
  component: BillingPage,
});

function BillingPage() {
  const fmt = useCurrencyFormatter({ locale: "en-US", fromCents: true, maximumFractionDigits: 0 });
  const zonedDate = useZonedDateFormatter();
  const orgs = useActiveOrganization();
  const orgId = orgs.active?.id;

  const listPlansFn = useServerFn(listPublicPlans);
  const getSubFn = useServerFn(getMySubscription);
  const recFn = useServerFn(recommendPlan);
  const cancelFn = useServerFn(cancelSubscriptionForOrg);
  const pauseFn = useServerFn(pauseSubscription);
  const resumeFn = useServerFn(resumeSubscription);
  const trialFn = useServerFn(startTrial);

  const qc = useQueryClient();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const [changeOpen, setChangeOpen] = useState(false);
  const [presetPlan, setPresetPlan] = useState<string | undefined>(undefined);

  // Deep link: /billing?plan=professional opens the review step directly.
  useEffect(() => {
    if (!search.plan) return;
    setPresetPlan(search.plan);
    setChangeOpen(true);
    void navigate({
      search: (prev: BillingSearch) => ({ ...prev, plan: undefined }),
      replace: true,
    });
  }, [search.plan, navigate]);

  const plansQ = useQuery({ queryKey: ["public-plans"], queryFn: () => listPlansFn() });
  const subQ = useQuery({
    queryKey: ["my-subscription", orgId],
    queryFn: () => getSubFn({ data: { organization_id: orgId! } }),
    enabled: !!orgId,
  });
  const recQ = useQuery({
    queryKey: ["plan-recommendation", orgId],
    queryFn: () => recFn({ data: { organization_id: orgId! } }),
    enabled: !!orgId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["my-subscription", orgId] });
    qc.invalidateQueries({ queryKey: ["plan-recommendation", orgId] });
  };

  const cancelMut = useMutation({
    mutationFn: (v: { at_period_end: boolean; reason?: string }) =>
      cancelFn({ data: { organization_id: orgId!, ...v } }),
    onSuccess: () => {
      toast.success("Subscription canceled");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const pauseMut = useMutation({
    mutationFn: () => pauseFn({ data: { organization_id: orgId! } }),
    onSuccess: () => {
      toast.success("Subscription paused");
      invalidate();
    },
  });
  const resumeMut = useMutation({
    mutationFn: () => resumeFn({ data: { organization_id: orgId! } }),
    onSuccess: () => {
      toast.success("Subscription resumed");
      invalidate();
    },
  });
  const trialMut = useMutation({
    mutationFn: (plan_code: string) => trialFn({ data: { organization_id: orgId!, plan_code } }),
    onSuccess: () => {
      toast.success("Trial started");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const sub = subQ.data as null | {
    id: string;
    status: string;
    trial_ends_at: string | null;
    cancel_at: string | null;
    current_period_end: string | null;
    plan: {
      id: string;
      code: string;
      name: string;
      tier: string;
      price_cents: number;
      currency: string;
      interval: string;
      features: Record<string, unknown>;
      limits: Record<string, unknown>;
    };
  };
  const plans = (plansQ.data ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    tier: string;
    price_cents: number;
    currency: string;
    interval: string;
    highlight: boolean;
  }>;
  const rec = recQ.data as
    | {
        recommended_plan: { code: string; name: string } | null;
        reason: string;
        observed_peak: number;
      }
    | undefined;

  const featureBullets = useMemo(() => {
    if (!sub?.plan) return [] as string[];
    const l = sub.plan.limits as Record<string, unknown>;
    const f = sub.plan.features as Record<string, unknown>;
    const items: string[] = [];
    if (l.messages_per_month)
      items.push(
        l.messages_per_month === -1
          ? "Unlimited messages"
          : `${Number(l.messages_per_month).toLocaleString()} messages / month`,
      );
    if (l.agents) items.push(l.agents === -1 ? "Unlimited agents" : `${l.agents} agents`);
    if (f.ai) items.push("AI Studio");
    if (f.automations) items.push("Automations");
    if (f.api) items.push("API access");
    return items;
  }, [sub]);

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      active: "default",
      trialing: "secondary",
      paused: "outline",
      canceled: "destructive",
      past_due: "destructive",
    };
    return (
      <Badge variant={(map[s] ?? "outline") as never} className="capitalize">
        {s.replace(/_/g, " ")}
      </Badge>
    );
  };

  const isPaused = sub?.status === "paused";
  const isActive = sub?.status === "active" || sub?.status === "trialing";

  return (
    <>
      <AppTopbar title="Billing" subtitle="Plan, seats, and invoices" />
      <main className="p-6 space-y-6 max-w-7xl">
        {search.checkout && search.intent && orgId && (
          <CheckoutReturnBanner
            organizationId={orgId}
            intentId={search.intent}
            canceled={search.checkout === "cancel"}
            onSettled={invalidate}
            onDismiss={() =>
              void navigate({
                search: (prev: BillingSearch) => ({
                  ...prev,
                  checkout: undefined,
                  intent: undefined,
                }),
                replace: true,
              })
            }
          />
        )}
        {orgs.isLoading || subQ.isLoading ? (
          <div className="rounded-control border border-border bg-surface p-8 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading subscription
          </div>
        ) : !orgId ? (
          <div className="rounded-control border border-destructive/30 bg-destructive/5 p-6">
            <h3 className="font-display text-lg font-semibold">
              Organization setup needs attention
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Refresh this page to retry automatic setup. If it still fails, contact your platform
              administrator.
            </p>
          </div>
        ) : !sub ? (
          <NoSubscription
            plans={plans}
            onStartTrial={(code) => trialMut.mutate(code)}
            pending={trialMut.isPending}
          />
        ) : (
          <>
            <section className="rounded-control border border-border bg-surface p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs uppercase   text-accent font-medium">Current plan</p>
                    {statusBadge(sub.status)}
                  </div>
                  <h3 className="mt-1 font-display text-2xl font-semibold">{sub.plan.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {fmt(sub.plan.price_cents, sub.plan.currency)} / {sub.plan.interval}
                    {sub.current_period_end &&
                      ` · renews ${zonedDate(sub.current_period_end, { dateStyle: "short" })}`}
                    {sub.trial_ends_at &&
                      sub.status === "trialing" &&
                      ` · trial ends ${zonedDate(sub.trial_ends_at, { dateStyle: "short" })}`}
                  </p>
                  {sub.cancel_at && (
                    <p className="mt-1 text-sm text-destructive">
                      Cancels on {zonedDate(sub.cancel_at, { dateStyle: "short" })}
                    </p>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" onClick={() => setChangeOpen(true)}>
                    Change plan
                  </Button>

                  {isActive && (
                    <Button
                      variant="outline"
                      onClick={() => pauseMut.mutate()}
                      disabled={pauseMut.isPending}
                    >
                      <Pause className="w-4 h-4 " /> Pause
                    </Button>
                  )}
                  {isPaused && (
                    <Button
                      variant="outline"
                      onClick={() => resumeMut.mutate()}
                      disabled={resumeMut.isPending}
                    >
                      <Play className="w-4 h-4 " /> Resume
                    </Button>
                  )}
                  {isActive && !sub.cancel_at && (
                    <CancelDialog
                      onCancel={(reason, immediate) =>
                        cancelMut.mutate({ at_period_end: !immediate, reason })
                      }
                      pending={cancelMut.isPending}
                    />
                  )}
                </div>
              </div>
              {featureBullets.length > 0 && (
                <ul className="mt-4 grid sm:grid-cols-2 gap-2 text-sm">
                  {featureBullets.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-muted-foreground">
                      <Check className="w-4 h-4 text-accent" /> {f}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {rec?.recommended_plan && rec.recommended_plan.code !== sub.plan.code && (
              <section className="rounded-control border border-accent/40 bg-accent/5 p-5 flex items-start gap-3">
                <div className="w-9 h-9 bg-accent/10 text-accent grid place-items-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium">Recommended: {rec.recommended_plan.name}</h4>
                  <p className="text-sm text-muted-foreground mt-1">{rec.reason}</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setPresetPlan(rec.recommended_plan!.code);
                    setChangeOpen(true);
                  }}
                >
                  Switch <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </section>
            )}
          </>
        )}

        <section className="rounded-control border border-border bg-surface p-6">
          <h3 className="font-display font-semibold flex items-center gap-2">
            <CreditCard className="w-4 h-4" /> Payment method
          </h3>
          <p className="text-sm text-muted-foreground mt-2">
            No card on file. You'll be prompted when your trial ends.
          </p>
        </section>

        {orgId && (
          <PlanChangeDialog
            open={changeOpen}
            onOpenChange={(v) => {
              setChangeOpen(v);
              if (!v) setPresetPlan(undefined);
            }}
            plans={plans}
            currentCode={sub?.plan.code ?? null}
            organizationId={orgId}
            initialPlanCode={presetPlan}
            onApplied={invalidate}
          />
        )}
      </main>
    </>
  );
}

function NoSubscription({
  plans,
  onStartTrial,
  pending,
}: {
  plans: Array<{
    code: string;
    name: string;
    price_cents: number;
    currency: string;
    highlight: boolean;
    interval: string;
  }>;
  onStartTrial: (code: string) => void;
  pending: boolean;
}) {
  const fmt = useCurrencyFormatter({ locale: "en-US", fromCents: true, maximumFractionDigits: 0 });
  const monthly = plans.filter((p) => p.interval === "month");
  return (
    <div className="rounded-control border border-dashed border-border p-8 text-center">
      <h3 className="font-display text-xl font-semibold">Start your free trial</h3>
      <p className="text-sm text-muted-foreground mt-1">
        Try any plan free for 14 days. No credit card required.
      </p>
      <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {monthly.map((p) => (
          <button
            key={p.code}
            onClick={() => onStartTrial(p.code)}
            disabled={pending}
            className={`rounded-control border p-4 text-left hover:border-border-strong transition ${p.highlight ? "border-accent" : "border-border"}`}
          >
            <div className="text-xs uppercase   text-muted-foreground">{p.code}</div>
            <div className="mt-1 font-medium">{p.name}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {fmt(p.price_cents, p.currency)} / mo
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function CancelDialog({
  onCancel,
  pending,
}: {
  onCancel: (reason: string, immediate: boolean) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [immediate, setImmediate] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="text-destructive hover:text-destructive">
          <XCircle className="w-4 h-4 " /> Cancel
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel subscription</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          You'll keep access until the end of your current billing period. We'd love to hear what we
          could do better.
        </p>
        <RichTextarea
          placeholder="Why are you canceling? (optional)"
          value={reason}
          onChange={(v) => setReason(v)}
          rows={3}
        />
        <div className="flex items-center gap-2 text-sm">
          <Checkbox
            id="cancel-immediate-billing"
            checked={immediate}
            onCheckedChange={(v) => setImmediate(v === true)}
          />
          <Label htmlFor="cancel-immediate-billing" className="font-normal">
            Cancel immediately instead of at period end
          </Label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Keep subscription
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onCancel(reason, immediate);
              setOpen(false);
            }}
            disabled={pending}
          >
            Confirm cancellation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
