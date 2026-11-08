/**
 * WhatsApp integration status panel.
 *
 * One-glance answer to "is WhatsApp actually working right now?":
 *   · every connected WhatsApp Cloud account (number, WABA, phone number id)
 *   · when the last webhook envelope was received per account
 *   · a rollup of the live health checks (token, permissions, subscription,
 *     callback URL) with the number of failing probes
 *
 * Detail lives in the panels below it — this one is the summary header.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  HelpCircle,
  Inbox,
  Loader2,
  Phone,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useWhatsAppHealth } from "@/hooks/use-whatsapp-health";
import { listChannelAccounts } from "@/lib/messaging/accounts.functions";
import { getWhatsAppWebhookStats, type WebhookAccountStats } from "@/lib/messaging/webhook-stats.functions";
import type { HealthStatus } from "@/lib/messaging/health.functions";

type AccountRow = {
  id: string;
  display_name: string | null;
  phone_number: string | null;
  phone_number_id: string | null;
  waba_id: string | null;
  status: string | null;
  status_reason: string | null;
  is_default: boolean | null;
  last_verified_at: string | null;
};

const STATUS_META: Record<HealthStatus, { icon: typeof CheckCircle2; className: string; label: string }> = {
  ok: { icon: CheckCircle2, className: "text-emerald-600", label: "Healthy" },
  warn: { icon: AlertTriangle, className: "text-amber-600", label: "Needs attention" },
  error: { icon: XCircle, className: "text-destructive", label: "Action required" },
  unknown: { icon: HelpCircle, className: "text-muted-foreground", label: "Unknown" },
};

function relative(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return { rel: formatDistanceToNow(d, { addSuffix: true }), abs: d.toLocaleString() };
}

export function WhatsAppIntegrationStatus() {
  const { data: workspace } = useCurrentWorkspace();
  const workspaceId = workspace?.id;

  const listFn = useServerFn(listChannelAccounts);
  const statsFn = useServerFn(getWhatsAppWebhookStats);

  const accountsQuery = useQuery({
    queryKey: ["channel-accounts", workspaceId],
    queryFn: () => listFn({ data: { workspaceId: workspaceId! } }),
    enabled: Boolean(workspaceId),
  });

  const statsQuery = useQuery({
    queryKey: ["whatsapp-webhook-stats", workspaceId],
    queryFn: () => statsFn({ data: { workspaceId: workspaceId! } }),
    enabled: Boolean(workspaceId),
    refetchInterval: 60_000,
  });

  const health = useWhatsAppHealth();

  const accounts = useMemo(
    () =>
      ((accountsQuery.data?.accounts ?? []) as unknown as AccountRow[]).filter(
        (a) => a.phone_number_id || a.waba_id,
      ),
    [accountsQuery.data],
  );

  const statsByAccount = useMemo(() => {
    const map = new Map<string, WebhookAccountStats>();
    for (const s of statsQuery.data?.accounts ?? []) map.set(s.channel_account_id, s);
    return map;
  }, [statsQuery.data]);

  const healthByAccount = useMemo(() => {
    const map = new Map<string, { status: HealthStatus; failing: number; firstProblem?: string }>();
    for (const a of health.data?.accounts ?? []) {
      const failing = a.checks.filter((c) => c.status === "error" || c.status === "warn");
      map.set(a.channelAccountId, {
        status: a.status,
        failing: failing.length,
        firstProblem: failing[0] ? `${failing[0].label}: ${failing[0].detail}` : undefined,
      });
    }
    return map;
  }, [health.data]);

  const lastWebhookOverall = useMemo(() => {
    let latest: string | null = null;
    for (const s of statsQuery.data?.accounts ?? []) {
      if (s.last_received_at && (!latest || s.last_received_at > latest)) latest = s.last_received_at;
    }
    return latest;
  }, [statsQuery.data]);

  const callbackUrl =
    health.data?.callbackUrl ??
    (typeof window !== "undefined" ? `${window.location.origin}/api/public/webhooks/whatsapp` : "");

  const loading = accountsQuery.isLoading || statsQuery.isLoading;
  const refreshing = accountsQuery.isFetching || statsQuery.isFetching || health.isFetching;
  const overall = health.data?.status ?? "unknown";
  const OverallIcon = STATUS_META[overall].icon;
  const lastSeen = relative(lastWebhookOverall);

  const refreshAll = () => {
    void Promise.all([accountsQuery.refetch(), statsQuery.refetch(), health.refetch()]).then(() =>
      toast.success("WhatsApp status refreshed"),
    );
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-medium text-sm flex items-center gap-2">
            <Phone className="w-4 h-4" /> Integration status
          </h3>
          <p className="text-xs text-muted-foreground">
            Connected WhatsApp Cloud accounts, the last webhook received, and the current health rollup.
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={refreshAll} disabled={refreshing || !workspaceId}>
          {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </Button>
      </div>

      <Card className="rounded">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex flex-wrap items-center gap-2">
            <OverallIcon className={`w-4 h-4 ${STATUS_META[overall].className}`} />
            {accounts.length} account{accounts.length === 1 ? "" : "s"} connected
            <Badge
              variant={overall === "error" ? "destructive" : overall === "ok" ? "outline" : "secondary"}
              className="text-[11px]"
            >
              {health.isFetching && !health.data ? "Checking" : STATUS_META[overall].label}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-0.5">
              <p className="text-[11px] uppercase text-muted-foreground">Last webhook received</p>
              <p className="text-sm font-medium">
                {lastSeen ? lastSeen.rel : "Never"}
              </p>
              <p className="text-xs text-muted-foreground">
                {lastSeen ? lastSeen.abs : "Meta has not delivered a single envelope to this workspace yet."}
              </p>
            </div>
            <div className="space-y-0.5 min-w-0">
              <p className="text-[11px] uppercase text-muted-foreground">Callback URL</p>
              <div className="flex items-start gap-1.5">
                <code className="text-xs break-all">{callbackUrl}</code>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 shrink-0"
                  aria-label="Copy callback URL"
                  onClick={() => {
                    void navigator.clipboard.writeText(callbackUrl);
                    toast.success("Callback URL copied");
                  }}
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : accounts.length === 0 ? (
            <Alert>
              <HelpCircle className="w-4 h-4" />
              <AlertTitle>No WhatsApp accounts connected</AlertTitle>
              <AlertDescription>
                Connect a WhatsApp Cloud account with the setup wizard to start receiving messages.
              </AlertDescription>
            </Alert>
          ) : (
            <ul className="divide-y divide-border/60">
              {accounts.map((a) => {
                const s = statsByAccount.get(a.id);
                const h = healthByAccount.get(a.id);
                const hs = h?.status ?? "unknown";
                const HIcon = STATUS_META[hs].icon;
                const seen = relative(s?.last_received_at ?? null);
                return (
                  <li key={a.id} className="py-3 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <HIcon className={`w-3.5 h-3.5 ${STATUS_META[hs].className}`} />
                      <span className="text-sm font-medium">{a.display_name ?? "WhatsApp account"}</span>
                      {a.phone_number && (
                        <span className="text-xs text-muted-foreground">{a.phone_number}</span>
                      )}
                      <Badge
                        variant={a.status === "connected" ? "outline" : "secondary"}
                        className="text-[11px] capitalize"
                      >
                        {a.status ?? "unknown"}
                      </Badge>
                      {a.is_default && <Badge variant="secondary" className="text-[11px]">Default</Badge>}
                      {h && h.failing > 0 && (
                        <Badge variant={hs === "error" ? "destructive" : "secondary"} className="text-[11px]">
                          {h.failing} check{h.failing === 1 ? "" : "s"} failing
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Inbox className="w-3 h-3" />
                        Last webhook: {seen ? `${seen.rel} (${seen.abs})` : "never"}
                      </span>
                      <span>
                        7d envelopes: {s?.total ?? 0} · processed {s?.processed ?? 0} · failed {s?.failed ?? 0}
                        {s?.signature_invalid ? ` · bad signature ${s.signature_invalid}` : ""}
                      </span>
                      {a.phone_number_id && <span>Phone ID: {a.phone_number_id}</span>}
                      {a.waba_id && <span>WABA: {a.waba_id}</span>}
                    </div>

                    {h?.firstProblem && (
                      <p className="text-xs text-foreground/80 break-words">{h.firstProblem}</p>
                    )}
                    {s?.last_error && (
                      <p className="text-xs text-destructive break-words">Last error: {s.last_error}</p>
                    )}
                    {a.status_reason && (
                      <p className="text-xs text-muted-foreground break-words">{a.status_reason}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
