/**
 * Webhook delivery health for payment gateways (super admins only).
 *
 * Shows the last N deliveries per gateway with status, HTTP code, latency and
 * the error text, plus a per-gateway rollup (success rate, p50/p95 latency).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listGatewayWebhookDeliveries } from "@/lib/billing/gateways.functions";

const STATUS_LABEL: Record<string, string> = {
  processed: "Processed",
  duplicate: "Duplicate",
  failed: "Failed",
  invalid_signature: "Bad signature",
  misconfigured: "Misconfigured",
};

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "processed") return "default";
  if (status === "duplicate") return "secondary";
  return "destructive";
}

function relative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const LIMITS = ["10", "25", "50", "100"];

export function GatewayWebhookHealth({ providerId }: { providerId?: string }) {
  const listFn = useServerFn(listGatewayWebhookDeliveries);
  const [limit, setLimit] = useState("25");

  const q = useQuery({
    queryKey: ["billing", "gateway-webhooks", providerId ?? "all", limit],
    queryFn: () =>
      listFn({
        data: { limit: Number(limit), ...(providerId ? { provider_id: providerId } : {}) },
      }),
    refetchInterval: 60_000,
  });

  const deliveries = q.data?.deliveries ?? [];
  const summaries = q.data?.summaries ?? [];

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Activity className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Webhook delivery health</h3>
        <span className="text-xs text-muted-foreground">
          Last deliveries per gateway with status, latency and errors
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Select value={limit} onValueChange={setLimit}>
            <SelectTrigger className="h-8 w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIMITS.map((n) => (
                <SelectItem key={n} value={n}>
                  Last {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            aria-label="Refresh webhook health"
            onClick={() => q.refetch()}
          >
            <RefreshCw className={`w-4 h-4 ${q.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {summaries.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summaries.map((s) => {
            const healthy = (s.successRate ?? 100) >= 95;
            return (
              <div key={s.providerId} className="rounded-control border p-3 space-y-1">
                <div className="flex items-center gap-2">
                  {healthy ? (
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-destructive" />
                  )}
                  <span className="text-sm font-medium capitalize">{s.providerId}</span>
                  <Badge variant={healthy ? "secondary" : "destructive"} className="ml-auto">
                    {s.successRate ?? 0}% ok
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {s.succeeded}/{s.total} delivered · {s.failed} failed
                </p>
                <p className="text-xs text-muted-foreground">
                  p50 {s.p50LatencyMs ?? "–"}ms · p95 {s.p95LatencyMs ?? "–"}ms
                  {s.lastReceivedAt ? ` · last ${relative(s.lastReceivedAt)}` : ""}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {q.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading deliveries
        </div>
      ) : q.isError ? (
        <p className="text-sm text-destructive py-4">
          {(q.error as Error)?.message ?? "Unable to load webhook deliveries."}
        </p>
      ) : deliveries.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          No webhook deliveries recorded yet. Events appear here as gateways call
          <code className="mx-1 text-xs">/api/public/webhooks/billing/&lt;gateway&gt;</code>.
        </p>
      ) : (
        <ul className="divide-y">
          {deliveries.map((d) => (
            <li key={d.id} className="py-3 flex flex-wrap items-start gap-x-3 gap-y-1">
              <Badge variant={statusVariant(d.status)} className="shrink-0">
                {STATUS_LABEL[d.status] ?? d.status}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="capitalize font-medium">{d.providerId}</span>
                  {d.eventType ? ` · ${d.eventType}` : ""}
                  {d.httpStatus ? ` · HTTP ${d.httpStatus}` : ""}
                  {typeof d.latencyMs === "number" ? ` · ${d.latencyMs}ms` : ""}
                </p>
                {d.eventId && (
                  <p className="text-xs text-muted-foreground font-mono break-all">{d.eventId}</p>
                )}
                {d.errorMessage && (
                  <p className="text-xs text-destructive break-words">{d.errorMessage}</p>
                )}
              </div>
              <div className="text-xs text-muted-foreground text-right shrink-0">
                <div>{relative(d.receivedAt)}</div>
                <div>{new Date(d.receivedAt).toLocaleString()}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
