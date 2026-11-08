import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  Send,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import type { IntegrationProvider } from "@/lib/integrations/core";
import { useInstalledIntegrations, type WebhookDelivery } from "@/lib/integrations/installed-store";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

const STANDARD_EVENTS = [
  "connection.created",
  "connection.updated",
  "connection.disabled",
  "connection.reconnected",
  "connection.disconnected",
  "sync.completed",
  "sync.failed",
] as const;

export function WebhookConfigDialog({
  provider,
  open,
  onOpenChange,
}: {
  provider: IntegrationProvider | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { items, configureWebhook, rotateWebhookSecret, testWebhook } = useInstalledIntegrations();
  const installed = provider ? items.find((i) => i.providerId === provider.id) : null;
  const existing = installed?.webhook;
  const formatZoned = useZonedDateFormatter();

  const availableEvents = useMemo(() => {
    const triggers = (provider?.capabilities ?? [])
      .filter((c) => c.kind === "trigger")
      .map((c) => `${provider!.id}.${c.id}`);
    return Array.from(new Set([...STANDARD_EVENTS, ...triggers]));
  }, [provider]);

  const [url, setUrl] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [events, setEvents] = useState<string[]>([]);
  const [showSecret, setShowSecret] = useState(false);
  const [testEvent, setTestEvent] = useState<string>(STANDARD_EVENTS[0]);
  const [testing, setTesting] = useState(false);
  const [lastResult, setLastResult] = useState<WebhookDelivery | null>(null);

  useEffect(() => {
    if (!open) return;
    setUrl(existing?.url ?? "");
    setEnabled(existing?.enabled ?? true);
    setEvents(existing?.events ?? [STANDARD_EVENTS[0]]);
    setTestEvent(existing?.events?.[0] ?? STANDARD_EVENTS[0]);
    setShowSecret(false);
    setLastResult(null);
  }, [open, existing]);

  if (!provider) return null;

  const dirty =
    url !== (existing?.url ?? "") ||
    enabled !== (existing?.enabled ?? true) ||
    JSON.stringify([...events].sort()) !== JSON.stringify([...(existing?.events ?? [])].sort());

  const urlValid = !url || /^https:\/\/.+/.test(url);

  const save = () => {
    if (!urlValid) return;
    configureWebhook(provider.id, { url, events, enabled });
    toast.success("Webhook configuration saved");
  };

  const rotate = () => {
    const next = rotateWebhookSecret(provider.id);
    if (next) {
      toast.success("Signing secret rotated", {
        description: "Update your endpoint before the next event.",
      });
      setShowSecret(true);
    }
  };

  const test = async () => {
    if (!existing?.url) {
      toast.error("Save the webhook URL first");
      return;
    }
    setTesting(true);
    setLastResult(null);
    try {
      const res = await testWebhook(provider.id, testEvent);
      setLastResult(res);
      if (res.ok) toast.success(`Test delivery ${res.status} · ${res.latencyMs}ms`);
      else toast.error(`Test failed: ${res.error ?? res.status}`);
    } finally {
      setTesting(false);
    }
  };

  const copy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const toggleEvent = (ev: string, on: boolean) => {
    setEvents((prev) => (on ? Array.from(new Set([...prev, ev])) : prev.filter((e) => e !== ev)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Configure webhook · {provider.name}
          </DialogTitle>
          <DialogDescription>
            Receive signed HTTP callbacks for lifecycle and provider events. Verify each request
            using the signing secret before trusting the payload.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh] pr-3">
          <div className="space-y-6 py-1">
            {/* Endpoint */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="wh-url">Endpoint URL</Label>
                <div className="flex items-center gap-2">
                  <Label htmlFor="wh-enabled" className="text-xs text-muted-foreground">
                    {enabled ? "Enabled" : "Disabled"}
                  </Label>
                  <Switch id="wh-enabled" checked={enabled} onCheckedChange={setEnabled} />
                </div>
              </div>
              <Input
                id="wh-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-app.example.com/hooks/wacrm"
              />
              {!urlValid && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> URL must start with https://
                </p>
              )}
            </div>

            <Separator />

            {/* Secret */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Signing secret</Label>
                <Button size="sm" variant="outline" onClick={rotate}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Rotate
                </Button>
              </div>
              {existing?.secret ? (
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-control border border-border bg-muted/40 px-3 py-2 text-xs font-mono truncate">
                    {showSecret ? existing.secret : `whsec_••••••••••••${existing.secretLast4}`}
                  </code>
                  <Button size="icon" variant="ghost" onClick={() => setShowSecret((s) => !s)}>
                    {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => copy(existing.secret, "Secret")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  A secret will be generated automatically when you save the webhook.
                </p>
              )}
              {existing?.rotatedAt && (
                <p className="text-[11px] text-muted-foreground">
                  Last rotated{" "}
                  {formatZoned(new Date(existing.rotatedAt), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground">
                Verify each request with an HMAC-SHA256 of the raw body using this secret, compared
                to the
                <code className="mx-1 rounded bg-muted px-1">X-WACRM-Signature</code> header.
              </p>
            </div>

            <Separator />

            {/* Events */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Subscribed events</Label>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEvents([...availableEvents])}>
                    Select all
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEvents([])}>
                    Clear
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-control border border-border p-3">
                {availableEvents.map((ev) => (
                  <label key={ev} className="flex items-start gap-2 cursor-pointer text-sm">
                    <Checkbox
                      checked={events.includes(ev)}
                      onCheckedChange={(v) => toggleEvent(ev, v === true)}
                      className="mt-0.5"
                    />
                    <span className="font-mono text-xs leading-5 break-all">{ev}</span>
                  </label>
                ))}
              </div>
            </div>

            <Separator />

            {/* Test */}
            <div className="space-y-2">
              <Label>Test delivery</Label>
              <div className="flex gap-2">
                <select
                  value={testEvent}
                  onChange={(e) => setTestEvent(e.target.value)}
                  className="flex-1 h-9 rounded-control border border-input bg-background px-3 text-sm"
                >
                  {(existing?.events?.length ? existing.events : availableEvents).map((ev) => (
                    <option key={ev} value={ev}>
                      {ev}
                    </option>
                  ))}
                </select>
                <Button onClick={test} disabled={testing || !existing?.url}>
                  {testing ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Send test
                </Button>
              </div>
              {lastResult && (
                <div
                  className={
                    "rounded-control border p-3 text-xs flex items-start gap-2 " +
                    (lastResult.ok
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-destructive/30 bg-destructive/5")
                  }
                >
                  {lastResult.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive mt-0.5" />
                  )}
                  <div className="flex-1">
                    <div className="font-medium">
                      {lastResult.ok ? "Delivered" : "Failed"} · HTTP {lastResult.status} ·{" "}
                      {lastResult.latencyMs}ms
                    </div>
                    {lastResult.error && (
                      <div className="text-muted-foreground">{lastResult.error}</div>
                    )}
                  </div>
                </div>
              )}

              {existing?.deliveries && existing.deliveries.length > 0 && (
                <div className="space-y-1 pt-2">
                  <p className="text-xs text-muted-foreground">Recent deliveries</p>
                  <div className="space-y-1">
                    {existing.deliveries.slice(0, 5).map((d, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-xs rounded border border-border px-2 py-1.5"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge
                            variant="secondary"
                            className={
                              d.ok
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                : "bg-destructive/15 text-destructive"
                            }
                          >
                            {d.status || "ERR"}
                          </Badge>
                          <span className="font-mono truncate">{d.event}</span>
                        </div>
                        <span className="text-muted-foreground shrink-0">
                          {d.latencyMs}ms · {formatZoned(new Date(d.at), { timeStyle: "short" })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={save} disabled={!dirty || !urlValid || !url}>
            Save configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
