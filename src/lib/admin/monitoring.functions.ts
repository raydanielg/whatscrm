/**
 * Platform-wide monitoring aggregator for the Super Admin dashboard.
 *
 * Aggregates realtime signals across:
 *  - Database (size, connections, WAL) via information_schema / pg views
 *  - Queues (workflow_queue, campaign_dispatch_queue, message_outbox, webhook_events)
 *  - Providers (ai_provider_health, WhatsApp channels, payment gateways, sync_jobs)
 *  - Request/response latency & error rate (ai_request_logs, provider_logs)
 *  - Realtime connection counts (sessions active in the last 5 minutes)
 *
 * The snapshot read asserts platform staff via the caller's RLS context,
 * then delegates to monitoring.server.ts which reads through the guarded
 * admin client (service role) to see platform-wide data. Writes below
 * (retrying a failed queue) also need the admin client: these queue tables
 * have no UPDATE policy for non-service-role clients.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertPlatformStaff(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["superadmin", "support"]);
  if (error) throw new Error("Unable to verify platform role");
  if (!data || data.length === 0) throw new Error("Forbidden: platform staff only");
}

export type SystemStatus = "healthy" | "degraded" | "down" | "unknown";

export interface ProviderHealth {
  id: string;
  name: string;
  kind: string;
  status: SystemStatus;
  latencyMs: number | null;
  successRate: number | null;
  lastCheckAt: string | null;
  message?: string | null;
}

export interface MonitoringSnapshot {
  generatedAt: string;
  system: {
    status: SystemStatus;
    uptimeSeconds: number | null;
    cpuUsagePct: number | null;
    memoryUsagePct: number | null;
    bandwidthMbps: number | null;
  };
  database: {
    sizeBytes: number | null;
    connections: number | null;
    maxConnections: number | null;
    usagePct: number | null;
  };
  storage: {
    usedBytes: number;
    fileCount: number;
  };
  realtime: {
    connections: number;
    activeConversations: number;
  };
  queues: {
    workflow: { pending: number; running: number; failed: number };
    campaigns: { pending: number; running: number; failed: number };
    outbox: { pending: number; failed: number };
    webhooks: { pending: number; failed: number };
  };
  api: {
    requestsLast5m: number;
    errorsLast5m: number;
    errorRatePct: number;
    avgResponseMs: number | null;
    p95ResponseMs: number | null;
  };
  aiProviders: ProviderHealth[];
  whatsappProviders: ProviderHealth[];
  paymentProviders: ProviderHealth[];
  incidents: Array<{
    id: string;
    severity: SystemStatus;
    source: string;
    message: string;
    at: string;
  }>;
}

function pct(used: number | null | undefined, total: number | null | undefined): number | null {
  if (!used || !total) return null;
  return Math.min(100, Math.round((used / total) * 1000) / 10);
}

function statusFromRate(rate: number | null): SystemStatus {
  if (rate == null) return "unknown";
  if (rate >= 98) return "healthy";
  if (rate >= 90) return "degraded";
  return "down";
}

export const getMonitoringSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MonitoringSnapshot> => {
    const { supabase, userId } = context;
    await assertPlatformStaff(supabase, userId);

    const { getMonitoringSnapshotInternal } = await import("./server/monitoring.server");
    return getMonitoringSnapshotInternal();
  });

/**
 * Retry all failed jobs for a specific queue (super admin only).
 */
export const retryFailedJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { queue: "workflow" | "campaigns" | "outbox" | "webhooks" }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPlatformStaff(supabase, userId);

    const tableMap = {
      workflow: "workflow_queue",
      campaigns: "campaign_dispatch_queue",
      outbox: "message_outbox",
      webhooks: "webhook_events",
    } as const;

    const table = tableMap[data.queue];
    // These queue tables have no UPDATE policy for regular (non-service-role)
    // clients — using the caller's RLS-scoped client here silently retried 0
    // rows (no error, just an empty match) while the UI reported success.
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const client = supabaseAdmin;
    const updates: Record<string, unknown> =
      table === "webhook_events"
        ? {
            processed: false,
            attempts: 0,
            next_attempt_at: new Date().toISOString(),
            dead_letter_at: null,
          }
        : { status: "pending", attempts: 0 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: any =
      table === "webhook_events"
        ? sbAny(client).from(table).update(updates).not("dead_letter_at", "is", null)
        : sbAny(client).from(table).update(updates).eq("status", "failed");
    const { error, count } = await filter.select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    return { retried: count ?? 0 };
  });
