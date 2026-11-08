import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity, AlertTriangle, CheckCircle2, Cpu, Database, HardDrive,
  Loader2, MessageSquare, RefreshCw, Server, Signal, Timer, Webhook, Wifi, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { getMonitoringSnapshot, retryFailedJobs, type MonitoringSnapshot, type SystemStatus } from "@/lib/admin/monitoring.functions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const statusColors: Record<SystemStatus, string> = {
  healthy: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  degraded: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  down: "text-red-500 bg-red-500/10 border-red-500/20",
  unknown: "text-muted-foreground bg-muted border-border",
};

const statusLabels: Record<SystemStatus, string> = {
  healthy: "Healthy", degraded: "Degraded", down: "Down", unknown: "Unknown",
};

function StatusDot({ status }: { status: SystemStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-control border text-xs font-medium", statusColors[status])}>
      <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse",
        status === "healthy" ? "bg-emerald-500" :
        status === "degraded" ? "bg-amber-500" :
        status === "down" ? "bg-red-500" : "bg-muted-foreground"
      )} />
      {statusLabels[status]}
    </span>
  );
}

function formatBytes(n: number | null): string {
  if (n == null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

function MetricCard({
  icon: Icon, label, value, sub, progress, tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; sub?: string;
  progress?: number | null; tone?: "default" | "warn" | "danger" | "ok";
}) {
  const toneClasses = {
    default: "text-foreground",
    ok: "text-emerald-500",
    warn: "text-amber-500",
    danger: "text-red-500",
  };
  return (
    <Card className="p-4 space-y-3 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <Icon className={cn("w-4 h-4", toneClasses[tone])} />
      </div>
      <div>
        <div className="text-2xl font-display font-semibold ">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </div>
      {progress != null && <Progress value={progress} className="h-1.5" />}
    </Card>
  );
}

function ProviderRow({ p }: { p: MonitoringSnapshot["aiProviders"][number] }) {
  return (
    <div className="flex items-center justify-between py-2.5 px-3 rounded-control hover:bg-muted/50 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{p.name}</span>
          <span className="text-xs text-muted-foreground">{p.kind}</span>
        </div>
        {p.message && <div className="text-xs text-muted-foreground truncate mt-0.5">{p.message}</div>}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
        {p.latencyMs != null && <span className="">{p.latencyMs}ms</span>}
        {p.successRate != null && <span className="">{p.successRate.toFixed(1)}%</span>}
        <StatusDot status={p.status} />
      </div>
    </div>
  );
}

export function MonitoringDashboard() {
  const fetchSnapshot = useServerFn(getMonitoringSnapshot);
  const retry = useServerFn(retryFailedJobs);
  const qc = useQueryClient();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-monitoring-snapshot"],
    queryFn: () => fetchSnapshot(),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (data) setLastUpdated(new Date());
  }, [data]);

  // Realtime — invalidate when queue tables change
  useEffect(() => {
    const channel = supabase
      .channel("admin-monitoring")
      .on("postgres_changes", { event: "*", schema: "public", table: "workflow_queue" },
        () => qc.invalidateQueries({ queryKey: ["admin-monitoring-snapshot"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "message_outbox" },
        () => qc.invalidateQueries({ queryKey: ["admin-monitoring-snapshot"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "webhook_events" },
        () => qc.invalidateQueries({ queryKey: ["admin-monitoring-snapshot"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_provider_health" },
        () => qc.invalidateQueries({ queryKey: ["admin-monitoring-snapshot"] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const totalFailed = useMemo(() => {
    if (!data) return 0;
    return data.queues.workflow.failed + data.queues.campaigns.failed +
      data.queues.outbox.failed + data.queues.webhooks.failed;
  }, [data]);

  async function handleRetry(queue: "workflow" | "campaigns" | "outbox" | "webhooks") {
    try {
      const res = await retry({ data: { queue } });
      toast.success(`Retried ${res.retried} failed job${res.retried === 1 ? "" : "s"}`);
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retry failed");
    }
  }

  if (isLoading || !data) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <StatusDot status={data.system.status} />
          <span className="text-sm text-muted-foreground">
            Updated {lastUpdated?.toLocaleTimeString() ?? "—"} · Auto-refresh 5s
          </span>
        </div>
        <div className="flex items-center gap-2">
          {totalFailed > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="w-3 h-3" />
              {totalFailed} failed
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Core metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={Cpu} label="CPU Usage"
          value={data.system.cpuUsagePct != null ? `${data.system.cpuUsagePct}%` : "—"}
          sub="Compute instance"
          progress={data.system.cpuUsagePct}
          tone={data.system.cpuUsagePct && data.system.cpuUsagePct > 80 ? "danger" : "default"}
        />
        <MetricCard
          icon={Server} label="Memory Usage"
          value={data.system.memoryUsagePct != null ? `${data.system.memoryUsagePct}%` : "—"}
          sub="RAM saturation"
          progress={data.system.memoryUsagePct}
          tone={data.system.memoryUsagePct && data.system.memoryUsagePct > 85 ? "danger" : "default"}
        />
        <MetricCard
          icon={Database} label="Database"
          value={formatBytes(data.database.sizeBytes)}
          sub={data.database.connections != null ? `${data.database.connections}/${data.database.maxConnections ?? "?"} connections` : "Postgres"}
          progress={data.database.usagePct}
        />
        <MetricCard
          icon={HardDrive} label="Storage"
          value={formatBytes(data.storage.usedBytes)}
          sub={`${data.storage.fileCount.toLocaleString()} files`}
        />
        <MetricCard
          icon={Signal} label="Bandwidth"
          value={data.system.bandwidthMbps != null ? `${data.system.bandwidthMbps} Mbps` : "—"}
          sub="Egress"
        />
        <MetricCard
          icon={Wifi} label="Realtime"
          value={data.realtime.connections.toLocaleString()}
          sub={`${data.realtime.activeConversations} active conversations`}
          tone="ok"
        />
        <MetricCard
          icon={Timer} label="Response Time"
          value={data.api.avgResponseMs != null ? `${data.api.avgResponseMs}ms` : "—"}
          sub={data.api.p95ResponseMs != null ? `p95 ${data.api.p95ResponseMs}ms` : "Last 5m"}
        />
        <MetricCard
          icon={Activity} label="API Health"
          value={`${(100 - data.api.errorRatePct).toFixed(1)}%`}
          sub={`${data.api.requestsLast5m} req · ${data.api.errorsLast5m} errors`}
          tone={data.api.errorRatePct > 5 ? "danger" : data.api.errorRatePct > 1 ? "warn" : "ok"}
        />
      </div>

      {/* Queues */}
      <div>
        <h3 className="font-bold text-xl mb-3">Queues & Jobs</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {([
            { key: "workflow", label: "Workflow Queue", icon: Zap, q: data.queues.workflow },
            { key: "campaigns", label: "Campaign Dispatch", icon: MessageSquare, q: data.queues.campaigns },
            { key: "outbox", label: "Message Outbox", icon: MessageSquare, q: { ...data.queues.outbox, running: 0 } },
            { key: "webhooks", label: "Webhook Queue", icon: Webhook, q: { ...data.queues.webhooks, running: 0 } },
          ] as const).map(({ key, label, icon: Icon, q }) => (
            <Card key={key} className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{label}</span>
                </div>
                {q.failed > 0 && (
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => handleRetry(key)}>
                    Retry all
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-lg font-semibold ">{q.pending}</div>
                  <div className="text-[11px] text-muted-foreground uppercase">Pending</div>
                </div>
                <div>
                  <div className="text-lg font-semibold  text-blue-500">{"running" in q ? q.running : 0}</div>
                  <div className="text-[11px] text-muted-foreground uppercase">Running</div>
                </div>
                <div>
                  <div className={cn("text-lg font-semibold ", q.failed > 0 ? "text-red-500" : "")}>{q.failed}</div>
                  <div className="text-[11px] text-muted-foreground uppercase">Failed</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Providers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-sm">AI Providers</h4>
            <Badge variant="secondary" className="text-xs">{data.aiProviders.length}</Badge>
          </div>
          <div className="space-y-1">
            {data.aiProviders.length === 0
              ? <div className="text-xs text-muted-foreground py-4 text-center">No providers configured</div>
              : data.aiProviders.map((p: MonitoringSnapshot["aiProviders"][number]) => <ProviderRow key={p.id} p={p} />)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-sm">WhatsApp Providers</h4>
            <Badge variant="secondary" className="text-xs">{data.whatsappProviders.length}</Badge>
          </div>
          <div className="space-y-1">
            {data.whatsappProviders.length === 0
              ? <div className="text-xs text-muted-foreground py-4 text-center">No channels connected</div>
              : data.whatsappProviders.map((p: MonitoringSnapshot["whatsappProviders"][number]) => <ProviderRow key={p.id} p={p} />)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-sm">Payment Gateways</h4>
            <Badge variant="secondary" className="text-xs">{data.paymentProviders.length}</Badge>
          </div>
          <div className="space-y-1">
            {data.paymentProviders.length === 0
              ? <div className="text-xs text-muted-foreground py-4 text-center">No gateways configured</div>
              : data.paymentProviders.map((p: MonitoringSnapshot["paymentProviders"][number]) => <ProviderRow key={p.id} p={p} />)}
          </div>
        </Card>
      </div>

      {/* Incidents */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-medium text-sm">Recent Incidents</h4>
          <span className="text-xs text-muted-foreground">Last hour</span>
        </div>
        {data.incidents.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            No incidents reported
          </div>
        ) : (
          <div className="space-y-2">
            {data.incidents.map((i: MonitoringSnapshot["incidents"][number]) => (
              <div key={i.id} className="flex items-start gap-3 p-2 rounded-control hover:bg-muted/50">
                <StatusDot status={i.severity} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{i.source}</div>
                  <div className="text-xs text-muted-foreground truncate">{i.message}</div>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{new Date(i.at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
