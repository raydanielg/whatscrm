/**
 * Super Admin — Subscriptions console.
 *
 * Cross-tenant subscription ledger with lifecycle actions (plan change, seat
 * change, trial extension, pause, cancel, resume). Every mutation is a single
 * guarded request with an explicit pending state and cache invalidation.
 */
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2,
  Search,
  RefreshCw,
  Users,
  TrendingUp,
  AlertTriangle,
  Clock,
  Ban,
  PlayCircle,
  PauseCircle,
  BadgeCheck,
} from "lucide-react";

import {
  getPlatformSubscriptions,
  updatePlatformSubscription,
  type PlatformSubscriptionRow,
  type SubscriptionActionInput,
} from "@/lib/admin/platform-modules.functions";
import { adminApplyPlan } from "@/lib/billing/plan-change.functions";
import { RichTextarea } from "@/shared/components/rich-textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

import { useCurrencyFormatter } from "@/hooks/use-currency";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  trialing: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  past_due: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  paused: "bg-muted text-muted-foreground border-border",
  canceled: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  incomplete: "bg-muted text-muted-foreground border-border",
};

export function SubscriptionsConsole() {
  const money = useCurrencyFormatter({ fromCents: true, maximumFractionDigits: 0 });
  const zonedDate = useZonedDateFormatter();
  const when = (iso: string | null) =>
    iso ? zonedDate(iso, { year: "numeric", month: "short", day: "numeric" }) : "—";
  const qc = useQueryClient();
  const fetchSubs = useServerFn(getPlatformSubscriptions);
  const mutateSub = useServerFn(updatePlatformSubscription);

  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [editing, setEditing] = React.useState<PlatformSubscriptionRow | null>(null);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["admin", "subscriptions"],
    queryFn: () => fetchSubs(),
    staleTime: 30_000,
  });

  const action = useMutation({
    mutationFn: (input: SubscriptionActionInput) => mutateSub({ data: input }),
    onSuccess: (_res, vars) => {
      toast.success(`Subscription updated (${vars.action.replace(/_/g, " ")})`);
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.rows ?? []).filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (!q) return true;
      return (
        r.organization_name.toLowerCase().includes(q) ||
        r.organization_slug.toLowerCase().includes(q) ||
        (r.billing_email ?? "").toLowerCase().includes(q) ||
        r.plan_name.toLowerCase().includes(q)
      );
    });
  }, [data?.rows, search, status]);

  if (error) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="p-6 text-sm">
          <div className="flex items-center gap-2 text-destructive font-medium">
            <AlertTriangle className="w-4 h-4" /> Could not load subscriptions
          </div>
          <p className="text-muted-foreground mt-1">{(error as Error).message}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const k = data?.kpis;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Monthly recurring revenue"
          value={isLoading ? null : money(k?.mrrCents ?? 0)}
          icon={TrendingUp}
          tone="text-emerald-600"
        />
        <Kpi
          label="Active subscriptions"
          value={isLoading ? null : String(k?.active ?? 0)}
          icon={Users}
        />
        <Kpi
          label="On trial"
          value={isLoading ? null : String(k?.trialing ?? 0)}
          icon={Clock}
          tone="text-sky-600"
        />
        <Kpi
          label="Needs attention"
          value={isLoading ? null : String((k?.pastDue ?? 0) + (k?.paused ?? 0))}
          icon={AlertTriangle}
          tone="text-amber-600"
          hint={`${k?.renewingSoon ?? 0} renewing within 7 days`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search organization, slug, billing email, or plan"
            className="pl-8"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="trialing">Trialing</SelectItem>
            <SelectItem value="past_due">Past due</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="canceled">Canceled</SelectItem>
            <SelectItem value="incomplete">Incomplete</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={() => refetch()}
          disabled={isFetching}
          aria-label="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs  text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Organization</th>
                <th className="text-left font-medium px-4 py-2.5">Plan</th>
                <th className="text-left font-medium px-4 py-2.5">Status</th>
                <th className="text-right font-medium px-4 py-2.5">Seats</th>
                <th className="text-right font-medium px-4 py-2.5">MRR</th>
                <th className="text-left font-medium px-4 py-2.5">Renews / ends</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t border-border">
                    <td colSpan={7} className="px-4 py-3">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))}

              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    {data?.rows.length
                      ? "No subscriptions match the current filters."
                      : "No subscriptions exist yet. They appear here as soon as a tenant starts a plan or trial."}
                  </td>
                </tr>
              )}

              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-border hover:bg-muted/40 transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <div className="font-medium truncate max-w-[220px]">{r.organization_name}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[220px]">
                      {r.billing_email ?? r.organization_slug}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div>{r.plan_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {money(r.price_cents, r.currency)} / {r.plan_interval}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant="outline" className={STATUS_TONE[r.status] ?? ""}>
                      {r.status.replace(/_/g, " ")}
                    </Badge>
                    {r.cancel_at && (
                      <div className="text-[11px] text-amber-600 mt-1">
                        Cancels {when(r.cancel_at)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right ">{r.seats}</td>
                  <td className="px-4 py-2.5 text-right ">{money(r.mrr_cents, r.currency)}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {r.status === "trialing"
                      ? `Trial ends ${when(r.trial_ends_at)}`
                      : when(r.current_period_end)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="outline" size="sm" onClick={() => setEditing(r)}>
                      Manage
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <ManageDialog
        row={editing}
        plans={data?.plans ?? []}
        onClose={() => setEditing(null)}
        pending={action.isPending}
        onAction={(input) => {
          if (action.isPending) return;
          action.mutate(input);
        }}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
  hint,
}: {
  label: string;
  value: string | null;
  icon: React.ComponentType<{ className?: string }>;
  tone?: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className={`w-4 h-4 ${tone ?? "text-muted-foreground"}`} />
        </div>
        {value === null ? (
          <Skeleton className="h-7 w-20 mt-2" />
        ) : (
          <div className="text-2xl font-semibold mt-1 ">{value}</div>
        )}
        {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function ManageDialog({
  row,
  plans,
  onClose,
  onAction,
  pending,
}: {
  row: PlatformSubscriptionRow | null;
  plans: Array<{
    id: string;
    name: string;
    interval: string;
    price_cents: number;
    currency: string;
    is_active: boolean;
  }>;
  onClose: () => void;
  onAction: (input: SubscriptionActionInput) => void;
  pending: boolean;
}) {
  const money = useCurrencyFormatter({ fromCents: true, maximumFractionDigits: 0 });
  const zonedDateFmt = useZonedDateFormatter();
  const when = (iso: string | null) =>
    iso ? zonedDateFmt(iso, { year: "numeric", month: "short", day: "numeric" }) : "—";
  const [planId, setPlanId] = React.useState("");
  const [seats, setSeats] = React.useState("1");
  const [trialDays, setTrialDays] = React.useState("14");

  React.useEffect(() => {
    if (!row) return;
    setPlanId(row.plan_id);
    setSeats(String(row.seats));
    setTrialDays("14");
  }, [row]);

  if (!row) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{row.organization_name}</DialogTitle>
          <DialogDescription>
            {row.plan_name} · {row.status.replace(/_/g, " ")} · created {when(row.created_at)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Plan</label>
            <div className="flex gap-2">
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.id} value={p.id} disabled={!p.is_active}>
                      {p.name} — {money(p.price_cents, p.currency)}/{p.interval}
                      {!p.is_active ? " (inactive)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                disabled={pending || !planId || planId === row.plan_id}
                onClick={() => onAction({ action: "change_plan", id: row.id, planId })}
              >
                {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
              </Button>
            </div>
          </div>

          <ApplyPlanSection row={row} plans={plans} disabled={pending} onApplied={onClose} />

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Seats</label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                value={seats}
                onChange={(e) => setSeats(e.target.value)}
                className="flex-1"
              />
              <Button
                variant="outline"
                disabled={pending || Number(seats) < 1 || Number(seats) === row.seats}
                onClick={() => onAction({ action: "set_seats", id: row.id, seats: Number(seats) })}
              >
                Update
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Extend trial by (days)
            </label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                max={365}
                value={trialDays}
                onChange={(e) => setTrialDays(e.target.value)}
                className="flex-1"
              />
              <Button
                variant="outline"
                disabled={pending || Number(trialDays) < 1}
                onClick={() =>
                  onAction({ action: "extend_trial", id: row.id, days: Number(trialDays) })
                }
              >
                <Clock className="w-3.5 h-3.5 mr-1.5" /> Extend
              </Button>
            </div>
          </div>

          <div className="border-t border-border pt-4 space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Lifecycle</div>
            <div className="flex flex-wrap gap-2">
              {row.status !== "active" && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => onAction({ action: "resume", id: row.id })}
                >
                  <PlayCircle className="w-3.5 h-3.5 mr-1.5" /> Activate
                </Button>
              )}
              {row.status === "active" && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => onAction({ action: "pause", id: row.id })}
                >
                  <PauseCircle className="w-3.5 h-3.5 mr-1.5" /> Pause
                </Button>
              )}
              {row.status !== "canceled" && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => onAction({ action: "cancel", id: row.id, immediate: false })}
                  >
                    Cancel at period end
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={pending}
                    onClick={() => onAction({ action: "cancel", id: row.id, immediate: true })}
                  >
                    <Ban className="w-3.5 h-3.5 mr-1.5" /> Cancel now
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * "Apply plan (mark as paid)" — for tenants who paid offline (bank transfer,
 * invoice, cash). Moves the org onto the plan now, starts a fresh billing
 * period, and records a `plan.manual_applied` billing event with the note.
 */
function ApplyPlanSection({
  row,
  plans,
  disabled,
  onApplied,
}: {
  row: PlatformSubscriptionRow;
  plans: Array<{
    id: string;
    name: string;
    interval: string;
    price_cents: number;
    currency: string;
    is_active: boolean;
  }>;
  disabled: boolean;
  onApplied: () => void;
}) {
  const money = useCurrencyFormatter({ fromCents: true, maximumFractionDigits: 0 });
  const zonedDateFmt = useZonedDateFormatter();
  const when = (iso: string | null) =>
    iso ? zonedDateFmt(iso, { year: "numeric", month: "short", day: "numeric" }) : "—";
  const qc = useQueryClient();
  const applyFn = useServerFn(adminApplyPlan);
  const [planId, setPlanId] = React.useState(row.plan_id);
  const [note, setNote] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);

  React.useEffect(() => {
    setPlanId(row.plan_id);
    setNote("");
    setConfirming(false);
  }, [row]);

  const plan = plans.find((p) => p.id === planId) ?? null;

  const apply = useMutation({
    mutationFn: () =>
      applyFn({
        data: {
          organization_id: row.organization_id,
          plan_id: planId,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      }),
    onSuccess: (res) => {
      toast.success(
        `${row.organization_name} is now on ${res.plan_name}` +
          (res.current_period_end ? ` until ${when(res.current_period_end)}` : ""),
      );
      setConfirming(false);
      qc.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
      onApplied();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = disabled || apply.isPending;

  return (
    <div className="space-y-1.5 rounded-control border border-border p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <BadgeCheck className="w-3.5 h-3.5" /> Apply plan (mark as paid)
      </div>
      <p className="text-[11px] text-muted-foreground">
        Use after receiving payment offline. Activates the plan now and starts a new billing period.
      </p>
      <Select value={planId} onValueChange={setPlanId}>
        <SelectTrigger>
          <SelectValue placeholder="Select a plan" />
        </SelectTrigger>
        <SelectContent>
          {plans.map((p) => (
            <SelectItem key={p.id} value={p.id} disabled={!p.is_active}>
              {p.name} — {money(p.price_cents, p.currency)}/{p.interval}
              {!p.is_active ? " (inactive)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <RichTextarea
        value={note}
        onChange={(v) => setNote(v)}
        maxLength={1000}
        rows={2}
        placeholder="Note (optional) — e.g. bank transfer reference, invoice number"
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={busy || !plan || !plan.is_active}
          onClick={() => setConfirming(true)}
        >
          {apply.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply plan"}
        </Button>
      </div>

      <AlertDialog open={confirming} onOpenChange={(o) => !apply.isPending && setConfirming(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Apply {plan?.name ?? "plan"} to {row.organization_name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {plan ? `${money(plan.price_cents, plan.currency)}/${plan.interval}. ` : ""}
              Confirm you have received payment. The organization moves to this plan immediately and
              a new billing period starts today. This is recorded as a manual plan change — no
              payment is recorded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={apply.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={apply.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!apply.isPending) apply.mutate();
              }}
            >
              {apply.isPending && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}
              Mark as paid &amp; apply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
