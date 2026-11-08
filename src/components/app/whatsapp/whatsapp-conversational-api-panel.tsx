import { useBrandName } from "@/hooks/use-brand-name";
import { useEffect, useMemo, useState } from "react";
import { Copy, RefreshCw, Eye, EyeOff, Check, MessageCircle, Globe, Key, Info } from "lucide-react";
import { toast } from "sonner";
import { useCurrentWorkspace } from "@/hooks/use-workspace";

const ENDPOINT = "https://crm.oneoftheprojects.com/api/v1/send-message";

function generateToken(workspaceId: string) {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })).replace(/=+$/, "");
  const payload = btoa(
    JSON.stringify({
      uid: workspaceId.replace(/-/g, "").slice(0, 24),
      role: "user",
      iat: Math.floor(Date.now() / 1000),
    }),
  ).replace(/=+$/, "");
  const rand = crypto.getRandomValues(new Uint8Array(32));
  const sig = btoa(String.fromCharCode(...rand))
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${header}.${payload}.${sig}`;
}

type ExampleKey =
  "text" | "image" | "video" | "document" | "audio" | "location" | "template" | "interactive";

const createExamples = (
  brandName: string,
): Record<ExampleKey, { label: string; description: string; body: unknown }> => ({
  text: {
    label: "Text",
    description: "Plain text conversational message",
    body: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "9876543210",
      type: "text",
      text: { preview_url: false, body: `Hello from ${brandName}!` },
    },
  },
  image: {
    label: "Image",
    description: "Send an image by public URL with optional caption",
    body: {
      messaging_product: "whatsapp",
      to: "9876543210",
      type: "image",
      image: { link: "https://example.com/image.jpg", caption: "Product preview" },
    },
  },
  video: {
    label: "Video",
    description: "Send a video by public URL",
    body: {
      messaging_product: "whatsapp",
      to: "9876543210",
      type: "video",
      video: { link: "https://example.com/video.mp4", caption: "Watch this" },
    },
  },
  audio: {
    label: "Audio",
    description: "Send an audio note (mp3 / ogg / aac)",
    body: {
      messaging_product: "whatsapp",
      to: "9876543210",
      type: "audio",
      audio: { link: "https://example.com/voice.mp3" },
    },
  },
  document: {
    label: "Document",
    description: "Send a document with filename",
    body: {
      messaging_product: "whatsapp",
      to: "9876543210",
      type: "document",
      document: {
        link: "https://example.com/invoice.pdf",
        filename: "invoice.pdf",
        caption: "Your invoice",
      },
    },
  },
  location: {
    label: "Location",
    description: "Share a location pin",
    body: {
      messaging_product: "whatsapp",
      to: "9876543210",
      type: "location",
      location: {
        latitude: 37.483307,
        longitude: -122.148981,
        name: "Meta HQ",
        address: "1 Hacker Way, Menlo Park, CA",
      },
    },
  },
  template: {
    label: "Template",
    description: "Send a pre-approved Meta template",
    body: {
      messaging_product: "whatsapp",
      to: "9876543210",
      type: "template",
      template: {
        name: "hello_world",
        language: { code: "en_US" },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: "John" }],
          },
        ],
      },
    },
  },
  interactive: {
    label: "Interactive",
    description: "Reply buttons (interactive message)",
    body: {
      messaging_product: "whatsapp",
      to: "9876543210",
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "Are you interested?" },
        action: {
          buttons: [
            { type: "reply", reply: { id: "yes", title: "Yes" } },
            { type: "reply", reply: { id: "no", title: "No" } },
          ],
        },
      },
    },
  },
});

export function WhatsAppConversationalApiPanel() {
  const brandName = useBrandName();
  const examples = useMemo(() => createExamples(brandName), [brandName]);
  const { data: ws } = useCurrentWorkspace();
  const wsId = ws?.id ?? "workspace";
  const storageKey = `wacrm:whatsapp-conversational-token:${wsId}`;

  const [token, setToken] = useState<string>("");
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState<ExampleKey>("text");

  useEffect(() => {
    if (!ws?.id) return;
    const existing = localStorage.getItem(storageKey);
    if (existing) {
      setToken(existing);
    } else {
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
    [token],
  );

  const endpointWithToken = `${ENDPOINT}?token=${token || "API_KEY"}`;

  const activeExample = examples[tab];
  const messageObject = activeExample.body;
  const requestBody = { messageObject };
  const requestBodyStr = JSON.stringify(requestBody, null, 2);

  const curlExample = `curl -X POST "${endpointWithToken}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestBody)}'`;

  const nodeExample = `const res = await fetch("${endpointWithToken}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(${JSON.stringify(requestBody, null, 2)})
});
const data = await res.json();`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold text-xl flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-primary" /> Conversational API
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Send conversational messages using the Meta REST API. Wrap any Meta WhatsApp payload
          inside <code className="text-xs">messageObject</code>.
        </p>
      </div>

      {/* API Key */}
      <section className="rounded-control border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-primary" />
            <h3 className="font-medium text-sm">Your API Key</h3>
          </div>
          <button
            onClick={regenerate}
            className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-control border border-border hover:bg-muted"
          >
            <RefreshCw className="w-3 h-3" /> Regenerate
          </button>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs font-mono bg-muted rounded-control px-3 py-2 truncate">
            {reveal ? token : masked}
          </code>
          <button
            onClick={() => setReveal((v) => !v)}
            className="p-2 rounded-control border border-border hover:bg-muted"
            aria-label={reveal ? "Hide token" : "Show token"}
          >
            {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <button
            onClick={() => copy(token, "API key")}
            className="p-2 rounded-control border border-border hover:bg-muted"
            aria-label="Copy token"
          >
            {copied === "API key" ? (
              <Check className="w-4 h-4 text-emerald-500" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Info className="w-3 h-3" /> Keep this token secret. Anyone with it can send messages from
          your workspace.
        </p>
      </section>

      {/* How To */}
      <section className="space-y-3">
        <h3 className="font-medium text-sm">How To</h3>

        <Step number={1} title="API Endpoint" desc="Send a POST request to the following URL">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-control bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              POST
            </span>
            <code className="flex-1 text-xs font-mono bg-muted rounded-control px-3 py-2 truncate">
              {endpointWithToken}
            </code>
            <button
              onClick={() => copy(endpointWithToken, "Endpoint")}
              className="p-2 rounded-control border border-border hover:bg-muted"
            >
              {copied === "Endpoint" ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
        </Step>

        <Step number={2} title="Message Type" desc="Choose the type of message you want to send">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(examples) as ExampleKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`text-xs px-3 py-1.5 rounded-control border transition-colors ${
                  tab === key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-muted"
                }`}
              >
                {examples[key].label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">{activeExample.description}</p>
        </Step>

        <Step
          number={3}
          title="Request Body"
          desc="Send a JSON body with the messageObject key containing the WhatsApp message payload."
        >
          <div className="relative">
            <pre className="text-xs font-mono bg-muted rounded-control px-3 py-3 overflow-x-auto max-h-96">
              {requestBodyStr}
            </pre>
            <button
              onClick={() => copy(requestBodyStr, "Body")}
              className="absolute top-2 right-2 p-1.5 rounded-control border border-border bg-background hover:bg-muted"
            >
              {copied === "Body" ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </Step>

        <Step number={4} title="cURL Example" desc="Ready-to-run request for your terminal">
          <div className="relative">
            <pre className="text-xs font-mono bg-muted rounded-control px-3 py-3 overflow-x-auto">
              {curlExample}
            </pre>
            <button
              onClick={() => copy(curlExample, "cURL")}
              className="absolute top-2 right-2 p-1.5 rounded-control border border-border bg-background hover:bg-muted"
            >
              {copied === "cURL" ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </Step>

        <Step number={5} title="Node.js Example" desc="Using native fetch">
          <div className="relative">
            <pre className="text-xs font-mono bg-muted rounded-control px-3 py-3 overflow-x-auto">
              {nodeExample}
            </pre>
            <button
              onClick={() => copy(nodeExample, "Node")}
              className="absolute top-2 right-2 p-1.5 rounded-control border border-border bg-background hover:bg-muted"
            >
              {copied === "Node" ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </Step>
      </section>

      {/* API Responses */}
      <section className="space-y-3">
        <h3 className="font-medium text-sm flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" /> API Responses
        </h3>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="rounded-control border border-emerald-500/30 bg-emerald-500/5 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold">Success Response</span>
              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-control bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                200 OK
              </span>
            </div>
            <pre className="text-xs font-mono bg-background rounded-control p-2 overflow-x-auto">
              {`{
  "success": true,
  "message": "Message sent successfully!"
}`}
            </pre>
          </div>
          <div className="rounded-control border border-red-500/30 bg-red-500/5 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold">Error Response</span>
              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-control bg-red-500/10 text-red-600 border border-red-500/20">
                4xx / 5xx
              </span>
            </div>
            <pre className="text-xs font-mono bg-background rounded-control p-2 overflow-x-auto">
              {`{
  "success": false,
  "message": "<REASON>"
}`}
            </pre>
          </div>
        </div>
      </section>
    </div>
  );
}

function Step({
  number,
  title,
  desc,
  children,
}: {
  number: number;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-control border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="w-6 h-6 rounded-control bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
          {number}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium">{title}</h4>
          <p className="text-xs text-muted-foreground mb-3">{desc}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
