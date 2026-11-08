/**
 * Super Admin — WhatsApp platform control plane.
 *
 * Cross-tenant view of WhatsApp Business accounts, template health, QR device
 * sessions, and 24h delivery health. Read-only by design: credentials are never
 * returned by the server function, only whether each one is configured.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle, CheckCircle2, KeyRound, MessageSquare, RefreshCw, Search, Send, Smartphone, ShieldAlert,
} from "lucide-react";

import { getWhatsAppPlatform } from "@/lib/admin/platform-modules.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

const STATUS_TONE: Record<string, string> = {
  connected: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  disconnected: "bg-muted text-muted-foreground border-border",
  error: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  suspended: "bg-rose-500/10 text-rose-600 border-rose-500/20",
};

function when(iso: string | null) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function WhatsAppPlatformConsole() {
  const fetchPlatform = useServerFn(getWhatsAppPlatform);
  const [search, setSearch] = React.useState("");

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["admin", "whatsapp-platform"],
    queryFn: () => fetchPlatform(),
    staleTime: 30_000,
  });

  const accounts = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data?.accounts ?? [];
    return (data?.accounts ?? []).filter((a) =>
      [a.display_name, a.phone_number, a.waba_id, a.workspace_name].some((v) =>
        (v ?? "").toLowerCase().includes(q),
      ),
    );
  }, [data?.accounts, search]);

  if (error) {
    return (
      <Card className="border-destructive/30">
        <CardContent className="p-6 text-sm">
          <div className="flex items-center gap-2 text-destructive font-medium">
            <AlertTriangle className="w-4 h-4" /> Could not load WhatsApp platform data
          </div>
          <p className="text-muted-foreground mt-1">{(error as Error).message}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const k = data?.kpis;
  const delivery = k?.delivery24h;
  const deliveryRate =
    delivery && delivery.total > 0 ? Math.round((delivery.sent / delivery.total) * 100) : null;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Kpi label="Business accounts" value={isLoading ? null : String(k?.accounts ?? 0)} icon={MessageSquare} hint={`${k?.connected ?? 0} connected`} />
        <Kpi label="Degraded connections" value={isLoading ? null : String(k?.degraded ?? 0)} icon={AlertTriangle} tone="text-amber-600" hint={`${k?.pending ?? 0} awaiting setup`} />
        <Kpi label="Live QR devices" value={isLoading ? null : String(k?.liveSessions ?? 0)} icon={Smartphone} tone="text-sky-600" />
        <Kpi
          label="24h delivery rate"
          value={isLoading ? null : deliveryRate === null ? "—" : `${deliveryRate}%`}
          icon={Send}
          tone={deliveryRate !== null && deliveryRate < 90 ? "text-rose-600" : "text-emerald-600"}
          hint={delivery ? `${delivery.failed} failed · ${delivery.queued} queued` : undefined}
        />
      </div>

      {!isLoading && (k?.misconfigured ?? 0) > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 flex items-start gap-3 text-sm">
            <ShieldAlert className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">
                {k?.misconfigured} account{k?.misconfigured === 1 ? "" : "s"} missing webhook credentials
              </div>
              <p className="text-muted-foreground mt-0.5">
                Accounts without an access token or verify token cannot receive webhooks. Inbound messages and
                delivery receipts for those tenants will be silently dropped.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="accounts">
        <div className="flex flex-wrap items-center gap-2">
          <TabsList>
            <TabsTrigger value="accounts">Business accounts</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="devices">QR devices</TabsTrigger>
          </TabsList>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search number, WABA ID, or workspace"
              className="pl-8"
            />
          </div>
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh">
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <TabsContent value="accounts" className="mt-4 space-y-3">
          {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}

          {!isLoading && accounts.length === 0 && (
            <EmptyRow message={
              data?.accounts.length
                ? "No accounts match your search."
                : "No WhatsApp Business accounts have been connected by any tenant yet."
            } />
          )}

          {accounts.map((a) => (
            <Card key={a.id}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{a.display_name ?? a.phone_number ?? "Unnamed account"}</span>
                      <Badge variant="outline" className={STATUS_TONE[a.status] ?? ""}>
                        {a.status}
                      </Badge>
                      <Badge variant="secondary" className="text-[11px]">{a.provider}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 space-x-2">
                      <span>{a.workspace_name}</span>
                      {a.phone_number && <span>· {a.phone_number}</span>}
                      {a.waba_id && <span>· WABA {a.waba_id}</span>}
                      <span>· verified {when(a.last_verified_at)}</span>
                    </div>
                    {a.status_reason && (
                      <div className="text-xs text-rose-600 mt-1">{a.status_reason}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <CredentialPill ok={a.has_access_token} label="Access token" />
                    <CredentialPill ok={a.has_app_secret} label="App secret" />
                    <CredentialPill ok={a.has_verify_token} label="Verify token" />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  <span>{a.templates.total} templates</span>
                  <span className="text-emerald-600">{a.templates.approved} approved</span>
                  <span className="text-amber-600">{a.templates.pending} pending</span>
                  <span className="text-rose-600">{a.templates.rejected} rejected</span>
                  <span>Signature: {a.webhook_signature_algo ?? "sha256"}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Template approval health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <>
                  <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 text-sm">
                    <Stat label="Total" value={k?.templates.total ?? 0} />
                    <Stat label="Approved" value={k?.templates.approved ?? 0} tone="text-emerald-600" />
                    <Stat label="Pending review" value={k?.templates.pending ?? 0} tone="text-amber-600" />
                    <Stat label="Rejected" value={k?.templates.rejected ?? 0} tone="text-rose-600" />
                  </div>
                  {(k?.templates.total ?? 0) > 0 && (
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                        <span>Approval rate</span>
                        <span>
                          {Math.round(((k?.templates.approved ?? 0) / (k?.templates.total || 1)) * 100)}%
                        </span>
                      </div>
                      <Progress value={((k?.templates.approved ?? 0) / (k?.templates.total || 1)) * 100} />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {accounts
                      .filter((a) => a.templates.total > 0)
                      .map((a) => (
                        <div key={a.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                          <span className="truncate">{a.display_name ?? a.phone_number} · {a.workspace_name}</span>
                          <span className="text-xs text-muted-foreground shrink-0 ml-3">
                            {a.templates.approved}/{a.templates.total} approved
                          </span>
                        </div>
                      ))}
                    {accounts.every((a) => a.templates.total === 0) && (
                      <p className="text-sm text-muted-foreground">No message templates have been registered yet.</p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="devices" className="mt-4 space-y-2">
          {isLoading && <Skeleton className="h-24 w-full" />}
          {!isLoading && (data?.sessions.length ?? 0) === 0 && (
            <EmptyRow message="No QR device sessions have been created." />
          )}
          {(data?.sessions ?? []).map((s) => (
            <Card key={s.id}>
              <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-6 h-6 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">
                      {s.display_name ?? s.phone_number ?? "Unpaired device"}
                    </span>
                    <Badge variant="outline" className={STATUS_TONE[s.status] ?? ""}>{s.status}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {s.workspace_name} · {s.device_platform ?? "unknown platform"} · last seen {when(s.last_seen_at)}
                  </div>
                  {s.error_message && <div className="text-xs text-rose-600 mt-1">{s.error_message}</div>}
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  {s.connected_at ? `Connected ${when(s.connected_at)}` : `Created ${when(s.created_at)}`}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CredentialPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${ok ? "text-emerald-600" : "text-muted-foreground"}`}>
      {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <KeyRound className="w-3.5 h-3.5" />}
      {label}
    </span>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold  ${tone ?? ""}`}>{value}</div>
    </div>
  );
}

function EmptyRow({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="p-10 text-center text-sm text-muted-foreground">{message}</CardContent>
    </Card>
  );
}

function Kpi({
  label, value, icon: Icon, tone, hint,
}: {
  label: string;
  value: string | null;
  icon: React.ComponentType<{ className?: string }>;
  tone?: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className={`w-4 h-4 ${tone ?? "text-muted-foreground"}`} />
        </div>
        {value === null ? (
          <Skeleton className="h-7 w-16 mt-2" />
        ) : (
          <div className="text-2xl font-semibold mt-1 ">{value}</div>
        )}
        {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}
