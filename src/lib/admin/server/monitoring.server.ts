/**
 * Real platform monitoring snapshot for Super Admin.
 *
 * This used to be a stub returning only `realtime`, which made the whole
 * `/admin/monitoring` page crash on `snapshot.queues.workflow` being undefined.
 * It also queried `sessions.last_active_at`, a column that does not exist.
 *
 * Everything here is measured. Where the platform genuinely cannot measure
 * something (host CPU on Windows, bandwidth) the field is `null`, which the
 * dashboard renders as "—" — never a made-up number. Incidents are derived from
 * current conditions (failed jobs, unhealthy providers, error rate); there is
 * no incident log to read, so none is invented.
 *
 * Caller must have asserted platform staff already (see monitoring.functions.ts).
 */
import { supabaseAdmin } from "@/lib/demo/admin-write-guard.server";
import { sbAny } from "@/lib/supabase/untyped";
import type { MonitoringSnapshot, ProviderHealth, SystemStatus } from "../monitoring.functions";

type Queue = { pending: number; running: number; failed: number };

type Stats = {
  db_size_bytes: number | null;
  db_connections: number | null;
  db_max_connections: number | null;
  storage_bytes: number | string | null;
  storage_files: number | null;
  queues: {
    workflow: Queue;
    campaigns: Queue;
    outbox: { pending: number; failed: number };
    webhooks: { pending: number; failed: number };
  };
  api: {
    requests: number;
    errors: number;
    avg_ms: number | null;
    p95_ms: number | null;
  };
};

const EMPTY_STATS: Stats = {
  db_size_bytes: null,
  db_connections: null,
  db_max_connections: null,
  storage_bytes: 0,
  storage_files: 0,
  queues: {
    workflow: { pending: 0, running: 0, failed: 0 },
    campaigns: { pending: 0, running: 0, failed: 0 },
    outbox: { pending: 0, failed: 0 },
    webhooks: { pending: 0, failed: 0 },
  },
  api: { requests: 0, errors: 0, avg_ms: null, p95_ms: null },
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Host metrics. Best-effort: not every runtime (e.g. Workers) exposes them. */
export async function readHost(): Promise<{
  uptimeSeconds: number | null;
  memoryUsagePct: number | null;
  cpuUsagePct: number | null;
}> {
  try {
    const os = await import("node:os");
    const total = os.totalmem();
    const rss = process.memoryUsage().rss;
    const cores = os.cpus().length || 1;
    const load = os.loadavg()[0]; // always 0 on Windows -> reported as unknown
    return {
      uptimeSeconds: Math.round(process.uptime()),
      memoryUsagePct: total > 0 ? round1((rss / total) * 100) : null,
      cpuUsagePct: load > 0 ? Math.min(100, round1((load / cores) * 100)) : null,
    };
  } catch {
    return { uptimeSeconds: null, memoryUsagePct: null, cpuUsagePct: null };
  }
}

function aiStatus(status: string | null | undefined, failures: number): SystemStatus {
  const v = (status ?? "").toLowerCase();
  if (["healthy", "ok", "up", "operational", "success", "available"].includes(v)) return "healthy";
  if (["degraded", "warning", "slow", "rate_limited"].includes(v)) return "degraded";
  if (["down", "error", "failed", "unhealthy", "unavailable"].includes(v)) return "down";
  return failures >= 3 ? "down" : "unknown";
}

function accountStatus(status: string | null | undefined): SystemStatus {
  switch (status) {
    case "connected": return "healthy";
    case "disconnected": return "degraded";
    case "error":
    case "suspended": return "down";
    default: return "unknown"; // pending, or anything new
  }
}

const rank: Record<SystemStatus, number> = { healthy: 0, unknown: 1, degraded: 2, down: 3 };

export async function getMonitoringSnapshotInternal(): Promise<MonitoringSnapshot> {
  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60_000).toISOString();
  const db = sbAny(supabaseAdmin);

  const [statsRes, sessions, conversations, aiRows, aiHealth, accounts, gateways, host] = await Promise.all([
    db.rpc("platform_monitoring_stats"),
    db.from("sessions").select("id", { count: "exact", head: true })
      .gte("last_seen_at", fiveMinAgo).is("revoked_at", null),
    db.from("conversations").select("id", { count: "exact", head: true })
      .gte("last_message_at", fiveMinAgo),
    db.from("ai_providers").select("id, name, kind, enabled").eq("enabled", true),
    db.from("ai_provider_health")
      .select("provider_id, status, last_check_at, last_error, latency_ms, consecutive_failures"),
    db.from("channel_accounts")
      .select("id, display_name, phone_number, provider, status, status_reason, last_verified_at"),
    db.from("payment_gateway_settings")
      .select("provider_id, display_label, mode, enabled").eq("enabled", true),
    readHost(),
  ]);

  const statsError: string | null = statsRes.error ? String(statsRes.error.message ?? statsRes.error) : null;
  const stats: Stats = statsRes.error || !statsRes.data ? EMPTY_STATS : (statsRes.data as Stats);

  // --- Providers ------------------------------------------------------------
  type AiHealthRow = {
    provider_id: string;
    status: string | null;
    last_check_at: string | null;
    last_error: string | null;
    latency_ms: number | null;
    consecutive_failures: number | null;
  };
  const healthById = new Map<string, AiHealthRow>();
  for (const h of (aiHealth.data ?? []) as AiHealthRow[]) healthById.set(h.provider_id, h);

  const aiProviders: ProviderHealth[] = ((aiRows.data ?? []) as Array<{ id: string; name: string; kind: string }>).map((p) => {
    const h = healthById.get(p.id);
    return {
      id: p.id,
      name: p.name,
      kind: String(p.kind),
      status: h ? aiStatus(h.status, h.consecutive_failures ?? 0) : "unknown",
      latencyMs: h?.latency_ms ?? null,
      successRate: null,
      lastCheckAt: h?.last_check_at ?? null,
      message: h?.last_error ?? (h ? null : "No health check has run yet"),
    };
  });

  const whatsappProviders: ProviderHealth[] = (
    (accounts.data ?? []) as Array<{
      id: string; display_name: string | null; phone_number: string | null; provider: string;
      status: string; status_reason: string | null; last_verified_at: string | null;
    }>
  ).map((a) => ({
    id: a.id,
    name: a.display_name ?? a.phone_number ?? String(a.provider),
    kind: String(a.provider),
    status: accountStatus(a.status),
    latencyMs: null,
    successRate: null,
    lastCheckAt: a.last_verified_at,
    message: a.status_reason,
  }));

  // Gateways have no health probe, so their status is honestly "unknown".
  const paymentProviders: ProviderHealth[] = (
    (gateways.data ?? []) as Array<{ provider_id: string; display_label: string | null; mode: string | null }>
  ).map((g) => ({
    id: g.provider_id,
    name: g.display_label ?? g.provider_id,
    kind: "payment",
    status: "unknown",
    latencyMs: null,
    successRate: null,
    lastCheckAt: null,
    message: g.mode ? `${g.mode} mode — no health probe` : "No health probe",
  }));

  // --- API ------------------------------------------------------------------
  const requests = Number(stats.api.requests ?? 0);
  const errors = Number(stats.api.errors ?? 0);
  const errorRatePct = requests > 0 ? round1((errors / requests) * 100) : 0;

  // --- Incidents: derived from current conditions, never invented -----------
  const at = now.toISOString();
  const incidents: MonitoringSnapshot["incidents"] = [];
  const queueLabels: Array<[string, number]> = [
    ["Workflow queue", stats.queues.workflow.failed],
    ["Campaign dispatch queue", stats.queues.campaigns.failed],
    ["Message outbox", stats.queues.outbox.failed],
    ["Webhook queue", stats.queues.webhooks.failed],
  ];
  for (const [label, failed] of queueLabels) {
    if (failed > 0) {
      incidents.push({
        id: `queue-${label}`, severity: "degraded", source: label,
        message: `${failed} failed job${failed === 1 ? "" : "s"} waiting for retry`, at,
      });
    }
  }
  for (const p of [...aiProviders, ...whatsappProviders]) {
    if (p.status === "down") {
      incidents.push({
        id: `provider-${p.id}`, severity: "down", source: p.name,
        message: p.message ?? `${p.kind} provider is down`, at,
      });
    }
  }
  if (requests >= 20 && errorRatePct > 5) {
    incidents.push({
      id: "api-error-rate", severity: errorRatePct > 25 ? "down" : "degraded", source: "API",
      message: `${errorRatePct}% of the last ${requests} requests returned 5xx`, at,
    });
  }
  if (statsError) {
    incidents.push({
      id: "stats-unavailable", severity: "unknown", source: "Monitoring",
      message: `Platform statistics could not be read: ${statsError}`, at,
    });
  }

  const worst = incidents.reduce<SystemStatus>(
    (acc, i) => (rank[i.severity] > rank[acc] ? i.severity : acc), "healthy");
  // A single failed queue or provider degrades the platform; it does not take it down.
  const systemStatus: SystemStatus = statsError ? "unknown" : worst === "down" ? "degraded" : worst;

  const maxConn = stats.db_max_connections;
  const conns = stats.db_connections;

  return {
    generatedAt: at,
    system: {
      status: systemStatus,
      uptimeSeconds: host.uptimeSeconds,
      cpuUsagePct: host.cpuUsagePct,
      memoryUsagePct: host.memoryUsagePct,
      bandwidthMbps: null,
    },
    database: {
      sizeBytes: stats.db_size_bytes,
      connections: conns,
      maxConnections: maxConn,
      usagePct: conns != null && maxConn ? round1((conns / maxConn) * 100) : null,
    },
    storage: {
      usedBytes: Number(stats.storage_bytes ?? 0),
      fileCount: Number(stats.storage_files ?? 0),
    },
    realtime: {
      connections: sessions.count ?? 0,
      activeConversations: conversations.count ?? 0,
    },
    queues: stats.queues,
    api: {
      requestsLast5m: requests,
      errorsLast5m: errors,
      errorRatePct,
      avgResponseMs: stats.api.avg_ms != null ? Number(stats.api.avg_ms) : null,
      p95ResponseMs: stats.api.p95_ms != null ? Number(stats.api.p95_ms) : null,
    },
    aiProviders,
    whatsappProviders,
    paymentProviders,
    incidents,
  };
}
