/**
 * Meta WhatsApp integration health checks panel.
 *
 * Runs live probes (token, permissions, webhook subscription, callback URL,
 * published domain, delivery activity) and surfaces failures as actionable
 * alerts with the concrete fix for each one.
 */

import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  HeartPulse,
  HelpCircle,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useWhatsAppHealth } from "@/hooks/use-whatsapp-health";
import type { HealthStatus } from "@/lib/messaging/health.functions";

const STATUS_META: Record<HealthStatus, { icon: typeof CheckCircle2; className: string; label: string }> = {
  ok: { icon: CheckCircle2, className: "text-emerald-600", label: "Healthy" },
  warn: { icon: AlertTriangle, className: "text-amber-600", label: "Needs attention" },
  error: { icon: XCircle, className: "text-destructive", label: "Action required" },
  unknown: { icon: HelpCircle, className: "text-muted-foreground", label: "Unknown" },
};

export function WhatsAppHealthChecks({ autoRun = true }: { autoRun?: boolean }) {
  const { data: workspace } = useCurrentWorkspace();
  const workspaceId = workspace?.id;

  // Shared query — the integration status panel reads the same key, so the
  // Graph probes run once per workspace instead of once per component.
  const health = useWhatsAppHealth(autoRun);

  const rerun = () => {
    void health.refetch().then(({ data: report }) => {
      if (!report) return;
      const failing = report.accounts.flatMap((a) =>
        a.checks.filter((c) => c.status === "error").map((c) => `${a.displayName}: ${c.label}`),
      );
      if (failing.length > 0) {
        toast.error(`${failing.length} WhatsApp health check${failing.length === 1 ? "" : "s"} failing`, {
          description: failing.slice(0, 3).join(" · "),
        });
      } else if (report.problems > 0) {
        toast.warning(`${report.problems} WhatsApp warning${report.problems === 1 ? "" : "s"}`);
      } else if (report.accounts.length > 0) {
        toast.success("All WhatsApp health checks passed.");
      }
    });
  };

  const run = { isPending: health.isFetching, mutate: rerun };
  const report = health.data;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-medium text-sm flex items-center gap-2">
            <HeartPulse className="w-4 h-4" /> Integration health
          </h3>
          <p className="text-xs text-muted-foreground">
            Live checks for token validity, permissions, webhook subscription, callback
            URL, and the published app domain.
            {report ? ` Last run ${formatDistanceToNow(new Date(report.checkedAt), { addSuffix: true })}.` : ""}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={rerun}
          disabled={run.isPending || !workspaceId}
        >
          {run.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Run checks
        </Button>
      </div>

      {run.isPending && !report ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !report ? (
        <Alert>
          <HeartPulse className="w-4 h-4" />
          <AlertTitle>Health checks not run yet</AlertTitle>
          <AlertDescription>Run the checks to probe Meta and your callback URL.</AlertDescription>
        </Alert>
      ) : report.accounts.length === 0 ? (
        <Alert>
          <HelpCircle className="w-4 h-4" />
          <AlertTitle>No WhatsApp accounts connected</AlertTitle>
          <AlertDescription>
            Connect a WhatsApp Cloud account with the setup wizard, then run these checks.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-3">
          {report.accounts.map((account) => {
            const meta = STATUS_META[account.status];
            const Icon = meta.icon;
            return (
              <Card key={account.channelAccountId} className="rounded">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex flex-wrap items-center gap-2">
                    <Icon className={`w-4 h-4 ${meta.className}`} />
                    {account.displayName}
                    {account.phoneNumber && (
                      <span className="font-normal text-xs text-muted-foreground">{account.phoneNumber}</span>
                    )}
                    <Badge
                      variant={account.status === "error" ? "destructive" : account.status === "ok" ? "outline" : "secondary"}
                      className="text-[11px]"
                    >
                      {meta.label}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <ul className="divide-y divide-border/60">
                    {account.checks.map((check, i) => {
                      const cm = STATUS_META[check.status];
                      const CIcon = cm.icon;
                      return (
                        <li key={`${check.id}-${i}`} className="flex gap-2 py-2 text-xs">
                          <CIcon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${cm.className}`} />
                          <div className="min-w-0 space-y-0.5">
                            <p className="font-medium">{check.label}</p>
                            <p className="text-muted-foreground break-words">{check.detail}</p>
                            {check.remedy && (
                              <p className="text-foreground/80 break-words">Fix: {check.remedy}</p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
