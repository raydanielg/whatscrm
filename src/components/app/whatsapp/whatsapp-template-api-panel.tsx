import { useEffect, useMemo, useState } from "react";
import { Copy, RefreshCw, Eye, EyeOff, Check, FileText, Globe, Key, Info } from "lucide-react";
import { toast } from "sonner";
import { useCurrentWorkspace } from "@/hooks/use-workspace";

const ENDPOINT = "https://crm.oneoftheprojects.com/api/v1/send_templet";

function generateToken(workspaceId: string) {
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

const PARAMS: Array<{ name: string; required: boolean; type: string; desc: string }> = [
  { name: "sendTo", required: true, type: "string", desc: "Recipient's WhatsApp phone number in E.164 format (e.g. +1234567890)" },
  { name: "templetName", required: true, type: "string", desc: "Exact name of your approved Meta template" },
  { name: "exampleArr", required: false, type: "array", desc: "Array of variable values to fill template placeholders in order" },
  { name: "token", required: true, type: "string", desc: "Your API token for authentication" },
  { name: "mediaUri", required: false, type: "string", desc: "Optional public URL of a media file (image, video, document) for media templates" },
];

export function WhatsAppTemplateApiPanel() {
  const { data: ws } = useCurrentWorkspace();
  const wsId = ws?.id ?? "workspace";
  const storageKey = `wacrm:whatsapp-template-token:${wsId}`;

  const [token, setToken] = useState<string>("");
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Live test form
  const [sendTo, setSendTo] = useState("+1234567890");
  const [templetName, setTempletName] = useState("YourTemplateName");
  const [exampleArrStr, setExampleArrStr] = useState("example_key_1, example_key_2");
  const [mediaUri, setMediaUri] = useState("");

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

  const exampleArr = useMemo(
    () => exampleArrStr.split(",").map((s) => s.trim()).filter(Boolean),
    [exampleArrStr]
  );

  const requestBody = useMemo(() => {
    const body: Record<string, unknown> = {
      sendTo,
      templetName,
      exampleArr,
      token: token || "YourAPIToken",
    };
    if (mediaUri.trim()) body.mediaUri = mediaUri.trim();
    return body;
  }, [sendTo, templetName, exampleArr, token, mediaUri]);

  const requestBodyStr = JSON.stringify(requestBody, null, 2);

  const httpExample = `POST ${ENDPOINT}
Content-Type: application/json
Authorization: Bearer ${token || "API_KEY"}

${requestBodyStr}`;

  const curlExample = `curl -X POST "${ENDPOINT}" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${token || "API_KEY"}" \\
  -d '${JSON.stringify(requestBody)}'`;

  const nodeExample = `const res = await fetch("${ENDPOINT}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer ${token || "API_KEY"}"
  },
  body: JSON.stringify(${JSON.stringify(requestBody, null, 2)})
});
const data = await res.json();`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-bold text-xl flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" /> Template API
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Send pre-approved Meta template messages to any WhatsApp number. Templates must be approved by Meta before use.
        </p>
      </div>

      {/* API Key */}
      <section className="rounded-control border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-primary" />
            <h3 className="font-medium text-sm">Your API Key</h3>
          </div>
          <button onClick={regenerate} className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-control border border-border hover:bg-muted">
            <RefreshCw className="w-3 h-3" /> Regenerate
          </button>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs font-mono bg-muted rounded-control px-3 py-2 truncate">
            {reveal ? token : masked}
          </code>
          <button onClick={() => setReveal((v) => !v)} className="p-2 rounded-control border border-border hover:bg-muted">
            {reveal ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <button onClick={() => copy(token, "API key")} className="p-2 rounded-control border border-border hover:bg-muted">
            {copied === "API key" ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Info className="w-3 h-3" /> Keep this token secret. Anyone with it can send templates from your workspace.
        </p>
      </section>

      {/* Send Message Builder */}
      <section className="rounded-control border border-border bg-card p-4 space-y-3">
        <h3 className="font-medium text-sm">Send Message</h3>
        <p className="text-xs text-muted-foreground">Send a pre-approved Meta template to any WhatsApp number.</p>
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="sendTo *">
            <input value={sendTo} onChange={(e) => setSendTo(e.target.value)} maxLength={20} placeholder="+1234567890"
              className="w-full text-sm rounded-control border border-border bg-background px-3 py-2 font-mono" />
          </Field>
          <Field label="templetName *">
            <input value={templetName} onChange={(e) => setTempletName(e.target.value)} maxLength={100} placeholder="hello_world"
              className="w-full text-sm rounded-control border border-border bg-background px-3 py-2 font-mono" />
          </Field>
          <Field label="exampleArr (comma-separated)">
            <input value={exampleArrStr} onChange={(e) => setExampleArrStr(e.target.value)} maxLength={500} placeholder="John, 12345"
              className="w-full text-sm rounded-control border border-border bg-background px-3 py-2 font-mono" />
          </Field>
          <Field label="mediaUri (optional)">
            <input value={mediaUri} onChange={(e) => setMediaUri(e.target.value)} maxLength={2048} placeholder="https://example.com/image.jpg"
              className="w-full text-sm rounded-control border border-border bg-background px-3 py-2 font-mono" />
          </Field>
        </div>
      </section>

      {/* How To */}
      <section className="space-y-3">
        <Step number={1} title="API Endpoint" desc="POST request URL">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-control bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">POST</span>
            <code className="flex-1 text-xs font-mono bg-muted rounded-control px-3 py-2 truncate">{ENDPOINT}</code>
            <button onClick={() => copy(ENDPOINT, "Endpoint")} className="p-2 rounded-control border border-border hover:bg-muted">
              {copied === "Endpoint" ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </Step>

        <Step number={2} title="Request Parameters" desc="Fields accepted by the endpoint">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3 font-medium">Parameter</th>
                  <th className="py-2 pr-3 font-medium">Type</th>
                  <th className="py-2 font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {PARAMS.map((p) => (
                  <tr key={p.name} className="border-b border-border/60 last:border-0 align-top">
                    <td className="py-2 pr-3 font-mono">
                      <div className="flex flex-col gap-0.5">
                        <span>{p.name}</span>
                        <span className={`text-[11px] font-semibold uppercase ${p.required ? "text-red-600" : "text-muted-foreground"}`}>
                          {p.required ? "required" : "optional"}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 pr-3 font-mono text-muted-foreground">{p.type}</td>
                    <td className="py-2 text-foreground/80">{p.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Step>

        <Step number={3} title="HTTP Request" desc="Full request as it goes over the wire">
          <CodeBlock code={httpExample} onCopy={() => copy(httpExample, "HTTP")} copied={copied === "HTTP"} />
        </Step>

        <Step number={4} title="cURL Example" desc="Ready-to-run request">
          <CodeBlock code={curlExample} onCopy={() => copy(curlExample, "cURL")} copied={copied === "cURL"} />
        </Step>

        <Step number={5} title="Node.js Example" desc="Using native fetch">
          <CodeBlock code={nodeExample} onCopy={() => copy(nodeExample, "Node")} copied={copied === "Node"} />
        </Step>
      </section>

      {/* Responses */}
      <section className="space-y-3">
        <h3 className="font-medium text-sm flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" /> Example Response
        </h3>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="rounded-control border border-emerald-500/30 bg-emerald-500/5 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold">Success</span>
              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-control bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">200 OK</span>
            </div>
            <pre className="text-xs font-mono bg-background rounded-control p-2 overflow-x-auto">
{`{
  "success": true,
  "metaResponse": {
    "message_id": "message_id_here",
    "status": "sent"
  }
}`}
            </pre>
          </div>
          <div className="rounded-control border border-red-500/30 bg-red-500/5 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold">Error</span>
              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-control bg-red-500/10 text-red-600 border border-red-500/20">4xx / 5xx</span>
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

function Step({ number, title, desc, children }: { number: number; title: string; desc: string; children: React.ReactNode }) {
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-foreground/80">{label}</span>
      {children}
    </label>
  );
}

function CodeBlock({ code, onCopy, copied }: { code: string; onCopy: () => void; copied: boolean }) {
  return (
    <div className="relative">
      <pre className="text-xs font-mono bg-muted rounded-control px-3 py-3 overflow-x-auto max-h-96 whitespace-pre">
{code}
      </pre>
      <button onClick={onCopy} className="absolute top-2 right-2 p-1.5 rounded-control border border-border bg-background hover:bg-muted">
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}
