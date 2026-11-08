import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  listSlaPolicies,
  upsertSlaPolicy,
  deleteSlaPolicy,
  upsertEscalationRule,
  deleteEscalationRule,
  getBusinessHours,
  saveBusinessHours,
  listHolidays,
  addHoliday,
  removeHoliday,
  slaDashboard,
  slaEvents,
  slaReport,
} from "@/lib/helpdesk/sla-engine.functions";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker, TimePicker, fromDateString, toDateString } from "@/shared/components";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Plus,
  Trash2,
  AlertTriangle,
  Timer,
  CheckCircle2,
  TrendingUp,
  CalendarDays,
  Building2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/_authenticated/helpdesk/sla-management")({
  head: () => ({ meta: [{ title: "SLA Management" }] }),
  component: SlaManagementPage,
});

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function SlaManagementPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">SLA Management</h1>
        <p className="text-sm text-muted-foreground">
          Policies, escalation rules, business hours, holiday calendar, and real-time breach
          detection.
        </p>
      </div>
      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="hours">Business Hours</TabsTrigger>
          <TabsTrigger value="holidays">Holidays</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard">
          <DashboardTab />
        </TabsContent>
        <TabsContent value="policies">
          <PoliciesTab />
        </TabsContent>
        <TabsContent value="hours">
          <HoursTab />
        </TabsContent>
        <TabsContent value="holidays">
          <HolidaysTab />
        </TabsContent>
        <TabsContent value="reports">
          <ReportsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* --------------------------- DASHBOARD --------------------------- */
function useCountdown(iso?: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!iso) return null;
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const s = Math.floor((abs % 60_000) / 1000);
  return { diff, label: `${h}h ${m}m ${s}s`, overdue: diff < 0 };
}

function DashboardTab() {
  const fmtZoned = useZonedDateFormatter();
  const dashFn = useServerFn(slaDashboard);
  const eventsFn = useServerFn(slaEvents);
  const qc = useQueryClient();
  const { data: dash } = useQuery({
    queryKey: ["sla-dashboard"],
    queryFn: () => dashFn(),
    refetchInterval: 30_000,
  });
  const { data: events = [] } = useQuery({ queryKey: ["sla-events"], queryFn: () => eventsFn() });

  useEffect(() => {
    const ch = supabase
      .channel("sla_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "ticket_sla_tracking" }, () =>
        qc.invalidateQueries({ queryKey: ["sla-dashboard"] }),
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sla_events" }, () =>
        qc.invalidateQueries({ queryKey: ["sla-events"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-5">
        <Stat icon={CheckCircle2} label="On Track" value={dash?.onTrack ?? 0} tone="green" />
        <Stat icon={Timer} label="At Risk" value={dash?.atRisk ?? 0} tone="amber" />
        <Stat icon={AlertTriangle} label="Breached" value={dash?.breached ?? 0} tone="red" />
        <Stat icon={CheckCircle2} label="Resolved" value={dash?.resolved ?? 0} tone="muted" />
        <Stat
          icon={TrendingUp}
          label="Compliance"
          value={`${(dash?.complianceRate ?? 100).toFixed(1)}%`}
          tone="primary"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live SLA Countdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {(dash?.rows ?? []).slice(0, 30).map((r: any) => (
              <CountdownRow key={r.id} row={r} />
            ))}
            {(dash?.rows ?? []).length === 0 && (
              <div className="p-6 text-sm text-muted-foreground text-center">No active SLAs.</div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Recent SLA Events
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {(events as any[]).slice(0, 15).map((e: any) => (
              <div key={e.id} className="flex items-center gap-3 p-3 text-sm">
                <Badge
                  variant={
                    e.event_type === "breach"
                      ? "destructive"
                      : e.event_type === "escalated"
                        ? "default"
                        : "secondary"
                  }
                >
                  {e.event_type} {e.target ? `· ${e.target}` : ""}
                  {e.level ? ` L${e.level}` : ""}
                </Badge>
                <div className="flex-1 truncate">
                  {e.ticket?.ticket_number && (
                    <span className="font-mono text-xs mr-2">#{e.ticket.ticket_number}</span>
                  )}
                  <span>{e.ticket?.subject ?? "Ticket"}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {fmtZoned(new Date(e.created_at), { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </div>
            ))}
            {(events as any[]).length === 0 && (
              <div className="p-6 text-sm text-muted-foreground text-center">No events.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CountdownRow({ row }: { row: any }) {
  const cd = useCountdown(row.resolution_due_at);
  const respCd = useCountdown(row.first_response_due_at);
  return (
    <div className="flex items-center gap-3 p-3 text-sm">
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">
          {row.ticket?.ticket_number && (
            <span className="font-mono text-xs mr-2">#{row.ticket.ticket_number}</span>
          )}
          {row.ticket?.subject ?? "Ticket"}
        </div>
        <div className="text-xs text-muted-foreground">
          {row.ticket?.priority} · {row.ticket?.status}
        </div>
      </div>
      <div className="text-right text-xs">
        <div className={respCd?.overdue ? "text-red-600 font-medium" : "text-muted-foreground"}>
          Response: {respCd ? (respCd.overdue ? `overdue ${respCd.label}` : respCd.label) : "—"}
        </div>
        <div className={cd?.overdue ? "text-red-600 font-medium" : "text-foreground"}>
          Resolution: {cd ? (cd.overdue ? `overdue ${cd.label}` : cd.label) : "—"}
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: number | string;
  tone: string;
}) {
  const bg =
    {
      green: "bg-emerald-500/10 text-emerald-600",
      amber: "bg-amber-500/10 text-amber-600",
      red: "bg-red-500/10 text-red-600",
      muted: "bg-muted text-muted-foreground",
      primary: "bg-primary/10 text-primary",
    }[tone] ?? "bg-muted";
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-control grid place-items-center ${bg}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-semibold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

/* --------------------------- POLICIES --------------------------- */
function PoliciesTab() {
  const list = useServerFn(listSlaPolicies);
  const { data: policies = [] } = useQuery({ queryKey: ["sla-policies"], queryFn: () => list() });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <PolicyDialog />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {(policies as any[]).map((p: any) => (
          <PolicyCard key={p.id} policy={p} />
        ))}
        {(policies as any[]).length === 0 && (
          <div className="col-span-full text-sm text-muted-foreground text-center py-12 border rounded-control">
            No SLA policies yet.
          </div>
        )}
      </div>
    </div>
  );
}

function PolicyCard({ policy }: { policy: any }) {
  const del = useServerFn(deleteSlaPolicy);
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: () => del({ data: { id: policy.id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["sla-policies"] });
    },
  });
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">{policy.name}</CardTitle>
          <div className="flex gap-1 mt-1 flex-wrap">
            {(policy.priorities ?? []).map((p: string) => (
              <Badge key={p} variant="outline">
                {p}
              </Badge>
            ))}
            {policy.business_hours_only && <Badge variant="secondary">Business hours</Badge>}
            {!policy.is_active && <Badge variant="outline">Inactive</Badge>}
          </div>
        </div>
        <div className="flex gap-1">
          <PolicyDialog policy={policy} />
          <Button size="icon" variant="ghost" onClick={() => remove.mutate()}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div className="border rounded p-2">
            <div className="text-xs text-muted-foreground">Response</div>
            <div className="font-mono">{policy.first_response_minutes}m</div>
          </div>
          <div className="border rounded p-2">
            <div className="text-xs text-muted-foreground">Resolution</div>
            <div className="font-mono">{policy.resolution_minutes}m</div>
          </div>
        </div>
        <EscalationRulesEditor policyId={policy.id} rules={policy.escalation_rules ?? []} />
      </CardContent>
    </Card>
  );
}

function PolicyDialog({ policy }: { policy?: any }) {
  const upsert = useServerFn(upsertSlaPolicy);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(
    policy ?? {
      name: "",
      first_response_minutes: 60,
      response_minutes: 60,
      resolution_minutes: 480,
      priorities: ["urgent"],
      business_hours_only: true,
      is_active: true,
      priority_rank: 0,
    },
  );

  const save = useMutation({
    mutationFn: () => upsert({ data: form }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["sla-policies"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={policy ? "icon" : "default"} variant={policy ? "ghost" : "default"}>
          {policy ? (
            <Zap className="h-4 w-4" />
          ) : (
            <>
              <Plus className="h-4 w-4 mr-2" /> New Policy
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{policy ? "Edit Policy" : "New Policy"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>First response (min)</Label>
              <Input
                type="number"
                value={form.first_response_minutes}
                onChange={(e) =>
                  setForm({ ...form, first_response_minutes: parseInt(e.target.value) || 0 })
                }
              />
            </div>
            <div>
              <Label>Resolution (min)</Label>
              <Input
                type="number"
                value={form.resolution_minutes}
                onChange={(e) =>
                  setForm({ ...form, resolution_minutes: parseInt(e.target.value) || 0 })
                }
              />
            </div>
          </div>
          <div>
            <Label>Priorities (comma-separated)</Label>
            <Input
              value={(form.priorities ?? []).join(", ")}
              onChange={(e) =>
                setForm({
                  ...form,
                  priorities: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
          <div className="flex justify-between items-center">
            <Label>Business hours only</Label>
            <Switch
              checked={!!form.business_hours_only}
              onCheckedChange={(v) => setForm({ ...form, business_hours_only: v })}
            />
          </div>
          <div className="flex justify-between items-center">
            <Label>Active</Label>
            <Switch
              checked={form.is_active !== false}
              onCheckedChange={(v) => setForm({ ...form, is_active: v })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={!form.name || save.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EscalationRulesEditor({ policyId, rules }: { policyId: string; rules: any[] }) {
  const upsert = useServerFn(upsertEscalationRule);
  const del = useServerFn(deleteEscalationRule);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({
    sla_policy_id: policyId,
    level: 1,
    name: "",
    trigger_type: "resolution_breach",
    minutes_offset: 0,
    notify_supervisor: true,
    raise_priority: false,
    is_active: true,
  });

  const save = useMutation({
    mutationFn: () => upsert({ data: form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sla-policies"] });
      setOpen(false);
      toast.success("Rule saved");
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sla-policies"] }),
  });

  return (
    <div className="border rounded-control p-3 bg-muted/30">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium">Escalation Levels ({rules.length})</div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="h-3 w-3 " /> Add
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Escalation Rule</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Level</Label>
                  <Input
                    type="number"
                    min={1}
                    value={form.level}
                    onChange={(e) => setForm({ ...form, level: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div>
                  <Label>Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Trigger</Label>
                <Select
                  value={form.trigger_type}
                  onValueChange={(v) => setForm({ ...form, trigger_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="response_warning">Response warning</SelectItem>
                    <SelectItem value="response_breach">Response breach</SelectItem>
                    <SelectItem value="resolution_warning">Resolution warning</SelectItem>
                    <SelectItem value="resolution_breach">Resolution breach</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Minutes after due (negative for before)</Label>
                <Input
                  type="number"
                  value={form.minutes_offset}
                  onChange={(e) =>
                    setForm({ ...form, minutes_offset: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="flex justify-between items-center">
                <Label>Notify supervisor</Label>
                <Switch
                  checked={!!form.notify_supervisor}
                  onCheckedChange={(v) => setForm({ ...form, notify_supervisor: v })}
                />
              </div>
              <div>
                <Label>Workflow event name (optional)</Label>
                <Input
                  value={form.workflow_event ?? ""}
                  placeholder="e.g. sla.escalated"
                  onChange={(e) => setForm({ ...form, workflow_event: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => save.mutate()} disabled={!form.name}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="space-y-1">
        {rules
          .sort((a: any, b: any) => a.level - b.level)
          .map((r: any) => (
            <div
              key={r.id}
              className="flex items-center gap-2 text-xs bg-background border rounded p-2"
            >
              <Badge>L{r.level}</Badge>
              <span className="flex-1">
                {r.name} ·{" "}
                <span className="text-muted-foreground">
                  {r.trigger_type}{" "}
                  {r.minutes_offset > 0
                    ? `+${r.minutes_offset}m`
                    : r.minutes_offset < 0
                      ? `${r.minutes_offset}m`
                      : ""}
                </span>
              </span>
              {r.workflow_event && <Badge variant="outline">→ {r.workflow_event}</Badge>}
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => remove.mutate(r.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        {rules.length === 0 && (
          <div className="text-xs text-muted-foreground py-2">No escalation levels defined.</div>
        )}
      </div>
    </div>
  );
}

/* --------------------------- BUSINESS HOURS --------------------------- */
function HoursTab() {
  const get = useServerFn(getBusinessHours);
  const save = useServerFn(saveBusinessHours);
  const qc = useQueryClient();
  const { data: hours } = useQuery({ queryKey: ["business-hours"], queryFn: () => get() });
  const [form, setForm] = useState<any>(null);
  useEffect(() => {
    if (hours && !form) setForm(hours);
  }, [hours, form]);

  const mut = useMutation({
    mutationFn: () =>
      save({
        data: {
          timezone: form.timezone,
          weekly_schedule: form.weekly_schedule,
          offline_message: form.offline_message,
        },
      }),
    onSuccess: () => {
      toast.success("Business hours saved");
      qc.invalidateQueries({ queryKey: ["business-hours"] });
    },
  });

  if (!form) return <div className="text-sm text-muted-foreground">Loading</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4" /> Business Hours
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-xs">
          <Label>Timezone</Label>
          <Input
            value={form.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            placeholder="UTC"
          />
        </div>
        <div className="space-y-2">
          {DAYS.map((d) => {
            const cfg = form.weekly_schedule?.[d] ?? {
              enabled: false,
              open: "09:00",
              close: "17:00",
            };
            return (
              <div key={d} className="flex items-center gap-3 border rounded-control p-2">
                <div className="w-16 capitalize font-medium">{d}</div>
                <Switch
                  checked={!!cfg.enabled}
                  onCheckedChange={(v) =>
                    setForm({
                      ...form,
                      weekly_schedule: { ...form.weekly_schedule, [d]: { ...cfg, enabled: v } },
                    })
                  }
                />
                <TimePicker
                  value={cfg.open}
                  disabled={!cfg.enabled}
                  className="w-28"
                  onChange={(v) =>
                    setForm({
                      ...form,
                      weekly_schedule: { ...form.weekly_schedule, [d]: { ...cfg, open: v ?? "" } },
                    })
                  }
                />
                <span>—</span>
                <TimePicker
                  value={cfg.close}
                  disabled={!cfg.enabled}
                  className="w-28"
                  onChange={(v) =>
                    setForm({
                      ...form,
                      weekly_schedule: { ...form.weekly_schedule, [d]: { ...cfg, close: v ?? "" } },
                    })
                  }
                />
              </div>
            );
          })}
        </div>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

/* --------------------------- HOLIDAYS --------------------------- */
function HolidaysTab() {
  const list = useServerFn(listHolidays);
  const add = useServerFn(addHoliday);
  const del = useServerFn(removeHoliday);
  const qc = useQueryClient();
  const { data: holidays = [] } = useQuery({ queryKey: ["sla-holidays"], queryFn: () => list() });
  const [form, setForm] = useState<any>({ name: "", holiday_date: "", recurring_yearly: false });

  const addMut = useMutation({
    mutationFn: () => add({ data: form }),
    onSuccess: () => {
      toast.success("Added");
      qc.invalidateQueries({ queryKey: ["sla-holidays"] });
      setForm({ name: "", holiday_date: "", recurring_yearly: false });
    },
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sla-holidays"] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4" /> Holiday Calendar
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Date</Label>
            <DatePicker
              value={fromDateString(form.holiday_date)}
              onChange={(d) => setForm({ ...form, holiday_date: toDateString(d) })}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={form.recurring_yearly}
              onCheckedChange={(v) => setForm({ ...form, recurring_yearly: v })}
            />{" "}
            <Label>Recurring yearly</Label>
          </div>
          <Button onClick={() => addMut.mutate()} disabled={!form.name || !form.holiday_date}>
            <Plus className="h-4 w-4 mr-2" />
            Add
          </Button>
        </div>
        <div className="divide-y border rounded-control">
          {(holidays as any[]).map((h: any) => (
            <div key={h.id} className="flex items-center gap-3 p-2 text-sm">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <span className="font-medium">{h.name}</span>
                <span className="text-muted-foreground ml-2">{h.holiday_date}</span>
                {h.recurring_yearly && (
                  <Badge variant="secondary" className="ml-2">
                    Yearly
                  </Badge>
                )}
              </div>
              <Button size="icon" variant="ghost" onClick={() => delMut.mutate(h.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {(holidays as any[]).length === 0 && (
            <div className="p-4 text-sm text-muted-foreground text-center">No holidays.</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* --------------------------- REPORTS --------------------------- */
function ReportsTab() {
  const rep = useServerFn(slaReport);
  const [days, setDays] = useState(30);
  const { data = [] } = useQuery({
    queryKey: ["sla-report", days],
    queryFn: () => rep({ data: { days } }),
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">SLA Trend</CardTitle>
        <Select value={String(days)} onValueChange={(v) => setDays(parseInt(v))}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data as any[]}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis allowDecimals={false} />
              <RTooltip />
              <Line type="monotone" dataKey="warning" stroke="#f59e0b" strokeWidth={2} />
              <Line type="monotone" dataKey="breach" stroke="#dc2626" strokeWidth={2} />
              <Line type="monotone" dataKey="escalated" stroke="#075E54" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
