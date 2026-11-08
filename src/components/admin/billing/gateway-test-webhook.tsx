/**
 * Send test webhook (super admins only).
 *
 * Fires an unsigned synthetic delivery at the platform's own billing webhook
 * endpoint and shows the resulting delivery row immediately. The endpoint
 * rejects the unsigned payload by design, so no billing data is affected.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Loader2, Send, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sendGatewayTestWebhook } from "@/lib/billing/gateway-webhook-test.functions";

type TestResult = Awaited<ReturnType<typeof sendGatewayTestWebhook>>;

const STATUS_STYLE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  processed: { label: "Delivered", variant: "default" },
  misconfigured: { label: "Misconfigured", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
};

export function GatewayTestWebhook({ gatewayIds }: { gatewayIds: string[] }) {
  const sendFn = useServerFn(sendGatewayTestWebhook);
  const [providerId, setProviderId] = useState(gatewayIds[0] ?? "");
  const [result, setResult] = useState<TestResult | null>(null);

  const mutation = useMutation({
    mutationFn: (id: string) => sendFn({ data: { provider_id: id } }),
    onSuccess: (data) => {
      setResult(data);
      if (data.status === "processed") toast.success("Test webhook delivered");
      else if (data.status === "misconfigured") toast.warning("Endpoint reachable, but misconfigured");
      else toast.error("Test webhook failed");
    },
    onError: (error: Error) => toast.error(error.message || "Could not send test webhook"),
  });

  const style = result ? (STATUS_STYLE[result.status] ?? STATUS_STYLE["failed"]!) : null;

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">Send test webhook</h3>
          <p className="text-sm text-muted-foreground">
            Fires an unsigned test delivery at the platform webhook endpoint to verify it is
            reachable. The payload is rejected by the signature check, so no billing data changes.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Gateway</Label>
          <Select value={providerId} onValueChange={setProviderId}>
            <SelectTrigger className="h-9 w-[220px]">
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
        <Button
          className="h-9"
          disabled={!providerId || mutation.isPending}
          onClick={() => mutation.mutate(providerId)}
        >
          {mutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          Send test webhook
        </Button>
      </div>

      {result && style ? (
        <div className="rounded-control border p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {result.status === "processed" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : result.status === "misconfigured" ? (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive" />
            )}
            <Badge variant={style.variant}>{style.label}</Badge>
            <span className="text-xs text-muted-foreground">
              HTTP {result.httpStatus ?? "—"} · {result.latencyMs ?? "—"} ms ·{" "}
              {result.receivedAt ? new Date(result.receivedAt).toLocaleString() : "not recorded"}
            </span>
          </div>
          <dl className="grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Delivery row</dt>
              <dd className="font-mono break-all">{result.deliveryId ?? "not recorded"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Event id</dt>
              <dd className="font-mono break-all">{result.eventId}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Endpoint</dt>
              <dd className="font-mono break-all">{result.endpoint}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Webhook secret</dt>
              <dd>{result.secretConfigured ? "Configured" : "Missing"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Reachable</dt>
              <dd>{result.reachable ? "Yes" : "No"}</dd>
            </div>
          </dl>
          {result.errorMessage ? (
            <p className="text-xs text-destructive break-words">{result.errorMessage}</p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
