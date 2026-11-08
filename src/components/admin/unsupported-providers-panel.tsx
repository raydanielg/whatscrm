import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Loader2, PlugZap, RefreshCw, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { AdminEmptyState } from "@/components/admin/admin-page-shell";
import {
  disableUnsupportedProvider,
  listUnsupportedProviders,
  remapUnsupportedProvider,
} from "@/lib/admin/channel-providers.functions";
import { channelLabel } from "@/lib/inbox/channel-capabilities";

const QUERY_KEY = ["admin", "unsupported-providers"];

export function UnsupportedProvidersPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listUnsupportedProviders);
  const remapFn = useServerFn(remapUnsupportedProvider);
  const disableFn = useServerFn(disableUnsupportedProvider);

  const [targets, setTargets] = useState<Record<string, string>>({});
  const [pendingDisable, setPendingDisable] = useState<{ provider: string; count: number } | null>(null);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => listFn(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: QUERY_KEY });

  const remap = useMutation({
    mutationFn: (vars: { fromProvider: string; toProvider: string }) =>
      remapFn({ data: vars as never }),
    onSuccess: (res: { updated: number }, vars) => {
      toast.success(`Mapped ${res.updated} account(s) to ${vars.toProvider}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Could not remap provider"),
  });

  const disable = useMutation({
    mutationFn: (vars: { provider: string }) => disableFn({ data: vars }),
    onSuccess: (res: { disabled: number }) => {
      toast.success(`Disabled ${res.disabled} account(s)`);
      setPendingDisable(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Could not disable accounts"),
  });

  const groups = useMemo(() => data?.groups ?? [], [data]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded" />
        <Skeleton className="h-40 w-full rounded" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Couldn&apos;t load provider report
          </CardTitle>
          <CardDescription>{(error as Error)?.message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Connected accounts" value={data?.totalAccounts ?? 0} />
        <StatCard label="Routable" value={data?.supportedCount ?? 0} tone="ok" />
        <StatCard label="Unsupported" value={data?.unsupportedCount ?? 0} tone="warn" />
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {groups.length === 0 ? (
        <AdminEmptyState
          icon={CheckCircle2}
          title="No unsupported providers"
          description="Every connected account uses a provider the inbox can route. Nothing to map or disable."
        />
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const selected = targets[g.provider] ?? "";
            const busy =
              (remap.isPending && remap.variables?.fromProvider === g.provider) ||
              (disable.isPending && disable.variables?.provider === g.provider);
            return (
              <Card key={g.provider}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <PlugZap className="h-4 w-4 text-accent" />
                        <code className="font-mono">{g.provider}</code>
                        <Badge variant="secondary">{g.count} account{g.count === 1 ? "" : "s"}</Badge>
                        <Badge variant="outline">
                          {g.workspaceCount} workspace{g.workspaceCount === 1 ? "" : "s"}
                        </Badge>
                      </CardTitle>
                      <CardDescription className="mt-1">
                        {g.reason}
                        {g.suggestedChannel
                          ? ` Suggested channel: ${channelLabel(g.suggestedChannel)}.`
                          : ""}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={selected}
                        onValueChange={(v) => setTargets((t) => ({ ...t, [g.provider]: v }))}
                      >
                        <SelectTrigger className="w-[190px]" aria-label={`Map ${g.provider} to`}>
                          <SelectValue placeholder="Map to provider" />
                        </SelectTrigger>
                        <SelectContent>
                          {(data?.knownProviders ?? []).map((p) => (
                            <SelectItem key={p} value={p}>
                              {p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        disabled={!selected || busy}
                        onClick={() =>
                          remap.mutate({ fromProvider: g.provider, toProvider: selected })
                        }
                      >
                        {busy && remap.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : null}
                        Apply mapping
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setPendingDisable({ provider: g.provider, count: g.count })}
                      >
                        <ShieldOff className="h-4 w-4 mr-2" /> Disable
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="rounded border border-border divide-y divide-border">
                    {g.accounts.slice(0, 25).map((a) => (
                      <div
                        key={a.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                      >
                        <span className="font-medium">{a.displayName || "Untitled account"}</span>
                        <span className="text-muted-foreground">
                          {a.workspaceName || a.workspaceId || "—"}
                        </span>
                        <Badge variant="outline">{a.status ?? "unknown"}</Badge>
                      </div>
                    ))}
                    {g.accounts.length > 25 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        +{g.accounts.length - 25} more
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={pendingDisable !== null}
        onOpenChange={(open) => !open && setPendingDisable(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable these accounts?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDisable?.count} account(s) using{" "}
              <code className="font-mono">{pendingDisable?.provider}</code> will be set to
              disconnected and stop sending or receiving messages. This can be undone by
              reconnecting the account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                pendingDisable && disable.mutate({ provider: pendingDisable.provider })
              }
            >
              Disable accounts
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p
          className={`text-2xl font-semibold mt-1 ${
            tone === "warn" && value > 0
              ? "text-destructive"
              : tone === "ok"
                ? "text-accent"
                : ""
          }`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
