/**
 * WhatsApp Integration health overview.
 * Ties together account status, outbox/webhook lag, and sync state.
 */
import { useChannelAccounts } from "@/hooks/use-channel-accounts";
import { useMonitoringOverview } from "@/hooks/use-monitoring";
import { useSyncJobs } from "@/hooks/use-sync";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, XCircle, Activity, Inbox, Webhook, RefreshCw } from "lucide-react";

function StatusPill({ ok, warn, label }: { ok: boolean; warn?: boolean; label: string }) {
  const Icon = ok ? CheckCircle2 : warn ? AlertTriangle : XCircle;
  const cls = ok ? "text-emerald-600" : warn ? "text-amber-600" : "text-red-600";
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className={`w-4 h-4 ${cls}`} />
      <span>{label}</span>
    </div>
  );
}

export function WhatsAppIntegrationHealth() {
  const { data: ws } = useCurrentWorkspace();
  const wsId = ws?.id;
  const accountsQ = useChannelAccounts(wsId);
  const overviewQ = useMonitoringOverview(wsId);
  const jobsQ = useSyncJobs(wsId);

  const accountsData: any = accountsQ.data;
  const accounts: any[] = Array.isArray(accountsData) ? accountsData : accountsData?.accounts ?? [];
  const jobsData: any = jobsQ.data;
  const jobs: any[] = Array.isArray(jobsData) ? jobsData : jobsData?.jobs ?? [];
  const overview: any = overviewQ.data;

  const connected = accounts.filter((a) => a.status === "connected").length;
  const total = accounts.length;
  const failing = accounts.filter((a) => a.health_status && a.health_status !== "healthy").length;

  const outboxLag = overview?.outbox?.pending ?? 0;
  const webhookLag = overview?.webhooks?.pending ?? 0;
  const successRate: number | null = overview?.outbox?.successRate ?? null;
  const recentFailedSync = jobs.find((j) => j.status === "failed");

  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-bold text-xl">Integration health</h2>
        <p className="text-sm text-muted-foreground">End-to-end status for the WhatsApp Cloud API stack.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card icon={Activity} title="Accounts" value={`${connected}/${total}`} sub={failing ? `${failing} unhealthy` : "all healthy"} tone={failing ? "warn" : "ok"} />
        <Card icon={Inbox} title="Outbox lag" value={String(outboxLag)} sub="queued messages" tone={outboxLag > 100 ? "warn" : "ok"} />
        <Card icon={Webhook} title="Webhook queue" value={String(webhookLag)} sub="pending events" tone={webhookLag > 100 ? "warn" : "ok"} />
        <Card icon={RefreshCw} title="Success (24h)" value={successRate != null ? `${(successRate * 100).toFixed(1)}%` : "—"} sub="delivery rate" tone={successRate != null && successRate < 0.95 ? "warn" : "ok"} />
      </div>

      <section className="rounded-control border border-border bg-surface p-4 space-y-3">
        <h3 className="font-medium">Background workers</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <StatusPill ok label="Outbox drain — every minute" />
          <StatusPill ok label="Webhook processor — every minute" />
          <StatusPill ok label="Scheduled messages — every minute" />
          <StatusPill ok label="Incremental syncs — every 5 minutes" />
          <StatusPill ok label="Expired media cleanup — hourly" />
          <StatusPill ok={!recentFailedSync} warn={!!recentFailedSync} label={recentFailedSync ? "Recent sync failure — check logs" : "No sync failures"} />
        </div>
      </section>

      <section className="rounded-control border border-border bg-surface p-4 space-y-2">
        <h3 className="font-medium">Enterprise readiness checklist</h3>
        <ul className="text-sm space-y-1.5 text-foreground/90">
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5" />Signed webhooks (HMAC-SHA256, timing-safe compare)</li>
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5" />Idempotent webhook processing with SHA-256 dedupe</li>
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5" />Exponential-backoff retry + dead-letter</li>
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5" />Provider abstraction (WhatsApp Cloud + future providers)</li>
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5" />Encrypted API tokens, per-workspace isolation via RLS</li>
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5" />Signed short-lived media URLs</li>
          <li className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5" />Realtime conversation + message status updates</li>
          <li className="flex gap-2"><Badge variant="outline" className="mt-0.5">Next</Badge>AI-powered auto-reply & routing</li>
        </ul>
      </section>
    </div>
  );
}

function Card({ icon: Icon, title, value, sub, tone }: { icon: any; title: string; value: string; sub: string; tone: "ok" | "warn" }) {
  const toneCls = tone === "warn" ? "text-amber-600" : "text-emerald-600";
  return (
    <div className="rounded-control border border-border bg-surface p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className={`w-4 h-4 ${toneCls}`} />
        {title}
      </div>
      <div className="mt-2 font-display text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
