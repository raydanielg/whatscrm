/**
 * Persistent in-app notification for unsupported channel providers.
 *
 * Any `channel_accounts` row whose provider is outside the supported registry
 * cannot be routed by the inbox: it is silently invisible while still counted
 * as "connected". This banner surfaces that state for the current tenant on
 * every authenticated screen (it does not auto-dismiss) and offers a direct
 * action to resolve it — remap onto a supported provider or disable the
 * account — for workspace owners/admins.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useCurrentWorkspace, useWorkspaceRole } from "@/hooks/use-workspace";
import { useChannelAccounts, type ChannelAccountRow } from "@/hooks/use-channel-accounts";
import { normalizeChannelAccounts } from "@/lib/inbox/account-sync";
import {
  TENANT_REMAP_LABELS,
  TENANT_REMAP_TARGETS,
  type TenantRemapTarget,
} from "@/lib/inbox/provider-repair";
import { repairWorkspaceProvider } from "@/lib/inbox/provider-repair.functions";

type Group = {
  provider: string;
  reason: string;
  accountIds: string[];
  names: string[];
};

export function UnsupportedProviderBanner() {
  const { active: workspace } = useCurrentWorkspace();
  const workspaceId = workspace?.id;

  const { data: accountsData } = useChannelAccounts(workspaceId);
  const { data: role } = useWorkspaceRole(workspaceId);
  const canFix = role === "owner" || role === "admin";

  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<Record<string, TenantRemapTarget>>({});
  const qc = useQueryClient();
  const repairFn = useServerFn(repairWorkspaceProvider);

  const groups = useMemo<Group[]>(() => {
    const { invalid } = normalizeChannelAccounts<ChannelAccountRow>(accountsData);
    const map = new Map<string, Group>();
    for (const item of invalid) {
      const key = item.provider || "(empty)";
      let g = map.get(key);
      if (!g) {
        g = { provider: key, reason: item.reason, accountIds: [], names: [] };
        map.set(key, g);
      }
      g.accountIds.push(item.row.id);
      g.names.push(item.row.display_name || "Untitled account");
    }
    return Array.from(map.values());
  }, [accountsData]);

  const repair = useMutation({
    mutationFn: (input: {
      fromProvider: string;
      action: "remap" | "disable";
      toProvider?: TenantRemapTarget;
      accountIds: string[];
    }) => repairFn({ data: { workspaceId: workspaceId!, ...input } }),
    onSuccess: (res) => {
      toast.success(
        res.action === "remap"
          ? `${res.affected} account${res.affected === 1 ? "" : "s"} mapped to a supported channel`
          : `${res.affected} account${res.affected === 1 ? "" : "s"} disabled`,
      );
      void qc.invalidateQueries({ queryKey: ["channel-accounts", workspaceId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!workspaceId || groups.length === 0) return null;

  const accountCount = groups.reduce((n, g) => n + g.accountIds.length, 0);

  return (
    <>
      <div
        role="alert"
        aria-live="polite"
        className="flex flex-wrap items-center gap-3 border-b border-warning/30 bg-warning-muted px-4 py-2.5 sm:px-6"
      >
        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
        <p className="min-w-0 flex-1 text-sm text-warning">
          <span className="font-semibold">
            {accountCount} connected account{accountCount === 1 ? "" : "s"} use an unsupported
            channel type
          </span>{" "}
          <span className="text-warning/90">
            ({groups.map((g) => g.provider).join(", ")}) — messages from{" "}
            {accountCount === 1 ? "it" : "them"} can&apos;t be routed to your inbox.
          </span>
        </p>
        {canFix ? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0"
            onClick={() => setOpen(true)}
          >
            <Wrench className="h-3.5 w-3.5" aria-hidden />
            Resolve now
          </Button>
        ) : (
          <Link
            to="/integrations/marketplace"
            className="shrink-0 text-xs font-medium text-accent hover:underline"
          >
            Ask a workspace admin — manage channels
          </Link>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Resolve unsupported channels</DialogTitle>
            <DialogDescription>
              Map each account onto a supported provider, or disable it so it stops counting as
              connected.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g.provider} className="rounded border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{g.provider}</p>
                    <p className="text-xs text-muted-foreground">{g.reason}</p>
                  </div>
                  <Badge variant="secondary">
                    {g.accountIds.length} account{g.accountIds.length === 1 ? "" : "s"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">{g.names.join(", ")}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={targets[g.provider] ?? ""}
                    onValueChange={(v) =>
                      setTargets((t) => ({ ...t, [g.provider]: v as TenantRemapTarget }))
                    }
                  >
                    <SelectTrigger className="h-8 w-56" aria-label={`Map ${g.provider} to`}>
                      <SelectValue placeholder="Map to supported provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {TENANT_REMAP_TARGETS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {TENANT_REMAP_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={!targets[g.provider] || repair.isPending}
                    onClick={() =>
                      repair.mutate({
                        fromProvider: g.provider,
                        action: "remap",
                        toProvider: targets[g.provider],
                        accountIds: g.accountIds,
                      })
                    }
                  >
                    Apply
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={repair.isPending}
                    onClick={() =>
                      repair.mutate({
                        fromProvider: g.provider,
                        action: "disable",
                        accountIds: g.accountIds,
                      })
                    }
                  >
                    Disable
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Link
              to="/integrations/marketplace"
              className="text-xs font-medium text-accent hover:underline"
              onClick={() => setOpen(false)}
            >
              Manage channels
            </Link>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
