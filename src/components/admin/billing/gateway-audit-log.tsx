/**
 * Payment gateway change history (super admins only).
 *
 * Reads `platform_audit_logs` through `listGatewayAuditLog` and shows who
 * changed what and when — adds, configuration edits, enable/disable, default
 * switches, mode switches and removals.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { listGatewayAuditLog } from "@/lib/billing/gateways.functions";

type Entry = Awaited<ReturnType<typeof listGatewayAuditLog>>[number];

const ACTION_LABEL: Record<string, string> = {
  "gateway.created": "Added",
  "gateway.updated": "Configured",
  "gateway.enabled": "Enabled",
  "gateway.disabled": "Disabled",
  "gateway.default_changed": "Default changed",
  "gateway.mode_changed": "Mode changed",
  "gateway.deleted": "Removed",
  "gateway.links_verified": "Mappings verified",
  "gateway.webhooks_replayed": "Webhooks replayed",
  "gateway.test_webhook_sent": "Test webhook",
  "gateway.plan_linked": "Plan linked",
  "gateway.plan_link_updated": "Plan link updated",
  "gateway.plan_unlinked": "Plan unlinked",
};

function actionVariant(action: string): "default" | "secondary" | "destructive" | "outline" {
  if (action === "gateway.deleted" || action === "gateway.disabled") return "destructive";
  if (action === "gateway.plan_unlinked") return "destructive";
  if (action === "gateway.created" || action === "gateway.enabled") return "default";
  if (action === "gateway.plan_linked") return "default";
  if (action === "gateway.default_changed") return "secondary";

  return "outline";
}

function formatWhen(iso: string) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function changeSummary(changes: Record<string, string | number | boolean | null>) {
  const parts = Object.entries(changes)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
  return parts.join(" · ");
}

export function GatewayAuditLog({ providerId }: { providerId?: string }) {
  const listFn = useServerFn(listGatewayAuditLog);

  const auditQ = useQuery({
    queryKey: ["billing", "gateway-audit", providerId ?? "all"],
    queryFn: () => listFn({ data: providerId ? { provider_id: providerId } : {} }),
  });

  const entries: Entry[] = auditQ.data ?? [];

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <History className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Change history</h3>
        <span className="text-xs text-muted-foreground">
          Every gateway add, configuration, enable/disable and default switch
        </span>
      </div>

      {auditQ.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading history
        </div>
      ) : auditQ.isError ? (
        <p className="text-sm text-destructive py-4">
          {(auditQ.error as Error)?.message ?? "Unable to load the change history."}
        </p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          No gateway changes recorded yet.
        </p>
      ) : (
        <ul className="divide-y">
          {entries.map((entry) => {
            const detail = changeSummary(entry.changes);
            return (
              <li key={entry.id} className="py-3 flex flex-wrap items-start gap-x-3 gap-y-1">
                <Badge variant={actionVariant(entry.action)} className="shrink-0">
                  {ACTION_LABEL[entry.action] ?? entry.action}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    {entry.summary ?? `${entry.action} ${entry.providerId ?? ""}`}
                  </p>
                  {detail && (
                    <p className="text-xs text-muted-foreground font-mono break-all">{detail}</p>
                  )}
                </div>
                <div className="text-xs text-muted-foreground text-right shrink-0">
                  <div>{entry.actorName ?? entry.actorEmail ?? "Unknown user"}</div>
                  <div>{formatWhen(entry.createdAt)}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
