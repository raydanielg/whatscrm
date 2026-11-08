/**
 * WhatsApp webhook configuration & health.
 *
 * Shows the public callback URL that must be pasted into the Meta App
 * dashboard, the verify_token stored on each `channel_accounts` row, and
 * live counters from `webhook_events` so admins can confirm Meta is
 * actually delivering inbound envelopes into their workspace.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle, CheckCircle2, Copy, ExternalLink, KeyRound, Link2,
  Loader2, PlugZap, RefreshCw, ShieldCheck, Webhook,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useChannelAccounts, type ChannelAccountRow } from "@/hooks/use-channel-accounts";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import {
  getWhatsAppWebhookStats,
  testWhatsAppWebhook,
  type WebhookAccountStats,
  type WebhookTestResult,
} from "@/lib/messaging/webhook-stats.functions";

const WEBHOOK_PATH = "/api/public/webhooks/whatsapp";
const REQUIRED_FIELDS = [
  "messages",
  "message_template_status_update",
  "messaging_handovers",
  "account_update",
  "phone_number_quality_update",
];

function copy(value: string, label: string) {
  navigator.clipboard
    .writeText(value)
    .then(() => toast.success(`${label} copied`))
    .catch(() => toast.error("Copy failed"));
}

function CopyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
      </div>
      <div className="flex gap-2">
        <Input readOnly value={value} className="font-mono text-xs" />
        <Button variant="outline" size="sm" onClick={() => copy(value, label)} className="gap-1.5">
          <Copy className="w-3.5 h-3.5" /> Copy
        </Button>
      </div>
    </div>
  );
}

export function WhatsAppWebhookPanel() {
  const { data: workspace } = useCurrentWorkspace();
  const workspaceId = workspace?.id;
  const { data: accountsData, isLoading } = useChannelAccounts(workspaceId);
  const accounts = useMemo(
    () => ((accountsData?.accounts ?? []) as unknown as ChannelAccountRow[])
      .filter((a) => a.provider === "whatsapp_cloud"),
    [accountsData?.accounts],
  );

  const statsFn = useServerFn(getWhatsAppWebhookStats);
  const {
    data: statsData,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["whatsapp-webhook-stats", workspaceId],
    queryFn: () => statsFn({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
    refetchInterval: 30_000,
  });

  const statsByAccount = useMemo(() => {
    const m = new Map<string, WebhookAccountStats>();
    for (const s of statsData?.accounts ?? []) m.set(s.channel_account_id, s);
    return m;
  }, [statsData]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const webhookUrl = origin ? `${origin}${WEBHOOK_PATH}` : WEBHOOK_PATH;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-xl flex items-center gap-2">
            <Webhook className="w-5 h-5" /> WhatsApp Webhook Configuration
          </h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Point Meta at this URL so inbound WhatsApp messages, delivery
            receipts, and template updates sync into your workspace in
            real time. Signature verification uses each account's app
            secret; subscription challenges use its verify token.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
          {isFetching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Refresh
        </Button>
      </header>

      {/* -------- Shared callback URL -------- */}
      <section className="rounded-control border border-border bg-surface p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-primary" />
          <h3 className="font-medium text-sm">Callback URL</h3>
          <Badge variant="outline" className="text-[11px] uppercase tracking-wide">Shared</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Paste this URL into Meta &rarr; WhatsApp &rarr; Configuration &rarr; Webhook.
          The endpoint is public; each request is authenticated by HMAC
          signature and matched to a channel account via its verify token.
        </p>
        <CopyField label="Callback URL" value={webhookUrl} hint="POST + GET" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="text-xs space-y-1">
            <div className="font-medium">Required webhook fields</div>
            <ul className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-0.5">
              {REQUIRED_FIELDS.map((f) => (
                <li key={f} className="font-mono">• {f}</li>
              ))}
            </ul>
          </div>
          <div className="text-xs space-y-1">
            <div className="font-medium">Setup checklist</div>
            <ol className="text-muted-foreground list-decimal ml-4 space-y-0.5">
              <li>Open your Meta App &rarr; WhatsApp &rarr; Configuration.</li>
              <li>Paste the Callback URL and the account's Verify token.</li>
              <li>Subscribe to the fields listed on the left.</li>
              <li>Send a test message &mdash; counters below update within 30s.</li>
            </ol>
          </div>
        </div>
        <div>
          <a
            href="https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            Meta webhook setup guide <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </section>

      {/* -------- Per-account subscriptions -------- */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm">Account subscriptions</h3>
          {statsData ? (
            <span className="text-[11px] text-muted-foreground">
              Health window: last {statsData.windowDays} days
            </span>
          ) : null}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : accounts.length === 0 ? (
          <Alert>
            <AlertTriangle className="w-4 h-4" />
            <AlertTitle>No WhatsApp accounts connected</AlertTitle>
            <AlertDescription>
              Connect a WhatsApp Cloud account first &mdash; its verify token
              is what Meta uses to authenticate webhook subscriptions.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            {accounts.map((account) => (
              <AccountWebhookCard
                key={account.id}
                account={account}
                stats={statsByAccount.get(account.id) ?? null}
                webhookUrl={webhookUrl}
                workspaceId={workspaceId}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AccountWebhookCard({
  account,
  stats,
  webhookUrl,
  workspaceId,
}: {
  account: ChannelAccountRow;
  stats: WebhookAccountStats | null;
  webhookUrl: string;
  workspaceId?: string;
}) {
  const [showToken, setShowToken] = useState(false);
  const [testResult, setTestResult] = useState<WebhookTestResult | null>(null);
  const verifyToken = account.verify_token ?? "";
  const missingAppSecret = !account.app_secret_name;
  const missingVerifyToken = !verifyToken;

  const testFn = useServerFn(testWhatsAppWebhook);
  const testMutation = useMutation({
    mutationFn: () =>
      testFn({ data: { workspaceId: workspaceId!, channelAccountId: account.id } }),
    onSuccess: (result) => {
      setTestResult(result);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    },
    onError: (err: Error) => toast.error(err.message || "Webhook test failed"),
  });


  const lastReceived = stats?.last_received_at
    ? formatDistanceToNow(new Date(stats.last_received_at), { addSuffix: true })
    : "Never";

  const health: { label: string; className: string; icon: typeof CheckCircle2 } = (() => {
    if (missingAppSecret || missingVerifyToken) {
      return { label: "Not configured", className: "bg-warning/10 text-warning border-warning/30", icon: AlertTriangle };
    }
    if (!stats || stats.total === 0) {
      return { label: "Awaiting first event", className: "bg-muted text-muted-foreground border-border", icon: Loader2 };
    }
    if (stats.signature_invalid > 0 || stats.failed > 0) {
      return { label: "Delivery issues", className: "bg-destructive/10 text-destructive border-destructive/30", icon: AlertTriangle };
    }
    return { label: "Healthy", className: "bg-success/10 text-success border-success/30", icon: CheckCircle2 };
  })();

  return (
    <div className="rounded-control border border-border bg-surface p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-medium text-sm">{account.display_name}</div>
          <div className="text-xs text-muted-foreground font-mono">
            {account.phone_number ?? account.phone_number_id ?? "—"}
          </div>
        </div>
        <Badge variant="outline" className={`gap-1.5 ${health.className}`}>
          <health.icon className="w-3 h-3" /> {health.label}
        </Badge>
      </div>

      {missingAppSecret ? (
        <Alert variant="destructive" className="py-2">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription className="text-xs">
            No app secret configured — webhook signatures cannot be verified.
            Edit the account to set <span className="font-mono">app_secret_name</span>.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <KeyRound className="w-3 h-3" /> Verify token
          </div>
          <div className="flex gap-2">
            <Input
              readOnly
              type={showToken ? "text" : "password"}
              value={verifyToken || "— not set —"}
              className="font-mono text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowToken((v) => !v)}
              disabled={!verifyToken}
            >
              {showToken ? "Hide" : "Show"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copy(verifyToken, "Verify token")}
              disabled={!verifyToken}
            >
              <Copy className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> App secret
          </div>
          <Input
            readOnly
            value={account.app_secret_name ?? "— not configured —"}
            className="font-mono text-xs"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
        <Stat label="Events (7d)" value={stats?.total ?? 0} />
        <Stat label="Processed" value={stats?.processed ?? 0} tone="success" />
        <Stat label="Failed" value={stats?.failed ?? 0} tone={stats && stats.failed > 0 ? "destructive" : undefined} />
        <Stat
          label="Signature invalid"
          value={stats?.signature_invalid ?? 0}
          tone={stats && stats.signature_invalid > 0 ? "destructive" : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Last inbound event: <span className="text-foreground font-medium">{lastReceived}</span>
        </span>
        {stats?.last_error ? (
          <span className="text-destructive font-mono truncate max-w-[380px]" title={stats.last_error}>
            {stats.last_error}
          </span>
        ) : null}
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={!workspaceId || testMutation.isPending}
            onClick={() => testMutation.mutate()}
          >
            {testMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <PlugZap className="w-3.5 h-3.5" />
            )}
            Test webhook
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5"
            onClick={() => copy(webhookUrl, "Callback URL")}
          >
            <Copy className="w-3.5 h-3.5" /> Copy callback URL
          </Button>
        </div>
      </div>

      {testResult ? (
        <Alert variant={testResult.ok ? "default" : "destructive"} className="py-2">
          {testResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          <AlertTitle className="text-xs">
            {testResult.ok ? "Webhook verified" : "Webhook test failed"}
          </AlertTitle>
          <AlertDescription className="text-xs space-y-1">
            <div>{testResult.message}</div>
            <div className="text-muted-foreground">
              {testResult.httpStatus !== null ? `HTTP ${testResult.httpStatus} · ` : ""}
              challenge {testResult.challengeEchoed ? "echoed" : "not echoed"} ·{" "}
              {testResult.recentDeliveries} deliveries in the last 7 days
              {testResult.lastReceivedAt
                ? ` · last ${formatDistanceToNow(new Date(testResult.lastReceivedAt), { addSuffix: true })}`
                : ""}
            </div>
            {testResult.lastError ? (
              <div className="font-mono text-destructive break-words">{testResult.lastError}</div>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "destructive";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "destructive"
      ? "text-destructive"
      : "text-foreground";
  return (
    <div className="rounded-control border border-border bg-background p-2">
      <div className={`text-lg font-semibold ${toneClass}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
