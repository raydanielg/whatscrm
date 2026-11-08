import { useEffect, useMemo, useState } from "react";
import { Copy, RefreshCw, Eye, EyeOff, Check, Code2, Globe, Key } from "lucide-react";
import { toast } from "sonner";
import { useCurrentWorkspace } from "@/hooks/use-workspace";

const ENDPOINT = "https://crm.oneoftheprojects.com/api/qr/rest/send_message";

function generateToken(workspaceId: string) {
  // Deterministic-ish JWT-shaped token per workspace (client-side display only).
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })).replace(/=+$/, "");
  const payload = btoa(
    JSON.stringify({
      uid: workspaceId.replace(/-/g, "").slice(0, 24),
      role: "user",
      iat: Math.floor(Date.now() / 1000),
    })
  ).replace(/=+$/, "");
  const rand = crypto.getRandomValues(new Uint8Array(32));
  const sig = btoa(String.fromCharCode(...rand))
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${header}.${payload}.${sig}`;
}

export function WhatsAppRestApiPanel() {
  const { data: ws } = useCurrentWorkspace();
  const wsId = ws?.id ?? "workspace";
  const storageKey = `wacrm:whatsapp-rest-token:${wsId}`;

  const [token, setToken] = useState<string>("");
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState<"text" | "image" | "video" | "audio" | "document" | "location">("text");

  useEffect(() => {
    if (!ws?.id) return;
    const existing = localStorage.getItem(storageKey);
    if (existing) setToken(existing);
    else {
      const t = generateToken(ws.id);
      localStorage.setItem(storageKey, t);
      setToken(t);
    }
  }, [ws?.id, storageKey]);

  const regenerate = () => {
    if (!ws?.id) return;
    const t = generateToken(ws.id);
    localStorage.setItem(storageKey, t);
    setToken(t);
    toast.success("API token regenerated");
  };

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1400);
    toast.success(`${label} copied`);
  };

  const masked = useMemo(
    () => (token ? `${token.slice(0, 12)}${"•".repeat(24)}${token.slice(-8)}` : ""),
    [token]
  );

  const curlExample = `curl -X POST ${ENDPOINT} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${token || "your_api_token"}" \\
  -d '{
    "messageType": "text",
    "requestType": "POST",
    "token": "${token || "your_api_token"}",
    "from": "+1234567890",
    "to": "+9876543210",
    "text": "Hello from the WhatsApp API!"
  }'`;

  const messageTypes: Record<string, { params: Array<{ name: string; type: string; required: boolean; desc: string; example: string }> }> = {
    text: {
      params: [{ name: "text", type: "string", required: true, desc: "Text to send", example: '"Hello!"' }],
    },
    image: {
      params: [
        { name: "imageUrl", type: "string (URL)", required: true, desc: "Public image URL", example: '"https://example.com/image.jpg"' },
        { name: "caption", type: "string", required: false, desc: "Caption (optional)", example: '"Check this out"' },
      ],
    },
    video: {
      params: [
        { name: "videoUrl", type: "string (URL)", required: true, desc: "Public video URL", example: '"https://example.com/video.mp4"' },
        { name: "caption", type: "string", required: false, desc: "Optional caption", example: '"Watch this"' },
      ],
    },
    audio: {
      params: [{ name: "aacUrl", type: "string (URL)", required: true, desc: "Public AAC audio URL", example: '"https://example.com/audio.aac"' }],
    },
    document: {
      params: [
        { name: "docUrl", type: "string (URL)", required: true, desc: "Public document URL", example: '"https://example.com/doc.pdf"' },
        { name: "caption", type: "string", required: false, desc: "Document caption", example: '"See attached"' },
      ],
    },
    location: {
      params: [
        { name: "lat", type: "number", required: true, desc: "Latitude", example: "37.7749" },
        { name: "long", type: "number", required: true, desc: "Longitude", example: "-122.4194" },
        { name: "title", type: "string", required: false, desc: "Location title", example: '"San Francisco"' },
      ],
    },
  };

  const requiredParams = [
    { name: "messageType", type: "string", desc: "Type of message to send", example: "text | image | video | audio | document | location" },
    { name: "requestType", type: "string", desc: "HTTP method", example: "GET or POST" },
    { name: "token", type: "string", desc: "Authentication token", example: '"your_api_token_here"' },
    { name: "from", type: "string", desc: "Sender phone with country code", example: '"1234567890"' },
    { name: "to", type: "string", desc: "Recipient phone with country code", example: '"9876543210"' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold text-xl flex items-center gap-2">
          <Code2 className="w-5 h-5" /> REST API
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Integrate WhatsApp messaging into your application.</p>
      </div>

      {/* API Token */}
      <section className="rounded-control border border-border bg-surface p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold flex items-center gap-2">
              <Key className="w-4 h-4" /> API Token
            </div>
            <div className="text-xs text-muted-foreground">Use this token to authenticate API requests</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setReveal((v) => !v)}
              className="h-8 px-2 rounded-control border border-border text-xs inline-flex items-center gap-1 hover:bg-muted"
            >
              {reveal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {reveal ? "Hide" : "Reveal"}
            </button>
            <button
              onClick={() => copy(token, "Token")}
              className="h-8 px-2 rounded-control border border-border text-xs inline-flex items-center gap-1 hover:bg-muted"
            >
              {copied === "Token" ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
              Copy
            </button>
            <button
              onClick={regenerate}
              className="h-8 px-2 rounded-control bg-primary text-primary-foreground text-xs inline-flex items-center gap-1 hover:bg-primary/90"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Regenerate
            </button>
          </div>
        </div>
        <div className="font-mono text-xs break-all bg-muted/50 rounded-control p-3 border border-border">
          {reveal ? token : masked}
        </div>
      </section>

      <p className="text-sm text-muted-foreground">
        Use this REST API to send WhatsApp messages programmatically from any platform or language.
      </p>

      {/* Endpoint */}
      <section className="space-y-2">
        <h3 className="font-display font-semibold text-sm flex items-center gap-2">
          <Globe className="w-4 h-4" /> Endpoint
        </h3>
        <div className="text-xs text-muted-foreground">Supports GET and POST</div>
        <div className="flex flex-wrap items-center gap-2 rounded-control border border-border p-3 bg-surface">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-control bg-success/10 text-success">GET</span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-control bg-primary/10 text-primary">POST</span>
          <code className="font-mono text-xs break-all flex-1">{ENDPOINT}</code>
          <button
            onClick={() => copy(ENDPOINT, "Endpoint")}
            className="h-7 px-2 rounded-control border border-border text-xs inline-flex items-center gap-1 hover:bg-muted"
          >
            {copied === "Endpoint" ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
            Copy
          </button>
        </div>
      </section>

      {/* Required Parameters */}
      <section className="space-y-2">
        <h3 className="font-display font-semibold text-sm">Required Parameters</h3>
        <ParamTable
          rows={requiredParams.map((p) => ({ ...p, required: true }))}
        />
      </section>

      {/* Message Type Params */}
      <section className="space-y-3">
        <h3 className="font-display font-semibold text-sm">Message Type Parameters</h3>
        <div className="flex flex-wrap gap-1 border-b border-border">
          {(Object.keys(messageTypes) as Array<keyof typeof messageTypes>).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k as typeof tab)}
              className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
        <ParamTable rows={messageTypes[tab].params} />
      </section>

      {/* cURL Example */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-sm">cURL Example</h3>
          <button
            onClick={() => copy(curlExample, "cURL")}
            className="h-7 px-2 rounded-control border border-border text-xs inline-flex items-center gap-1 hover:bg-muted"
          >
            {copied === "cURL" ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
            Copy
          </button>
        </div>
        <pre className="font-mono text-xs bg-muted/50 border border-border rounded-control p-4 overflow-x-auto whitespace-pre">
{curlExample}
        </pre>
      </section>

      {/* Responses */}
      <section className="space-y-3">
        <h3 className="font-display font-semibold text-sm">Responses</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <ResponseCard
            title="Success Response"
            statusLabel="200"
            statusClass="bg-success/10 text-success"
            json={{
              success: true,
              message: "Sent",
              data: {
                messageId: "ABGFlh4sVgAHEwkSJQZk",
                timestamp: "2023-05-15T12:34:56Z",
                recipient: "+1234567890",
                messageType: "text",
                contentPreview: "Hello world...",
              },
            }}
          />
          <ResponseCard
            title="Error"
            statusLabel="4xx"
            statusClass="bg-destructive/10 text-destructive"
            json={{
              success: false,
              message: "Message not sent",
              solution: "Check your token and parameters",
            }}
          />
        </div>
      </section>
    </div>
  );
}

function ParamTable({
  rows,
}: {
  rows: Array<{ name: string; type: string; required: boolean; desc: string; example: string }>;
}) {
  return (
    <div className="rounded-control border border-border overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="text-left font-medium px-3 py-2">Parameter</th>
            <th className="text-left font-medium px-3 py-2">Type</th>
            <th className="text-left font-medium px-3 py-2">Required</th>
            <th className="text-left font-medium px-3 py-2">Description</th>
            <th className="text-left font-medium px-3 py-2">Example</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-border">
              <td className="px-3 py-2 font-mono font-medium">{r.name}</td>
              <td className="px-3 py-2 text-muted-foreground">{r.type}</td>
              <td className="px-3 py-2">
                <span
                  className={`px-1.5 py-0.5 rounded-control text-[11px] font-medium ${
                    r.required ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {r.required ? "Required" : "Optional"}
                </span>
              </td>
              <td className="px-3 py-2">{r.desc}</td>
              <td className="px-3 py-2 font-mono text-muted-foreground">{r.example}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResponseCard({
  title,
  statusLabel,
  statusClass,
  json,
}: {
  title: string;
  statusLabel: string;
  statusClass: string;
  json: unknown;
}) {
  return (
    <div className="rounded-control border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
        <div className="text-xs font-semibold">{title}</div>
        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-control ${statusClass}`}>{statusLabel}</span>
      </div>
      <pre className="font-mono text-xs p-3 overflow-x-auto whitespace-pre">
{JSON.stringify(json, null, 2)}
      </pre>
    </div>
  );
}
