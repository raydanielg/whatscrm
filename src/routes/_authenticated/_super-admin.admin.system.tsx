import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Server, Loader2, RefreshCw, Wrench, ExternalLink } from "lucide-react";
import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getMonitoringSnapshot, retryFailedJobs } from "@/lib/admin/monitoring.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/system")({
  head: () => ({
    meta: [{ title: "Super Admin — System Ops" }, { name: "robots", content: "noindex" }],
  }),
  component: SystemOpsPage,
});

const QUEUES = [
  { key: "workflow" as const, label: "Workflow queue" },
  { key: "campaigns" as const, label: "Campaign dispatch" },
  { key: "outbox" as const, label: "Message outbox" },
  { key: "webhooks" as const, label: "Webhook events" },
];

function QueueDiagnostics() {
  const runSnapshot = useServerFn(getMonitoringSnapshot);
  const runRetry = useServerFn(retryFailedJobs);
  const [retrying, setRetrying] = useState<string | null>(null);
  const snapshot = useQuery({
    queryKey: ["admin-system-ops-snapshot"],
    queryFn: () => runSnapshot(),
    refetchInterval: 15_000,
  });

  const failedCount = (queue: (typeof QUEUES)[number]["key"]) => {
    const q = snapshot.data?.queues;
    if (!q) return null;
    if (queue === "workflow") return q.workflow.failed;
    if (queue === "campaigns") return q.campaigns.failed;
    if (queue === "outbox") return q.outbox.failed;
    return q.webhooks.failed;
  };

  async function retry(queue: (typeof QUEUES)[number]["key"]) {
    setRetrying(queue);
    try {
      const r = await runRetry({ data: { queue } });
      toast.success(r.retried > 0 ? `Re-queued ${r.retried} job(s)` : "No failed jobs to retry");
      snapshot.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setRetrying(null);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="p-3 border-b border-border flex items-center justify-between">
        <div className="text-sm font-medium">Background job queues</div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => snapshot.refetch()}
          disabled={snapshot.isFetching}
        >
          <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", snapshot.isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>
      <div className="divide-y divide-border">
        {QUEUES.map((q) => {
          const failed = failedCount(q.key);
          return (
            <div key={q.key} className="p-3 flex items-center justify-between">
              <div>
                <div className="text-sm">{q.label}</div>
                <div className="text-xs text-muted-foreground">
                  {failed == null ? "—" : `${failed} failed job(s)`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {failed != null && failed > 0 && (
                  <Badge
                    variant="outline"
                    className="bg-amber-500/10 text-amber-600 border-amber-500/20"
                  >
                    Needs attention
                  </Badge>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={retrying === q.key || !failed}
                  onClick={() => retry(q.key)}
                >
                  {retrying === q.key && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                  Retry failed
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function SystemOpsPage() {
  return (
    <AdminPageShell
      title="System Operations"
      description="Background job diagnostics and failed-job retries, plus quick links to the maintenance and settings controls that actually exist in this platform."
    >
      <div className="space-y-6">
        <QueueDiagnostics />

        <Card className="p-4">
          <div className="flex items-start gap-3">
            <Wrench className="w-4 h-4 text-muted-foreground mt-0.5" />
            <div className="text-sm">
              <div className="font-medium">Maintenance mode</div>
              <p className="text-muted-foreground text-xs mt-1 max-w-prose">
                Taking the platform offline for maintenance (with an IP allowlist and a custom
                message) is configured under Settings → Maintenance, not here, since it's one
                setting among many on that page rather than a standalone ops action.
              </p>
              <Link
                to="/admin/settings"
                className="inline-flex items-center gap-1 text-primary hover:underline text-xs mt-2"
              >
                Open Settings <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </Card>

        {/*
         * Cache purge and index/migration triggers have no backing in this
         * codebase: there is no server-side cache layer to invalidate (this
         * app is Supabase + edge functions, not a cached read-through
         * service), and running migrations from an admin UI button would be
         * genuinely dangerous without a reviewed, gated workflow. Rather than
         * faking those buttons, this page only exposes the two system-ops
         * actions that have real, safe backing: queue diagnostics/retry
         * (above) and a link to the maintenance-mode setting that already
         * exists. See also: Super Admin → Monitoring for live
         * CPU/memory/provider health.
         */}
        <Card className="p-4 flex items-start gap-3">
          <Server className="w-4 h-4 text-muted-foreground mt-0.5" />
          <p className="text-xs text-muted-foreground max-w-prose">
            Reindexing and cache purges aren't listed here because this platform has no server-side
            cache layer to purge, and there's no reviewed workflow for triggering migrations from
            the UI yet. For live system health (CPU, memory, provider status, incidents), see{" "}
            <Link to="/admin/monitoring" className="text-primary hover:underline">
              Monitoring
            </Link>
            .
          </p>
        </Card>
      </div>
    </AdminPageShell>
  );
}
