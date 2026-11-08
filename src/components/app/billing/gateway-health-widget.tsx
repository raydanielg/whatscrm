/**
 * Gateway health/status widget for the tenant Billing area.
 *
 * Shows, for each gateway available to the active workspace: current
 * connection state, when the last webhook arrived and how many deliveries
 * failed in the selected window. Credentials, webhook URLs and raw error text
 * stay server-side — this widget only renders counters and timestamps.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Clock,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getWorkspaceGatewayHealth,
  type WorkspaceGatewayHealth,
} from "@/lib/billing/workspace-gateways.functions";

const STATE_META: Record<
  WorkspaceGatewayHealth["state"],
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    Icon: typeof Activity;
    tone: string;
  }
> = {
  healthy: { label: "Connected", variant: "default", Icon: CheckCircle2, tone: "text-primary" },
  degraded: {
    label: "Degraded",
    variant: "secondary",
    Icon: AlertTriangle,
    tone: "text-muted-foreground",
  },
  failing: {
    label: "Failing",
    variant: "destructive",
    Icon: AlertTriangle,
    tone: "text-destructive",
  },
  idle: { label: "No traffic", variant: "outline", Icon: Clock, tone: "text-muted-foreground" },
  disabled: {
    label: "Disabled",
    variant: "outline",
    Icon: CircleSlash,
    tone: "text-muted-foreground",
  },
};

const WINDOWS = [
  { value: "24", label: "Last 24 hours" },
  { value: "168", label: "Last 7 days" },
  { value: "720", label: "Last 30 days" },
];

function relative(iso: string | null) {
  if (!iso) return "Never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function GatewayHealthWidget({ workspaceId }: { workspaceId: string }) {
  const healthFn = useServerFn(getWorkspaceGatewayHealth);
  const [windowHours, setWindowHours] = useState("24");

  const q = useQuery({
    queryKey: ["billing", "gateway-health", workspaceId, windowHours],
    queryFn: () =>
      healthFn({ data: { workspace_id: workspaceId, window_hours: Number(windowHours) } }),
    refetchInterval: 60_000,
  });

  const gateways = q.data?.gateways ?? [];
  const failing = gateways.filter((g) => g.state === "failing").length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4 shrink-0" />
            Gateway health
          </CardTitle>
          <CardDescription>
            Connection state and webhook activity for this workspace.
            {failing > 0 && (
              <span className="text-destructive">
                {" "}
                {failing} gateway{failing === 1 ? "" : "s"} failing.
              </span>
            )}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select value={windowHours} onValueChange={setWindowHours}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDOWS.map((w) => (
                <SelectItem key={w.value} value={w.value}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            onClick={() => q.refetch()}
            disabled={q.isFetching}
            aria-label="Refresh gateway health"
          >
            {q.isFetching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {q.isLoading && (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        )}

        {q.isError && (
          <p className="text-sm text-destructive">
            Couldn't load gateway health for this workspace.
          </p>
        )}

        {!q.isLoading && !q.isError && gateways.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No payment gateways are available to this workspace yet.
          </p>
        )}

        {gateways.map((g) => {
          const meta = STATE_META[g.state];
          return (
            <div
              key={g.id}
              className="rounded-control border p-3 flex flex-wrap items-center gap-x-4 gap-y-2"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <meta.Icon className={`w-4 h-4 shrink-0 ${meta.tone}`} />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {g.displayName}
                    {g.isDefault && (
                      <Badge variant="outline" className="ml-2 text-[11px]">
                        Default
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground capitalize">{g.mode} mode</div>
                </div>
              </div>

              <div className="text-xs">
                <div className="text-muted-foreground">Last webhook</div>
                <div className="font-medium">{relative(g.lastWebhookAt)}</div>
              </div>

              <div className="text-xs">
                <div className="text-muted-foreground">Failures</div>
                <div
                  className={`font-medium ${g.failures > 0 ? "text-destructive" : ""}`}
                >
                  {g.failures} / {g.deliveries}
                </div>
              </div>

              <Badge variant={meta.variant}>{meta.label}</Badge>
            </div>
          );
        })}

        {q.data && (
          <p className="text-[11px] text-muted-foreground pt-1">
            Window: last {q.data.windowHours}h · updated {relative(q.data.generatedAt)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
