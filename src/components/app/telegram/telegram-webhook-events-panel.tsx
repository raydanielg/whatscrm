import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, RotateCcw, Trash2, ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  clearTelegramWebhookEvents,
  listTelegramWebhookEvents,
  retryTelegramWebhookEvent,
  type TelegramWebhookEvent,
} from "@/lib/telegram/webhook-events.functions";

const FILTERS = [
  { id: "", label: "All" },
  { id: "failed", label: "Failed" },
  { id: "unauthorized", label: "Unauthorized" },
  { id: "processed", label: "Processed" },
  { id: "ignored", label: "Ignored" },
] as const;

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "failed" || status === "unauthorized") return "destructive";
  if (status === "processed") return "default";
  return "secondary";
}

export function TelegramWebhookEventsPanel({ workspaceId }: { workspaceId: string | null }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("");

  const eventsQuery = useQuery({
    queryKey: ["telegram-webhook-events", workspaceId, status],
    enabled: !!workspaceId,
    queryFn: async () => {
      const res = await listTelegramWebhookEvents({
        data: { workspaceId: workspaceId as string, status: status || null, limit: 50 },
      });
      return res.events as TelegramWebhookEvent[];
    },
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["telegram-webhook-events", workspaceId] });

  const retry = useMutation({
    mutationFn: async (eventId: string) => retryTelegramWebhookEvent({ data: { eventId } }),
    onSuccess: (r) => {
      if (r.status === "processed") toast.success("Event re-processed into the inbox");
      else if (r.status === "ignored") toast.info("Nothing to ingest in this update");
      else toast.error(r.error ?? "Retry failed");
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clear = useMutation({
    mutationFn: async () =>
      clearTelegramWebhookEvents({ data: { workspaceId: workspaceId as string } }),
    onSuccess: () => {
      toast.success("Webhook event log cleared");
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const events = eventsQuery.data ?? [];

  return (
    <Card className="rounded">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">Webhook event log</CardTitle>
          <CardDescription>
            Every incoming Telegram update with its verification status, processing errors and
            manual retry for failed ingests.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void eventsQuery.refetch()}
            disabled={eventsQuery.isFetching}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 mr-1.5 ${eventsQuery.isFetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => clear.mutate()}
            disabled={clear.isPending || events.length === 0}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Clear
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Button
              key={f.id || "all"}
              size="sm"
              variant={status === f.id ? "secondary" : "ghost"}
              className="h-7 px-2.5 text-xs"
              onClick={() => setStatus(f.id)}
              aria-pressed={status === f.id}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {eventsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading events</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No webhook events recorded yet. They appear here as Telegram delivers updates.
          </p>
        ) : (
          <div className="divide-y divide-border rounded border border-border">
            {events.map((e) => (
              <div key={e.id} className="flex items-start justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusVariant(e.status)} className="text-[11px]">
                      {e.status}
                    </Badge>
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      {e.verified ? (
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
                      )}
                      {e.verified ? "Signature verified" : "Verification failed"}
                    </span>
                    {e.update_id != null && (
                      <span className="text-[11px] text-muted-foreground">
                        update #{e.update_id}
                      </span>
                    )}
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(e.created_at).toLocaleString()}
                    </span>
                    {e.retry_count > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        {e.retry_count} retr{e.retry_count === 1 ? "y" : "ies"}
                      </span>
                    )}
                  </div>
                  {e.error_message && (
                    <p className="mt-1 text-xs text-destructive [overflow-wrap:anywhere]">
                      {e.error_message}
                    </p>
                  )}
                </div>
                {(e.status === "failed" || e.status === "ignored") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => retry.mutate(e.id)}
                    disabled={retry.isPending}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    Retry
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
