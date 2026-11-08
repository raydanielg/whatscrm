import { BRAND_NAME } from "@/lib/branding/brand";
import { requireOrgRole } from "@/lib/rbac";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, queryOptions, useQueryClient } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  KeyRound,
  Webhook,
  Book,
  Boxes,
  Copy,
  Ban,
  Plus,
  ShieldCheck,
  Terminal,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import {
  listApiKeys,
  createApiKey,
  revokeApiKey,
  listWebhookActivity,
} from "@/lib/developer/api-keys.functions";
import { useResolvedOrgId } from "@/hooks/use-organization";
import { AppTopbar } from "@/components/app/app-topbar";
import { ApiKeysManager } from "@/components/app/developer/api-keys-manager";
import { DeveloperOrgSwitcher } from "@/components/app/developer/developer-org-switcher";

const keysQO = (organizationId: string) =>
  queryOptions({
    queryKey: ["developer", "api-keys", organizationId],
    queryFn: () => listApiKeys({ data: { organizationId } }),
  });
const webhooksQO = (organizationId: string) =>
  queryOptions({
    queryKey: ["developer", "webhooks", organizationId],
    queryFn: () => listWebhookActivity({ data: { organizationId } }),
  });

export const Route = createFileRoute("/_authenticated/developer/")({
  beforeLoad: requireOrgRole("owner", "admin"),
  staticData: { breadcrumb: "Developer Center" },
  head: () => ({
    meta: [
      { title: "Developer Center" },
      { name: "description", content: `API keys, webhooks, and integrations for ${BRAND_NAME}.` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DeveloperPage,
  errorComponent: ({ error }) => (
    <div className="p-6" role="alert">
      <h1 className="font-display text-xl font-semibold">Developer Center</h1>
      <p className="text-sm text-destructive mt-2">{(error as Error).message}</p>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Not found.</div>,
});

function DeveloperPage() {
  return (
    <>
      <AppTopbar
        title="Developer Center"
        subtitle="REST API, webhooks, OAuth apps, and native integrations."
        actions={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <DeveloperOrgSwitcher />
            <div className="hidden sm:flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-control bg-emerald-500/10 text-emerald-600 text-xs whitespace-nowrap">
                <CheckCircle2 className="w-3 h-3 shrink-0" /> API v1 · operational
              </span>
              <a
                href="/developer-tools"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-control bg-accent/10 text-accent hover:bg-muted transition-colors text-xs whitespace-nowrap"
              >
                <Terminal className="w-3 h-3 shrink-0" /> Plugin Developer Tools
              </a>
            </div>
          </div>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <Tabs defaultValue="keys" className="w-full">
          <TabsList className="w-full md:w-auto grid grid-cols-2 md:inline-flex">
            <TabsTrigger value="keys">
              <KeyRound className="w-3.5 h-3.5 mr-1.5" />
              API Keys
            </TabsTrigger>
            <TabsTrigger value="webhooks">
              <Webhook className="w-3.5 h-3.5 mr-1.5" />
              Webhooks
            </TabsTrigger>
            <TabsTrigger value="integrations">
              <Boxes className="w-3.5 h-3.5 mr-1.5" />
              Integrations
            </TabsTrigger>
            <TabsTrigger value="docs">
              <Book className="w-3.5 h-3.5 mr-1.5" />
              API Reference
            </TabsTrigger>
          </TabsList>

          <TabsContent value="keys" className="mt-4">
            <Suspense fallback={<Skeleton />}>
              <KeysTab />
            </Suspense>
          </TabsContent>
          <TabsContent value="webhooks" className="mt-4">
            <Suspense fallback={<Skeleton />}>
              <WebhooksTab />
            </Suspense>
          </TabsContent>
          <TabsContent value="integrations" className="mt-4">
            <IntegrationsTab />
          </TabsContent>
          <TabsContent value="docs" className="mt-4">
            <DocsTab />
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}

function Skeleton() {
  return (
    <div className="rounded-control border border-border bg-surface p-8 text-sm text-muted-foreground">
      Loading
    </div>
  );
}

/* ---------------------- API Keys ---------------------- */

// Implementation lives in the shared manager so Settings and the Developer
// Center never drift apart.
function KeysTab() {
  return <ApiKeysManager />;
}

/* ---------------------- Webhooks ---------------------- */

function WebhooksTab() {
  const { organizationId, isLoading, isMissingContext } = useResolvedOrgId();
  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading</div>;
  if (!organizationId) {
    return (
      <div className="p-6 text-sm text-muted-foreground" role="status">
        {isMissingContext
          ? "You're not a member of any organization yet. Create or join one to manage webhooks."
          : "Loading"}
      </div>
    );
  }
  return <WebhooksTabInner organizationId={organizationId} />;
}

function WebhooksTabInner({ organizationId }: { organizationId: string }) {
  const formatZoned = useZonedDateFormatter();
  const { data } = useSuspenseQuery(webhooksQO(organizationId));
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            Signing secrets
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Verify every incoming webhook using HMAC-SHA256 on the raw request body.
          </p>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prefix</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Activated</TableHead>
                <TableHead>Retired</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.secrets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    No signing secrets provisioned yet.
                  </TableCell>
                </TableRow>
              )}
              {data.secrets.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.secret_prefix}</TableCell>
                  <TableCell>
                    {s.is_primary ? (
                      <Badge>Primary</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Rotational</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {s.activated_at
                      ? formatZoned(new Date(s.activated_at), {
                          dateStyle: "short",
                          timeStyle: "medium",
                        })
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {s.retired_at ? (
                      formatZoned(new Date(s.retired_at), {
                        dateStyle: "short",
                        timeStyle: "medium",
                      })
                    ) : (
                      <span className="text-emerald-600">Active</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent deliveries</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Signature</TableHead>
                <TableHead>Processed</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.events.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No webhook events yet.
                  </TableCell>
                </TableRow>
              )}
              {data.events.map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">{e.provider}</TableCell>
                  <TableCell className="text-xs font-medium">{e.event_type}</TableCell>
                  <TableCell>
                    {e.signature_valid ? (
                      <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">
                        Valid
                      </Badge>
                    ) : (
                      <Badge variant="destructive">Invalid</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {e.processed ? (
                      <span className="text-emerald-600 text-xs">✓ delivered</span>
                    ) : (
                      <span className="text-amber-600 text-xs">pending</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{e.attempts}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatZoned(new Date(e.received_at), {
                      dateStyle: "short",
                      timeStyle: "medium",
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------------- Integrations Marketplace ---------------------- */

const INTEGRATIONS = [
  {
    id: "zapier",
    name: "Zapier",
    cat: "Automation",
    desc: "Trigger workflows and push data to 5,000+ apps.",
    status: "available",
  },
  {
    id: "make",
    name: "Make",
    cat: "Automation",
    desc: "Visual scenarios for multi-step automation.",
    status: "available",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    cat: "CRM",
    desc: "Sync contacts, deals, and marketing lists.",
    status: "available",
  },
  {
    id: "salesforce",
    name: "Salesforce",
    cat: "CRM",
    desc: "Two-way lead and opportunity sync.",
    status: "available",
  },
  {
    id: "slack",
    name: "Slack",
    cat: "Comms",
    desc: "Post assignments, alerts, and SLA breaches.",
    status: "available",
  },
  {
    id: "gcal",
    name: "Google Calendar",
    cat: "Productivity",
    desc: "Book meetings from conversations.",
    status: "available",
  },
  {
    id: "stripe",
    name: "Stripe",
    cat: "Billing",
    desc: "Sync customer, invoice, and payment events.",
    status: "installed",
  },
  {
    id: "shopify",
    name: "Shopify",
    cat: "Commerce",
    desc: "Trigger campaigns from order events.",
    status: "coming-soon",
  },
  {
    id: "meta-ads",
    name: "Meta Ads",
    cat: "Marketing",
    desc: "Attribute conversions to WhatsApp campaigns.",
    status: "coming-soon",
  },
];

function IntegrationsTab() {
  const [q, setQ] = useState("");
  const filtered = INTEGRATIONS.filter(
    (i) =>
      i.name.toLowerCase().includes(q.toLowerCase()) ||
      i.cat.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search integrations"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
          aria-label="Search integrations"
        />
        <span className="text-xs text-muted-foreground">
          {filtered.length} of {INTEGRATIONS.length}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((it) => (
          <Card key={it.id} className="hover:border-border-strong transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-muted-foreground">{it.cat}</div>
                  <div className="font-display font-semibold mt-0.5">{it.name}</div>
                </div>
                {it.status === "installed" && (
                  <Badge className="bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">
                    Installed
                  </Badge>
                )}
                {it.status === "coming-soon" && <Badge variant="secondary">Soon</Badge>}
              </div>
              <p className="text-sm text-muted-foreground mt-2 min-h-[40px]">{it.desc}</p>
              <div className="mt-3">
                <Button
                  size="sm"
                  variant={it.status === "installed" ? "secondary" : "outline"}
                  disabled={it.status === "coming-soon"}
                  className="w-full"
                >
                  {it.status === "installed"
                    ? "Configure"
                    : it.status === "coming-soon"
                      ? "Notify me"
                      : "Install"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ---------------------- API Reference ---------------------- */

function DocsTab() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Quick start</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>Base URL</p>
          <pre className="rounded-control bg-muted/60 p-3 text-xs font-mono overflow-x-auto">
            https://api.wacrm.io/v1
          </pre>
          <p>Authenticate with a bearer token</p>
          <pre className="rounded-control bg-muted/60 p-3 text-xs font-mono overflow-x-auto">{`curl https://api.wacrm.io/v1/contacts \\
  -H "Authorization: Bearer wdf_live_..." \\
  -H "Content-Type: application/json"`}</pre>
          <p>Send a WhatsApp message</p>
          <pre className="rounded-control bg-muted/60 p-3 text-xs font-mono overflow-x-auto">{`curl -X POST https://api.wacrm.io/v1/messages \\
  -H "Authorization: Bearer wdf_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"to":"+15551234567","template":"welcome_v1"}'`}</pre>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resources</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {[
            { l: "Platform Health", h: "/developer/platform-health" },
            { l: "API Analytics", h: "/developer/api-analytics" },
            { l: "API Security", h: "/developer/api-security" },
            { l: "REST API reference", h: "/developer/reference" },
            { l: "Webhooks guide", h: "/developer/webhooks-guide" },
            { l: "OAuth 2.0 apps", h: "/developer/oauth" },
            { l: "SDK downloads", h: "/developer/sdks" },
            { l: "Changelog", h: "/developer/changelog" },
            { l: "Status", h: "/status" },
          ].map((r) => (
            <a
              key={r.l}
              href={r.h}
              className="flex items-center justify-between rounded-control border border-border px-3 py-2 hover:bg-muted transition-colors"
            >
              <span>{r.l}</span>
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
            </a>
          ))}
        </CardContent>
      </Card>

      <Card className="md:col-span-3">
        <CardHeader>
          <CardTitle className="text-base">Core endpoints</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Method</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Scope</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                ["GET", "/v1/contacts", "List contacts", "contacts:read"],
                ["POST", "/v1/contacts", "Create a contact", "contacts:write"],
                ["POST", "/v1/messages", "Send a message", "messages:write"],
                ["GET", "/v1/conversations", "List conversations", "messages:read"],
                ["POST", "/v1/campaigns", "Create a campaign", "campaigns:write"],
                ["POST", "/v1/deals", "Create a deal", "deals:write"],
                ["POST", "/v1/workflows/:id/run", "Trigger a workflow", "workflows:run"],
              ].map(([m, p, d, s]) => (
                <TableRow key={p}>
                  <TableCell>
                    <Badge variant={m === "GET" ? "secondary" : "default"}>{m}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p}</TableCell>
                  <TableCell className="text-sm">{d}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{s}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
