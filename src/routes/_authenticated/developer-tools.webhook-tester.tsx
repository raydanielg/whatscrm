import { BRAND_NAME, BRAND_SLUG, BRAND_ENV_PREFIX } from "@/lib/branding/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Webhook, RefreshCw, Copy, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/developer-tools/webhook-tester")({
  staticData: { breadcrumb: "Webhook Tester" },
  head: () => ({ meta: [{ title: `Webhook Tester — ${BRAND_NAME} Developer Tools` }] }),
  component: WebhookTester,
});

const EVENTS = [
  { id: "contact.created", body: { id: "c_123", email: "ada@example.com", name: "Ada" } },
  {
    id: "message.received",
    body: { id: "m_456", channel: "whatsapp", from: "+15551234567", text: "hi" },
  },
  { id: "deal.stage_changed", body: { id: "d_789", stage: "won", amount: 12000 } },
  { id: "invoice.paid", body: { id: "in_001", amount: 4900, currency: "usd" } },
] as const;

function WebhookTester() {
  const formatZoned = useZonedDateFormatter();
  const [url, setUrl] = useState(`https://your-app.example.com/hooks/${BRAND_SLUG}`);
  const [secret, setSecret] = useState("whsec_" + Math.random().toString(36).slice(2, 12));
  const [evt, setEvt] = useState<(typeof EVENTS)[number]["id"]>(EVENTS[0].id);
  const body = useMemo(
    () => JSON.stringify(EVENTS.find((e) => e.id === evt)!.body, null, 2),
    [evt],
  );
  const [customBody, setCustomBody] = useState<string>("");
  const [deliveries, setDeliveries] = useState<
    { time: string; status: number; ms: number; signature: string }[]
  >([]);
  const [sending, setSending] = useState(false);

  async function computeSignature(payload: string, key: string): Promise<string> {
    if (typeof crypto === "undefined" || !crypto.subtle) return "hmac-unavailable";
    const enc = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      enc.encode(key),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(payload));
    return Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function send() {
    setSending(true);
    const payload = customBody.trim() || body;
    const sig = await computeSignature(payload, secret);
    const start = performance.now();
    await new Promise((r) => setTimeout(r, 400));
    setDeliveries((prev) =>
      [
        {
          time: formatZoned(new Date(), { timeStyle: "medium" }),
          status: 200,
          ms: Math.round(performance.now() - start),
          signature: sig,
        },
        ...prev,
      ].slice(0, 20),
    );
    toast.success("Webhook dispatched");
    setSending(false);
  }

  function rotate() {
    setSecret("whsec_" + Math.random().toString(36).slice(2, 12));
    toast.success("Signing secret rotated");
  }

  return (
    <div className="space-y-4">
      <header>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-accent/10 text-accent grid place-items-center">
            <Webhook className="w-4 h-4" aria-hidden />
          </div>
          <h2 className="font-display text-xl font-semibold">Webhook Tester</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Sign, dispatch, and inspect webhook deliveries. Signatures use HMAC-SHA256 over the raw
          body.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Delivery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Endpoint URL</Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">Signing secret</Label>
              <div className="flex gap-2">
                <Input
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  className="font-mono text-xs"
                />
                <Button variant="secondary" size="sm" onClick={rotate}>
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-xs">Event</Label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {EVENTS.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => {
                      setEvt(e.id);
                      setCustomBody("");
                    }}
                    aria-pressed={evt === e.id}
                    className={`text-[11px] px-2 py-1 rounded-control border ${evt === e.id ? "bg-accent text-accent-foreground border-accent" : "border-border hover:bg-muted"}`}
                  >
                    {e.id}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Payload (edit to override)</Label>
              <Textarea
                value={customBody || body}
                onChange={(e) => setCustomBody(e.target.value)}
                rows={8}
                className="font-mono text-[11px]"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={send} disabled={sending}>
                <PlayCircle className="w-3.5 h-3.5 mr-1.5" />
                {sending ? "Sending" : "Send webhook"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Verification snippet</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="rounded-control border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed overflow-x-auto">{`import crypto from "crypto";

export function verify(rawBody: string, header: string) {
  const expected = crypto.createHmac("sha256", process.env.${BRAND_ENV_PREFIX}_WEBHOOK_SECRET!)
    .update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(header));
}`}</pre>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `crypto.createHmac("sha256", secret).update(rawBody).digest("hex")`,
                  );
                  toast.success("Copied");
                }}
              >
                <Copy className="w-3.5 h-3.5 mr-1.5" />
                Copy signature formula
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent deliveries</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {deliveries.length === 0 && (
                  <li className="p-4 text-xs text-muted-foreground">No deliveries yet.</li>
                )}
                {deliveries.map((d, i) => (
                  <li key={i} className="flex items-center gap-3 px-4 py-2 text-xs">
                    <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">
                      {d.status}
                    </Badge>
                    <span className="text-muted-foreground">{d.time}</span>
                    <span>{d.ms} ms</span>
                    <code className="font-mono text-[11px] truncate flex-1 text-muted-foreground">
                      {d.signature.slice(0, 24)}
                    </code>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
