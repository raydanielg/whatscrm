import { BRAND_NAME } from "@/lib/branding/brand";
import { requireOrgRole } from "@/lib/rbac";
import { AppTopbar } from "@/components/app/app-topbar";
import { DeveloperOrgSwitcher } from "@/components/app/developer/developer-org-switcher";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getSecurityOverview,
  listIpRules,
  upsertIpRule,
  deleteIpRule,
  getCorsConfig,
  saveCorsConfig,
  listSecurityEvents,
  listAuditLogs,
  type SecurityEventRow,
  type AuditLogRow,
  rotateApiKeySecurity,
  listAbuseSignals,
} from "@/lib/api/security.functions";
import { listApiKeys } from "@/lib/developer/api-keys.functions";
import { useResolvedOrgId } from "@/hooks/use-organization";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
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
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Fingerprint,
  KeyRound,
  Globe,
  ScrollText,
  Ban,
  Plus,
  Trash2,
  RefreshCw,
  Copy,
  AlertTriangle,
  Activity,
  Gauge,
  Webhook,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/developer/api-security")({
  beforeLoad: requireOrgRole("owner", "admin"),
  staticData: { breadcrumb: "API Security" },
  head: () => ({
    meta: [
      { title: `API Security — ${BRAND_NAME}` },
      {
        name: "description",
        content:
          "Rate limits, IP rules, signatures, CORS, audit logs, and OWASP-aligned protections for the API.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ApiSecurityPage,
});

function ApiSecurityPage() {
  const overviewFn = useServerFn(getSecurityOverview);
  const { data: overview } = useQuery({
    queryKey: ["sec-overview"],
    queryFn: () => overviewFn({}),
  });

  return (
    <>
      <AppTopbar
        title="API Security"
        subtitle="IP allowlists, CORS, signing, and audit logs."
        actions={
          <div className="flex items-center gap-2">
            <DeveloperOrgSwitcher />
            <Badge variant="outline" className="text-xs">
              <ShieldCheck className="h-3 w-3 " /> Hardened
            </Badge>
          </div>
        }
      />
      <div className="container mx-auto px-4 md:px-6 py-8 space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            icon={<KeyRound className="h-4 w-4" />}
            label="Active keys"
            value={overview?.keys.active ?? 0}
            sublabel={`${overview?.keys.expiring_soon ?? 0} expiring soon`}
          />
          <MetricCard
            icon={<Globe className="h-4 w-4" />}
            label="IP rules"
            value={overview?.ip_rules.total ?? 0}
            sublabel={`${overview?.ip_rules.allow ?? 0} allow · ${overview?.ip_rules.deny ?? 0} deny`}
          />
          <MetricCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Alerts (7d)"
            value={overview?.alerts.total_7d ?? 0}
            sublabel={`${overview?.alerts.critical ?? 0} critical`}
            tone={(overview?.alerts.critical ?? 0) > 0 ? "destructive" : undefined}
          />
          <MetricCard
            icon={<Activity className="h-4 w-4" />}
            label="Rate-limit hits (24h)"
            value={overview?.abuse.rate_limited ?? 0}
            sublabel={`${overview?.abuse.unique_ips ?? 0} unique IPs`}
            tone={(overview?.abuse.rate_limited ?? 0) > 0 ? "destructive" : undefined}
          />
        </div>

        <Tabs defaultValue="rate-limits" className="space-y-4">
          <TabsList className="flex-wrap  ">
            <TabsTrigger value="rate-limits">Rate limits & Quotas</TabsTrigger>
            <TabsTrigger value="ip">IP rules</TabsTrigger>
            <TabsTrigger value="signing">Signing & Validation</TabsTrigger>
            <TabsTrigger value="cors">CORS & CSRF</TabsTrigger>
            <TabsTrigger value="encryption">Encryption</TabsTrigger>
            <TabsTrigger value="audit">Audit & Alerts</TabsTrigger>
            <TabsTrigger value="abuse">Abuse detection</TabsTrigger>
            <TabsTrigger value="keys">Key rotation</TabsTrigger>
          </TabsList>

          <TabsContent value="rate-limits" className="space-y-4">
            <RateLimitsPanel overview={overview} />
          </TabsContent>
          <TabsContent value="ip">
            <IpRulesPanel />
          </TabsContent>
          <TabsContent value="signing">
            <SigningPanel />
          </TabsContent>
          <TabsContent value="cors">
            <CorsPanel />
          </TabsContent>
          <TabsContent value="encryption">
            <EncryptionPanel />
          </TabsContent>
          <TabsContent value="audit">
            <AuditPanel />
          </TabsContent>
          <TabsContent value="abuse">
            <AbusePanel />
          </TabsContent>
          <TabsContent value="keys">
            <KeyRotationPanel />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

// -------- Rate limits & quotas --------

type Overview = Awaited<ReturnType<typeof getSecurityOverview>>;

function RateLimitsPanel({ overview }: { overview: Overview | undefined }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5" /> Gateway limiter
          </CardTitle>
          <CardDescription>
            Token-bucket, per-API-key + route. Backed by{" "}
            <code className="font-mono text-xs">rate_limit_buckets</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Default limit" value="600 req / minute" />
          <Row label="Burst" value="1200 req / minute" />
          <Row label="Response" value="429 rate_limited" />
          <Row label="Headers" value="X-RateLimit-Limit, -Remaining, -Reset" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>API quotas</CardTitle>
          <CardDescription>Per-billing-period usage vs plan entitlement.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(overview?.quotas ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              No quotas configured for this workspace.
            </p>
          )}
          {(overview?.quotas ?? []).map((q) => (
            <div key={q.meter} className="space-y-1">
              <div className="flex justify-between text-sm">
                <code className="font-mono">{q.meter}</code>
                <span className="text-muted-foreground">
                  {q.used.toLocaleString()} / {q.included.toLocaleString()}
                </span>
              </div>
              <Progress value={q.pct} className={q.pct > 90 ? "[&>div]:bg-destructive" : ""} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}

// -------- IP rules --------

function IpRulesPanel() {
  const list = useServerFn(listIpRules);
  const upsert = useServerFn(upsertIpRule);
  const del = useServerFn(deleteIpRule);
  const qc = useQueryClient();
  const { data: rules = [] } = useQuery({ queryKey: ["sec-ip-rules"], queryFn: () => list({}) });

  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [cidr, setCidr] = useState("");
  const [type, setType] = useState<"allow" | "deny">("allow");

  const saveMut = useMutation({
    mutationFn: () => upsert({ data: { label, cidr, applies_to: type, is_active: true } }),
    onSuccess: () => {
      toast.success("IP rule saved");
      setOpen(false);
      setLabel("");
      setCidr("");
      qc.invalidateQueries({ queryKey: ["sec-ip-rules"] });
      qc.invalidateQueries({ queryKey: ["sec-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["sec-ip-rules"] });
      qc.invalidateQueries({ queryKey: ["sec-overview"] });
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>IP allowlist &amp; blocklist</CardTitle>
          <CardDescription>
            CIDR ranges checked before every authenticated API call.
          </CardDescription>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 " /> Add rule
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New IP rule</DialogTitle>
              <DialogDescription>
                Allow rules take precedence over deny rules matching the same address.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Label</Label>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Office HQ"
                />
              </div>
              <div>
                <Label>CIDR / IP</Label>
                <Input
                  value={cidr}
                  onChange={(e) => setCidr(e.target.value)}
                  placeholder="203.0.113.0/24"
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as "allow" | "deny")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="allow">Allow</SelectItem>
                    <SelectItem value="deny">Deny (block)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => saveMut.mutate()}
                disabled={!label || !cidr || saveMut.isPending}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>CIDR</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground text-sm">
                  No IP rules. Requests from all IPs are accepted (subject to auth).
                </TableCell>
              </TableRow>
            )}
            {rules.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.label}</TableCell>
                <TableCell>
                  <code className="font-mono text-xs">{r.cidr}</code>
                </TableCell>
                <TableCell>
                  <Badge variant={r.applies_to === "deny" ? "destructive" : "secondary"}>
                    {r.applies_to === "deny" ? (
                      <Ban className="h-3 w-3 " />
                    ) : (
                      <ShieldCheck className="h-3 w-3 " />
                    )}
                    {r.applies_to}
                  </Badge>
                </TableCell>
                <TableCell>
                  {r.is_active ? <Badge>Active</Badge> : <Badge variant="outline">Disabled</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => delMut.mutate(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// -------- Signing --------

function SigningPanel() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Fingerprint className="h-5 w-5" /> Request signing
          </CardTitle>
          <CardDescription>Optional HMAC-SHA256 signature for high-value writes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>Attach these headers to each request:</p>
          <CodeBlock
            text={`X-WACRM-Timestamp: 1731523200
X-WACRM-Signature: sha256=<hex>

signature = HMAC_SHA256(secret, "\${timestamp}.\${method}.\${path}.\${body}")`}
          />
          <p className="text-muted-foreground text-xs">
            Rejected if <code>|now − timestamp|</code> &gt; 300s (replay protection). Constant-time
            comparison.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5" /> Webhook signature validation
          </CardTitle>
          <CardDescription>
            Verify inbound and outbound webhooks with a shared secret.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <CodeBlock
            text={`// Outbound (${BRAND_NAME} → your server)
Header: X-WACRM-Signature: t=<ts>,v1=<hex>

expected = HMAC_SHA256(endpoint_secret, "\${t}.\${raw_body}")
timingSafeEqual(v1, expected) === true`}
          />
          <p className="text-muted-foreground text-xs">
            Each endpoint has its own secret. Rotate from the Webhooks page — both old and new
            secrets are accepted for 24h.
          </p>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Request & response validation</CardTitle>
          <CardDescription>Zod schemas enforced on every endpoint.</CardDescription>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4 text-sm">
          <Check label="Request body validated with strict Zod schema" />
          <Check label="Query &amp; path params typed and length-bounded" />
          <Check label="Response body serialized through a whitelist schema (no PII leak)" />
          <Check label="Content-Type enforced application/json" />
          <Check label="Maximum body size 1 MB (429 payload_too_large)" />
          <Check label="Unknown fields rejected (mass-assignment protection, API6)" />
        </CardContent>
      </Card>
    </div>
  );
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function Check({ label }: { label: string }) {
  return (
    <div className="flex items-start gap-2">
      <ShieldCheck className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
      <span>{decodeEntities(label)}</span>
    </div>
  );
}

function CodeBlock({ text }: { text: string }) {
  return (
    <div className="relative">
      <pre className="bg-muted rounded-control p-3 text-xs font-mono overflow-auto whitespace-pre-wrap break-all">
        {text}
      </pre>
      <Button
        size="icon"
        variant="ghost"
        className="absolute top-1 right-1 h-7 w-7"
        onClick={() => {
          navigator.clipboard.writeText(text);
          toast.success("Copied");
        }}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// -------- CORS --------

function CorsPanel() {
  const getFn = useServerFn(getCorsConfig);
  const saveFn = useServerFn(saveCorsConfig);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["sec-cors"], queryFn: () => getFn({}) });

  const [origins, setOrigins] = useState("");
  const [methods, setMethods] = useState("");
  const [headers, setHeaders] = useState("");
  const [credentials, setCredentials] = useState(false);
  const [maxAge, setMaxAge] = useState(86400);

  // hydrate once
  useState(() => {
    if (data) {
      setOrigins(data.allowed_origins.join("\n"));
      setMethods(data.allowed_methods.join(", "));
      setHeaders(data.allowed_headers.join(", "));
      setCredentials(data.allow_credentials);
      setMaxAge(data.max_age_seconds);
    }
    return null;
  });

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          allowed_origins: origins
            .split(/\n+/)
            .map((s) => s.trim())
            .filter(Boolean),
          allowed_methods: methods
            .split(",")
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean),
          allowed_headers: headers
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          allow_credentials: credentials,
          max_age_seconds: maxAge,
        },
      }),
    onSuccess: () => {
      toast.success("CORS saved");
      qc.invalidateQueries({ queryKey: ["sec-cors"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>CORS configuration</CardTitle>
          <CardDescription>
            Cross-origin rules for the public API. Applied at the gateway.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Allowed origins</Label>
            <Textarea
              placeholder={"https://app.example.com\nhttps://admin.example.com"}
              value={origins}
              onChange={(e) => setOrigins(e.target.value)}
              rows={4}
            />
            <p className="text-xs text-muted-foreground mt-1">
              One per line. Use <code>*</code> for public API (only when credentials off).
            </p>
          </div>
          <div>
            <Label>Methods</Label>
            <Input value={methods} onChange={(e) => setMethods(e.target.value)} />
          </div>
          <div>
            <Label>Allowed headers</Label>
            <Input value={headers} onChange={(e) => setHeaders(e.target.value)} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Allow credentials</Label>
              <p className="text-xs text-muted-foreground">
                Send cookies / Authorization from the browser.
              </p>
            </div>
            <Switch checked={credentials} onCheckedChange={setCredentials} />
          </div>
          <div>
            <Label>Preflight max-age (seconds)</Label>
            <Input
              type="number"
              value={maxAge}
              onChange={(e) => setMaxAge(Number(e.target.value))}
            />
          </div>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save CORS
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>CSRF protection</CardTitle>
          <CardDescription>Applied automatically to browser-cookie sessions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Check label="Session cookies set <code>SameSite=Lax; Secure; HttpOnly</code>" />
          <Check label="Double-submit token on state-changing form posts" />
          <Check label="Origin &amp; Referer headers verified on POST/PATCH/DELETE" />
          <Check label="Bearer-token APIs are exempt (no ambient credentials)" />
          <Check label="Preflight required for <code>content-type: application/json</code>" />
        </CardContent>
      </Card>
    </div>
  );
}

// -------- Encryption --------

function EncryptionPanel() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" /> In transit
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Check label="TLS 1.3 enforced on all API endpoints" />
          <Check label="HSTS: <code>max-age=63072000; includeSubDomains; preload</code>" />
          <Check label="Modern cipher suites only (AEAD, forward secrecy)" />
          <Check label="HTTP → HTTPS 301 with no downgrade path" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" /> At rest
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Check label="AES-256 encryption on all database volumes" />
          <Check label="Secrets sealed with envelope encryption (KMS-managed DEK)" />
          <Check label="API keys stored as SHA-256 hashes — never the plaintext" />
          <Check label="Webhook secrets stored hashed with a public prefix for identification" />
          <Check label="Backups encrypted with a separate key ring" />
        </CardContent>
      </Card>
    </div>
  );
}

// -------- Audit + Alerts --------

function AuditPanel() {
  const formatZoned = useZonedDateFormatter();
  const eventsFn = useServerFn(listSecurityEvents);
  const auditFn = useServerFn(listAuditLogs);
  const [severity, setSeverity] = useState<string>("all");
  const { data: eventsData } = useQuery({
    queryKey: ["sec-events", severity],
    queryFn: () =>
      eventsFn({ data: { severity: severity === "all" ? undefined : severity, limit: 100 } }),
  });
  const { data: auditData } = useQuery({
    queryKey: ["sec-audit"],
    queryFn: () => auditFn({ data: { limit: 100 } }),
  });
  const events: SecurityEventRow[] = Array.isArray(eventsData)
    ? (eventsData as SecurityEventRow[])
    : [];
  const audit: AuditLogRow[] = Array.isArray(auditData) ? (auditData as AuditLogRow[]) : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Security alerts
            </CardTitle>
            <CardDescription>
              Signals produced by the gateway, auth service, and anomaly detectors.
            </CardDescription>
          </div>
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Resource</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-sm">
                    No security events recorded.
                  </TableCell>
                </TableRow>
              )}
              {events.map((e) => (
                <TableRow key={String(e.id)}>
                  <TableCell className="text-xs">
                    {formatZoned(new Date(String(e.created_at)), {
                      dateStyle: "short",
                      timeStyle: "medium",
                    })}
                  </TableCell>
                  <TableCell>
                    <SeverityBadge sev={String(e.severity ?? "low")} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{String(e.event_type ?? "")}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {e.ip_address ? String(e.ip_address) : "—"}
                  </TableCell>
                  <TableCell className="text-xs">{String(e.resource_type ?? "—")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5" /> Audit trail
          </CardTitle>
          <CardDescription>
            Immutable log of every privileged action. Kept 400 days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audit.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-sm">
                    No audit entries yet.
                  </TableCell>
                </TableRow>
              )}
              {audit.map((a) => (
                <TableRow key={String(a.id)}>
                  <TableCell className="text-xs">
                    {formatZoned(new Date(String(a.created_at)), {
                      dateStyle: "short",
                      timeStyle: "medium",
                    })}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{String(a.action ?? "")}</TableCell>
                  <TableCell className="text-xs">
                    {String(a.resource_type ?? "")}{" "}
                    {a.resource_id ? (
                      <span className="text-muted-foreground">
                        / {String(a.resource_id).slice(0, 8)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {a.actor_id ? String(a.actor_id).slice(0, 8) + "" : "system"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {a.ip_address ? String(a.ip_address) : "—"}
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

function SeverityBadge({ sev }: { sev: string }) {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    critical: "destructive",
    high: "destructive",
    medium: "default",
    low: "secondary",
  };
  return <Badge variant={map[sev] ?? "outline"}>{sev}</Badge>;
}

// -------- Abuse --------

function AbusePanel() {
  const fn = useServerFn(listAbuseSignals);
  const { data } = useQuery({ queryKey: ["sec-abuse"], queryFn: () => fn({}) });

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <AbuseList
        title="Top offending IPs"
        icon={<Globe className="h-4 w-4" />}
        rows={data?.top_ips ?? []}
      />
      <AbuseList
        title="Most-hit failing paths"
        icon={<ShieldAlert className="h-4 w-4" />}
        rows={data?.top_paths ?? []}
      />
      <AbuseList
        title="Keys with most errors"
        icon={<KeyRound className="h-4 w-4" />}
        rows={data?.top_keys ?? []}
      />
    </div>
  );
}

function AbuseList({
  title,
  icon,
  rows,
}: {
  title: string;
  icon: React.ReactNode;
  rows: Array<{ key: string; count: number }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing suspicious in the last 24h.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.key} className="flex justify-between text-sm gap-2">
                <code className="font-mono text-xs truncate">{r.key}</code>
                <Badge variant="destructive">{r.count}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// -------- Key rotation --------

function KeyRotationPanel() {
  const formatZoned = useZonedDateFormatter();
  const { organizationId } = useResolvedOrgId();
  const keysFn = useServerFn(listApiKeys);
  const rotateFn = useServerFn(rotateApiKeySecurity);
  const qc = useQueryClient();
  const { data: keysData } = useQuery({
    queryKey: ["sec-api-keys", organizationId],
    enabled: !!organizationId,
    queryFn: () => keysFn({ data: { organizationId: organizationId! } }),
  });
  const keys = Array.isArray(keysData) ? [] : (keysData?.keys ?? []);
  const [revealed, setRevealed] = useState<string | null>(null);

  const rotate = useMutation({
    mutationFn: (id: string) => rotateFn({ data: { id } }),
    onSuccess: (res) => {
      setRevealed(res.secret);
      toast.success("Key rotated. Old key expires in 24 hours.");
      qc.invalidateQueries({ queryKey: ["sec-api-keys"] });
      qc.invalidateQueries({ queryKey: ["sec-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" /> API key rotation
        </CardTitle>
        <CardDescription>
          Create a new secret without downtime — old key stays valid for 24h.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {revealed && (
          <div className="mb-4 rounded-control border border-primary/40 bg-primary/5 p-3">
            <p className="text-sm font-medium mb-2">
              New key — copy it now, it will not be shown again:
            </p>
            <CodeBlock text={revealed} />
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Prefix</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-sm">
                  No API keys yet.
                </TableCell>
              </TableRow>
            )}
            {keys.map((k) => (
              <TableRow key={k.id}>
                <TableCell>{k.name}</TableCell>
                <TableCell>
                  <code className="font-mono text-xs">{k.prefix}</code>
                </TableCell>
                <TableCell>
                  {k.revoked_at ? (
                    <Badge variant="destructive">Revoked</Badge>
                  ) : (
                    <Badge>Active</Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {k.last_used_at
                    ? formatZoned(new Date(k.last_used_at), {
                        dateStyle: "short",
                        timeStyle: "medium",
                      })
                    : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!k.revoked_at || rotate.isPending}
                    onClick={() => rotate.mutate(k.id)}
                  >
                    <RefreshCw className="h-3.5 w-3.5 " /> Rotate
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// -------- shared --------

function MetricCard({
  icon,
  label,
  value,
  sublabel,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sublabel?: string;
  tone?: "destructive";
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          {icon}
          {label}
        </div>
        <div
          className={`mt-2 text-3xl font-semibold ${tone === "destructive" ? "text-destructive" : ""}`}
        >
          {value}
        </div>
        {sublabel && <div className="text-xs text-muted-foreground mt-1">{sublabel}</div>}
      </CardContent>
    </Card>
  );
}
