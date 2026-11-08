/**
 * Webhook replay tool (super admins only).
 *
 * Pick a gateway and a time window, preview which failed deliveries can be
 * re-run from their stored payload, then replay them after fixing the
 * configuration. Already-processed events are skipped automatically.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, History, Loader2, Play, SearchCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  previewGatewayWebhookReplay,
  replayGatewayWebhooks,
} from "@/lib/billing/gateway-webhook-replay.functions";

type Candidate = Awaited<ReturnType<typeof previewGatewayWebhookReplay>>["candidates"][number];
type Outcome = Awaited<ReturnType<typeof replayGatewayWebhooks>>["outcomes"][number];

const WINDOWS: { value: string; label: string; hours: number }[] = [
  { value: "1", label: "Last hour", hours: 1 },
  { value: "24", label: "Last 24 hours", hours: 24 },
  { value: "72", label: "Last 3 days", hours: 72 },
  { value: "168", label: "Last 7 days", hours: 168 },
  { value: "720", label: "Last 30 days", hours: 720 },
  { value: "custom", label: "Custom range", hours: 0 },
];

const STATUS_OPTIONS = [
  { id: "failed", label: "Processing failures" },
  { id: "misconfigured", label: "Misconfigured" },
  { id: "invalid_signature", label: "Bad signature" },
] as const;

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function GatewayWebhookReplay({ gatewayIds }: { gatewayIds: string[] }) {
  const previewFn = useServerFn(previewGatewayWebhookReplay);
  const replayFn = useServerFn(replayGatewayWebhooks);

  const [providerId, setProviderId] = useState(gatewayIds[0] ?? "");
  const [windowKey, setWindowKey] = useState("24");
  const [from, setFrom] = useState(toLocalInput(new Date(Date.now() - 24 * 3600_000)));
  const [to, setTo] = useState(toLocalInput(new Date()));
  const [statuses, setStatuses] = useState<string[]>(["failed", "misconfigured"]);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);

  const range = () => {
    if (windowKey === "custom") {
      return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
    }
    const hours = Number(windowKey);
    return {
      from: new Date(Date.now() - hours * 3600_000).toISOString(),
      to: new Date().toISOString(),
    };
  };

  const baseInput = () => ({
    provider_id: providerId,
    ...range(),
    statuses: statuses as ("failed" | "misconfigured" | "invalid_signature")[],
    limit: 200,
  });

  const previewMut = useMutation({
    mutationFn: () => previewFn({ data: baseInput() }),
    onSuccess: (res) => {
      setOutcomes(null);
      setCandidates(res.candidates);
      toast.success(`${res.replayable} of ${res.total} deliveries can be replayed`);
    },
    onError: (e: Error) => toast.error(e.message || "Preview failed"),
  });

  const replayMut = useMutation({
    mutationFn: () => replayFn({ data: baseInput() }),
    onSuccess: (res) => {
      setOutcomes(res.outcomes);
      setCandidates(null);
      if (res.failed > 0) {
        toast.error(`${res.replayed} replayed · ${res.failed} still failing`);
      } else {
        toast.success(`${res.replayed} replayed · ${res.skipped} skipped`);
      }
    },
    onError: (e: Error) => toast.error(e.message || "Replay failed"),
  });

  const busy = previewMut.isPending || replayMut.isPending;
  const replayableCount = candidates?.filter((c) => c.replayable).length ?? 0;

  const toggleStatus = (id: string, on: boolean) =>
    setStatuses((prev) => (on ? [...new Set([...prev, id])] : prev.filter((s) => s !== id)));

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <History className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Replay failed webhooks</h3>
        <span className="text-xs text-muted-foreground">
          Re-run stored payloads after fixing a gateway's configuration
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Gateway</Label>
          <Select value={providerId} onValueChange={setProviderId}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select gateway" />
            </SelectTrigger>
            <SelectContent>
              {gatewayIds.map((id) => (
                <SelectItem key={id} value={id}>
                  {id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Time window</Label>
          <Select value={windowKey} onValueChange={setWindowKey}>
            <SelectTrigger className="h-9">
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
        </div>
        {windowKey === "custom" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">From</Label>
              <Input
                type="datetime-local"
                className="h-9"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input
                type="datetime-local"
                className="h-9"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {STATUS_OPTIONS.map((s) => (
          <label key={s.id} className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={statuses.includes(s.id)}
              onCheckedChange={(v) => toggleStatus(s.id, v === true)}
            />
            {s.label}
          </label>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={busy || !providerId || statuses.length === 0}
            onClick={() => previewMut.mutate()}
          >
            {previewMut.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <SearchCheck className="w-4 h-4 " />
            )}
            Preview
          </Button>
          <Button
            size="sm"
            className="h-8"
            disabled={busy || !providerId || replayableCount === 0}
            onClick={() => replayMut.mutate()}
          >
            {replayMut.isPending ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <Play className="w-4 h-4 " />
            )}
            Replay {replayableCount > 0 ? replayableCount : ""}
          </Button>
        </div>
      </div>

      {candidates && candidates.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No failed deliveries for this gateway in the selected window.
        </p>
      )}

      {candidates && candidates.length > 0 && (
        <ul className="divide-y border rounded-control">
          {candidates.map((c) => (
            <li key={c.deliveryId} className="p-3 flex flex-wrap items-start gap-x-3 gap-y-1">
              <Badge variant={c.replayable ? "secondary" : "outline"} className="shrink-0">
                {c.replayable ? "Replayable" : "Skip"}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  {c.eventType ?? "unknown event"} · {c.status}
                  {c.replayCount > 0 ? ` · replayed ${c.replayCount}×` : ""}
                </p>
                {c.eventId && (
                  <p className="text-xs text-muted-foreground font-mono break-all">{c.eventId}</p>
                )}
                <p className="text-xs text-muted-foreground break-words">
                  {c.reason ?? c.errorMessage ?? ""}
                </p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {new Date(c.receivedAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}

      {outcomes && (
        <ul className="divide-y border rounded-control">
          {outcomes.map((o) => (
            <li key={o.deliveryId} className="p-3 flex flex-wrap items-start gap-x-3 gap-y-1">
              {o.result === "replayed" ? (
                <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              ) : o.result === "failed" ? (
                <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              ) : (
                <Badge variant="outline" className="shrink-0">
                  Skipped
                </Badge>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm">{o.eventType ?? "unknown event"}</p>
                {o.eventId && (
                  <p className="text-xs text-muted-foreground font-mono break-all">{o.eventId}</p>
                )}
                {o.resultMessage && (
                  <p
                    className={`text-xs break-words ${o.result === "failed" ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {o.resultMessage}
                  </p>
                )}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {new Date(o.receivedAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
