import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Send, Compass } from "lucide-react";

export const Route = createFileRoute("/_authenticated/developer-tools/api-explorer")({
  staticData: { breadcrumb: "API Explorer" },
  head: () => ({ meta: [{ title: `API Explorer — ${BRAND_NAME} Developer Tools` }] }),
  component: ApiExplorer,
});

type Endpoint = { method: "GET" | "POST" | "PATCH" | "DELETE"; path: string; group: string; desc: string; body?: string };
const ENDPOINTS: Endpoint[] = [
  { method: "GET",  path: "/v1/contacts",         group: "Contacts",  desc: "List contacts with cursor pagination." },
  { method: "POST", path: "/v1/contacts",         group: "Contacts",  desc: "Create a contact.", body: `{ "email": "ada@example.com", "name": "Ada Lovelace" }` },
  { method: "GET",  path: "/v1/contacts/{id}",    group: "Contacts",  desc: "Fetch a single contact." },
  { method: "PATCH",path: "/v1/contacts/{id}",    group: "Contacts",  desc: "Update fields on a contact.", body: `{ "tags": ["vip"] }` },
  { method: "GET",  path: "/v1/messages",         group: "Messages",  desc: "List messages across channels." },
  { method: "POST", path: "/v1/messages",         group: "Messages",  desc: "Send a message.", body: `{ "channel": "whatsapp", "to": "+15551234567", "text": "hi" }` },
  { method: "GET",  path: "/v1/deals",            group: "Sales",     desc: "List deals in the pipeline." },
  { method: "POST", path: "/v1/deals",            group: "Sales",     desc: "Create a deal.", body: `{ "name": "Acme Q3", "amount": 12000 }` },
  { method: "GET",  path: "/v1/campaigns",        group: "Marketing", desc: "List campaigns." },
  { method: "POST", path: "/v1/campaigns/{id}/launch", group: "Marketing", desc: "Launch a campaign." },
  { method: "GET",  path: "/v1/workflows",        group: "Automation",desc: "List workflows." },
  { method: "POST", path: "/v1/workflows/{id}/run", group: "Automation", desc: "Run a workflow.", body: `{ "input": {} }` },
];

const METHOD_COLOR: Record<Endpoint["method"], string> = {
  GET: "bg-blue-500/10 text-blue-600",
  POST: "bg-emerald-500/10 text-emerald-600",
  PATCH: "bg-amber-500/10 text-amber-600",
  DELETE: "bg-red-500/10 text-red-600",
};

function ApiExplorer() {
  const [selected, setSelected] = useState<Endpoint>(ENDPOINTS[0]);
  const [token, setToken] = useState("wdf_live_");
  const [body, setBody] = useState(selected.body ?? "");
  const [response, setResponse] = useState<{ status: number; body: string; time: number } | null>(null);
  const [sending, setSending] = useState(false);

  function pick(e: Endpoint) {
    setSelected(e); setBody(e.body ?? ""); setResponse(null);
  }

  async function send() {
    setSending(true);
    const start = performance.now();
    // Simulated response — no live network in this preview.
    await new Promise((r) => setTimeout(r, 350));
    const elapsed = Math.round(performance.now() - start);
    const fake = { ok: true, method: selected.method, path: selected.path, echoedBody: body ? safeParse(body) : null };
    setResponse({ status: selected.method === "POST" ? 201 : 200, body: JSON.stringify(fake, null, 2), time: elapsed });
    setSending(false);
  }

  return (
    <div className="space-y-4">
      <header>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-accent/10 text-accent grid place-items-center">
            <Compass className="w-4 h-4" aria-hidden />
          </div>
          <h2 className="font-display text-xl font-semibold">API Explorer</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">Try any REST endpoint with authenticated headers.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        <Card>
          <CardHeader><CardTitle className="text-xs">Endpoints</CardTitle></CardHeader>
          <CardContent className="p-0 max-h-[560px] overflow-auto">
            <ul>
              {ENDPOINTS.map((e) => {
                const active = e.path === selected.path && e.method === selected.method;
                return (
                  <li key={`${e.method}-${e.path}`}>
                    <button
                      onClick={() => pick(e)}
                      className={`w-full text-left px-3 py-2 flex items-center gap-2 border-l-2 ${active ? "bg-accent/5 border-accent" : "border-transparent hover:bg-muted"}`}
                    >
                      <Badge className={`${METHOD_COLOR[e.method]} hover:${METHOD_COLOR[e.method]} text-[11px] font-mono w-14 justify-center`}>{e.method}</Badge>
                      <span className="text-xs font-mono truncate">{e.path}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Badge className={`${METHOD_COLOR[selected.method]} hover:${METHOD_COLOR[selected.method]} font-mono`}>{selected.method}</Badge>
                <code className="text-sm">{selected.path}</code>
              </CardTitle>
              <p className="text-xs text-muted-foreground">{selected.desc}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Authorization</Label>
                <Input value={token} onChange={(e) => setToken(e.target.value)} className="font-mono text-xs" placeholder="wdf_live_" />
              </div>
              {(selected.method === "POST" || selected.method === "PATCH") && (
                <div>
                  <Label className="text-xs">Request body (JSON)</Label>
                  <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className="font-mono text-[11px]" />
                </div>
              )}
              <div className="flex justify-end">
                <Button onClick={send} disabled={sending}><Send className="w-3.5 h-3.5 mr-1.5" />{sending ? "Sending" : "Send request"}</Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Response</CardTitle>
              {response && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">{response.status}</Badge>
                  <span>{response.time} ms</span>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <pre className="rounded-control border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed max-h-80 overflow-auto">
{response ? response.body : "Send a request to see the response here."}
              </pre>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return { raw: s }; }
}
