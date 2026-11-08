import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DateTimePicker,
  fromLocalDateTimeString,
  toLocalDateTimeString,
} from "@/shared/components";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import {
  Calendar,
  Clock,
  Repeat,
  Zap,
  Activity,
  Pause,
  Play,
  X,
  Plus,
  Gauge,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Cake,
  PartyPopper,
  Sparkles,
  Rocket,
  MessageSquareReply,
  UserPlus,
  TrendingDown,
} from "lucide-react";
import { toast } from "sonner";
import {
  DRIP_PRESETS,
  useAllCampaigns,
  useCampaignAction,
  useCreateDripFromPreset,
  useQueueHealth,
  useRecurringCampaigns,
  useScheduleCampaign,
  useScheduledCampaigns,
  useSchedulingRealtime,
  type DripPreset,
} from "@/hooks/use-scheduling";

export const Route = createFileRoute("/_authenticated/scheduling")({
  component: SchedulingPage,
});

const PRESET_ICONS: Record<DripPreset, typeof Cake> = {
  welcome: UserPlus,
  followup: MessageSquareReply,
  abandoned: TrendingDown,
  promotional: Rocket,
  birthday: Cake,
  anniversary: PartyPopper,
};

type Tab = "scheduled" | "recurring" | "drip" | "queue";

function SchedulingPage() {
  useSchedulingRealtime();
  const [tab, setTab] = useState<Tab>("scheduled");
  const [scheduleFor, setScheduleFor] = useState<string | null>(null);

  const tabs: Array<{ id: Tab; label: string; icon: typeof Calendar }> = [
    { id: "scheduled", label: "Scheduled", icon: Calendar },
    { id: "recurring", label: "Recurring", icon: Repeat },
    { id: "drip", label: "Drip Templates", icon: Zap },
    { id: "queue", label: "Queue Health", icon: Activity },
  ];

  return (
    <>
      <AppTopbar
        title="Campaign Scheduling"
        subtitle="Schedule, throttle and orchestrate campaigns reliably"
        actions={
          <button
            onClick={() => setScheduleFor("__new__")}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" /> Schedule campaign
          </button>
        }
      />
      <div className="border-b border-border max-w-7xl w-full mx-auto">
        <ScrollArea orientation="horizontal" type="hover" className="w-full">
          <div className="flex w-max items-center gap-1 px-6">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors rounded-none ${
                    active
                      ? "border-primary text-foreground font-medium"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {tab === "scheduled" && <ScheduledTab onSchedule={setScheduleFor} />}
        {tab === "recurring" && <RecurringTab />}
        {tab === "drip" && <DripTab />}
        {tab === "queue" && <QueueTab />}
      </main>

      {scheduleFor && (
        <ScheduleDialog
          campaignId={scheduleFor === "__new__" ? null : scheduleFor}
          onClose={() => setScheduleFor(null)}
        />
      )}
    </>
  );
}

/* --------------------- Scheduled tab --------------------- */

function ScheduledTab({ onSchedule }: { onSchedule: (id: string) => void }) {
  const { data, isLoading } = useScheduledCampaigns();
  const action = useCampaignAction();
  const fmtZoned = useZonedDateFormatter();

  if (isLoading) return <EmptyState loading />;
  if (!data || data.length === 0)
    return (
      <EmptyState
        icon={Calendar}
        title="Nothing scheduled"
        hint="Schedule a campaign to see it appear here with live timers and controls."
      />
    );

  return (
    <div className="rounded-control border border-border bg-surface overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="text-left px-4 py-2.5 font-medium">Campaign</th>
            <th className="text-left px-4 py-2.5 font-medium">Status</th>
            <th className="text-left px-4 py-2.5 font-medium">Scheduled</th>
            <th className="text-left px-4 py-2.5 font-medium">Timezone</th>
            <th className="text-left px-4 py-2.5 font-medium">Rate</th>
            <th className="text-right px-4 py-2.5 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.map((c: any) => (
            <tr key={c.id} className="border-t border-border">
              <td className="px-4 py-3 font-medium">{c.name}</td>
              <td className="px-4 py-3">
                <StatusPill status={c.status} />
              </td>
              <td className="px-4 py-3  text-muted-foreground">
                {c.scheduled_at
                  ? fmtZoned(new Date(c.scheduled_at), { dateStyle: "medium", timeStyle: "short" })
                  : "—"}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{c.timezone ?? "UTC"}</td>
              <td className="px-4 py-3 text-muted-foreground">{c.throttle_per_minute}/min</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1 justify-end">
                  <button
                    onClick={() => onSchedule(c.id)}
                    className="p-1.5 hover:bg-muted rounded"
                    title="Reschedule"
                  >
                    <Clock className="w-4 h-4" />
                  </button>
                  {c.status === "paused" ? (
                    <button
                      onClick={() =>
                        action.mutate(
                          { campaignId: c.id, action: "resume" },
                          { onSuccess: () => toast.success("Campaign resumed") },
                        )
                      }
                      className="p-1.5 hover:bg-muted rounded"
                      title="Resume"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() =>
                        action.mutate(
                          { campaignId: c.id, action: "pause" },
                          { onSuccess: () => toast.success("Campaign paused") },
                        )
                      }
                      className="p-1.5 hover:bg-muted rounded"
                      title="Pause"
                    >
                      <Pause className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() =>
                      action.mutate(
                        { campaignId: c.id, action: "cancel" },
                        { onSuccess: () => toast.success("Campaign cancelled") },
                      )
                    }
                    className="p-1.5 hover:bg-muted rounded text-destructive"
                    title="Cancel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* --------------------- Recurring tab --------------------- */

function RecurringTab() {
  const { data, isLoading } = useRecurringCampaigns();
  if (isLoading) return <EmptyState loading />;
  if (!data || data.length === 0)
    return (
      <EmptyState
        icon={Repeat}
        title="No recurring campaigns"
        hint="Schedule a campaign with a recurrence rule (daily, weekly, monthly) to see it here."
      />
    );
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {data.map((c: any) => (
        <div key={c.id} className="rounded-control border border-border bg-surface p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-medium">{c.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {c.recurrence_rule?.freq ?? "—"} · every {c.recurrence_rule?.interval ?? 1}
              </div>
            </div>
            <StatusPill status={c.status} />
          </div>
          <div className="text-xs text-muted-foreground mt-3 space-y-1">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> {c.timezone ?? "UTC"}
            </div>
            <div className="flex items-center gap-1.5">
              <Gauge className="w-3 h-3" /> {c.throttle_per_minute}/min throttle
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* --------------------- Drip templates tab --------------------- */

function DripTab() {
  const create = useCreateDripFromPreset();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {DRIP_PRESETS.map((p) => {
        const Icon = PRESET_ICONS[p.id];
        return (
          <div
            key={p.id}
            className="rounded-control border border-border bg-surface p-4 flex flex-col gap-3"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-primary/10 text-primary flex items-center justify-center">
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="font-medium">{p.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{p.description}</div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground space-y-1">
              {p.steps.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Sparkles className="w-3 h-3 shrink-0" />
                  <span className="truncate">
                    +{s.delayHours}h · {s.name}
                  </span>
                </div>
              ))}
            </div>
            <button
              disabled={create.isPending}
              onClick={() =>
                create.mutate(
                  { preset: p.id },
                  {
                    onSuccess: () => toast.success(`${p.label} created`),
                    onError: (e) => toast.error((e as Error).message),
                  },
                )
              }
              className="mt-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
            >
              {create.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Create sequence
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------- Queue tab --------------------- */

function QueueTab() {
  const { data, isLoading } = useQueueHealth();
  const fmtZoned = useZonedDateFormatter();
  const stats = [
    { label: "Pending", value: data?.pending ?? 0, icon: Clock, tone: "text-warning" },
    { label: "Processing", value: data?.processing ?? 0, icon: Loader2, tone: "text-primary" },
    { label: "Sent", value: data?.sent ?? 0, icon: CheckCircle2, tone: "text-success" },
    { label: "Failed", value: data?.failed ?? 0, icon: AlertTriangle, tone: "text-destructive" },
    { label: "Skipped", value: data?.skipped ?? 0, icon: X, tone: "text-muted-foreground" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-control border border-border bg-surface p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon className={`w-3.5 h-3.5 ${s.tone}`} />
                {s.label}
              </div>
              <div className="text-2xl font-display font-semibold mt-2 ">
                {isLoading ? "" : s.value.toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>
      <div className="rounded-control border border-border bg-surface p-4 text-sm">
        <div className="flex items-center gap-2 font-medium mb-2">
          <Activity className="w-4 h-4" /> Dispatcher
        </div>
        <div className="text-xs text-muted-foreground space-y-1">
          <div>
            Queue is drained every minute by the campaign dispatch worker with per-campaign
            throttling and exponential retry.
          </div>
          {data?.oldestPending && (
            <div>
              Oldest pending job:{" "}
              <span className="font-mono">
                {fmtZoned(new Date(data.oldestPending), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------- Schedule dialog --------------------- */

function ScheduleDialog({
  campaignId,
  onClose,
}: {
  campaignId: string | null;
  onClose: () => void;
}) {
  const { data: campaigns } = useAllCampaigns();
  const schedule = useScheduleCampaign();

  const [selectedId, setSelectedId] = useState(campaignId ?? "");
  const [scheduledAt, setScheduledAt] = useState(() =>
    new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
  );
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const [throttle, setThrottle] = useState(60);
  const [respectHours, setRespectHours] = useState(true);
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(18);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [freq, setFreq] = useState<"DAILY" | "WEEKLY" | "MONTHLY">("WEEKLY");
  const [interval, setInterval] = useState(1);

  const draftCampaigns = useMemo(
    () => (campaigns ?? []).filter((c: any) => c.status !== "completed"),
    [campaigns],
  );

  const submit = () => {
    if (!selectedId) {
      toast.error("Select a campaign");
      return;
    }
    schedule.mutate(
      {
        campaignId: selectedId,
        scheduledAt: new Date(scheduledAt).toISOString(),
        timezone,
        throttlePerMinute: throttle,
        sendWindow: respectHours ? { startHour, endHour, days, respect: true } : null,
        isRecurring,
        recurrenceRule: isRecurring ? { freq, interval } : null,
      },
      {
        onSuccess: () => {
          toast.success("Campaign scheduled");
          onClose();
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  };

  const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-background border border-border rounded-control shadow-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <div className="font-medium">Schedule campaign</div>
            <div className="text-xs text-muted-foreground">
              Delivery uses queue processing with timezone and rate limits.
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <Field label="Campaign">
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full bg-background border border-border rounded-control px-2 py-1.5 text-sm"
            >
              <option value="">Select a campaign</option>
              {draftCampaigns.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.status}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Send at">
              <DateTimePicker
                value={fromLocalDateTimeString(scheduledAt)}
                onChange={(d) => setScheduledAt(toLocalDateTimeString(d))}
              />
            </Field>
            <Field label="Timezone">
              <input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full bg-background border border-border rounded-control px-2 py-1.5 text-sm"
              />
            </Field>
          </div>

          <Field label={`Rate limit — ${throttle} messages/minute`}>
            <input
              type="range"
              min={10}
              max={600}
              step={10}
              value={throttle}
              onChange={(e) => setThrottle(Number(e.target.value))}
              className="w-full"
            />
          </Field>

          <div className="rounded-control border border-border p-3 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Checkbox
                id="respect-business-hours"
                checked={respectHours}
                onCheckedChange={(v) => setRespectHours(v === true)}
              />
              <Label htmlFor="respect-business-hours" className="font-normal">
                Respect business hours
              </Label>
            </div>
            {respectHours && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start hour">
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={startHour}
                      onChange={(e) => setStartHour(Number(e.target.value))}
                      className="w-full bg-background border border-border rounded-control px-2 py-1.5 text-sm"
                    />
                  </Field>
                  <Field label="End hour">
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={endHour}
                      onChange={(e) => setEndHour(Number(e.target.value))}
                      className="w-full bg-background border border-border rounded-control px-2 py-1.5 text-sm"
                    />
                  </Field>
                </div>
                <div className="flex items-center gap-1">
                  {DAY_LABELS.map((d, i) => {
                    const active = days.includes(i);
                    return (
                      <button
                        key={i}
                        onClick={() =>
                          setDays((prev) =>
                            prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort(),
                          )
                        }
                        className={`w-8 h-8 text-xs rounded-control border transition-colors ${
                          active
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="rounded-control border border-border p-3 space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Checkbox
                id="recurring-campaign"
                checked={isRecurring}
                onCheckedChange={(v) => setIsRecurring(v === true)}
              />
              <Label htmlFor="recurring-campaign" className="font-normal">
                Recurring campaign
              </Label>
            </div>
            {isRecurring && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Frequency">
                  <select
                    value={freq}
                    onChange={(e) => setFreq(e.target.value as "DAILY" | "WEEKLY" | "MONTHLY")}
                    className="w-full bg-background border border-border rounded-control px-2 py-1.5 text-sm"
                  >
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                    <option value="MONTHLY">Monthly</option>
                  </select>
                </Field>
                <Field label="Every">
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={interval}
                    onChange={(e) => setInterval(Number(e.target.value))}
                    className="w-full bg-background border border-border rounded-control px-2 py-1.5 text-sm"
                  />
                </Field>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm rounded-control border border-border hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={schedule.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
          >
            {schedule.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Schedule
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------- Bits --------------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    scheduled: "bg-primary/10 text-primary",
    running: "bg-success/10 text-success",
    paused: "bg-warning/10 text-warning",
    completed: "bg-muted text-muted-foreground",
    failed: "bg-destructive/10 text-destructive",
    draft: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-control text-xs font-medium ${map[status] ?? "bg-muted"}`}
    >
      {status}
    </span>
  );
}

function EmptyState({
  icon: Icon,
  title,
  hint,
  loading,
}: {
  icon?: typeof Calendar;
  title?: string;
  hint?: string;
  loading?: boolean;
}) {
  if (loading)
    return (
      <div className="rounded-control border border-dashed border-border bg-surface p-10 text-center text-sm text-muted-foreground">
        Loading
      </div>
    );
  const I = Icon ?? Calendar;
  return (
    <div className="rounded-control border border-dashed border-border bg-surface p-10 text-center">
      <I className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
      <div className="font-medium">{title}</div>
      {hint && <div className="text-sm text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}
