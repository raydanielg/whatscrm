import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  retryQueueJob,
  cancelQueueJob,
  bulkRetryFailedJobs,
  recoverStuckRuns,
  deadLetterJob,
} from "@/lib/workflows/workflows.functions";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  AlertTriangle,
  Pause,
  CalendarClock,
  RefreshCw,
  TrendingUp,
  Timer,
  Zap,
  X,
  Skull,
  ShieldAlert,
} from "lucide-react";

type RunRow = {
  id: string;
  automation_id: string;
  status: string;
  trigger_source: string | null;
  duration_ms: number | null;
  started_at: string;
  finished_at: string | null;
  error: unknown;
};

type QueueRow = {
  id: string;
  automation_id: string;
  status: string;
  attempts: number;
  max_attempts: number;
  run_at: string;
  priority: number;
  last_error: unknown;
  dead_lettered_at?: string | null;
};

type AutomationLite = {
  id: string;
  name: string;
  status: string;
  trigger_type: string;
};

const WINDOW_HOURS = 24;

export function WorkflowMonitoring() {
  const qc = useQueryClient();
  const [rangeH, setRangeH] = React.useState<number>(WINDOW_HOURS);
  const sinceIso = React.useMemo(
    () => new Date(Date.now() - rangeH * 3600_000).toISOString(),
    [rangeH],
  );

  const runsQ = useQuery({
    queryKey: ["wf-mon-runs", rangeH],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflow_runs")
        .select(
          "id, automation_id, status, trigger_source, duration_ms, started_at, finished_at, error",
        )
        .gte("started_at", sinceIso)
        .order("started_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as RunRow[];
    },
    refetchInterval: 15_000,
  });

  const queueQ = useQuery({
    queryKey: ["wf-mon-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflow_queue")
        .select(
          "id, automation_id, status, attempts, max_attempts, run_at, priority, last_error, dead_lettered_at",
        )
        .in("status", ["queued", "running", "retry", "failed"])
        .order("run_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as QueueRow[];
    },
    refetchInterval: 10_000,
  });

  const autosQ = useQuery({
    queryKey: ["wf-mon-autos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automations")
        .select("id, name, status, trigger_type")
        .limit(500);
      if (error) throw error;
      return (data ?? []) as AutomationLite[];
    },
    refetchInterval: 30_000,
  });

  // Realtime — invalidate on any change.
  React.useEffect(() => {
    const ch = supabase
      .channel("wf-monitoring")
      .on("postgres_changes", { event: "*", schema: "public", table: "workflow_runs" }, () =>
        qc.invalidateQueries({ queryKey: ["wf-mon-runs"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "workflow_queue" }, () =>
        qc.invalidateQueries({ queryKey: ["wf-mon-queue"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "automations" }, () =>
        qc.invalidateQueries({ queryKey: ["wf-mon-autos"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const runs = runsQ.data ?? [];
  const queue = queueQ.data ?? [];
  const autos = autosQ.data ?? [];
  const nameById = React.useMemo(() => {
    const m = new Map<string, AutomationLite>();
    autos.forEach((a) => m.set(a.id, a));
    return m;
  }, [autos]);

  const stats = React.useMemo(() => {
    const total = runs.length;
    const success = runs.filter((r) => r.status === "success").length;
    const failed = runs.filter((r) => r.status === "failed").length;
    const running = runs.filter((r) => r.status === "running" || r.status === "pending").length;
    const durations = runs.filter((r) => r.duration_ms != null).map((r) => r.duration_ms as number);
    const avg = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;
    const p95 = percentile(durations, 0.95);
    const successRate = total ? (success / total) * 100 : 0;
    return { total, success, failed, running, avg, p95, successRate };
  }, [runs]);

  const deadLetter = queue.filter(
    (q) => !!q.dead_lettered_at || (q.status === "failed" && q.attempts >= q.max_attempts),
  );
  const retryQueue = queue.filter(
    (q) =>
      !q.dead_lettered_at &&
      (q.status === "retry" || (q.status === "failed" && q.attempts < q.max_attempts)),
  );
  const runningQueue = queue.filter((q) => q.status === "running");
  const scheduled = queue.filter(
    (q) => q.status === "queued" && new Date(q.run_at).getTime() > Date.now(),
  );
  const paused = autos.filter((a) => a.status === "paused");

  // Runs stuck in `running` for > 10 minutes — likely orphaned by a crashed worker.
  const stuckThreshold = Date.now() - 10 * 60_000;
  const stuckRuns = runs.filter(
    (r) => r.status === "running" && new Date(r.started_at).getTime() < stuckThreshold,
  );

  // Health score: weighted success + queue backlog.
  const health = computeHealth(stats, queue);

  const retryFn = useServerFn(retryQueueJob);
  const cancelFn = useServerFn(cancelQueueJob);
  const bulkRetryFn = useServerFn(bulkRetryFailedJobs);
  const recoverFn = useServerFn(recoverStuckRuns);
  const dlqFn = useServerFn(deadLetterJob);
  const retryMut = useMutation({
    mutationFn: (jobId: string) => retryFn({ data: { jobId } }),
    onSuccess: () => {
      toast.success("Job re-queued");
      qc.invalidateQueries({ queryKey: ["wf-mon-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const cancelMut = useMutation({
    mutationFn: (jobId: string) => cancelFn({ data: { jobId } }),
    onSuccess: () => {
      toast.success("Job cancelled");
      qc.invalidateQueries({ queryKey: ["wf-mon-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const bulkRetryMut = useMutation({
    mutationFn: () => bulkRetryFn({ data: {} }),
    onSuccess: (r) => {
      toast.success(`Re-queued ${r.requeued} job${r.requeued === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["wf-mon-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const recoverMut = useMutation({
    mutationFn: () => recoverFn({ data: { olderThanMinutes: 10 } }),
    onSuccess: (r) => {
      toast.success(`Recovered ${r.recovered} stuck run${r.recovered === 1 ? "" : "s"}`);
      qc.invalidateQueries({ queryKey: ["wf-mon-runs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const dlqMut = useMutation({
    mutationFn: (jobId: string) => dlqFn({ data: { jobId } }),
    onSuccess: () => {
      toast.success("Job moved to dead-letter");
      qc.invalidateQueries({ queryKey: ["wf-mon-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section aria-label="Workflow monitoring" className="space-y-5">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-sm font-medium">Workflow monitoring</div>
          <div className="text-xs text-muted-foreground">
            Live runs, queue, and health across the last {rangeH}h.
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <RangeSelect value={rangeH} onChange={setRangeH} />
          <button
            onClick={() => bulkRetryMut.mutate()}
            disabled={bulkRetryMut.isPending || retryQueue.length === 0}
            title={
              retryQueue.length === 0
                ? "No jobs eligible for retry"
                : `Re-queue ${retryQueue.length} failed/retry jobs`
            }
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-control border border-border bg-surface text-xs hover:bg-muted disabled:opacity-50"
          >
            {bulkRetryMut.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Retry all failed
          </button>
          <button
            onClick={() => recoverMut.mutate()}
            disabled={recoverMut.isPending || stuckRuns.length === 0}
            title={
              stuckRuns.length === 0
                ? "No stuck runs detected"
                : `Fail ${stuckRuns.length} runs stuck > 10m`
            }
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-control border border-border bg-surface text-xs hover:bg-muted disabled:opacity-50"
          >
            {recoverMut.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ShieldAlert className="w-3.5 h-3.5" />
            )}
            Recover stuck runs{" "}
            {stuckRuns.length > 0 && <span className="">({stuckRuns.length})</span>}
          </button>
          <button
            onClick={() => {
              qc.invalidateQueries({ queryKey: ["wf-mon-runs"] });
              qc.invalidateQueries({ queryKey: ["wf-mon-queue"] });
              qc.invalidateQueries({ queryKey: ["wf-mon-autos"] });
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-control border border-border bg-surface text-xs hover:bg-muted"
            aria-label="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </header>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi
          icon={<Activity className="w-4 h-4" />}
          label="Total runs"
          value={stats.total.toLocaleString()}
        />
        <Kpi
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
          label="Successful"
          value={stats.success.toLocaleString()}
          hint={`${stats.successRate.toFixed(1)}%`}
        />
        <Kpi
          icon={<XCircle className="w-4 h-4 text-rose-500" />}
          label="Failed"
          value={stats.failed.toLocaleString()}
        />
        <Kpi
          icon={<Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
          label="Running"
          value={stats.running.toLocaleString()}
        />
        <Kpi
          icon={<Timer className="w-4 h-4" />}
          label="Avg runtime"
          value={fmtMs(stats.avg)}
          hint={`p95 ${fmtMs(stats.p95)}`}
        />
        <HealthCard health={health} />
      </div>

      {/* Queue / status boards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-5 gap-4">
        <StatusList
          title="Running now"
          icon={<Zap className="w-4 h-4 text-blue-500" />}
          items={runningQueue.map((q) => ({
            id: q.id,
            automationId: q.automation_id,
            primary: nameById.get(q.automation_id)?.name ?? "Workflow",
            secondary: `Attempt ${q.attempts + 1}/${q.max_attempts}`,
          }))}
          empty="No workflows running"
        />
        <StatusList
          title="Retry queue"
          icon={<RefreshCw className="w-4 h-4 text-amber-500" />}
          items={retryQueue.slice(0, 20).map((q) => ({
            id: q.id,
            automationId: q.automation_id,
            primary: nameById.get(q.automation_id)?.name ?? "Workflow",
            secondary: `${q.attempts}/${q.max_attempts} attempts`,
            error: errorMessage(q.last_error),
            action: {
              label: "Retry now",
              icon: <RefreshCw className="w-3 h-3" />,
              onClick: () => retryMut.mutate(q.id),
              pending: retryMut.isPending,
            },
            secondaryAction: {
              label: "Dead-letter",
              icon: <Skull className="w-3 h-3" />,
              onClick: () => dlqMut.mutate(q.id),
              pending: dlqMut.isPending,
            },
          }))}
          empty="Nothing to retry"
        />
        <StatusList
          title="Scheduled"
          icon={<CalendarClock className="w-4 h-4 text-indigo-500" />}
          items={scheduled.slice(0, 20).map((q) => ({
            id: q.id,
            automationId: q.automation_id,
            primary: nameById.get(q.automation_id)?.name ?? "Workflow",
            secondary: `in ${fmtIn(q.run_at)}`,
            action: {
              label: "Cancel",
              icon: <X className="w-3 h-3" />,
              onClick: () => cancelMut.mutate(q.id),
              pending: cancelMut.isPending,
            },
          }))}
          empty="No scheduled runs"
        />
        <StatusList
          title="Dead-letter"
          icon={<Skull className="w-4 h-4 text-rose-500" />}
          items={deadLetter.slice(0, 20).map((q) => ({
            id: q.id,
            automationId: q.automation_id,
            primary: nameById.get(q.automation_id)?.name ?? "Workflow",
            secondary: `${q.attempts}/${q.max_attempts} attempts`,
            error: errorMessage(q.last_error),
            action: {
              label: "Requeue",
              icon: <RefreshCw className="w-3 h-3" />,
              onClick: () => retryMut.mutate(q.id),
              pending: retryMut.isPending,
            },
          }))}
          empty="No dead-lettered jobs"
        />
        <StatusList
          title="Paused"
          icon={<Pause className="w-4 h-4 text-muted-foreground" />}
          items={paused.slice(0, 20).map((a) => ({
            id: a.id,
            automationId: a.id,
            primary: a.name,
            secondary: a.trigger_type,
          }))}
          empty="No paused workflows"
        />
      </div>

      {/* Analytics chart */}
      <TimelineChart runs={runs} rangeH={rangeH} />

      {/* Execution history */}
      <ExecutionHistory runs={runs} nameById={nameById} loading={runsQ.isLoading} />
    </section>
  );
}

/* ---------------- Sub-components ---------------- */

function Kpi({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-control border border-border bg-surface p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1.5 text-2xl font-semibold ">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function HealthCard({
  health,
}: {
  health: { score: number; label: string; tone: "good" | "warn" | "bad" };
}) {
  const tone =
    health.tone === "good"
      ? "text-emerald-600 bg-emerald-500/10 border-emerald-500/20"
      : health.tone === "warn"
        ? "text-amber-600 bg-amber-500/10 border-amber-500/20"
        : "text-rose-600 bg-rose-500/10 border-rose-500/20";
  return (
    <div className="rounded-control border border-border bg-surface p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <TrendingUp className="w-4 h-4" />
        <span>Health</span>
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <div className="text-2xl font-semibold ">{health.score}</div>
        <span
          className={`inline-flex items-center rounded-control border px-2 py-0.5 text-[11px] ${tone}`}
        >
          {health.label}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full ${health.tone === "good" ? "bg-emerald-500" : health.tone === "warn" ? "bg-amber-500" : "bg-rose-500"}`}
          style={{ width: `${health.score}%` }}
        />
      </div>
    </div>
  );
}

type StatusItemAction = {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  pending?: boolean;
};
type StatusItem = {
  id: string;
  automationId: string;
  primary: string;
  secondary?: string;
  error?: string;
  action?: StatusItemAction;
  secondaryAction?: StatusItemAction;
};

function StatusList({
  title,
  icon,
  items,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  items: StatusItem[];
  empty: string;
}) {
  return (
    <div className="rounded-control border border-border bg-surface">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-medium">
          {icon}
          <span>{title}</span>
        </div>
        <span className="text-xs text-muted-foreground ">{items.length}</span>
      </div>
      <ul className="divide-y divide-border max-h-72 overflow-auto">
        {items.length === 0 ? (
          <li className="px-3 py-6 text-center text-xs text-muted-foreground">{empty}</li>
        ) : (
          items.map((it) => (
            <li key={it.id} className="px-3 py-2 hover:bg-muted/50 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <Link
                  to="/automations/$workflowId"
                  params={{ workflowId: it.automationId }}
                  className="block min-w-0 flex-1"
                >
                  <div className="text-sm truncate">{it.primary}</div>
                  {it.secondary && (
                    <div className="text-[11px] text-muted-foreground truncate">{it.secondary}</div>
                  )}
                  {it.error && (
                    <div className="text-[11px] text-rose-600 truncate flex items-center gap-1 mt-0.5">
                      <AlertTriangle className="w-3 h-3" /> {it.error}
                    </div>
                  )}
                </Link>
                {(it.action || it.secondaryAction) && (
                  <div className="shrink-0 flex flex-col gap-1">
                    {it.action && (
                      <button
                        type="button"
                        onClick={it.action.onClick}
                        disabled={it.action.pending}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-control border border-border text-[11px] hover:bg-muted disabled:opacity-50"
                      >
                        {it.action.pending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          it.action.icon
                        )}
                        <span>{it.action.label}</span>
                      </button>
                    )}
                    {it.secondaryAction && (
                      <button
                        type="button"
                        onClick={it.secondaryAction.onClick}
                        disabled={it.secondaryAction.pending}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-control border border-border text-[11px] text-rose-600 hover:bg-muted disabled:opacity-50"
                      >
                        {it.secondaryAction.pending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          it.secondaryAction.icon
                        )}
                        <span>{it.secondaryAction.label}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

function TimelineChart({ runs, rangeH }: { runs: RunRow[]; rangeH: number }) {
  // Bucket runs into ~24 bins across the window.
  const bins = 24;
  const now = Date.now();
  const windowMs = rangeH * 3600_000;
  const buckets = React.useMemo(() => {
    const arr = Array.from({ length: bins }, () => ({ success: 0, failed: 0, other: 0 }));
    for (const r of runs) {
      const t = new Date(r.started_at).getTime();
      const idx = Math.min(
        bins - 1,
        Math.max(0, Math.floor(((t - (now - windowMs)) / windowMs) * bins)),
      );
      if (r.status === "success") arr[idx].success += 1;
      else if (r.status === "failed") arr[idx].failed += 1;
      else arr[idx].other += 1;
    }
    return arr;
  }, [runs, now, windowMs]);
  const max = Math.max(1, ...buckets.map((b) => b.success + b.failed + b.other));

  return (
    <div className="rounded-control border border-border bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium">Execution timeline</div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <LegendDot color="bg-emerald-500" label="Success" />
          <LegendDot color="bg-rose-500" label="Failed" />
          <LegendDot color="bg-muted-foreground/40" label="Other" />
        </div>
      </div>
      <div className="flex items-end gap-1 h-32">
        {buckets.map((b, i) => {
          const total = b.success + b.failed + b.other;
          const h = (total / max) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col justify-end" title={`${total} runs`}>
              <div
                className="w-full flex flex-col-reverse rounded-t overflow-hidden transition-all"
                style={{ height: `${h}%` }}
              >
                {b.success > 0 && <div className="bg-emerald-500" style={{ flex: b.success }} />}
                {b.failed > 0 && <div className="bg-rose-500" style={{ flex: b.failed }} />}
                {b.other > 0 && (
                  <div className="bg-muted-foreground/40" style={{ flex: b.other }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

function ExecutionHistory({
  runs,
  nameById,
  loading,
}: {
  runs: RunRow[];
  nameById: Map<string, AutomationLite>;
  loading: boolean;
}) {
  const [selected, setSelected] = React.useState<RunRow | null>(null);
  const fmtZoned = useZonedDateFormatter();
  return (
    <div className="rounded-control border border-border bg-surface">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <div className="text-sm font-medium">Execution history</div>
        <div className="text-xs text-muted-foreground">{runs.length} runs</div>
      </div>
      <div className="overflow-auto max-h-[480px]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface z-10">
            <tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Workflow</th>
              <th className="px-4 py-2 font-medium">Trigger</th>
              <th className="px-4 py-2 font-medium">Started</th>
              <th className="px-4 py-2 font-medium">Duration</th>
              <th className="px-4 py-2 font-medium">Error</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-xs text-muted-foreground">
                  Loading
                </td>
              </tr>
            ) : runs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-xs text-muted-foreground">
                  No runs in this window
                </td>
              </tr>
            ) : (
              runs.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-border last:border-0 hover:bg-muted/40 cursor-pointer"
                  onClick={() => setSelected(r)}
                >
                  <td className="px-4 py-2">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-2 truncate max-w-[220px]">
                    {nameById.get(r.automation_id)?.name ?? r.automation_id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {r.trigger_source ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-xs ">
                    {fmtZoned(new Date(r.started_at), { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                  <td className="px-4 py-2 text-xs ">{fmtMs(r.duration_ms ?? 0)}</td>
                  <td className="px-4 py-2 text-xs text-rose-600 truncate max-w-[280px]">
                    {errorMessage(r.error) ?? ""}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {selected && (
        <RunDetailDrawer
          run={selected}
          name={nameById.get(selected.automation_id)?.name}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function RunDetailDrawer({
  run,
  name,
  onClose,
}: {
  run: RunRow;
  name?: string;
  onClose: () => void;
}) {
  const fmtZoned = useZonedDateFormatter();
  const stepsQ = useQuery({
    queryKey: ["wf-run-steps", run.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflow_run_steps")
        .select(
          "id, node_id, node_type, status, duration_ms, started_at, finished_at, error, sort_order",
        )
        .eq("run_id", run.id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative ml-auto w-full max-w-xl h-full bg-surface border-l border-border shadow-2xl overflow-auto animate-in slide-in-from-right duration-200">
        <header className="sticky top-0 bg-surface border-b border-border px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">{name ?? "Workflow run"}</div>
            <div className="text-xs text-muted-foreground">
              {fmtZoned(new Date(run.started_at), { dateStyle: "medium", timeStyle: "short" })}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-xs px-2 py-1 rounded-control border border-border hover:bg-muted"
          >
            Close
          </button>
        </header>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <Field label="Status">
              <StatusBadge status={run.status} />
            </Field>
            <Field label="Duration">{fmtMs(run.duration_ms ?? 0)}</Field>
            <Field label="Trigger">{run.trigger_source ?? "—"}</Field>
          </div>
          {errorMessage(run.error) && (
            <div className="rounded-control border border-rose-500/30 bg-rose-500/10 text-rose-700 text-xs p-3">
              <div className="font-medium mb-1 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Error
              </div>
              <pre className="whitespace-pre-wrap break-words">
                {JSON.stringify(run.error, null, 2)}
              </pre>
            </div>
          )}
          <div>
            <div className="text-xs font-medium mb-2">Step log</div>
            <ol className="space-y-1.5">
              {(stepsQ.data ?? []).map((s) => (
                <li
                  key={s.id}
                  className="rounded-control border border-border bg-background p-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono truncate">{s.node_type}</span>
                    <StatusBadge status={s.status} />
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                    <span>{s.node_id}</span>
                    <span className="">{fmtMs(s.duration_ms ?? 0)}</span>
                  </div>
                  {errorMessage(s.error) && (
                    <div className="text-[11px] text-rose-600 mt-1 truncate">
                      {errorMessage(s.error)}
                    </div>
                  )}
                </li>
              ))}
              {(stepsQ.data ?? []).length === 0 && !stepsQ.isLoading && (
                <li className="text-xs text-muted-foreground">No steps recorded.</li>
              )}
            </ol>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-control border border-border p-2">
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    success: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
    failed: "text-rose-600 bg-rose-500/10 border-rose-500/20",
    running: "text-blue-600 bg-blue-500/10 border-blue-500/20",
    pending: "text-muted-foreground bg-muted border-border",
    queued: "text-indigo-600 bg-indigo-500/10 border-indigo-500/20",
    retry: "text-amber-600 bg-amber-500/10 border-amber-500/20",
    cancelled: "text-muted-foreground bg-muted border-border",
  };
  const cls = map[status] ?? "text-muted-foreground bg-muted border-border";
  return (
    <span
      className={`inline-flex items-center rounded-control border px-2 py-0.5 text-[11px] capitalize ${cls}`}
    >
      {status}
    </span>
  );
}

function RangeSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const opts = [
    { v: 1, label: "1h" },
    { v: 6, label: "6h" },
    { v: 24, label: "24h" },
    { v: 24 * 7, label: "7d" },
    { v: 24 * 30, label: "30d" },
  ];
  return (
    <div className="inline-flex items-center rounded-control border border-border bg-surface p-0.5">
      {opts.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`px-2 py-1 rounded-control text-xs ${value === o.v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- helpers ---------------- */

function fmtMs(ms: number): string {
  if (!ms) return "0ms";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function fmtIn(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "now";
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

function errorMessage(err: unknown): string | undefined {
  if (!err) return undefined;
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const e = err as { message?: string; error?: string };
    return e.message ?? e.error ?? JSON.stringify(err).slice(0, 200);
  }
  return String(err);
}

function computeHealth(
  stats: { total: number; success: number; failed: number },
  queue: QueueRow[],
): { score: number; label: string; tone: "good" | "warn" | "bad" } {
  const rate = stats.total ? stats.success / stats.total : 1;
  const backlog = queue.filter((q) => q.status === "queued" || q.status === "retry").length;
  const backlogPenalty = Math.min(20, backlog / 5);
  const score = Math.max(0, Math.min(100, Math.round(rate * 100 - backlogPenalty)));
  if (score >= 90) return { score, label: "Healthy", tone: "good" };
  if (score >= 70) return { score, label: "Degraded", tone: "warn" };
  return { score, label: "Unhealthy", tone: "bad" };
}
