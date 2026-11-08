/**
 * WhatsApp webhook dead-letter queue.
 *
 * Lists envelopes that exhausted their automatic retries (or are still in
 * the backoff window) and lets a workspace admin inspect the raw payload
 * and requeue them for another processing pass.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useChannelAccounts, type ChannelAccountRow } from "@/hooks/use-channel-accounts";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import {
  listWhatsAppFailedWebhooks,
  retryWhatsAppWebhookEvents,
  type FailedWebhookRow,
  type FailedWebhookSummary,
} from "@/lib/messaging/webhook-stats.functions";

function relative(ts: string | null | undefined) {
  if (!ts) return "—";
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: true });
  } catch {
    return ts;
  }
}

export function WhatsAppDeadLetterQueue({ limit = 50 }: { limit?: number }) {
  const { data: workspace } = useCurrentWorkspace();
  const workspaceId = workspace?.id;
  const { data: accountsData } = useChannelAccounts(workspaceId);
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<string[]>([]);
  const [inspecting, setInspecting] = useState<FailedWebhookRow | null>(null);

  const accountNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of (accountsData?.accounts ?? []) as unknown as ChannelAccountRow[]) {
      m.set(a.id, a.display_name ?? a.id);
    }
    return m;
  }, [accountsData?.accounts]);

  const listFn = useServerFn(listWhatsAppFailedWebhooks);
  const retryFn = useServerFn(retryWhatsAppWebhookEvents);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["whatsapp-webhook-dead-letters", workspaceId, limit],
    queryFn: () =>
      listFn({ data: { workspaceId: workspaceId!, limit, includePayload: true } }),
    enabled: !!workspaceId,
    refetchInterval: 60_000,
  });

  const events: FailedWebhookRow[] = data?.events ?? [];
  const summary: FailedWebhookSummary | undefined = data?.summary;

  const retry = useMutation({
    mutationFn: (vars: { eventIds?: string[]; allDeadLettered?: boolean }) =>
      retryFn({ data: { workspaceId: workspaceId!, runNow: true, ...vars } }),
    onSuccess: (result) => {
      toast.success(result.message);
      setSelected([]);
      queryClient.invalidateQueries({ queryKey: ["whatsapp-webhook-dead-letters"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-webhook-deliveries"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-webhook-stats"] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Could not reprocess these envelopes."),
  });

  const allSelected = events.length > 0 && selected.length === events.length;
  const toggleAll = () => setSelected(allSelected ? [] : events.map((e) => e.id));
  const toggleOne = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-medium text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Failed &amp; dead-lettered webhooks
          </h3>
          <p className="text-xs text-muted-foreground">
            Envelopes retry automatically with exponential backoff. Anything that
            exhausts its attempts lands here and can be reprocessed manually.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
            {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={selected.length === 0 || retry.isPending}
            onClick={() => retry.mutate({ eventIds: selected })}
          >
            {retry.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
            Reprocess selected{selected.length > 0 ? ` (${selected.length})` : ""}
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!summary?.deadLettered || retry.isPending}
            onClick={() => retry.mutate({ allDeadLettered: true })}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reprocess all dead-lettered
          </Button>
        </div>
      </div>

      {summary && summary.total > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="destructive">{summary.deadLettered} dead-lettered</Badge>
          <Badge variant="secondary">{summary.retrying} awaiting retry</Badge>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : events.length === 0 ? (
        <Alert>
          <CheckCircle2 className="w-4 h-4" />
          <AlertTitle>No failed webhooks</AlertTitle>
          <AlertDescription>
            Every inbound envelope has been processed successfully. Failures would
            appear here after their automatic retries are exhausted.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="rounded-control border border-border bg-surface overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr className="text-left">
                <th className="px-3 py-2 w-8">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                </th>
                <th className="px-3 py-2 font-medium">Received</th>
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 font-medium">Event</th>
                <th className="px-3 py-2 font-medium">Attempts</th>
                <th className="px-3 py-2 font-medium">State</th>
                <th className="px-3 py-2 font-medium">Error</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-t border-border/60 align-top">
                  <td className="px-3 py-2">
                    <Checkbox
                      checked={selected.includes(e.id)}
                      onCheckedChange={() => toggleOne(e.id)}
                      aria-label="Select envelope"
                    />
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{relative(e.received_at)}</td>
                  <td className="px-3 py-2">
                    {e.channel_account_id
                      ? accountNames.get(e.channel_account_id) ?? "Unmatched"
                      : "Unmatched"}
                  </td>
                  <td className="px-3 py-2 font-mono">{e.event_type ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {e.attempts ?? 0}/{e.max_attempts ?? 8}
                  </td>
                  <td className="px-3 py-2">
                    {e.dead_letter_at ? (
                      <Badge variant="destructive" className="text-[11px]">
                        Dead letter {relative(e.dead_letter_at)}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[11px]">
                        Retry {relative(e.next_attempt_at)}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 max-w-[20rem] text-muted-foreground break-words">
                    {e.last_error_kind ? `[${e.last_error_kind}] ` : ""}
                    {e.last_error ?? e.process_error ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setInspecting(e)}>
                        Payload
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={retry.isPending}
                        onClick={() => retry.mutate({ eventIds: [e.id] })}
                      >
                        Reprocess
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!inspecting} onOpenChange={(open) => !open && setInspecting(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Webhook payload</DialogTitle>
            <DialogDescription>
              Raw envelope received from Meta{inspecting ? ` · ${relative(inspecting.received_at)}` : ""}.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] rounded-control border border-border bg-muted/30">
            <pre className="p-3 text-[11px] font-mono whitespace-pre-wrap break-words">
              {inspecting?.payload ?? "{}"}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </section>
  );
}
