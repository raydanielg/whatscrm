/**
 * Builds the platform-wide performance snapshot from measurements.
 * Caller must already have asserted platform staff.
 */
import { supabaseAdmin } from "@/lib/demo/admin-write-guard.server";
import { sbAny } from "@/lib/supabase/untyped";
import { readHost } from "@/lib/admin/server/monitoring.server";
import type { PerfFinding, PerfSnapshot } from "./performance-center.functions";

type Num = number | null;
type Center = {
  api: { req_5m: number; err_5m: number; p50_ms: Num; p95_ms: Num; p99_ms: Num; req_24h: number };
  outbox: { sent_24h: number };
  queues: {
    workflow: { pending: number; running: number; failed: number; oldest_min: Num };
    campaigns: { pending: number; running: number; failed: number; oldest_min: Num };
    outbox: { pending: number; failed: number; oldest_min: Num };
    webhooks: { pending: number; failed: number; oldest_min: Num };
  };
  database: { size_bytes: Num; connections: Num; max_connections: Num; cache_hit_pct: Num };
  realtime: { sessions_5m: number; users_15m: number; conversations_5m: number };
};

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Minimum sample before a latency / error figure is allowed to raise a warning. */
const MIN_API_SAMPLE = 20;

export async function buildPerformanceSnapshot(): Promise<PerfSnapshot> {
  const db = sbAny(supabaseAdmin);

  // Time a trivial read: the app server's own round trip to Postgres.
  const t0 = performance.now();
  const [probe, centerRes, host] = await Promise.all([
    db.from("workspaces").select("id", { head: true }).limit(1),
    db.rpc("platform_monitoring_center"),
    readHost(),
  ]);
  const probeMs = probe.error ? null : Math.round(performance.now() - t0);

  if (centerRes.error || !centerRes.data) {
    // Never fall back to zeros: an unreadable database is not a fast one.
    throw new Error(`Performance statistics could not be read: ${centerRes.error?.message ?? "no data"}`);
  }
  const m = centerRes.data as Center;

  const q = m.queues;
  const queueList = [q.workflow, q.campaigns, q.outbox, q.webhooks];
  const depth = queueList.reduce((s, x) => s + x.pending, 0);
  const running = q.workflow.running + q.campaigns.running;
  const failed = queueList.reduce((s, x) => s + x.failed, 0);
  const oldest = queueList.reduce<number | null>(
    (acc, x) => (x.oldest_min != null && (acc == null || x.oldest_min > acc) ? x.oldest_min : acc), null);

  const a = m.api;
  const errorRate = ratio(a.err_5m, a.req_5m);

  const server: PerfSnapshot["server"] = {
    api: {
      reqPerMin: round1(a.req_5m / 5),
      requests24h: a.req_24h,
      p50Ms: a.p50_ms, p95Ms: a.p95_ms, p99Ms: a.p99_ms,
      errorRate,
    },
    database: {
      probeMs,
      cacheHitPct: m.database.cache_hit_pct,
      connections: m.database.connections,
      maxConnections: m.database.max_connections,
      sizeBytes: m.database.size_bytes,
    },
    queues: {
      depth, running, failed,
      oldestWaitMin: oldest != null ? round1(oldest) : null,
      outboxSent24h: m.outbox.sent_24h,
      failureRate: ratio(failed, depth + running + failed),
    },
    realtime: {
      sessions5m: m.realtime.sessions_5m,
      users15m: m.realtime.users_15m,
      conversations5m: m.realtime.conversations_5m,
    },
    process: { memoryPct: host.memoryUsagePct, cpuPct: host.cpuUsagePct, uptimeSeconds: host.uptimeSeconds },
  };

  const findings: PerfFinding[] = [];
  const add = (f: Omit<PerfFinding, "source">) => findings.push({ ...f, source: "server" });

  // --- API ------------------------------------------------------------------
  if (a.req_5m >= MIN_API_SAMPLE && a.p95_ms != null) {
    add({
      id: "api-p95", category: "api", impact: "high",
      title: `API p95 ${a.p95_ms}ms`,
      detail: `Measured over ${a.req_5m} gateway requests in the last 5 minutes (p50 ${a.p50_ms}ms, p99 ${a.p99_ms}ms). Target ≤ 500ms. If it is high, batch server functions, select only needed columns and stream long responses.`,
      severity: a.p95_ms <= 500 ? "ok" : a.p95_ms <= 1500 ? "warning" : "critical",
    });
  } else {
    add({
      id: "api-p95", category: "api", impact: "high", severity: "info",
      title: "API latency — not enough traffic to measure",
      detail: a.req_5m === 0
        ? "No API gateway requests in the last 5 minutes. p95 needs at least 20 requests."
        : `${a.req_5m} request(s) in the last 5 minutes; p95 needs at least ${MIN_API_SAMPLE}.`,
    });
  }
  if (a.req_5m >= MIN_API_SAMPLE && errorRate != null) {
    add({
      id: "api-errors", category: "api", impact: "high",
      title: `API 5xx rate ${(errorRate * 100).toFixed(2)}%`,
      detail: `${a.err_5m} of ${a.req_5m} gateway requests returned 5xx in the last 5 minutes. Target ≤ 1%.`,
      severity: errorRate <= 0.01 ? "ok" : errorRate <= 0.05 ? "warning" : "critical",
    });
  }

  // --- Database -------------------------------------------------------------
  const cache = m.database.cache_hit_pct;
  if (cache != null) {
    add({
      id: "db-cache", category: "caching", impact: "high",
      title: `Postgres cache hit ${cache}%`,
      detail: "Share of block reads served from memory since the statistics were last reset. Target ≥ 95%. A low ratio on a large database means the working set does not fit in RAM or indexes are missing.",
      severity: cache >= 95 ? "ok" : cache >= 85 ? "warning" : "critical",
    });
  }
  if (probeMs != null) {
    add({
      id: "db-latency", category: "database", impact: "high",
      title: `Database round trip ${probeMs}ms`,
      detail: "One timed read from the app server to Postgres. It includes network distance, so a database in another region reads higher. Target ≤ 300ms; keep the app and database in the same region.",
      severity: probeMs <= 300 ? "ok" : probeMs <= 1000 ? "warning" : "critical",
    });
  }
  const { connections, max_connections: maxConnections } = m.database;
  if (connections != null && maxConnections) {
    const use = (connections / maxConnections) * 100;
    add({
      id: "db-connections", category: "database", impact: "medium",
      title: `Database connections ${connections}/${maxConnections}`,
      detail: "Connections in use against the configured limit. Above 80% you risk exhausting the pool under load — use the pooler and keep server functions short-lived.",
      severity: use < 80 ? "ok" : use < 95 ? "warning" : "critical",
    });
  }

  // --- Queues ---------------------------------------------------------------
  add({
    id: "queue-wait", category: "background-jobs", impact: "high",
    title: oldest != null ? `Oldest queued job has waited ${round1(oldest)} min` : "Queues are empty",
    detail: oldest != null
      ? `${depth} job(s) waiting, ${running} running. Jobs waiting over 10 minutes mean workers are behind — scale worker concurrency or check that the cron hooks are firing.`
      : "No job is currently waiting. Nothing to tune.",
    severity: oldest == null ? "ok" : oldest <= 10 ? "ok" : oldest <= 30 ? "warning" : "critical",
  });
  if (failed > 0) {
    add({
      id: "queue-failed", category: "queues", impact: "medium",
      title: `${failed} failed job${failed === 1 ? "" : "s"} in queues`,
      detail: "Jobs in a failed or dead-letter state. Add exponential backoff and idempotency keys, then retry them from Super Admin → Monitoring.",
      severity: failed >= 100 ? "critical" : "warning",
    });
  }

  // --- Host -----------------------------------------------------------------
  if (host.memoryUsagePct != null) {
    add({
      id: "server-memory", category: "memory", impact: "medium",
      title: `Server memory ${host.memoryUsagePct}% of host RAM`,
      detail: "Resident memory of the app server process against the host's total RAM. Above 85% look for leaked listeners and unbounded in-memory caches.",
      severity: host.memoryUsagePct <= 85 ? "ok" : "warning",
    });
  }

  return { generatedAt: new Date().toISOString(), server, findings };
}
