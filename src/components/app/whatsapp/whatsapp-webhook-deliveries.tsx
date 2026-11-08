/**
 * Recent WhatsApp webhook delivery log.
 *
 * Lists the newest raw envelopes recorded in `webhook_events` for the
 * active workspace so admins can confirm Meta is delivering, see whether
 * signatures validated, and read the last processing error. Payload
 * bodies are deliberately not shown.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, Inbox, Loader2, RefreshCw, ShieldAlert, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useChannelAccounts, type ChannelAccountRow } from "@/hooks/use-channel-accounts";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { listWhatsAppWebhookDeliveries } from "@/lib/messaging/webhook-stats.functions";

function relative(ts: string | null) {
  if (!ts) return "—";
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: true });
  } catch {
    return ts;
  }
}

export function WhatsAppWebhookDeliveries({ limit = 25 }: { limit?: number }) {
  const { data: workspace } = useCurrentWorkspace();
  const workspaceId = workspace?.id;
  const { data: accountsData } = useChannelAccounts(workspaceId);

  const accountNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of (accountsData?.accounts ?? []) as unknown as ChannelAccountRow[]) {
      m.set(a.id, a.display_name ?? a.id);
    }
    return m;
  }, [accountsData?.accounts]);

  const listFn = useServerFn(listWhatsAppWebhookDeliveries);
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["whatsapp-webhook-deliveries", workspaceId, limit],
    queryFn: () => listFn({ data: { workspaceId: workspaceId!, limit } }),
    enabled: !!workspaceId,
    refetchInterval: 30_000,
  });

  const deliveries = data?.deliveries ?? [];

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-medium text-sm flex items-center gap-2">
            <Inbox className="w-4 h-4" /> Last webhook deliveries
          </h3>
          <p className="text-xs text-muted-foreground">
            Newest {limit} envelopes received from Meta, refreshed every 30s.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
          {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : deliveries.length === 0 ? (
        <Alert>
          <ShieldAlert className="w-4 h-4" />
          <AlertTitle>No webhook deliveries yet</AlertTitle>
          <AlertDescription>
            Once Meta is pointed at the callback URL above, inbound envelopes
            appear here within seconds of the first message or status update.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="rounded-control border border-border bg-surface overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Received</th>
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 font-medium">Event</th>
                <th className="px-3 py-2 font-medium">Signature</th>
                <th className="px-3 py-2 font-medium">Result</th>
                <th className="px-3 py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((d) => (
                <tr key={d.id} className="border-t border-border/60 align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{relative(d.received_at)}</td>
                  <td className="px-3 py-2">
                    {d.channel_account_id
                      ? accountNames.get(d.channel_account_id) ?? "Unmatched"
                      : "Unmatched"}
                  </td>
                  <td className="px-3 py-2 font-mono">{d.event_type ?? "—"}</td>
                  <td className="px-3 py-2">
                    {d.signature_valid ? (
                      <Badge variant="outline" className="gap-1 text-[11px]">
                        <CheckCircle2 className="w-3 h-3" /> Valid
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1 text-[11px]">
                        <XCircle className="w-3 h-3" /> Invalid
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {d.dead_letter_at ? (
                      <Badge variant="destructive" className="text-[11px]">Dead letter</Badge>
                    ) : d.processed ? (
                      <Badge variant="outline" className="text-[11px]">
                        Processed {relative(d.processed_at)}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[11px]">
                        Pending{d.attempts ? ` · ${d.attempts} attempts` : ""}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 max-w-[22rem] text-muted-foreground break-words">
                    {d.process_error
                      ? `${d.last_error_kind ? `[${d.last_error_kind}] ` : ""}${d.process_error}`
                      : d.external_event_id
                        ? <span className="font-mono">{d.external_event_id}</span>
                        : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
