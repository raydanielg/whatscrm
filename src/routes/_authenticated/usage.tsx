import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, AlertTriangle, Bell, Plus, RefreshCw, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";

import { AppTopbar } from "@/components/app/app-topbar";
import { useOrganizations } from "@/hooks/use-organization";
import {
  getUsageSummary,
  listUsageAlerts,
  upsertUsageAlert,
  deleteUsageAlert,
  evaluateUsageAlerts,
  type UsageMeterRow,
} from "@/lib/billing/usage.functions";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/usage")({
  staticData: { breadcrumb: "Usage" },
  head: () => ({
    meta: [
      { title: "Usage & Metering" },
      {
        name: "description",
        content: "Realtime usage across your workspace with billing alerts and thresholds.",
      },
    ],
  }),
  component: UsagePage,
});

function formatValue(value: number, unit: string): string {
  if (unit === "bytes") {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let v = value;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
  }
  if (unit === "tokens") return value.toLocaleString() + " tok";
  return value.toLocaleString();
}

function statusColor(percent: number | null): string {
  if (percent == null) return "text-muted-foreground";
  if (percent >= 100) return "text-destructive";
  if (percent >= 80) return "text-orange-500";
  if (percent >= 50) return "text-yellow-500";
  return "text-emerald-500";
}

function UsagePage() {
  const orgs = useOrganizations();
  const orgId = orgs.data?.[0]?.id;
  const qc = useQueryClient();

  const summaryFn = useServerFn(getUsageSummary);
  const alertsFn = useServerFn(listUsageAlerts);
  const upsertFn = useServerFn(upsertUsageAlert);
  const deleteFn = useServerFn(deleteUsageAlert);
  const evalFn = useServerFn(evaluateUsageAlerts);

  const summaryQ = useQuery({
    queryKey: ["usage-summary", orgId],
    queryFn: () => summaryFn({ data: { organization_id: orgId! } }),
    enabled: !!orgId,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const alertsQ = useQuery({
    queryKey: ["usage-alerts", orgId],
    queryFn: () => alertsFn({ data: { organization_id: orgId! } }),
    enabled: !!orgId,
  });

  // Realtime invalidation on new usage events
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`usage-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "usage_events",
          filter: `organization_id=eq.${orgId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["usage-summary", orgId] }),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tenant_quotas",
          filter: `organization_id=eq.${orgId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["usage-summary", orgId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, qc]);

  const evalMut = useMutation({
    mutationFn: () => evalFn({ data: { organization_id: orgId! } }),
    onSuccess: (r) => {
      toast.success(`${r.triggered_count} alert${r.triggered_count === 1 ? "" : "s"} evaluated`);
      qc.invalidateQueries({ queryKey: ["usage-alerts", orgId] });
    },
  });

  const meters = summaryQ.data?.meters ?? [];
  const critical = meters.filter((m) => (m.percent ?? 0) >= 80);

  return (
    <div className="flex min-h-screen w-full flex-col">
      <AppTopbar
        title="Usage & Metering"
        subtitle="Realtime workspace usage with billing thresholds and alerts."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => summaryQ.refetch()}
              disabled={summaryQ.isFetching}
            >
              <RefreshCw className={`h-4 w-4 ${summaryQ.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => evalMut.mutate()}
              disabled={evalMut.isPending || !orgId}
            >
              <Zap className="h-4 w-4" />
              Evaluate alerts
            </Button>
          </div>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {critical.length > 0 && (
          <Card className="border-orange-500/40 bg-orange-500/5">
            <CardContent className="flex items-start gap-3 py-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-orange-500" />
              <div className="flex-1 text-sm">
                <p className="font-medium">
                  {critical.length} meter{critical.length === 1 ? "" : "s"} near or over your limit
                </p>
                <p className="text-muted-foreground">{critical.map((c) => c.name).join(", ")}</p>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="realtime" className="w-full">
          <TabsList>
            <TabsTrigger value="realtime">
              <Activity className="h-4 w-4" /> Realtime
            </TabsTrigger>
            <TabsTrigger value="alerts">
              <Bell className="h-4 w-4" /> Alerts ({alertsQ.data?.length ?? 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="realtime" className="mt-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {summaryQ.isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="h-32 animate-pulse bg-muted/30" />
                ))}
              {meters.map((m) => (
                <MeterCard key={m.code} meter={m} />
              ))}
            </div>
            {summaryQ.data && (
              <p className="mt-4 text-xs text-muted-foreground">
                Period: {new Date(summaryQ.data.period_start).toLocaleDateString()} →{" "}
                {new Date(summaryQ.data.period_end).toLocaleDateString()}
              </p>
            )}
          </TabsContent>

          <TabsContent value="alerts" className="mt-4">
            <AlertsSection
              orgId={orgId}
              meters={meters}
              alerts={(alertsQ.data ?? []) as AlertRow[]}
              onSaved={() => qc.invalidateQueries({ queryKey: ["usage-alerts", orgId] })}
              upsertFn={upsertFn}
              deleteFn={deleteFn}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function MeterCard({ meter }: { meter: UsageMeterRow }) {
  const cap = meter.hard_limit ?? meter.included;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{meter.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline justify-between">
          <div className={`text-2xl font-semibold  ${statusColor(meter.percent)}`}>
            {formatValue(meter.used, meter.unit)}
          </div>
          {cap && cap > 0 && (
            <div className="text-xs text-muted-foreground">of {formatValue(cap, meter.unit)}</div>
          )}
        </div>
        {meter.percent != null && (
          <>
            <Progress value={meter.percent} className="h-1.5" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{meter.percent.toFixed(1)}% used</span>
              {meter.hard_limit != null && (
                <Badge variant="outline" className="text-[11px]">
                  Hard limit
                </Badge>
              )}
            </div>
          </>
        )}
        {meter.percent == null && cap === null && (
          <div className="text-xs text-muted-foreground">Unlimited</div>
        )}
      </CardContent>
    </Card>
  );
}

type AlertPayload = {
  id?: string;
  organization_id: string;
  meter_code: string;
  threshold_type: "percent" | "absolute";
  threshold_value: number;
  notify_emails: string[];
  notify_in_app: boolean;
  block_on_exceed: boolean;
  is_active: boolean;
};

type AlertRow = {
  id: string;
  meter_code: string;
  threshold_type: "percent" | "absolute";
  threshold_value: number;
  notify_emails: string[];
  notify_in_app: boolean;
  block_on_exceed: boolean;
  is_active: boolean;
  last_triggered_at: string | null;
  last_triggered_value: number | null;
};

function AlertsSection({
  orgId,
  meters,
  alerts,
  onSaved,
  upsertFn,
  deleteFn,
}: {
  orgId: string | undefined;
  meters: UsageMeterRow[];
  alerts: AlertRow[];
  onSaved: () => void;
  upsertFn: ReturnType<typeof useServerFn<typeof upsertUsageAlert>>;
  deleteFn: ReturnType<typeof useServerFn<typeof deleteUsageAlert>>;
}) {
  const [editing, setEditing] = useState<AlertRow | null>(null);
  const [open, setOpen] = useState(false);

  const saveMut = useMutation({
    mutationFn: (input: AlertPayload) => upsertFn({ data: input }),
    onSuccess: () => {
      toast.success("Alert saved");
      setOpen(false);
      setEditing(null);
      onSaved();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Alert deleted");
      onSaved();
    },
  });

  const meterName = (code: string) => meters.find((m) => m.code === code)?.name ?? code;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" /> New alert
            </Button>
          </DialogTrigger>
          <AlertDialog
            editing={editing}
            meters={meters}
            orgId={orgId}
            onSubmit={(payload) => saveMut.mutate(payload)}
            pending={saveMut.isPending}
          />
        </Dialog>
      </div>

      {alerts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <Bell className="h-8 w-8 opacity-40" />
            <p>No usage alerts yet.</p>
            <p className="text-xs">Get notified when you approach billing thresholds.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {alerts.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex flex-wrap items-center gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{meterName(a.meter_code)}</span>
                    {!a.is_active && <Badge variant="outline">Paused</Badge>}
                    {a.block_on_exceed && <Badge variant="destructive">Blocks on exceed</Badge>}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Trigger when usage ≥{" "}
                    <span className="font-medium text-foreground">
                      {a.threshold_type === "percent"
                        ? `${a.threshold_value}%`
                        : a.threshold_value.toLocaleString()}
                    </span>
                    {a.last_triggered_at && (
                      <> · last triggered {new Date(a.last_triggered_at).toLocaleString()}</>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing(a);
                      setOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm("Delete this alert?")) deleteMut.mutate(a.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AlertDialog({
  editing,
  meters,
  orgId,
  onSubmit,
  pending,
}: {
  editing: AlertRow | null;
  meters: UsageMeterRow[];
  orgId: string | undefined;
  onSubmit: (payload: {
    id?: string;
    organization_id: string;
    meter_code: string;
    threshold_type: "percent" | "absolute";
    threshold_value: number;
    notify_emails: string[];
    notify_in_app: boolean;
    block_on_exceed: boolean;
    is_active: boolean;
  }) => void;
  pending: boolean;
}) {
  const [meterCode, setMeterCode] = useState(editing?.meter_code ?? meters[0]?.code ?? "");
  const [thresholdType, setThresholdType] = useState<"percent" | "absolute">(
    editing?.threshold_type ?? "percent",
  );
  const [thresholdValue, setThresholdValue] = useState<string>(
    String(editing?.threshold_value ?? 80),
  );
  const [notifyEmails, setNotifyEmails] = useState<string>(
    (editing?.notify_emails ?? []).join(", "),
  );
  const [notifyInApp, setNotifyInApp] = useState(editing?.notify_in_app ?? true);
  const [blockOnExceed, setBlockOnExceed] = useState(editing?.block_on_exceed ?? false);
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);

  useEffect(() => {
    if (editing) {
      setMeterCode(editing.meter_code);
      setThresholdType(editing.threshold_type);
      setThresholdValue(String(editing.threshold_value));
      setNotifyEmails(editing.notify_emails.join(", "));
      setNotifyInApp(editing.notify_in_app);
      setBlockOnExceed(editing.block_on_exceed);
      setIsActive(editing.is_active);
    }
  }, [editing]);

  const canSave = orgId && meterCode && Number(thresholdValue) > 0;

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{editing ? "Edit alert" : "New usage alert"}</DialogTitle>
        <DialogDescription>
          Get notified when a meter crosses a threshold this billing period.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <Label>Meter</Label>
          <Select value={meterCode} onValueChange={setMeterCode}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {meters.map((m) => (
                <SelectItem key={m.code} value={m.code}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Threshold type</Label>
            <Select
              value={thresholdType}
              onValueChange={(v) => setThresholdType(v as "percent" | "absolute")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">% of limit</SelectItem>
                <SelectItem value="absolute">Absolute value</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Value</Label>
            <Input
              type="number"
              value={thresholdValue}
              onChange={(e) => setThresholdValue(e.target.value)}
              min={1}
            />
          </div>
        </div>
        <div>
          <Label>Notify emails (comma-separated)</Label>
          <Input
            value={notifyEmails}
            onChange={(e) => setNotifyEmails(e.target.value)}
            placeholder="admin@company.com, billing@company.com"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="in-app">In-app notification</Label>
            <Switch id="in-app" checked={notifyInApp} onCheckedChange={setNotifyInApp} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="block">Block operations when exceeded</Label>
            <Switch id="block" checked={blockOnExceed} onCheckedChange={setBlockOnExceed} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="active">Active</Label>
            <Switch id="active" checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button
          disabled={!canSave || pending}
          onClick={() =>
            onSubmit({
              id: editing?.id,
              organization_id: orgId!,
              meter_code: meterCode,
              threshold_type: thresholdType,
              threshold_value: Number(thresholdValue),
              notify_emails: notifyEmails
                .split(",")
                .map((e) => e.trim())
                .filter(Boolean),
              notify_in_app: notifyInApp,
              block_on_exceed: blockOnExceed,
              is_active: isActive,
            })
          }
        >
          {pending ? "Saving" : editing ? "Save changes" : "Create alert"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
