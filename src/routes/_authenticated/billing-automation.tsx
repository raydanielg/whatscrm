import { AppTopbar } from "@/components/app/app-topbar";
import { requireWorkspaceRole } from "@/lib/rbac";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  getAutomationConfig,
  updateAutomationConfig,
  runAutomationNow,
  listRecentNotifications,
} from "@/lib/billing/automation.functions";
import { useOrganizations } from "@/hooks/use-organization";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Loader2, PlayCircle, Save, Bell, CreditCard, ShieldAlert, Sparkles } from "lucide-react";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/billing-automation")({
  beforeLoad: requireWorkspaceRole("owner", "admin"),
  staticData: { breadcrumb: "Billing Automation" },
  head: () => ({
    meta: [
      { title: "Billing Automation" },
      {
        name: "description",
        content:
          "Configure notifications, payment retries, grace periods and account lifecycle rules.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BillingAutomationPage,
});

interface AutomationConfig {
  organization_id: string;
  notify_trial_ending: boolean;
  notify_payment_failed: boolean;
  notify_payment_succeeded: boolean;
  notify_invoice_generated: boolean;
  notify_invoice_due: boolean;
  notify_subscription_renewed: boolean;
  notify_subscription_expired: boolean;
  notify_usage_limit_reached: boolean;
  notify_quota_warning: boolean;
  notify_upgrade_recommendation: boolean;
  trial_ending_warning_days: number;
  invoice_due_reminder_days: number;
  quota_warning_threshold_pct: number;
  payment_retry_hours: number[];
  max_payment_retries: number;
  grace_period_days: number;
  auto_suspend_after_grace: boolean;
  auto_reactivate_on_payment: boolean;
}

const NOTIFICATION_ROWS: Array<{
  key: keyof AutomationConfig;
  icon: typeof Bell;
  label: string;
  hint: string;
}> = [
  {
    key: "notify_trial_ending",
    icon: Sparkles,
    label: "Trial Ending",
    hint: "Warn before a trial converts or expires.",
  },
  {
    key: "notify_payment_failed",
    icon: ShieldAlert,
    label: "Payment Failed",
    hint: "Alert admins the moment a charge is declined.",
  },
  {
    key: "notify_payment_succeeded",
    icon: CreditCard,
    label: "Payment Succeeded",
    hint: "Send a receipt confirmation email.",
  },
  {
    key: "notify_invoice_generated",
    icon: Bell,
    label: "Invoice Generated",
    hint: "Notify when a new invoice is issued.",
  },
  {
    key: "notify_invoice_due",
    icon: Bell,
    label: "Invoice Due",
    hint: "Remind before an open invoice's due date.",
  },
  {
    key: "notify_subscription_renewed",
    icon: Bell,
    label: "Subscription Renewed",
    hint: "Confirm every renewal cycle.",
  },
  {
    key: "notify_subscription_expired",
    icon: ShieldAlert,
    label: "Subscription Expired",
    hint: "Alert when a canceled subscription's access ends.",
  },
  {
    key: "notify_usage_limit_reached",
    icon: ShieldAlert,
    label: "Usage Limit Reached",
    hint: "Alert on 100% of a metered resource.",
  },
  {
    key: "notify_quota_warning",
    icon: Bell,
    label: "Quota Warning",
    hint: "Early warning at the configured threshold.",
  },
  {
    key: "notify_upgrade_recommendation",
    icon: Sparkles,
    label: "Upgrade Recommendation",
    hint: "Suggest better plans based on usage patterns.",
  },
];

function BillingAutomationPage() {
  const zonedDate = useZonedDateFormatter();
  const orgs = useOrganizations();
  const orgId = orgs.data?.[0]?.id;
  const qc = useQueryClient();
  const router = useRouter();

  const getConfig = useServerFn(getAutomationConfig);
  const saveConfig = useServerFn(updateAutomationConfig);
  const runNow = useServerFn(runAutomationNow);
  const listNotifs = useServerFn(listRecentNotifications);

  const configQ = useQuery({
    queryKey: ["billing-automation-config", orgId],
    queryFn: () => getConfig({ data: { organization_id: orgId! } }),
    enabled: !!orgId,
  });
  const notifsQ = useQuery({
    queryKey: ["billing-automation-notifs", orgId],
    queryFn: () => listNotifs({ data: { organization_id: orgId! } }),
    enabled: !!orgId,
  });

  const [local, setLocal] = useState<AutomationConfig | null>(null);
  useEffect(() => {
    if (configQ.data) setLocal(configQ.data as unknown as AutomationConfig);
  }, [configQ.data]);

  const saveMut = useMutation({
    mutationFn: (patch: Partial<AutomationConfig>) =>
      saveConfig({ data: { organization_id: orgId!, ...patch } }),
    onSuccess: () => {
      toast.success("Automation settings saved");
      qc.invalidateQueries({ queryKey: ["billing-automation-config", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runMut = useMutation({
    mutationFn: () => runNow({ data: { organization_id: orgId! } }),
    onSuccess: (r) => {
      toast.success("Automation pass completed", {
        description: `Retried ${r.payments_retried} • Suspended ${r.accounts_suspended} • Reactivated ${r.accounts_reactivated}`,
      });
      qc.invalidateQueries({ queryKey: ["billing-automation-notifs", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!orgId || !local) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  const set = <K extends keyof AutomationConfig>(k: K, v: AutomationConfig[K]) =>
    setLocal({ ...local, [k]: v });
  const save = () => saveMut.mutate(local);

  return (
    <>
      <AppTopbar
        title="Billing Automation"
        subtitle="Notifications, dunning, grace periods and account lifecycle — all configurable here."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => runMut.mutate()} disabled={runMut.isPending}>
              {runMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4" />
              )}
              Run now
            </Button>
            <Button onClick={save} disabled={saveMut.isPending}>
              {saveMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save changes
            </Button>
          </div>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4" /> Notifications
            </CardTitle>
            <CardDescription>
              Toggle which billing events trigger customer notifications.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {NOTIFICATION_ROWS.map((r) => {
              const Icon = r.icon;
              return (
                <div
                  key={r.key}
                  className="flex items-start justify-between gap-4 rounded-control border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {r.label}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{r.hint}</p>
                  </div>
                  <Switch
                    checked={Boolean(local[r.key])}
                    onCheckedChange={(v) => set(r.key, v as AutomationConfig[typeof r.key])}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> Timing
              </CardTitle>
              <CardDescription>How early to warn before events.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <NumberField
                label="Trial-ending warning (days before)"
                value={local.trial_ending_warning_days}
                onChange={(v) => set("trial_ending_warning_days", v)}
              />
              <NumberField
                label="Invoice-due reminder (days before)"
                value={local.invoice_due_reminder_days}
                onChange={(v) => set("invoice_due_reminder_days", v)}
              />
              <NumberField
                label="Quota warning threshold (%)"
                value={local.quota_warning_threshold_pct}
                onChange={(v) => set("quota_warning_threshold_pct", v)}
                max={100}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" /> Payment Retries
              </CardTitle>
              <CardDescription>Dunning schedule for failed payments.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs uppercase text-muted-foreground">
                  Retry schedule (hours)
                </Label>
                <Input
                  className="mt-1"
                  value={local.payment_retry_hours.join(", ")}
                  onChange={(e) =>
                    set(
                      "payment_retry_hours",
                      e.target.value
                        .split(/[\s,]+/)
                        .map((n) => parseInt(n, 10))
                        .filter((n) => Number.isFinite(n) && n >= 0),
                    )
                  }
                  placeholder="1, 24, 72"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Comma-separated hours between successive retry attempts.
                </p>
              </div>
              <NumberField
                label="Max retries"
                value={local.max_payment_retries}
                onChange={(v) => set("max_payment_retries", v)}
                max={20}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" /> Grace period &amp; account lifecycle
            </CardTitle>
            <CardDescription>
              Control how accounts behave when payments stay unpaid.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <NumberField
              label="Grace period (days after past-due)"
              value={local.grace_period_days}
              onChange={(v) => set("grace_period_days", v)}
              max={90}
            />
            <ToggleRow
              label="Auto-suspend after grace"
              hint="Move accounts to paused once grace expires and invoices remain unpaid."
              checked={local.auto_suspend_after_grace}
              onChange={(v) => set("auto_suspend_after_grace", v)}
            />
            <ToggleRow
              label="Auto-reactivate on payment"
              hint="Restore access automatically once all outstanding invoices are paid."
              checked={local.auto_reactivate_on_payment}
              onChange={(v) => set("auto_reactivate_on_payment", v)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent notifications</CardTitle>
            <CardDescription>Queue for this organization — the last 50 events.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {notifsQ.data && notifsQ.data.length > 0 ? (
              notifsQ.data.map((n) => (
                <div
                  key={n.id}
                  className="flex items-center justify-between gap-4 rounded-control border p-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 truncate font-medium">
                      <Badge variant="outline" className="font-mono text-[11px]">
                        {n.kind}
                      </Badge>
                      <span className="truncate">{n.subject}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{n.body}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <Badge
                      variant={
                        n.status === "sent"
                          ? "default"
                          : n.status === "failed"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {n.status}
                    </Badge>
                    <div className="mt-1">
                      {zonedDate(n.created_at, { dateStyle: "medium", timeStyle: "short" })}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No notifications yet.</p>
            )}
          </CardContent>
        </Card>

        <Separator />
        <p className="text-xs text-muted-foreground">
          Automation pass runs periodically from the server. Use "Run now" to trigger an immediate
          pass for this organization.
        </p>
      </main>
    </>
  );
}

function NumberField({
  label,
  value,
  onChange,
  max = 365,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  max?: number;
}) {
  return (
    <div>
      <Label className="text-xs uppercase text-muted-foreground">{label}</Label>
      <Input
        className="mt-1"
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          onChange(Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0);
        }}
      />
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-control border p-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
