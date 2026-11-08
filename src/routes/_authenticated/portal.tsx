import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CreditCard,
  Check,
  XCircle,
  Loader2,
  Sparkles,
  Receipt,
  Gift,
  MapPin,
  FileText,
  Download,
  Trash2,
  Star,
  RefreshCw,
  AlertTriangle,
  Calendar,
  Wallet,
  TicketPercent,
  ShieldCheck,
  ArrowUpRight,
  PauseCircle,
  PlayCircle,
} from "lucide-react";
import { toast } from "sonner";

import { AppTopbar } from "@/components/app/app-topbar";
import { useResolvedOrgId } from "@/hooks/use-organization";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

import {
  listPublicPlans,
  getMySubscription,
  changePlan,
  cancelSubscriptionForOrg,
  pauseSubscription,
  resumeSubscription,
  recommendPlan,
} from "@/lib/billing/plans.functions";
import { listOrgInvoices } from "@/lib/billing/billing.functions";
import { getUsageSummary } from "@/lib/billing/usage.functions";
import {
  getPortalOverview,
  updateBillingInfo,
  setDefaultPaymentMethod,
  removePaymentMethod,
  validateCoupon,
  applyCouponToSubscription,
  applyReferralCredit,
  reactivateSubscription,
} from "@/lib/billing/portal.functions";

import { useCurrencyFormatter } from "@/hooks/use-currency";
export const Route = createFileRoute("/_authenticated/portal")({
  staticData: { breadcrumb: "Billing portal" },
  head: () => ({
    meta: [
      { title: "Billing portal" },
      {
        name: "description",
        content:
          "Self-service billing: manage your plan, invoices, payment methods, taxes, coupons, and usage.",
      },
    ],
  }),
  component: PortalPage,
});

const shortDate = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString() : "—");

function PortalPage() {
  // Resolve the ACTIVE org (switcher / stored slot), not just the first
  // membership — otherwise the portal renders "No organization selected"
  // while the org list is still loading or after an org switch.
  const { organizationId: orgId, isLoading: orgsLoading, isMissingContext } = useResolvedOrgId();

  const overviewFn = useServerFn(getPortalOverview);
  const invoicesFn = useServerFn(listOrgInvoices);
  const plansFn = useServerFn(listPublicPlans);
  const subFn = useServerFn(getMySubscription);
  const usageFn = useServerFn(getUsageSummary);
  const recFn = useServerFn(recommendPlan);

  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["portal-overview", orgId] });
    qc.invalidateQueries({ queryKey: ["my-subscription", orgId] });
    qc.invalidateQueries({ queryKey: ["portal-invoices", orgId] });
    qc.invalidateQueries({ queryKey: ["portal-usage", orgId] });
  };

  const overviewQ = useQuery({
    queryKey: ["portal-overview", orgId],
    queryFn: () => overviewFn({ data: { organization_id: orgId! } }),
    enabled: !!orgId,
  });
  const subQ = useQuery({
    queryKey: ["my-subscription", orgId],
    queryFn: () => subFn({ data: { organization_id: orgId! } }),
    enabled: !!orgId,
  });
  const plansQ = useQuery({ queryKey: ["public-plans"], queryFn: () => plansFn() });
  const invoicesQ = useQuery({
    queryKey: ["portal-invoices", orgId],
    queryFn: () => invoicesFn({ data: { organization_id: orgId! } }),
    enabled: !!orgId,
  });
  const usageQ = useQuery({
    queryKey: ["portal-usage", orgId],
    queryFn: () => usageFn({ data: { organization_id: orgId! } }),
    enabled: !!orgId,
  });
  const recQ = useQuery({
    queryKey: ["plan-recommendation", orgId],
    queryFn: () => recFn({ data: { organization_id: orgId! } }),
    enabled: !!orgId,
  });

  const loading = orgsLoading || overviewQ.isLoading || subQ.isLoading;

  return (
    <>
      <AppTopbar
        title="Billing portal"
        subtitle="Plan, invoices, payment methods, taxes, and usage"
      />
      <main className="p-6 space-y-6 max-w-6xl mx-auto">
        {loading ? (
          <div className="rounded-control border border-border bg-surface p-10 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading your billing portal
          </div>
        ) : !orgId ? (
          <div className="rounded-control border p-6 text-sm text-muted-foreground">
            {isMissingContext
              ? "You are not a member of any organization yet."
              : "Preparing your organization"}
          </div>
        ) : (
          <>
            <HeaderCard
              orgId={orgId}
              overview={overviewQ.data}
              sub={subQ.data as SubShape}
              rec={recQ.data as RecShape}
              plans={(plansQ.data ?? []) as PlanShape[]}
              onChanged={invalidate}
            />

            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-2 md:grid-cols-6">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="plans">Plans</TabsTrigger>
                <TabsTrigger value="invoices">Invoices</TabsTrigger>
                <TabsTrigger value="methods">Payment</TabsTrigger>
                <TabsTrigger value="billing-info">Billing info</TabsTrigger>
                <TabsTrigger value="usage">Usage</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4 mt-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <CouponCard
                    orgId={orgId}
                    coupon={overviewQ.data?.coupon}
                    onChanged={invalidate}
                  />
                  <ReferralCard
                    orgId={orgId}
                    referral={overviewQ.data?.referral}
                    onChanged={invalidate}
                  />
                </div>
                <PaymentHistoryCard payments={overviewQ.data?.recent_payments ?? []} />
              </TabsContent>

              <TabsContent value="plans" className="mt-4">
                <PlansGrid
                  orgId={orgId}
                  currentCode={(subQ.data as SubShape)?.plan?.code ?? null}
                  plans={(plansQ.data ?? []) as PlanShape[]}
                  onChanged={invalidate}
                />
              </TabsContent>

              <TabsContent value="invoices" className="mt-4">
                <InvoicesTable invoices={(invoicesQ.data ?? []) as InvoiceRow[]} />
              </TabsContent>

              <TabsContent value="methods" className="mt-4">
                <PaymentMethodsPanel
                  orgId={orgId}
                  methods={overviewQ.data?.payment_methods ?? []}
                  onChanged={invalidate}
                />
              </TabsContent>

              <TabsContent value="billing-info" className="mt-4">
                <BillingInfoForm
                  orgId={orgId}
                  customer={overviewQ.data?.customer as CustomerRow}
                  onChanged={invalidate}
                />
              </TabsContent>

              <TabsContent value="usage" className="mt-4">
                <UsagePanel meters={(usageQ.data ?? []) as UsageRow[]} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </>
  );
}

/* -------------------------------- Types --------------------------------- */

type PlanShape = {
  id: string;
  code: string;
  name: string;
  tier: string;
  price_cents: number;
  currency: string;
  interval: string;
  highlight: boolean;
};
type SubShape = null | {
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
type RecShape =
  | {
      recommended_plan: { code: string; name: string } | null;
      reason: string;
      observed_peak: number;
    }
  | undefined;
type PaymentMethodRow = {
  id: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default: boolean;
  provider: string;
  type: string;
  status: string;
};
type InvoiceRow = {
  id: string;
  number?: string | null;
  status: string;
  total?: number;
  amount_due?: number;
  currency: string;
  issued_at?: string | null;
  due_at?: string | null;
  created_at?: string;
  pdf_url?: string | null;
};
type UsageRow = {
  key: string;
  label?: string;
  used: number;
  limit?: number | null;
  unit?: string | null;
};
type PaymentRow = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  paid_at: string | null;
  reference: string | null;
  processor: string | null;
  processor_ref: string | null;
  created_at: string;
  invoice_id: string | null;
};

/* --------------------------- Header hero card --------------------------- */

function statusColor(status: string): "default" | "secondary" | "outline" | "destructive" {
  if (status === "active") return "default";
  if (status === "trialing") return "secondary";
  if (status === "paused") return "outline";
  return "destructive";
}

function HeaderCard({
  orgId,
  overview,
  sub,
  rec,
  plans,
  onChanged,
}: {
  orgId: string;
  overview: Awaited<ReturnType<typeof getPortalOverview>> | undefined;
  sub: SubShape;
  rec: RecShape;
  plans: PlanShape[];
  onChanged: () => void;
}) {
  const money = useCurrencyFormatter({
    locale: "en-US",
    fromCents: true,
    maximumFractionDigits: 2,
  });
  const changeFn = useServerFn(changePlan);
  const cancelFn = useServerFn(cancelSubscriptionForOrg);
  const pauseFnS = useServerFn(pauseSubscription);
  const resumeFnS = useServerFn(resumeSubscription);
  const reactivateFn = useServerFn(reactivateSubscription);

  const changeMut = useMutation({
    mutationFn: (code: string) => changeFn({ data: { organization_id: orgId, plan_code: code } }),
    onSuccess: () => {
      toast.success("Plan updated");
      onChanged();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const cancelMut = useMutation({
    mutationFn: (v: { reason: string; immediate: boolean }) =>
      cancelFn({ data: { organization_id: orgId, reason: v.reason, at_period_end: !v.immediate } }),
    onSuccess: () => {
      toast.success("Subscription canceled");
      onChanged();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const pauseMut = useMutation({
    mutationFn: () => pauseFnS({ data: { organization_id: orgId } }),
    onSuccess: () => {
      toast.success("Subscription paused");
      onChanged();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const resumeMut = useMutation({
    mutationFn: () => resumeFnS({ data: { organization_id: orgId } }),
    onSuccess: () => {
      toast.success("Subscription resumed");
      onChanged();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const reactivateMut = useMutation({
    mutationFn: () => reactivateFn({ data: { organization_id: orgId } }),
    onSuccess: () => {
      toast.success("Subscription reactivated");
      onChanged();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const referralCredit = overview?.referral.credit_cents ?? 0;
  const status = sub?.status ?? "none";
  const isTrial = status === "trialing";
  const isPaused = status === "paused";
  const isActive = status === "active" || isTrial;
  const willCancel = !!sub?.cancel_at;

  const featureBullets = useMemo(() => {
    if (!sub?.plan) return [] as string[];
    const l = sub.plan.limits as Record<string, unknown>;
    const f = sub.plan.features as Record<string, unknown>;
    const items: string[] = [];
    if (l.messages_per_month)
      items.push(
        l.messages_per_month === -1
          ? "Unlimited messages"
          : `${Number(l.messages_per_month).toLocaleString()} messages / mo`,
      );
    if (l.agents) items.push(l.agents === -1 ? "Unlimited agents" : `${l.agents} agents`);
    if (f.ai) items.push("AI Studio");
    if (f.automations) items.push("Automations");
    if (f.api) items.push("API access");
    return items;
  }, [sub]);

  return (
    <section className="rounded-control border border-border bg-gradient-to-br from-surface to-surface/60 p-6 md:p-8 relative overflow-hidden">
      <div className="absolute -top-12 -right-12 w-56 h-56 rounded-full bg-accent/10 blur-3xl pointer-events-none" />
      <div className="relative flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs uppercase   text-accent font-medium">Current plan</p>
            <Badge variant={statusColor(status)} className="capitalize">
              {status.replace(/_/g, " ")}
            </Badge>
            {isTrial && sub?.trial_ends_at && (
              <Badge variant="outline" className="gap-1">
                <Sparkles className="w-3 h-3" /> Trial ends {shortDate(sub.trial_ends_at)}
              </Badge>
            )}
            {willCancel && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="w-3 h-3" /> Cancels {shortDate(sub!.cancel_at)}
              </Badge>
            )}
          </div>
          <h2 className="mt-2 font-display text-3xl font-semibold">
            {sub?.plan?.name ?? "No active plan"}
          </h2>
          {sub?.plan && (
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
              <span>
                {money(sub.plan.price_cents, sub.plan.currency)} / {sub.plan.interval}
              </span>
              {sub.current_period_end && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> renews {shortDate(sub.current_period_end)}
                </span>
              )}
            </p>
          )}
          {featureBullets.length > 0 && (
            <ul className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              {featureBullets.map((f) => (
                <li key={f} className="flex items-center gap-2 text-muted-foreground">
                  <Check className="w-3.5 h-3.5 text-accent" /> {f}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-2 flex-wrap justify-end">
          {referralCredit > 0 && (
            <Badge variant="secondary" className="gap-1 py-1.5 px-3">
              <Gift className="w-3.5 h-3.5" /> {money(referralCredit)} credit
            </Badge>
          )}
          {isActive && !willCancel && (
            <>
              <Button
                variant="outline"
                onClick={() => pauseMut.mutate()}
                disabled={pauseMut.isPending}
              >
                <PauseCircle className="w-4 h-4 " /> Pause
              </Button>
              <CancelDialog
                onCancel={(r, i) => cancelMut.mutate({ reason: r, immediate: i })}
                pending={cancelMut.isPending}
              />
            </>
          )}
          {isPaused && (
            <Button
              variant="outline"
              onClick={() => resumeMut.mutate()}
              disabled={resumeMut.isPending}
            >
              <PlayCircle className="w-4 h-4 " /> Resume
            </Button>
          )}
          {(willCancel || status === "canceled") && (
            <Button onClick={() => reactivateMut.mutate()} disabled={reactivateMut.isPending}>
              <RefreshCw className="w-4 h-4 " /> Reactivate
            </Button>
          )}
        </div>
      </div>

      {rec?.recommended_plan && sub?.plan && rec.recommended_plan.code !== sub.plan.code && (
        <div className="relative mt-6 rounded-control border border-accent/40 bg-accent/5 p-4 flex items-start gap-3">
          <div className="w-9 h-9 bg-accent/10 text-accent grid place-items-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium">Recommended: {rec.recommended_plan.name}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{rec.reason}</p>
          </div>
          <Button
            size="sm"
            onClick={() => changeMut.mutate(rec.recommended_plan!.code)}
            disabled={changeMut.isPending}
          >
            Switch <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
      )}

      {!sub && plans.length > 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          Choose a plan below to activate your subscription.
        </p>
      )}
    </section>
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
          <XCircle className="w-4 h-4 " /> Cancel plan
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel subscription</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          You'll keep access until the end of your billing period. Tell us what went wrong so we can
          improve.
        </p>
        <Textarea
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
        />
        <div className="flex items-center gap-2 text-sm">
          <Checkbox
            id="cancel-immediate-portal"
            checked={immediate}
            onCheckedChange={(v) => setImmediate(v === true)}
          />
          <Label htmlFor="cancel-immediate-portal" className="font-normal">
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

/* ------------------------------ Plans grid ------------------------------ */

function PlansGrid({
  orgId,
  currentCode,
  plans,
  onChanged,
}: {
  orgId: string;
  currentCode: string | null;
  plans: PlanShape[];
  onChanged: () => void;
}) {
  const money = useCurrencyFormatter({
    locale: "en-US",
    fromCents: true,
    maximumFractionDigits: 2,
  });
  const [interval, setInterval] = useState<"month" | "year">("month");
  const changeFn = useServerFn(changePlan);
  const changeMut = useMutation({
    mutationFn: (v: { code: string; atPeriodEnd: boolean }) =>
      changeFn({
        data: { organization_id: orgId, plan_code: v.code, at_period_end: v.atPeriodEnd },
      }),
    onSuccess: () => {
      toast.success("Plan updated");
      onChanged();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const items = plans.filter((p) => p.interval === interval);

  return (
    <section className="space-y-4">
      <div className="flex justify-center">
        <div className="inline-flex items-center rounded-control border border-border p-1 text-sm bg-surface">
          <button
            onClick={() => setInterval("month")}
            className={`px-4 py-1.5 rounded-control transition ${interval === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setInterval("year")}
            className={`px-4 py-1.5 rounded-control transition ${interval === "year" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            Yearly · save 20%
          </button>
        </div>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((p) => {
          const isCurrent = p.code === currentCode;
          return (
            <div
              key={p.id}
              className={`rounded-control border p-5 flex flex-col transition ${p.highlight ? "border-accent shadow-lg shadow-accent/10" : "border-border"}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs uppercase   text-muted-foreground">{p.tier}</div>
                  <div className="mt-1 font-medium text-lg">{p.name}</div>
                </div>
                {p.highlight && <Badge variant="secondary">Popular</Badge>}
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="font-display text-3xl font-semibold">
                  {money(p.price_cents, p.currency)}
                </span>
                <span className="text-sm text-muted-foreground">/ {p.interval}</span>
              </div>
              <div className="mt-4 flex flex-col gap-2">
                <Button
                  disabled={isCurrent || changeMut.isPending}
                  onClick={() => changeMut.mutate({ code: p.code, atPeriodEnd: false })}
                >
                  {isCurrent ? "Current plan" : "Switch now"}
                </Button>
                {!isCurrent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => changeMut.mutate({ code: p.code, atPeriodEnd: true })}
                    disabled={changeMut.isPending}
                  >
                    At next renewal
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------ Invoices -------------------------------- */

function InvoicesTable({ invoices }: { invoices: InvoiceRow[] }) {
  const money = useCurrencyFormatter({
    locale: "en-US",
    fromCents: true,
    maximumFractionDigits: 2,
  });
  if (!invoices.length) {
    return (
      <div className="rounded-control border border-dashed p-8 text-center text-sm text-muted-foreground">
        No invoices yet.
      </div>
    );
  }
  return (
    <div className="rounded-control border border-border bg-surface overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="text-left px-4 py-2.5 font-medium">Invoice</th>
            <th className="text-left px-4 py-2.5 font-medium">Date</th>
            <th className="text-left px-4 py-2.5 font-medium">Status</th>
            <th className="text-right px-4 py-2.5 font-medium">Amount</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr key={inv.id} className="border-t border-border">
              <td className="px-4 py-3 font-mono text-xs">{inv.number ?? inv.id.slice(0, 8)}</td>
              <td className="px-4 py-3">{shortDate(inv.issued_at ?? inv.created_at)}</td>
              <td className="px-4 py-3">
                <Badge
                  variant={
                    inv.status === "paid"
                      ? "default"
                      : inv.status === "open"
                        ? "secondary"
                        : "outline"
                  }
                  className="capitalize"
                >
                  {inv.status}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right font-medium">
                {money(Number(inv.total ?? inv.amount_due ?? 0), inv.currency)}
              </td>
              <td className="px-4 py-3 text-right">
                {inv.pdf_url ? (
                  <a
                    href={inv.pdf_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-accent hover:underline text-xs"
                  >
                    <Download className="w-3.5 h-3.5" /> PDF
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------------- Payment methods --------------------------- */

function PaymentMethodsPanel({
  orgId,
  methods,
  onChanged,
}: {
  orgId: string;
  methods: PaymentMethodRow[];
  onChanged: () => void;
}) {
  const defaultFn = useServerFn(setDefaultPaymentMethod);
  const removeFn = useServerFn(removePaymentMethod);
  const defaultMut = useMutation({
    mutationFn: (id: string) =>
      defaultFn({ data: { organization_id: orgId, payment_method_id: id } }),
    onSuccess: () => {
      toast.success("Default updated");
      onChanged();
    },
  });
  const removeMut = useMutation({
    mutationFn: (id: string) =>
      removeFn({ data: { organization_id: orgId, payment_method_id: id } }),
    onSuccess: () => {
      toast.success("Card removed");
      onChanged();
    },
  });

  return (
    <div className="space-y-3">
      {methods.length === 0 ? (
        <div className="rounded-control border border-dashed p-8 text-center text-sm text-muted-foreground">
          No payment methods on file. You'll be prompted to add one when your trial ends.
        </div>
      ) : (
        methods.map((m) => (
          <div
            key={m.id}
            className="rounded-control border border-border bg-surface p-4 flex items-center gap-4"
          >
            <div className="w-11 h-11 rounded-control bg-muted grid place-items-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium capitalize flex items-center gap-2">
                {m.brand ?? m.type} •••• {m.last4 ?? "----"}
                {m.is_default && (
                  <Badge variant="secondary" className="gap-1">
                    <Star className="w-3 h-3" /> Default
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {m.exp_month && m.exp_year
                  ? `Expires ${String(m.exp_month).padStart(2, "0")}/${m.exp_year}`
                  : m.provider}
                {m.status !== "active" && ` · ${m.status}`}
              </div>
            </div>
            <div className="flex gap-1">
              {!m.is_default && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => defaultMut.mutate(m.id)}
                  disabled={defaultMut.isPending}
                >
                  Make default
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => removeMut.mutate(m.id)}
                disabled={removeMut.isPending}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))
      )}
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5" /> Card details are stored securely with your payment
        provider. We only keep the last 4 digits.
      </p>
    </div>
  );
}

/* --------------------------- Billing info form ------------------------- */

type CustomerRow =
  | {
      name: string | null;
      email: string | null;
      tax_id: string | null;
      billing_address: Record<string, unknown> | null;
    }
  | null
  | undefined;

function BillingInfoForm({
  orgId,
  customer,
  onChanged,
}: {
  orgId: string;
  customer: CustomerRow;
  onChanged: () => void;
}) {
  const addr = (customer?.billing_address ?? {}) as Record<string, string>;
  const [form, setForm] = useState({
    name: customer?.name ?? "",
    email: customer?.email ?? "",
    tax_id: customer?.tax_id ?? "",
    line1: addr.line1 ?? "",
    line2: addr.line2 ?? "",
    city: addr.city ?? "",
    state: addr.state ?? "",
    postal_code: addr.postal_code ?? "",
    country: addr.country ?? "",
  });
  const updateFn = useServerFn(updateBillingInfo);
  const mut = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          organization_id: orgId,
          name: form.name || null,
          email: form.email || null,
          tax_id: form.tax_id || null,
          billing_address: {
            line1: form.line1,
            line2: form.line2,
            city: form.city,
            state: form.state,
            postal_code: form.postal_code,
            country: form.country,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Billing info saved");
      onChanged();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        mut.mutate();
      }}
      className="rounded-control border border-border bg-surface p-6 space-y-5"
    >
      <div>
        <h3 className="font-medium flex items-center gap-2">
          <MapPin className="w-4 h-4 text-accent" /> Contact & tax
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Appears on invoices, receipts, and tax documents.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Company / billing name">
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Acme, Inc."
          />
        </Field>
        <Field label="Billing email">
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="finance@acme.com"
          />
        </Field>
        <Field label="Tax / VAT ID" className="sm:col-span-2">
          <Input
            value={form.tax_id}
            onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
            placeholder="EU VAT / GST / EIN"
          />
        </Field>
      </div>
      <div className="pt-4 border-t border-border grid sm:grid-cols-2 gap-4">
        <Field label="Address line 1" className="sm:col-span-2">
          <Input value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} />
        </Field>
        <Field label="Address line 2" className="sm:col-span-2">
          <Input value={form.line2} onChange={(e) => setForm({ ...form, line2: e.target.value })} />
        </Field>
        <Field label="City">
          <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </Field>
        <Field label="State / region">
          <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
        </Field>
        <Field label="Postal code">
          <Input
            value={form.postal_code}
            onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
          />
        </Field>
        <Field label="Country (ISO-2)">
          <Input
            value={form.country}
            maxLength={2}
            onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })}
            placeholder="US"
          />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={mut.isPending}>
          {mut.isPending ? "Saving" : "Save billing info"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs uppercase   text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/* -------------------------------- Usage -------------------------------- */

function UsagePanel({ meters }: { meters: UsageRow[] }) {
  if (!meters.length) {
    return (
      <div className="rounded-control border border-dashed p-8 text-center text-sm text-muted-foreground">
        Usage will appear here once your team starts sending messages.
      </div>
    );
  }
  return (
    <div className="grid md:grid-cols-2 gap-3">
      {meters.map((m) => {
        const limit = m.limit ?? 0;
        const pct = limit > 0 ? Math.min(100, Math.round((m.used / limit) * 100)) : 0;
        const near = pct >= 80;
        return (
          <div key={m.key} className="rounded-control border border-border bg-surface p-4">
            <div className="flex items-baseline justify-between">
              <div className="font-medium">{m.label ?? m.key}</div>
              <div className={`text-sm ${near ? "text-destructive" : "text-muted-foreground"}`}>
                {m.used.toLocaleString()}
                {limit > 0 ? ` / ${limit.toLocaleString()}` : ""} {m.unit ?? ""}
              </div>
            </div>
            {limit > 0 && <Progress value={pct} className="mt-3 h-2" />}
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------- Coupon & referral -------------------------- */

function CouponCard({
  orgId,
  coupon,
  onChanged,
}: {
  orgId: string;
  coupon: { code: string | null; applied_at: string | null } | undefined;
  onChanged: () => void;
}) {
  const money = useCurrencyFormatter({
    locale: "en-US",
    fromCents: true,
    maximumFractionDigits: 2,
  });
  const [code, setCode] = useState("");
  const validateFn = useServerFn(validateCoupon);
  const applyFn = useServerFn(applyCouponToSubscription);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof validateCoupon>> | null>(null);

  const previewMut = useMutation({
    mutationFn: () => validateFn({ data: { organization_id: orgId, code } }),
    onSuccess: (r) => setPreview(r),
    onError: (e) => toast.error((e as Error).message),
  });
  const applyMut = useMutation({
    mutationFn: () => applyFn({ data: { organization_id: orgId, code } }),
    onSuccess: () => {
      toast.success("Coupon applied");
      setPreview(null);
      setCode("");
      onChanged();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="rounded-control border border-border bg-surface p-5">
      <h3 className="font-medium flex items-center gap-2">
        <TicketPercent className="w-4 h-4 text-accent" /> Coupon
      </h3>
      {coupon?.code ? (
        <p className="text-sm text-muted-foreground mt-2">
          Active coupon: <span className="font-mono text-foreground">{coupon.code}</span>
          {coupon.applied_at && ` · applied ${shortDate(coupon.applied_at)}`}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground mt-2">
          Have a promo code? Redeem it for a discount on your next invoice.
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. LAUNCH20"
        />
        <Button
          variant="outline"
          onClick={() => previewMut.mutate()}
          disabled={!code || previewMut.isPending}
        >
          Check
        </Button>
        <Button
          onClick={() => applyMut.mutate()}
          disabled={!code || applyMut.isPending || !preview?.ok}
        >
          Apply
        </Button>
      </div>
      {preview && (
        <p className={`text-xs mt-2 ${preview.ok ? "text-accent" : "text-destructive"}`}>
          {preview.ok
            ? `${preview.coupon.name} — ${preview.coupon.discount_type === "percent" ? `${preview.coupon.percent_off}% off` : money(preview.coupon.amount_off_cents ?? 0, preview.coupon.currency)}`
            : preview.reason}
        </p>
      )}
    </div>
  );
}

function ReferralCard({
  orgId,
  referral,
  onChanged,
}: {
  orgId: string;
  referral:
    | {
        credit_cents: number;
        referral_code: string | null;
        redemptions: Array<{ code: string; credit_cents: number; applied_at: string }>;
      }
    | undefined;
  onChanged: () => void;
}) {
  const money = useCurrencyFormatter({
    locale: "en-US",
    fromCents: true,
    maximumFractionDigits: 2,
  });
  const [code, setCode] = useState("");
  const applyFn = useServerFn(applyReferralCredit);
  const mut = useMutation({
    mutationFn: () => applyFn({ data: { organization_id: orgId, referral_code: code } }),
    onSuccess: (r) => {
      toast.success(`+${money(r.credit_cents)} credit added`);
      setCode("");
      onChanged();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <div className="rounded-control border border-border bg-surface p-5">
      <h3 className="font-medium flex items-center gap-2">
        <Gift className="w-4 h-4 text-accent" /> Referral credits
      </h3>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-display text-2xl font-semibold">
          {money(referral?.credit_cents ?? 0)}
        </span>
        <span className="text-xs text-muted-foreground">available credit</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Applied automatically to your next invoice. Redeemed {referral?.redemptions.length ?? 0}×.
      </p>
      <div className="mt-3 flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Referral code"
        />
        <Button onClick={() => mut.mutate()} disabled={!code || mut.isPending}>
          Redeem
        </Button>
      </div>
    </div>
  );
}

/* --------------------------- Payment history --------------------------- */

function PaymentHistoryCard({ payments }: { payments: PaymentRow[] }) {
  const money = useCurrencyFormatter({
    locale: "en-US",
    fromCents: true,
    maximumFractionDigits: 2,
  });
  return (
    <div className="rounded-control border border-border bg-surface p-5">
      <h3 className="font-medium flex items-center gap-2">
        <Receipt className="w-4 h-4 text-accent" /> Payment history
      </h3>
      {payments.length === 0 ? (
        <p className="text-sm text-muted-foreground mt-3">No payments recorded yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {payments.slice(0, 8).map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2.5 text-sm">
              <div className="w-8 h-8 rounded-control bg-muted grid place-items-center">
                <Wallet className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate">
                  {money(p.amount, p.currency)} ·{" "}
                  <span className="capitalize text-muted-foreground">
                    {p.method?.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {shortDate(p.paid_at ?? p.created_at)}
                  {p.reference && ` · ${p.reference}`}
                </div>
              </div>
              <Badge
                variant={
                  p.status === "completed" || p.status === "succeeded"
                    ? "default"
                    : p.status === "failed"
                      ? "destructive"
                      : "outline"
                }
                className="capitalize"
              >
                {p.status}
              </Badge>
              {p.invoice_id && (
                <a
                  className="text-accent hover:underline text-xs inline-flex items-center gap-1"
                  href={`/billing-documents?doc=${p.invoice_id}`}
                >
                  <FileText className="w-3.5 h-3.5" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
