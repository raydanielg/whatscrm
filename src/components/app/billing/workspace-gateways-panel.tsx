/**
 * Workspace-level payment gateway overrides.
 *
 * Owners/admins can switch off a platform-enabled gateway for their own
 * workspace and pick which one is used by default. Overrides never widen what
 * the platform allows — a gateway switched off platform-wide stays off.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Lock } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  listWorkspaceGateways,
  setWorkspaceDefaultGateway,
  setWorkspaceGatewayOverride,
} from "@/lib/billing/workspace-gateways.functions";

export function WorkspaceGatewaysPanel({
  workspaceId,
  canManage = true,
}: {
  workspaceId: string;
  canManage?: boolean;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listWorkspaceGateways);
  const overrideFn = useServerFn(setWorkspaceGatewayOverride);
  const defaultFn = useServerFn(setWorkspaceDefaultGateway);

  const key = ["workspace-gateways", workspaceId];
  const q = useQuery({
    queryKey: key,
    enabled: Boolean(workspaceId),
    queryFn: () => listFn({ data: { workspace_id: workspaceId } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: key });
  const onError = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : "Could not update gateway");

  const toggle = useMutation({
    mutationFn: (v: { provider_id: string; enabled: boolean | null }) =>
      overrideFn({ data: { workspace_id: workspaceId, ...v } }),
    onSuccess: () => {
      invalidate();
      toast.success("Workspace gateway updated");
    },
    onError,
  });

  const makeDefault = useMutation({
    mutationFn: (provider_id: string | null) =>
      defaultFn({ data: { workspace_id: workspaceId, provider_id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Default gateway updated");
    },
    onError,
  });

  const rows = q.data ?? [];
  const platformRows = rows.filter((g) => g.platformEnabled);
  const busy = toggle.isPending || makeDefault.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment gateways</CardTitle>
        <CardDescription>
          Choose which of the platform's gateways this workspace uses, and which one is
          selected by default. Gateways switched off platform-wide can't be turned on here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? (
          <>
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </>
        ) : platformRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No payment gateways are enabled on the platform yet.
          </p>
        ) : (
          platformRows.map((g) => (
            <div
              key={g.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-control border p-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{g.displayName}</span>
                  <Badge variant="outline" className="capitalize">
                    {g.mode}
                  </Badge>
                  {g.isWorkspaceDefault && <Badge>Workspace default</Badge>}
                  {!g.isWorkspaceDefault && g.platformDefault && (
                    <Badge variant="secondary">Platform default</Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {g.override === null
                    ? "Inheriting the platform setting (on)"
                    : g.override
                      ? "Turned on for this workspace"
                      : "Turned off for this workspace"}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {g.effectiveEnabled && !g.isWorkspaceDefault && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!canManage || busy}
                    onClick={() => makeDefault.mutate(g.id)}
                  >
                    <Check className="mr-1 h-3.5 w-3.5" />
                    Make default
                  </Button>
                )}
                {g.override !== null && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!canManage || busy}
                    onClick={() => toggle.mutate({ provider_id: g.id, enabled: null })}
                  >
                    Inherit
                  </Button>
                )}
                <Switch
                  aria-label={`Enable ${g.displayName} for this workspace`}
                  checked={g.effectiveEnabled}
                  disabled={!canManage || busy}
                  onCheckedChange={(v) =>
                    toggle.mutate({ provider_id: g.id, enabled: v })
                  }
                />
              </div>
            </div>
          ))
        )}

        {!canManage && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            Only workspace owners and admins can change these settings.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
