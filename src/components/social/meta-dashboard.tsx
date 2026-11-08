/**
 * Meta dashboard: every connected Facebook Page / Instagram account, the live
 * grant status Meta reports for its token, and a revoke action — so tokens are
 * never pasted around by hand.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  Facebook,
  Instagram,
} from "lucide-react";
import {
  listMetaGrants,
  revokeMetaGrant,
  type MetaGrant,
} from "@/lib/social/meta-manage.functions";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

interface Props {
  workspaceId: string | undefined;
  onChanged?: () => void;
}

export function MetaDashboard({ workspaceId, onChanged }: Props) {
  const list = useServerFn(listMetaGrants);
  const revoke = useServerFn(revokeMetaGrant);
  const qc = useQueryClient();
  const [target, setTarget] = useState<MetaGrant | null>(null);
  const formatZoned = useZonedDateFormatter();

  const {
    data: grants = [],
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["meta-grants", workspaceId],
    enabled: Boolean(workspaceId),
    queryFn: () => list({ data: { workspaceId: workspaceId as string } }),
  });

  const revokeMut = useMutation({
    mutationFn: (channelId: string) =>
      revoke({ data: { workspaceId: workspaceId as string, channelId } }),
    onSuccess: (res) => {
      if (res.revokedAtMeta)
        toast.success("Access revoked at Meta and the stored token was deleted");
      else
        toast.warning(res.revokeError ?? "Stored token deleted; Meta did not confirm the revoke");
      setTarget(null);
      void qc.invalidateQueries({ queryKey: ["meta-grants", workspaceId] });
      onChanged?.();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Could not revoke this token"),
  });

  if (!workspaceId) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Meta connections</h3>
          <p className="text-xs text-muted-foreground">
            Pages and Instagram accounts granted through “Continue with Facebook”, with the grant
            status Meta reports right now.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      {isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Checking grant status with Meta</Card>
      ) : grants.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">
          No Meta channels connected yet. Use Channels → Connect channel → Facebook → Continue with
          Facebook.
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {grants.map((g) => (
            <Card key={g.id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  {g.platform === "facebook" ? (
                    <Facebook className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Instagram className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{g.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {g.username ? `@${g.username} · ` : ""}ID {g.externalId ?? "—"}
                    </p>
                  </div>
                </div>
                {g.valid ? (
                  <Badge variant="secondary" className="gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    Granted
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <ShieldAlert className="h-3 w-3" />
                    Needs attention
                  </Badge>
                )}
              </div>

              {g.error && <p className="text-xs text-destructive">{g.error}</p>}

              {g.missingScopes.length > 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  Missing permissions: {g.missingScopes.join(", ")} — reconnect and approve them.
                </p>
              )}

              {g.scopes.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {g.scopes.slice(0, 8).map((s) => (
                    <code key={s} className="rounded bg-muted px-1 py-0.5 text-[11px]">
                      {s}
                    </code>
                  ))}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                {g.expiresAt
                  ? `Token expires ${formatZoned(new Date(g.expiresAt), { dateStyle: "medium", timeStyle: "short" })}`
                  : "Long-lived token — no expiry reported"}
              </p>

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setTarget(g)}
                disabled={revokeMut.isPending}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Revoke access
              </Button>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog
        open={Boolean(target)}
        onOpenChange={(v) => {
          if (!v) setTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {target?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This asks Meta to remove the app’s permissions for this account and deletes the stored
              token. Scheduled posts for this channel will fail until you reconnect.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (target) revokeMut.mutate(target.id);
              }}
              disabled={revokeMut.isPending}
            >
              {revokeMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
