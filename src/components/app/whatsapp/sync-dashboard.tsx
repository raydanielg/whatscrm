import { useState } from "react";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useChannelAccounts, type ChannelAccountRow } from "@/hooks/use-channel-accounts";
import {
  useSyncJobs,
  useSyncCursors,
  useSyncStatistics,
  useRunSync,
  useRunAllSyncs,
  type SyncKind,
  type SyncJobRow,
  type SyncCursorRow,
} from "@/hooks/use-sync";
import { RefreshCw, CheckCircle2, XCircle, AlertTriangle, Loader2, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const KIND_LABELS: Record<SyncKind, string> = {
  templates: "Templates",
  business_profile: "Business Profile",
  phone_numbers: "Phone Numbers",
  media_cleanup: "Media Cleanup",
  webhook_drain: "Webhook Queue",
  outbox_drain: "Outbox Queue",
  scheduled_messages: "Scheduled Messages",
  contacts_reconcile: "Contacts Reconcile",
  conversations_reconcile: "Conversations Reconcile",
  status_reconcile: "Status Reconcile",
  account_health: "Account Health",
};

const ACCOUNT_SCOPED: SyncKind[] = [
  "account_health", "business_profile", "phone_numbers", "templates",
];

const WORKSPACE_SCOPED: SyncKind[] = [
  "webhook_drain", "outbox_drain", "scheduled_messages", "media_cleanup",
  "contacts_reconcile", "conversations_reconcile", "status_reconcile",
];

export function SyncDashboard() {
  const { data: ws } = useCurrentWorkspace();
  const workspaceId = ws?.id;
  const { data: accountsData } = useChannelAccounts(workspaceId);
  const accounts = (accountsData?.accounts ?? []) as ChannelAccountRow[];
  const [selectedAccountId, setSelectedAccountId] = useState<string | "">("");

  const { data: jobsData } = useSyncJobs(workspaceId);
  const { data: cursorsData } = useSyncCursors(workspaceId);
  const { data: stats } = useSyncStatistics(workspaceId);
  const runSync = useRunSync(workspaceId);
  const runAll = useRunAllSyncs(workspaceId);

  const jobs = (jobsData?.jobs ?? []) as unknown as SyncJobRow[];
  const cursors = (cursorsData?.cursors ?? []) as unknown as SyncCursorRow[];

  const currentAccount = accounts.find((a) => a.id === selectedAccountId) ?? accounts[0];
  const currentAccountId = currentAccount?.id;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-xl">Synchronization</h2>
          <p className="text-sm text-muted-foreground">
            Manage templates, contacts, conversations, media, and delivery queues across every connected account.
          </p>
        </div>
        {currentAccountId && (
          <button
            onClick={() => runAll.mutate({ channelAccountId: currentAccountId })}
            disabled={runAll.isPending}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-control bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
          >
            {runAll.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Sync everything
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Runs (24h)" value={stats?.totalRuns ?? 0} />
        <StatCard
          label="Success"
          value={Object.values(stats?.byKind ?? {}).reduce((n, s) => n + s.success, 0)}
          tone="success"
        />
        <StatCard
          label="Partial"
          value={Object.values(stats?.byKind ?? {}).reduce((n, s) => n + s.partial, 0)}
          tone="warning"
        />
        <StatCard
          label="Failed"
          value={Object.values(stats?.byKind ?? {}).reduce((n, s) => n + s.failed, 0)}
          tone="danger"
        />
      </div>

      {/* Account picker + per-account syncs */}
      <div className="rounded-control border border-border p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium text-sm">Per-account sync</h3>
          <select
            value={selectedAccountId || currentAccountId || ""}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="h-9 px-2 rounded-control border border-input bg-surface text-sm min-w-[220px]"
          >
            {accounts.length === 0 && <option value="">No accounts connected</option>}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.display_name || a.phone_number || a.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ACCOUNT_SCOPED.map((kind) => {
            const cur = cursors.find(
              (c) => c.kind === kind && c.channel_account_id === currentAccountId,
            );
            return (
              <SyncRow
                key={kind}
                label={KIND_LABELS[kind]}
                cursor={cur}
                disabled={!currentAccountId || runSync.isPending}
                onRun={() =>
                  runSync.mutate({ kind, channelAccountId: currentAccountId ?? undefined })
                }
              />
            );
          })}
        </div>
      </div>

      {/* Workspace-scoped syncs */}
      <div className="rounded-control border border-border p-4 space-y-3">
        <h3 className="font-medium text-sm">Workspace sync</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {WORKSPACE_SCOPED.map((kind) => {
            const cur = cursors.find((c) => c.kind === kind && c.channel_account_id === null);
            return (
              <SyncRow
                key={kind}
                label={KIND_LABELS[kind]}
                cursor={cur}
                disabled={runSync.isPending}
                onRun={() => runSync.mutate({ kind })}
              />
            );
          })}
        </div>
      </div>

      {/* Recent jobs */}
      <div className="rounded-control border border-border">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="font-medium text-sm">Recent sync jobs</h3>
          <span className="text-xs text-muted-foreground">{jobs.length} runs</span>
        </div>
        <div className="max-h-[420px] overflow-y-auto divide-y divide-border">
          {jobs.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">No sync jobs yet.</div>
          )}
          {jobs.map((j) => (
            <div key={j.id} className="p-3 flex items-center gap-3 text-sm">
              <StatusIcon status={j.status} />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{KIND_LABELS[j.kind] ?? j.kind}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {j.trigger_source} · attempt {j.attempt}
                  {j.error ? ` · ${j.error}` : ""}
                </div>
              </div>
              <div className="text-xs text-muted-foreground text-right shrink-0">
                <div>{j.items_succeeded}/{j.items_processed} ok</div>
                <div>{j.duration_ms ?? 0}ms · {formatDistanceToNow(new Date(j.started_at), { addSuffix: true })}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "success" | "warning" | "danger" }) {
  const toneCls =
    tone === "success" ? "text-success" :
    tone === "warning" ? "text-amber-600" :
    tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-control border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-display font-semibold ${toneCls}`}>{value}</div>
    </div>
  );
}

function SyncRow({
  label, cursor, onRun, disabled,
}: {
  label: string;
  cursor?: { last_success_at: string | null; last_failure_at: string | null; last_error: string | null };
  onRun: () => void;
  disabled?: boolean;
}) {
  const ok = cursor?.last_success_at;
  const err = cursor?.last_failure_at && cursor?.last_error;
  return (
    <div className="flex items-center justify-between rounded-control border border-border p-3">
      <div className="min-w-0">
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs text-muted-foreground truncate">
          {ok ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              synced {formatDistanceToNow(new Date(ok), { addSuffix: true })}
            </span>
          ) : "never synced"}
          {err && <span className="text-destructive"> · {cursor?.last_error}</span>}
        </div>
      </div>
      <button
        onClick={onRun}
        disabled={disabled}
        className="inline-flex items-center gap-1 px-2 py-1.5 rounded-control border border-input text-xs hover:bg-muted disabled:opacity-60"
      >
        <RefreshCw className="w-3.5 h-3.5" /> Sync
      </button>
    </div>
  );
}

function StatusIcon({ status }: { status: SyncJobRow["status"] }) {
  const cls = "w-4 h-4 shrink-0";
  if (status === "success") return <CheckCircle2 className={`${cls} text-success`} />;
  if (status === "partial") return <AlertTriangle className={`${cls} text-amber-600`} />;
  if (status === "failed") return <XCircle className={`${cls} text-destructive`} />;
  if (status === "running") return <Loader2 className={`${cls} animate-spin text-primary`} />;
  return <Clock className={`${cls} text-muted-foreground`} />;
}
