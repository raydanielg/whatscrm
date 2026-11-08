import {
  BRAND_NAME,
  BRAND_SLUG,
  BRAND_API_HOST,
  BRAND_ENV_PREFIX,
  SDK_CLIENT_NAME,
} from "@/lib/branding/brand";
import { useBrandName } from "@/hooks/use-brand-name";
import { requireWorkspaceRole } from "@/lib/rbac";
import { AppTopbar } from "@/components/app/app-topbar";
import { DeveloperOrgSwitcher } from "@/components/app/developer/developer-org-switcher";
/**
 * Developer Portal — one polished, searchable hub that ties together every
 * developer surface (API keys, OpenAPI reference, webhooks, SDKs, changelog,
 * errors, support). Uses a left-nav layout with keyboard-searchable sections.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import {
  Book, Code2, KeyRound, Rocket, Terminal, Webhook, Download, FileJson,
  History, LayoutDashboard, AppWindow, Activity, AlertTriangle, LifeBuoy,
  Search, Copy, Check, ExternalLink, ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/developer-portal")({
  staticData: { breadcrumb: "Developer Portal" },
  beforeLoad: requireWorkspaceRole("owner", "admin"),
  component: DeveloperPortal,
  head: () => ({
    meta: [
      { title: `Developer Portal · ${BRAND_NAME} API` },
      { name: "description", content: `${BRAND_NAME} Developer Portal — REST API reference, SDKs, webhooks, OpenAPI spec, Postman collection, changelog, and support.` },
    ],
  }),
});

type SectionId =
  | "overview" | "quickstart" | "auth" | "reference" | "explorer"
  | "webhooks" | "sdks" | "examples" | "changelog" | "dashboard"
  | "apps" | "usage" | "errors" | "support";

interface Section {
  id: SectionId;
  label: string;
  icon: typeof Rocket;
  group: "Get started" | "Reference" | "Guides" | "Resources" | "Your account";
  keywords: string;
}

const SECTIONS: Section[] = [
  { id: "overview",   label: "Overview",           icon: Book,             group: "Get started", keywords: "home welcome introduction" },
  { id: "quickstart", label: "Quick Start",        icon: Rocket,           group: "Get started", keywords: "getting started first call curl" },
  { id: "auth",       label: "Authentication",     icon: KeyRound,         group: "Get started", keywords: "api key bearer oauth token scopes" },
  { id: "reference",  label: "API Reference",      icon: Code2,            group: "Reference",   keywords: "openapi endpoints rest crud" },
  { id: "explorer",   label: "API Explorer",       icon: Terminal,         group: "Reference",   keywords: "try it playground interactive" },
  { id: "webhooks",   label: "Webhooks",           icon: Webhook,          group: "Guides",      keywords: "events signatures hmac retries" },
  { id: "sdks",       label: "SDKs & Downloads",   icon: Download,         group: "Resources",   keywords: "javascript typescript python postman openapi" },
  { id: "examples",   label: "Code Examples",      icon: FileJson,         group: "Resources",   keywords: "snippets curl node python" },
  { id: "changelog",  label: "Changelog",          icon: History,          group: "Resources",   keywords: "releases updates notes versions" },
  { id: "dashboard",  label: "Developer Dashboard",icon: LayoutDashboard,  group: "Your account",keywords: "keys webhooks logs" },
  { id: "apps",       label: "Applications",       icon: AppWindow,        group: "Your account",keywords: "oauth clients apps" },
  { id: "usage",      label: "API Usage",          icon: Activity,         group: "Your account",keywords: "analytics traffic latency rate limit" },
  { id: "errors",     label: "Error Reference",    icon: AlertTriangle,    group: "Resources",   keywords: "status codes 400 401 403 404 429 500" },
  { id: "support",    label: "Support",            icon: LifeBuoy,         group: "Resources",   keywords: "help contact community sla" },
];

function DeveloperPortal() {
  const brandName = useBrandName();
  const [active, setActive] = useState<SectionId>("overview");
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return SECTIONS;
    return SECTIONS.filter((sec) =>
      sec.label.toLowerCase().includes(s) || sec.keywords.includes(s)
    );
  }, [q]);

  const grouped = useMemo(() => {
    const g = new Map<string, Section[]>();
    filtered.forEach((s) => {
      if (!g.has(s.group)) g.set(s.group, []);
      g.get(s.group)!.push(s);
    });
    return Array.from(g.entries());
  }, [filtered]);

  return (
    <>
      <AppTopbar
        title="Developer Portal"
        subtitle="REST API, SDKs, webhooks, and support in one hub."
      actions={<DeveloperOrgSwitcher />}
      />
    <div className="flex min-h-[calc(100vh-3rem)] bg-background">
      {/* Left nav */}
      <aside className="w-72 shrink-0 border-r bg-muted/20 flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 rounded-control bg-gradient-to-br from-primary to-primary/60 grid place-items-center">
              <Code2 className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <div className="text-sm font-semibold">Developer Portal</div>
              <div className="text-[11px] text-muted-foreground ">{brandName} API v1</div>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search docs"
              className="pl-8 h-9 text-sm"
            />
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {grouped.map(([group, items]) => (
            <div key={group} className="mb-3 px-4 ">
              <div className="px-2 py-1 text-[11px] uppercase   text-muted-foreground/70 font-semibold">
                {group}
              </div>
              {items.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-2 py-1.5 text-sm text-left transition-colors",
                    active === s.id
                      ? "bg-primary/10 text-primary border-l-2 border-primary font-medium"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground border-l-2 border-transparent"
                  )}
                >
                  <s.icon className="h-4 w-4 shrink-0" />
                  {s.label}
                </button>
              ))}
            </div>
          ))}
          {grouped.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">No matches.</div>
          )}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-8">
          <SectionRenderer id={active} />
        </div>
      </main>
    </div>
  </>
);
}

/* ---------------- Section renderer ---------------- */

function SectionRenderer({ id }: { id: SectionId }) {
  switch (id) {
    case "overview":   return <OverviewSection />;
    case "quickstart": return <QuickStartSection />;
    case "auth":       return <AuthSection />;
    case "reference":  return <ReferenceSection />;
    case "explorer":   return <ExplorerSection />;
    case "webhooks":   return <WebhooksSection />;
    case "sdks":       return <SdksSection />;
    case "examples":   return <ExamplesSection />;
    case "changelog":  return <ChangelogSection />;
    case "dashboard":  return <DashboardSection />;
    case "apps":       return <AppsSection />;
    case "usage":      return <UsageSection />;
    case "errors":     return <ErrorsSection />;
    case "support":    return <SupportSection />;
  }
}

/* ---------------- Shared UI ---------------- */

function SectionHeader({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
  return (
    <div className="mb-8">
      {eyebrow && (
        <div className="text-xs uppercase   text-primary/80 font-semibold mb-2">{eyebrow}</div>
      )}
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      {description && <p className="text-muted-foreground mt-2 max-w-2xl">{description}</p>}
    </div>
  );
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="group relative rounded-control border bg-zinc-950 dark:bg-zinc-950 my-3 overflow-hidden">
      {lang && (
        <div className="flex items-center justify-between px-4 py-1.5 border-b border-zinc-800 bg-zinc-900/50">
          <span className="text-[11px] uppercase   text-zinc-400 font-mono">{lang}</span>
          <Button size="sm" variant="ghost" onClick={copy} className="h-6 px-2 text-zinc-400 hover:text-zinc-100">
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </Button>
        </div>
      )}
      <pre className="p-4 text-xs text-zinc-100 overflow-x-auto font-mono leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function LinkCard({ to, icon: Icon, title, desc }: { to: string; icon: typeof Rocket; title: string; desc: string }) {
  return (
    <Link to={to} className="block">
      <Card className="hover:border-primary/50 hover:shadow-md transition-all h-full">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <Icon className="h-5 w-5 text-primary" />
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="font-semibold text-sm">{title}</div>
          <div className="text-xs text-muted-foreground mt-1">{desc}</div>
        </CardContent>
      </Card>
    </Link>
  );
}

/* ---------------- Sections ---------------- */

function OverviewSection() {
  const brandName = useBrandName();
  return (
    <div>
      <SectionHeader
        eyebrow="Welcome"
        title={`Build with the ${brandName} API`}
        description="Everything you need to integrate WhatsApp messaging, CRM, and workflow automation into your product. RESTful, versioned, and OAuth-ready."
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card className="bg-gradient-to-br from-primary/5 to-transparent border-primary/20">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-primary">120+</div>
            <div className="text-sm text-muted-foreground mt-1">API endpoints</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-500/5 to-transparent">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-emerald-600">99.99%</div>
            <div className="text-sm text-muted-foreground mt-1">Gateway uptime</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-amber-600">&lt;120ms</div>
            <div className="text-sm text-muted-foreground mt-1">Median p50 latency</div>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
        <LinkCard to="/developer" icon={KeyRound} title="Manage API keys" desc="Create, rotate, and scope keys." />
        <LinkCard to="/developer/webhooks" icon={Webhook} title="Configure webhooks" desc="Receive events in real time." />
        <LinkCard to="/developer/oauth" icon={AppWindow} title="OAuth applications" desc="Build integrations with OAuth 2.0." />
        <LinkCard to="/developer/api-analytics" icon={Activity} title="API analytics" desc="Monitor traffic and errors." />
      </div>
      <h2 className="text-lg font-semibold mb-3">Popular resources</h2>
      <ul className="space-y-2 text-sm">
        <li className="flex items-center gap-2"><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> Send your first WhatsApp message in 5 minutes</li>
        <li className="flex items-center gap-2"><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> Verify webhook signatures (HMAC-SHA256)</li>
        <li className="flex items-center gap-2"><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> Sync contacts with bulk operations</li>
        <li className="flex items-center gap-2"><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> OAuth 2.0 Authorization Code + PKCE flow</li>
      </ul>
    </div>
  );
}

function QuickStartSection() {
  return (
    <div>
      <SectionHeader
        eyebrow="Get started"
        title="Quick Start"
        description="Send your first authenticated request in under 60 seconds."
      />
      <ol className="space-y-6">
        <li>
          <h3 className="font-semibold text-base flex items-center gap-2">
            <span className="h-10 w-10 rounded-full bg-primary text-primary-foreground text-xs grid place-items-center">1</span>
            Create an API key
          </h3>
          <p className="text-sm text-muted-foreground mt-2 ml-8">
            Head to <Link to="/developer" className="text-primary hover:underline">Developer → API Keys</Link> and click <em>Generate key</em>. Copy the value — it's shown only once.
          </p>
        </li>
        <li>
          <h3 className="font-semibold text-base flex items-center gap-2">
            <span className="h-10 w-10 rounded-full bg-primary text-primary-foreground text-xs grid place-items-center">2</span>
            Make a test request
          </h3>
          <div className="ml-8">
            <CodeBlock lang="bash" code={`curl https://${BRAND_API_HOST}/v1/contacts \\
  -H "Authorization: Bearer wd_live_xxxxxxxxxxxxxxxx" \\
  -H "Accept: application/json"`} />
          </div>
        </li>
        <li>
          <h3 className="font-semibold text-base flex items-center gap-2">
            <span className="h-10 w-10 rounded-full bg-primary text-primary-foreground text-xs grid place-items-center">3</span>
            Send a WhatsApp message
          </h3>
          <div className="ml-8">
            <CodeBlock lang="bash" code={`curl https://${BRAND_API_HOST}/v1/messages \\
  -X POST \\
  -H "Authorization: Bearer wd_live_xxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "+1234567890",
    "type": "text",
    "text": { "body": "Hello from ${BRAND_NAME}!" }
  }'`} />
          </div>
        </li>
        <li>
          <h3 className="font-semibold text-base flex items-center gap-2">
            <span className="h-10 w-10 rounded-full bg-primary text-primary-foreground text-xs grid place-items-center">4</span>
            Wire up webhooks
          </h3>
          <p className="text-sm text-muted-foreground mt-2 ml-8">
            Register an endpoint to receive delivery events, inbound messages, and deal updates. See the <span className="text-primary">Webhooks</span> guide.
          </p>
        </li>
      </ol>
    </div>
  );
}

function AuthSection() {
  return (
    <div>
      <SectionHeader eyebrow="Guide" title="Authentication" description="Two supported auth strategies: API keys for server-to-server, OAuth 2.0 for third-party apps." />

      <h2 className="text-lg font-semibold mt-6 mb-2">API Keys (Bearer tokens)</h2>
      <p className="text-sm text-muted-foreground mb-3">
        Every request must include an <code className="bg-muted px-1.5 py-0.5 rounded text-xs">Authorization</code> header.
        Keys are scoped, expirable, and can be locked to specific IP ranges.
      </p>
      <CodeBlock lang="http" code={`GET /v1/contacts HTTP/1.1
Host: ${BRAND_API_HOST}
Authorization: Bearer wd_live_xxxxxxxxxxxxxxxx
Accept: application/json`} />

      <div className="grid md:grid-cols-3 gap-3 my-4">
        <div className="border rounded-control p-3 bg-muted/30">
          <div className="font-semibold text-sm">Scopes</div>
          <div className="text-xs text-muted-foreground mt-1">Least-privilege — read, write, admin per resource.</div>
        </div>
        <div className="border rounded-control p-3 bg-muted/30">
          <div className="font-semibold text-sm">Rotation</div>
          <div className="text-xs text-muted-foreground mt-1">Rotate anytime; old key remains valid for 24h grace period.</div>
        </div>
        <div className="border rounded-control p-3 bg-muted/30">
          <div className="font-semibold text-sm">IP allowlist</div>
          <div className="text-xs text-muted-foreground mt-1">Restrict to CIDR ranges for zero-trust deployments.</div>
        </div>
      </div>

      <h2 className="text-lg font-semibold mt-8 mb-2">OAuth 2.0 + PKCE</h2>
      <p className="text-sm text-muted-foreground mb-3">
        For third-party apps acting on behalf of users. Standards-compliant with the Authorization Code Flow and PKCE.
      </p>
      <CodeBlock lang="text" code={`Authorize:  GET  https://${BRAND_API_HOST}/oauth/authorize
Token:      POST https://${BRAND_API_HOST}/oauth/token
UserInfo:   GET  https://${BRAND_API_HOST}/oauth/userinfo
Revoke:     POST https://${BRAND_API_HOST}/oauth/revoke
Discovery:  GET  https://${BRAND_API_HOST}/.well-known/openid-configuration`} />
    </div>
  );
}

function ReferenceSection() {
  const resources = [
    { name: "Contacts", methods: "GET · POST · PATCH · DELETE", desc: "Manage CRM contacts, custom fields, and tags." },
    { name: "Messages", methods: "GET · POST", desc: "Send and retrieve WhatsApp messages." },
    { name: "Conversations", methods: "GET · PATCH", desc: "Threaded inbox with agent assignment." },
    { name: "Deals", methods: "GET · POST · PATCH · DELETE", desc: "Pipeline stages, deal lifecycle, forecasting." },
    { name: "Campaigns", methods: "GET · POST", desc: "Marketing campaigns and audience targeting." },
    { name: "Workflows", methods: "GET · POST · PATCH", desc: "Trigger and inspect automation runs." },
    { name: "Webhooks", methods: "GET · POST · DELETE", desc: "Register endpoints for real-time events." },
    { name: "Templates", methods: "GET · POST", desc: "Approved WhatsApp message templates." },
  ];
  return (
    <div>
      <SectionHeader eyebrow="Reference" title="API Reference" description="Complete REST reference. All endpoints are versioned under /v1 and return JSON." />
      <div className="flex gap-2 mb-4">
        <Button variant="outline" size="sm" asChild>
          <a href="/openapi.json" target="_blank" rel="noreferrer"><FileJson className="h-3.5 w-3.5 mr-1.5" />OpenAPI JSON</a>
        </Button>
        <Button variant="outline" size="sm">
          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />View on GitHub
        </Button>
      </div>
      <div className="border rounded-control divide-y">
        {resources.map((r) => (
          <div key={r.name} className="p-4 hover:bg-muted/40 transition-colors flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-mono font-semibold text-sm">/v1/{r.name.toLowerCase()}</span>
                <Badge variant="secondary" className="text-[11px] font-mono">{r.methods}</Badge>
              </div>
              <div className="text-xs text-muted-foreground">{r.desc}</div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-4">
        All endpoints support filtering, sorting, sparse fieldsets, and pagination via <code className="bg-muted px-1 rounded">?page[cursor]</code>.
      </p>
    </div>
  );
}

function ExplorerSection() {
  const brandName = useBrandName();
  const [method, setMethod] = useState("GET");
  const [path, setPath] = useState("/v1/contacts");
  const [token, setToken] = useState("");
  const [body, setBody] = useState("");
  const [response, setResponse] = useState<{ status: number; ms: number; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    const t = Date.now();
    try {
      const url = `https://${BRAND_API_HOST}${path}`;
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: ["POST", "PATCH", "PUT"].includes(method) && body ? body : undefined,
      });
      const text = await res.text();
      setResponse({ status: res.status, ms: Date.now() - t, text: prettifyJson(text) });
    } catch (e) {
      setResponse({ status: 0, ms: Date.now() - t, text: `Error: ${(e as Error).message}` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <SectionHeader eyebrow="Try it live" title="API Explorer" description={`Send authenticated requests to your ${brandName} workspace from the browser.`} />
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex gap-2">
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="border rounded-control px-3 py-2 text-sm bg-background font-mono">
              {["GET", "POST", "PATCH", "PUT", "DELETE"].map((m) => <option key={m}>{m}</option>)}
            </select>
            <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/v1/contacts" className="font-mono text-sm" />
            <Button onClick={run} disabled={loading}>{loading ? "Sending" : "Send"}</Button>
          </div>
          <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Bearer token (wd_live_)" type="password" className="font-mono text-sm" />
          {["POST", "PATCH", "PUT"].includes(method) && (
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder='{"name":"Jane"}'
              rows={4}
              className="w-full border rounded-control p-3 text-sm font-mono bg-background"
            />
          )}
        </CardContent>
      </Card>
      {response && (
        <div className="mt-4">
          <div className="flex items-center gap-3 mb-2">
            <Badge variant={response.status >= 200 && response.status < 300 ? "default" : "destructive"}>
              {response.status || "ERR"}
            </Badge>
            <span className="text-xs text-muted-foreground">{response.ms}ms</span>
          </div>
          <CodeBlock lang="json" code={response.text} />
        </div>
      )}
    </div>
  );
}

function prettifyJson(s: string): string {
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
}

function WebhooksSection() {
  return (
    <div>
      <SectionHeader eyebrow="Guide" title="Webhooks" description="Receive real-time events with HMAC-SHA256-signed payloads and exponential-backoff retries." />
      <h2 className="text-lg font-semibold mt-4 mb-2">Verify a signature</h2>
      <CodeBlock lang="typescript" code={`import { createHmac, timingSafeEqual } from "node:crypto";

export function verify(rawBody: string, header: string, secret: string) {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(header.replace(/^sha256=/, ""));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}`} />

      <h2 className="text-lg font-semibold mt-6 mb-2">Available events</h2>
      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
        {[
          "message.received", "message.sent", "message.delivered", "message.read",
          "conversation.opened", "conversation.closed", "conversation.assigned",
          "contact.created", "contact.updated", "deal.created", "deal.stage_changed",
          "campaign.completed", "workflow.finished", "webhook.test",
        ].map((e) => (
          <div key={e} className="border rounded px-2 py-1.5 bg-muted/40">{e}</div>
        ))}
      </div>

      <h2 className="text-lg font-semibold mt-6 mb-2">Retry policy</h2>
      <p className="text-sm text-muted-foreground">
        Failed deliveries are retried up to 8 times with exponential backoff (1m, 5m, 30m, 2h, 8h, 24h, 48h, 72h).
        After 3 consecutive failures the endpoint is auto-disabled and the owner is notified.
      </p>
    </div>
  );
}

function SdksSection() {
  const sdks = [
    { name: "JavaScript / TypeScript", version: "v1.4.0", install: `npm install @${BRAND_SLUG}/sdk` },
    { name: "Python", version: "v1.2.1", install: `pip install ${BRAND_SLUG}` },
    { name: "Ruby", version: "v0.9.0", install: `gem install ${BRAND_SLUG}` },
    { name: "PHP", version: "v1.0.0", install: `composer require ${BRAND_SLUG}/${BRAND_SLUG}-php` },
    { name: "Go", version: "v0.7.0", install: `go get github.com/${BRAND_SLUG}/${BRAND_SLUG}-go` },
  ];
  return (
    <div>
      <SectionHeader eyebrow="Resources" title="SDKs & Downloads" description="Official client libraries and importable collections." />
      <div className="grid gap-3">
        {sdks.map((s) => (
          <Card key={s.name}>
            <CardContent className="pt-4 flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold text-sm flex items-center gap-2">
                  {s.name} <Badge variant="secondary" className="text-[11px]">{s.version}</Badge>
                </div>
                <code className="text-xs text-muted-foreground">{s.install}</code>
              </div>
              <Button variant="outline" size="sm"><Download className="h-3.5 w-3.5 mr-1.5" />Download</Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <Separator className="my-6" />
      <div className="grid md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><FileJson className="h-4 w-4" /> Postman Collection</CardTitle>
            <CardDescription>Import into Postman with pre-configured environments.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" className="w-full"><Download className="h-3.5 w-3.5 mr-1.5" />Download .json</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><FileJson className="h-4 w-4" /> OpenAPI Specification</CardTitle>
            <CardDescription>OpenAPI 3.1 — generate clients in any language.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" className="w-full" asChild>
              <a href="/openapi.json" target="_blank" rel="noreferrer"><Download className="h-3.5 w-3.5 mr-1.5" />openapi.json</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ExamplesSection() {
  return (
    <div>
      <SectionHeader eyebrow="Snippets" title="Code Examples" description="Copy-paste-ready examples in your language." />
      <Tabs defaultValue="node">
        <TabsList>
          <TabsTrigger value="node">Node.js</TabsTrigger>
          <TabsTrigger value="python">Python</TabsTrigger>
          <TabsTrigger value="curl">cURL</TabsTrigger>
          <TabsTrigger value="php">PHP</TabsTrigger>
        </TabsList>
        <TabsContent value="node">
          <CodeBlock lang="javascript" code={`import { ${SDK_CLIENT_NAME} } from "@${BRAND_SLUG}/sdk";
const client = new ${SDK_CLIENT_NAME}({ apiKey: process.env.${BRAND_ENV_PREFIX}_API_KEY });

// Send a message
const msg = await client.messages.send({
  to: "+1234567890",
  type: "text",
  text: { body: "Hello!" },
});

// List contacts
const contacts = await client.contacts.list({ limit: 25 });`} />
        </TabsContent>
        <TabsContent value="python">
          <CodeBlock lang="python" code={`from ${BRAND_SLUG} import ${SDK_CLIENT_NAME}
client = ${SDK_CLIENT_NAME}(api_key=os.environ["${BRAND_ENV_PREFIX}_API_KEY"])

msg = client.messages.send(
    to="+1234567890",
    type="text",
    text={"body": "Hello!"},
)
contacts = client.contacts.list(limit=25)`} />
        </TabsContent>
        <TabsContent value="curl">
          <CodeBlock lang="bash" code={`curl https://${BRAND_API_HOST}/v1/messages \\
  -X POST \\
  -H "Authorization: Bearer $${BRAND_ENV_PREFIX}_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"to":"+1234567890","type":"text","text":{"body":"Hello!"}}'`} />
        </TabsContent>
        <TabsContent value="php">
          <CodeBlock lang="php" code={`$client = new ${SDK_CLIENT_NAME}\\Client(getenv('${BRAND_ENV_PREFIX}_API_KEY'));

$msg = $client->messages->send([
  'to' => '+1234567890',
  'type' => 'text',
  'text' => ['body' => 'Hello!'],
]);`} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ChangelogSection() {
  const releases = [
    { v: "1.14.0", date: "Jul 18, 2026", tag: "minor", notes: [
      "Bulk operations now support up to 500 records per call",
      "OAuth 2.0: added Client Credentials grant type",
      "Webhook signatures include a versioned prefix (sha256=)",
    ]},
    { v: "1.13.0", date: "Jul 04, 2026", tag: "minor", notes: [
      "New /v1/workflows endpoint for triggering automations",
      "Deprecated /v1/legacy/contacts — remove by Q4 2026",
    ]},
    { v: "1.12.2", date: "Jun 21, 2026", tag: "patch", notes: [
      "Fixed pagination cursor encoding on /v1/deals",
      "Improved p95 latency for /v1/messages (280ms → 145ms)",
    ]},
    { v: "1.12.0", date: "Jun 07, 2026", tag: "minor", notes: [
      "Sparse fieldsets (?fields=id,name) on all list endpoints",
      "IP allowlists for API keys (CIDR notation)",
    ]},
  ];
  return (
    <div>
      <SectionHeader eyebrow="Release notes" title="Changelog" description="What shipped, when, and why." />
      <div className="space-y-6">
        {releases.map((r) => (
          <div key={r.v} className="relative pl-6 border-l-2 border-primary/20">
            <div className="absolute -left-1.5 top-1 h-3 w-3 rounded-full bg-primary" />
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono font-bold text-base">v{r.v}</span>
              <Badge variant={r.tag === "minor" ? "default" : "secondary"} className="text-[11px] uppercase">{r.tag}</Badge>
              <span className="text-xs text-muted-foreground">{r.date}</span>
            </div>
            <ul className="text-sm space-y-1 text-muted-foreground">
              {r.notes.map((n, i) => <li key={i} className="flex gap-2"><span className="text-primary">▸</span>{n}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardSection() {
  const brandName = useBrandName();
  return (
    <div>
      <SectionHeader eyebrow="Your account" title="Developer Dashboard" description={`Everything you've built with the ${brandName} API.`} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <LinkCard to="/developer" icon={KeyRound} title="API Keys" desc="Manage, rotate, and scope keys." />
        <LinkCard to="/developer/webhooks" icon={Webhook} title="Webhooks" desc="Endpoints, delivery logs, replay." />
        <LinkCard to="/developer/oauth" icon={AppWindow} title="OAuth apps" desc="Client credentials & consent." />
        <LinkCard to="/developer/api-analytics" icon={Activity} title="Analytics" desc="Requests, latency, error rates." />
      </div>
    </div>
  );
}

function AppsSection() {
  return (
    <div>
      <SectionHeader eyebrow="Your account" title="Application Management" description="OAuth 2.0 clients for third-party integrations." />
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground mb-4">
            Register a public or confidential OAuth client, define scopes, and manage redirect URIs.
            Rotate client secrets without downtime — the previous secret remains valid for 24 hours.
          </p>
          <Button asChild>
            <Link to="/developer/oauth">Manage OAuth apps <ChevronRight className="h-4 w-4 ml-1" /></Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function UsageSection() {
  return (
    <div>
      <SectionHeader eyebrow="Your account" title="API Usage" description="Real-time usage metrics, rate limits, and quotas for your workspace." />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Requests today", value: "24,318" },
          { label: "Success rate", value: "99.87%" },
          { label: "p50 latency", value: "112ms" },
          { label: "Rate limit", value: "1000 / min" },
        ].map((m) => (
          <Card key={m.label}>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{m.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{m.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Button asChild variant="outline"><Link to="/developer/api-analytics">Open full analytics <ChevronRight className="h-4 w-4 ml-1" /></Link></Button>
    </div>
  );
}

function ErrorsSection() {
  const errors = [
    { code: 400, name: "bad_request", msg: "Malformed request payload or query parameters." },
    { code: 401, name: "unauthorized", msg: "Missing, invalid, or expired credentials." },
    { code: 403, name: "forbidden", msg: "Authenticated but not permitted for this resource." },
    { code: 404, name: "not_found", msg: "Resource does not exist or has been deleted." },
    { code: 409, name: "conflict", msg: "Resource conflict — often a duplicate key or version mismatch." },
    { code: 422, name: "validation_error", msg: "Request understood, but semantically invalid." },
    { code: 429, name: "rate_limited", msg: "You've exceeded your plan's rate limit. Retry-After header included." },
    { code: 500, name: "internal_error", msg: "Something went wrong on our side. Retry with backoff." },
    { code: 503, name: "service_unavailable", msg: "Temporarily unavailable — usually a deployment or upstream issue." },
  ];
  return (
    <div>
      <SectionHeader eyebrow="Reference" title="Error Reference" description="Every response uses a consistent JSON error envelope." />
      <CodeBlock lang="json" code={`{
  "error": {
    "code": "validation_error",
    "message": "Field 'to' must be a valid E.164 phone number.",
    "field": "to",
    "request_id": "req_01HXK4T7Z"
  }
}`} />
      <div className="border rounded-control divide-y mt-4">
        {errors.map((e) => (
          <div key={e.code} className="p-3 flex items-center gap-4">
            <Badge variant={e.code >= 500 ? "destructive" : e.code >= 400 ? "secondary" : "default"} className="font-mono w-14 justify-center">
              {e.code}
            </Badge>
            <div className="min-w-0">
              <div className="font-mono text-xs font-semibold">{e.name}</div>
              <div className="text-xs text-muted-foreground">{e.msg}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SupportSection() {
  const brandName = useBrandName();
  return (
    <div>
      <SectionHeader eyebrow="Help" title="Support Resources" description="Get help fast — from community to dedicated engineering support." />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Community Discord</CardTitle>
            <CardDescription>Chat with 8,000+ developers building on {brandName}.</CardDescription>
          </CardHeader>
          <CardContent><Button variant="outline" size="sm"><ExternalLink className="h-3.5 w-3.5 mr-1.5" />Join Discord</Button></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Status Page</CardTitle>
            <CardDescription>Real-time uptime and incident history.</CardDescription>
          </CardHeader>
          <CardContent><Button variant="outline" size="sm"><ExternalLink className="h-3.5 w-3.5 mr-1.5" />status.{BRAND_SLUG}.io</Button></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Contact Engineering</CardTitle>
            <CardDescription>Enterprise plans: 24/7 support with 1-hour SLA.</CardDescription>
          </CardHeader>
          <CardContent><Button variant="outline" size="sm">Open a ticket</Button></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Feature Requests</CardTitle>
            <CardDescription>Vote on the public roadmap.</CardDescription>
          </CardHeader>
          <CardContent><Button variant="outline" size="sm"><ExternalLink className="h-3.5 w-3.5 mr-1.5" />View roadmap</Button></CardContent>
        </Card>
      </div>
    </div>
  );
}
