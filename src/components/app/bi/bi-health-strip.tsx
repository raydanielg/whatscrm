import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { Activity, AlertTriangle, CheckCircle2, Clock, Database } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getBiHealth } from "@/lib/bi/bi.functions";
import { cn } from "@/lib/utils";

interface Props { workspaceId: string }

export function BiHealthStrip({ workspaceId }: Props) {
  const fn = useServerFn(getBiHealth);
  const { data } = useQuery({
    queryKey: ["bi.health", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => fn({ data: { workspaceId } }),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const queuedRunning = (data?.queue.queued ?? 0) + (data?.queue.running ?? 0);
  const failures24h = data?.failuresLast24h ?? 0;
  const successRate = data?.recentSuccessRate;
  const snapshotAge = data?.lastSnapshotAt
    ? formatDistanceToNow(new Date(data.lastSnapshotAt), { addSuffix: true })
    : "no snapshots yet";

  const health: { label: string; tone: "ok" | "warn" | "error" } =
    failures24h > 3 ? { label: "Degraded", tone: "error" }
    : failures24h > 0 || queuedRunning > 20 ? { label: "Watching", tone: "warn" }
    : { label: "Healthy", tone: "ok" };

  const stats: { icon: typeof Activity; label: string; value: string; hint?: string }[] = [
    { icon: Activity, label: "Pipeline", value: health.label, hint: `${queuedRunning} jobs in flight` },
    { icon: Database, label: "Last KPI snapshot", value: snapshotAge, hint: data?.lastSnapshotAt ? new Date(data.lastSnapshotAt).toLocaleString() : undefined },
    { icon: CheckCircle2, label: "Recent success rate", value: successRate == null ? "—" : `${successRate}%`, hint: `over last ${data?.recentRunCount ?? 0} runs` },
    { icon: Clock, label: "Schedules due", value: String(data?.dueSchedules ?? 0), hint: "reports awaiting next tick" },
    { icon: AlertTriangle, label: "Failures (24h)", value: String(failures24h), hint: failures24h > 0 ? "check download center" : "all clear" },
  ];

  return (
    <div
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
      role="region"
      aria-label="Business Intelligence pipeline health"
      aria-live="polite"
    >
      {stats.map((s, i) => (
        <Card key={s.label} className={cn("border-border/60", i === 0 && toneRing(health.tone))}>
          <CardContent className="flex items-start gap-3 p-4">
            <div className={cn("rounded-control p-2", toneBg(i === 0 ? health.tone : "muted"))}>
              <s.icon className={cn("h-4 w-4", toneText(i === 0 ? health.tone : "muted"))} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase text-muted-foreground">{s.label}</p>
              <p className="mt-0.5 truncate text-sm font-semibold">{s.value}</p>
              {s.hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{s.hint}</p>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function toneRing(t: "ok" | "warn" | "error") {
  return t === "ok" ? "ring-1 ring-emerald-500/20" : t === "warn" ? "ring-1 ring-amber-500/30" : "ring-1 ring-destructive/30";
}
function toneBg(t: "ok" | "warn" | "error" | "muted") {
  return t === "ok" ? "bg-emerald-500/10" : t === "warn" ? "bg-amber-500/10" : t === "error" ? "bg-destructive/10" : "bg-muted";
}
function toneText(t: "ok" | "warn" | "error" | "muted") {
  return t === "ok" ? "text-emerald-600 dark:text-emerald-400"
    : t === "warn" ? "text-amber-600 dark:text-amber-400"
    : t === "error" ? "text-destructive"
    : "text-muted-foreground";
}
