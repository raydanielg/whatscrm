import { BRAND_NAME } from "@/lib/branding/brand";
import { useBrandName } from "@/hooks/use-brand-name";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Mail,
  MessageSquare,
  RefreshCw,
  Search,
} from "lucide-react";
import { AdminPageShell } from "@/components/admin/admin-page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { listSystemTemplates } from "@/lib/admin/communications.functions";

export const Route = createFileRoute("/_authenticated/_super-admin/admin/template-preview")({
  head: () => ({
    meta: [{ title: "Super Admin — Template Preview" }, { name: "robots", content: "noindex" }],
  }),
  component: TemplatePreviewPage,
});

/** Sample values for common template placeholders (${BRAND_NAME} brand). */
const SAMPLE_VARS: Record<string, string> = {
  brand: `${BRAND_NAME}`,
  brand_name: `${BRAND_NAME}`,
  app_name: `${BRAND_NAME}`,
  product: `${BRAND_NAME}`,
  company: `${BRAND_NAME}`,
  first_name: "Alex",
  last_name: "Rivera",
  name: "Alex Rivera",
  user_name: "Alex Rivera",
  email: "alex@example.com",
  support_email: "support@wacrm.app",
  sales_email: "sales@wacrm.com",
  workspace: "Acme Retail",
  workspace_name: "Acme Retail",
  organization: "Acme Retail",
  agent_name: "Jordan Lee",
  invite_link: "https://app.wacrm.app/accept-invite?token=demo",
  reset_link: "https://app.wacrm.app/auth/reset?token=demo",
  verify_link: "https://app.wacrm.app/auth/verify?token=demo",
  action_url: "https://app.wacrm.app",
  dashboard_url: "https://app.wacrm.app",
  amount: "USD 129.00",
  invoice_number: "INV-2026-0142",
  due_date: "August 12, 2026",
  appointment_time: "Thursday, July 23 · 2:30 PM",
  code: "428193",
  otp: "428193",
  year: String(new Date().getFullYear()),
};

// Retired product names. This flags stale branding still stored in DB
// notification templates, so it must match the OLD names, never "WACRM".
const LEGACY_BRAND = /wadiff|swiffer/gi;

interface TemplateRow {
  id: string;
  code: string;
  channel: "in_app" | "email" | "whatsapp" | "sms";
  subject: string | null;
  body: string;
  translations: Record<string, { subject?: string; body?: string }> | null;
  variables: string[] | null;
  enabled: boolean;
  updated_at: string;
}

function render(source: string, sampleVars: Record<string, string>): string {
  return source.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const v = sampleVars[key];
    return v ?? `{{${key}}}`;
  });
}

function highlight(text: string): { html: string; hits: number } {
  let hits = 0;
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = escaped.replace(LEGACY_BRAND, (m) => {
    hits += 1;
    return `<mark class="bg-destructive/20 text-destructive rounded-control px-0.5">${m}</mark>`;
  });
  return { html, hits };
}

function channelIcon(ch: string) {
  if (ch === "email") return <Mail className="h-3.5 w-3.5" />;
  return <MessageSquare className="h-3.5 w-3.5" />;
}

function TemplatePreviewPage() {
  const brandName = useBrandName();
  const sampleVars = useMemo(
    () => ({
      ...SAMPLE_VARS,
      brand: brandName,
      brand_name: brandName,
      app_name: brandName,
      product: brandName,
      company: brandName,
    }),
    [brandName],
  );
  const list = useServerFn(listSystemTemplates);
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["admin", "template-preview"],
    queryFn: () => list() as Promise<TemplateRow[]>,
  });

  const [query, setQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("all");

  const rows = data ?? [];

  const enriched = useMemo(() => {
    return rows.map((t) => {
      const subject = render(t.subject ?? "", sampleVars);
      const body = render(t.body ?? "", sampleVars);
      const s = highlight(subject);
      const b = highlight(body);
      const translationHits = Object.values(t.translations ?? {}).reduce((acc, tr) => {
        const trSubj = highlight(render(tr?.subject ?? "")).hits;
        const trBody = highlight(render(tr?.body ?? "")).hits;
        return acc + trSubj + trBody;
      }, 0);
      const hits = s.hits + b.hits + translationHits;
      return { t, subject, body, subjectHtml: s.html, bodyHtml: b.html, hits };
    });
  }, [rows, sampleVars]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched.filter(({ t }) => {
      if (channelFilter !== "all" && t.channel !== channelFilter) return false;
      if (!q) return true;
      return (
        t.code.toLowerCase().includes(q) ||
        (t.subject ?? "").toLowerCase().includes(q) ||
        t.body.toLowerCase().includes(q)
      );
    });
  }, [enriched, query, channelFilter]);

  const totalHits = enriched.reduce((n, e) => n + e.hits, 0);
  const dirtyCount = enriched.filter((e) => e.hits > 0).length;
  const disabledCount = rows.filter((r) => !r.enabled).length;

  return (
    <AdminPageShell
      title="Template Preview"
      description="Render every system template with sample data and flag legacy branding."
      actions={
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Regenerate
        </Button>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Stat label="Templates" value={rows.length} />
        <Stat label="Rendered clean" value={rows.length - dirtyCount} tone="success" />
        <Stat
          label="Legacy branding hits"
          value={totalHits}
          tone={totalHits > 0 ? "danger" : "success"}
        />
        <Stat label="Disabled" value={disabledCount} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by code, subject, body"
            className="pl-8 h-9"
          />
        </div>
        <Tabs value={channelFilter} onValueChange={setChannelFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="email">Email</TabsTrigger>
            <TabsTrigger value="in_app">In-app</TabsTrigger>
            <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
            <TabsTrigger value="sms">SMS</TabsTrigger>
          </TabsList>
          <TabsContent value={channelFilter} />
        </Tabs>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading templates</div>
      ) : error ? (
        <div className="text-sm text-destructive">Failed to load: {(error as Error).message}</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No templates match the current filters.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(({ t, subjectHtml, bodyHtml, hits }) => (
            <Card key={t.id} className={hits > 0 ? "border-destructive/40" : undefined}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-mono">{t.code}</CardTitle>
                    <Badge variant="secondary" className="gap-1">
                      {channelIcon(t.channel)}
                      {t.channel}
                    </Badge>
                    {!t.enabled && <Badge variant="outline">Disabled</Badge>}
                    {t.translations && Object.keys(t.translations).length > 0 && (
                      <Badge variant="outline">
                        {Object.keys(t.translations).length} translations
                      </Badge>
                    )}
                  </div>
                  {hits > 0 ? (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {hits} legacy brand hit{hits === 1 ? "" : "s"}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1 text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" />
                      Clean
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {t.subject && (
                  <div>
                    <div className="text-[11px] uppercase text-muted-foreground mb-0.5 flex items-center gap-1">
                      <Eye className="h-3 w-3" /> Subject
                    </div>
                    <div
                      className="text-sm font-medium"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(subjectHtml) }}
                    />
                  </div>
                )}
                <div>
                  <div className="text-[11px] uppercase text-muted-foreground mb-0.5">Body</div>
                  <pre
                    className="whitespace-pre-wrap text-sm font-sans leading-relaxed rounded-control border bg-muted/30 p-3"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(bodyHtml) }}
                  />
                </div>
                {t.variables && t.variables.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {t.variables.map((v) => (
                      <Badge key={v} variant="outline" className="font-mono text-[11px]">
                        {`{{${v}}}`}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AdminPageShell>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "text-destructive"
      : tone === "success"
        ? "text-emerald-600"
        : "text-foreground";
  return (
    <Card>
      <CardContent className="py-3">
        <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
        <div className={`text-2xl font-semibold font-display ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
