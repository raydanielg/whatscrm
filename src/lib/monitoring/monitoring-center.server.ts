/**
 * Builds the Monitoring Center snapshot from real measurements.
 *
 * Caller must already have asserted platform staff (see
 * monitoring-center.functions.ts) — this reads across every tenant with the
 * service role.
 *
 * Rules of the road:
 *  - A check with no traffic in its window is "unknown", not "healthy". A quiet
 *    platform is not a healthy one, it is an unmeasured one.
 *  - Ratios need a minimum sample before they can degrade a status, so a single
 *    failed request out of two cannot page anyone.
 *  - Thresholds live in `T` and feed BOTH the health cards and the alert rules,
 *    so a card can never say "healthy" while its own alert is firing.
 */
import { supabaseAdmin } from "@/lib/demo/admin-write-guard.server";
import { sbAny } from "@/lib/supabase/untyped";
import { readHost } from "@/lib/admin/server/monitoring.server";
import type {
  AlertRule,
  ErrorEvent,
  HealthCheck,
  HealthStatus,
  LogEntry,
  MonitoringSnapshot,
  TraceSpan,
} from "./monitoring-center.functions";

type Num = number | null;
type QueueStat = { pending: number; running?: number; failed: number; oldest_min: Num };

type Center = {
  api: {
    req_5m: number; err_5m: number; p50_ms: Num; p95_ms: Num; p99_ms: Num;
    req_24h: number; err_24h: number; avg_ms_24h: Num; last_at: string | null;
  };
  webhooks: {
    received_24h: number; processed_24h: number; failed_24h: number; rejected_24h: number;
    stuck: number; avg_ms_24h: Num; last_at: string | null;
  };
  ai: { req_24h: number; errors_24h: number; rate_limited_24h: number; avg_ms_24h: Num; tokens_24h: number };
  outbox: { total_24h: number; sent_24h: number; failed_24h: number; avg_send_ms_24h: Num };
  workflows: { runs_24h: number; failed_24h: number; running: number; avg_ms_24h: Num };
  queues: { workflow: QueueStat; campaigns: QueueStat; outbox: QueueStat; webhooks: QueueStat };
  workers: { active: number };
  database: {
    size_bytes: Num; connections: Num; max_connections: Num; deadlocks: Num; cache_hit_pct: Num;
  };
  realtime: { sessions_5m: number; users_15m: number; conversations_5m: number };
  storage: { bytes: number | string; files: number };
  sources: Array<{ id: string; label: string; rows_24h: number; last_at: string | null }>;
};

type Events = {
  errors: Array<{
    id: string; message: string; service: string; level: "error" | "warning";
    count: number; first_seen: string; last_seen: string; detail: string | null;
  }>;
  logs: Array<{ ts: string; level: LogEntry["level"]; service: string; message: string }>;
  traces: Array<{
    trace_id: string; name: string; service: string; duration_ms: number;
    started_at: string; ok: boolean; spans: number;
  }>;
};

/** Every threshold used for health status AND alert rules. */
const T = {
  apiMinSample: 20, apiErrDegraded: 0.02, apiErrDown: 0.1, apiP95DegradedMs: 1500,
  webhookMinSample: 5, webhookDownSample: 20, webhookErrDegraded: 0.05, webhookErrDown: 0.25,
  aiMinSample: 5, aiDownSample: 10, aiErrDegraded: 0.03, aiErrDown: 0.2,
  deliveryMinSample: 10, deliveryDownSample: 20, deliveryErrDegraded: 0.05, deliveryErrDown: 0.25,
  queueWaitDegradedMin: 10, queueWaitDownMin: 30, queueFailedDown: 100,
  // The probe is the app server's own round trip to Postgres, so it includes
  // network distance. 500 ms flagged a healthy remote dev database; 1 s is slow
  // for any deployment.
  dbConnDegradedPct: 80, dbProbeDegradedMs: 1000,
} as const;

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const pct = (r: number | null, digits = 1) => (r == null ? "—" : `${(r * 100).toFixed(digits)}%`);
const ms = (v: Num) => (v == null ? "—" : `${Math.round(v)}ms`);
const num = (v: number) => v.toLocaleString("en-US");
const round1 = (n: number) => Math.round(n * 10) / 10;

function bytes(n: number | string | null): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(v) / Math.log(1024)));
  return `${(v / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function duration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const rank: Record<HealthStatus, number> = { healthy: 0, unknown: 1, degraded: 2, down: 3 };
const worse = (a: HealthStatus, b: HealthStatus): HealthStatus => (rank[b] > rank[a] ? b : a);

/** Times a call. Supabase clients report failure through `{ error }` rather than throwing. */
async function probe(
  run: () => PromiseLike<{ error?: { message?: string } | null }>,
): Promise<{ ms: number; ok: boolean; error?: string }> {
  const t0 = performance.now();
  try {
    const res = await run();
    const message = res.error?.message;
    return { ms: Math.round(performance.now() - t0), ok: !res.error, error: message };
  } catch (e) {
    return { ms: Math.round(performance.now() - t0), ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function buildMonitoringCenterSnapshot(): Promise<MonitoringSnapshot> {
  const db = sbAny(supabaseAdmin);

  const [dbProbe, storageProbe, centerRes, eventsRes, accountsRes, aiProvidersRes, aiHealthRes, host] =
    await Promise.all([
      probe(() => db.from("workspaces").select("id", { head: true }).limit(1)),
      probe(() => supabaseAdmin.storage.listBuckets()),
      db.rpc("platform_monitoring_center"),
      db.rpc("platform_monitoring_events", { _limit: 100 }),
      db.from("channel_accounts").select("id, status"),
      db.from("ai_providers").select("id").eq("enabled", true),
      db.from("ai_provider_health").select("provider_id, status"),
      readHost(),
    ]);

  // A snapshot of zeros would read as "all quiet". If the numbers cannot be
  // read, say so.
  if (centerRes.error || !centerRes.data) {
    throw new Error(`Monitoring statistics could not be read: ${centerRes.error?.message ?? "no data"}`);
  }
  if (eventsRes.error || !eventsRes.data) {
    throw new Error(`Monitoring events could not be read: ${eventsRes.error?.message ?? "no data"}`);
  }
  const m = centerRes.data as Center;
  const ev = eventsRes.data as Events;

  const accounts = (accountsRes.data ?? []) as Array<{ status: string }>;
  const aiEnabled = ((aiProvidersRes.data ?? []) as Array<{ id: string }>).map((p) => p.id);
  const aiHealth = new Map(
    ((aiHealthRes.data ?? []) as Array<{ provider_id: string; status: string | null }>).map((h) => [
      h.provider_id, (h.status ?? "").toLowerCase(),
    ]),
  );

  const checks: HealthCheck[] = [];

  // --- Application -----------------------------------------------------------
  {
    const version = process.env["APP_VERSION"];
    checks.push({
      id: "application",
      label: "Application",
      status: "healthy", // this process just answered the request
      latencyMs: null,
      errorRate: null,
      detail: `Serving requests${version ? ` · v${version}` : ""}${
        host.uptimeSeconds != null ? ` · up ${duration(host.uptimeSeconds)}` : ""}`,
      metrics: [
        { label: "Process uptime", value: host.uptimeSeconds != null ? duration(host.uptimeSeconds) : "—" },
        { label: "Memory", value: host.memoryUsagePct != null ? `${host.memoryUsagePct}%` : "—" },
        { label: "CPU", value: host.cpuUsagePct != null ? `${host.cpuUsagePct}%` : "—" },
      ],
    });
  }

  // --- Database --------------------------------------------------------------
  {
    const d = m.database;
    const usage = d.connections != null && d.max_connections ? (d.connections / d.max_connections) * 100 : null;
    let status: HealthStatus = "healthy";
    if (!dbProbe.ok) status = "down";
    else if ((usage != null && usage >= T.dbConnDegradedPct) || dbProbe.ms > T.dbProbeDegradedMs) status = "degraded";
    checks.push({
      id: "database",
      label: "Database",
      status,
      latencyMs: dbProbe.ok ? dbProbe.ms : null,
      errorRate: null,
      detail: dbProbe.ok
        ? `${d.connections ?? "?"}/${d.max_connections ?? "?"} connections · cache hit ${d.cache_hit_pct ?? "—"}% · ${bytes(d.size_bytes)}`
        : `Query probe failed: ${dbProbe.error ?? "unknown error"}`,
      metrics: [
        { label: "Connections", value: `${d.connections ?? "?"}/${d.max_connections ?? "?"}` },
        { label: "Size", value: bytes(d.size_bytes) },
        { label: "Cache hit", value: d.cache_hit_pct != null ? `${d.cache_hit_pct}%` : "—" },
        { label: "Deadlocks", value: String(d.deadlocks ?? 0) },
      ],
    });
  }

  // --- Realtime --------------------------------------------------------------
  // There is no realtime service probe, so this reports activity only and stays
  // "unknown" rather than claiming the service is healthy.
  {
    const r = m.realtime;
    checks.push({
      id: "realtime",
      label: "Realtime",
      status: "unknown",
      latencyMs: null,
      errorRate: null,
      detail: "No realtime service probe. Showing recent activity only.",
      metrics: [
        { label: "Active sessions (5m)", value: num(r.sessions_5m) },
        { label: "Active users (15m)", value: num(r.users_15m) },
        { label: "Active conversations (5m)", value: num(r.conversations_5m) },
      ],
    });
  }

  // --- Queues ----------------------------------------------------------------
  const q = m.queues;
  const queueList: Array<[string, QueueStat]> = [
    ["workflow", q.workflow], ["campaign dispatch", q.campaigns], ["message outbox", q.outbox], ["webhook", q.webhooks],
  ];
  const pending = queueList.reduce((s, [, x]) => s + x.pending, 0);
  const running = (q.workflow.running ?? 0) + (q.campaigns.running ?? 0);
  const failed = queueList.reduce((s, [, x]) => s + x.failed, 0);
  const oldest = queueList.reduce<number | null>(
    (acc, [, x]) => (x.oldest_min != null && (acc == null || x.oldest_min > acc) ? x.oldest_min : acc), null);
  {
    let status: HealthStatus = "healthy";
    if (failed > 0 || (oldest != null && oldest > T.queueWaitDegradedMin)) status = "degraded";
    if (failed >= T.queueFailedDown || (oldest != null && oldest > T.queueWaitDownMin)) status = "down";
    const total = pending + running + failed;
    checks.push({
      id: "queue",
      label: "Queues",
      status,
      latencyMs: oldest != null ? Math.round(oldest * 60_000) : null,
      errorRate: ratio(failed, total),
      detail: total === 0
        ? "All queues are empty."
        : `${num(pending)} waiting, ${num(running)} running, ${num(failed)} failed${
            oldest != null ? ` · oldest waiting job ${round1(oldest)} min` : ""}`,
      metrics: [
        { label: "Depth", value: num(pending) },
        { label: "Failed", value: num(failed) },
        { label: "Oldest wait", value: oldest != null ? `${round1(oldest)} min` : "—" },
      ],
    });
  }

  // --- Webhooks (inbound, 24h) -----------------------------------------------
  const wh = m.webhooks;
  const whBad = wh.failed_24h + wh.rejected_24h;
  const whRate = ratio(whBad, wh.received_24h);
  const whFiring = wh.received_24h >= T.webhookMinSample && whRate != null && whRate > T.webhookErrDegraded;
  {
    let status: HealthStatus = "healthy";
    if (wh.received_24h === 0) status = "unknown";
    else {
      if (wh.stuck > 0 || whFiring) status = "degraded";
      if (wh.received_24h >= T.webhookDownSample && whRate != null && whRate > T.webhookErrDown) status = "down";
    }
    checks.push({
      id: "webhook",
      label: "Inbound webhooks",
      status,
      latencyMs: wh.avg_ms_24h,
      errorRate: whRate,
      detail: wh.received_24h === 0
        ? "No inbound webhook deliveries in the last 24 hours."
        : `${num(wh.received_24h)} received in 24h · ${num(wh.failed_24h)} failed · ${num(wh.rejected_24h)} rejected (bad signature)${
            wh.stuck > 0 ? ` · ${wh.stuck} stuck unprocessed` : ""}`,
      metrics: [
        { label: "24h received", value: num(wh.received_24h) },
        { label: "Failed / rejected", value: `${num(wh.failed_24h)} / ${num(wh.rejected_24h)}` },
        { label: "Avg processing", value: ms(wh.avg_ms_24h) },
      ],
    });
  }

  // --- API gateway -----------------------------------------------------------
  const a = m.api;
  const apiRate5 = ratio(a.err_5m, a.req_5m);
  const apiFiring = a.req_5m >= T.apiMinSample && apiRate5 != null && apiRate5 > T.apiErrDegraded;
  const apiSlow = a.req_5m >= T.apiMinSample && a.p95_ms != null && a.p95_ms > T.apiP95DegradedMs;
  {
    let status: HealthStatus = "healthy";
    if (a.req_24h === 0) status = "unknown";
    else {
      if (apiFiring || apiSlow) status = "degraded";
      if (a.req_5m >= T.apiMinSample && apiRate5 != null && apiRate5 > T.apiErrDown) status = "down";
    }
    const recent = a.req_5m > 0;
    checks.push({
      id: "api",
      label: "API",
      status,
      latencyMs: recent ? a.p95_ms : a.avg_ms_24h,
      errorRate: recent ? apiRate5 : ratio(a.err_24h, a.req_24h),
      detail: a.req_24h === 0
        ? "No API gateway requests recorded in the last 24 hours."
        : recent
          ? `${round1(a.req_5m / 5)} req/min over 5m · p95 ${ms(a.p95_ms)} · ${pct(apiRate5, 2)} 5xx`
          : `Idle in the last 5m · ${num(a.req_24h)} requests in 24h · avg ${ms(a.avg_ms_24h)}`,
      metrics: [
        { label: "Req/min (5m)", value: String(round1(a.req_5m / 5)) },
        { label: "p95 (5m)", value: ms(a.p95_ms) },
        { label: "24h requests", value: num(a.req_24h) },
      ],
    });
  }

  // --- AI providers ----------------------------------------------------------
  const ai = m.ai;
  const aiRate = ratio(ai.errors_24h, ai.req_24h);
  const aiFiring = ai.req_24h >= T.aiMinSample && aiRate != null && aiRate > T.aiErrDegraded;
  {
    const healthy = aiEnabled.filter((id) => aiHealth.get(id) === "healthy").length;
    const anyDown = aiEnabled.some((id) => ["down", "error", "failed", "unhealthy"].includes(aiHealth.get(id) ?? ""));
    let status: HealthStatus;
    if (ai.req_24h > 0) {
      status = "healthy";
      if (aiFiring) status = "degraded";
      if (ai.req_24h >= T.aiDownSample && aiRate != null && aiRate > T.aiErrDown) status = "down";
    } else if (aiEnabled.length === 0) status = "unknown";
    else status = anyDown ? "down" : "unknown";
    checks.push({
      id: "ai-provider",
      label: "AI providers",
      status,
      latencyMs: ai.avg_ms_24h,
      errorRate: aiRate,
      detail: aiEnabled.length === 0
        ? "No AI provider is enabled."
        : ai.req_24h === 0
          ? `${aiEnabled.length} provider${aiEnabled.length === 1 ? "" : "s"} enabled, no requests in the last 24 hours.`
          : `${num(ai.req_24h)} requests in 24h · ${num(ai.errors_24h)} failed · ${num(ai.rate_limited_24h)} rate limited`,
      metrics: [
        { label: "Providers healthy", value: `${healthy}/${aiEnabled.length}` },
        { label: "Requests 24h", value: num(ai.req_24h) },
        { label: "Tokens 24h", value: num(ai.tokens_24h) },
      ],
    });
  }

  // --- Message delivery (outbox + connected accounts) ------------------------
  const ob = m.outbox;
  const obRate = ratio(ob.failed_24h, ob.total_24h);
  const obFiring = ob.total_24h >= T.deliveryMinSample && obRate != null && obRate > T.deliveryErrDegraded;
  const connected = accounts.filter((x) => x.status === "connected").length;
  const brokenAccounts = accounts.filter((x) => x.status === "error" || x.status === "suspended").length;
  {
    let status: HealthStatus;
    if (accounts.length === 0 && ob.total_24h === 0) status = "unknown";
    else {
      status = "healthy";
      if (brokenAccounts > 0 || obFiring) status = "degraded";
      if (brokenAccounts > 0 && brokenAccounts === accounts.length) status = "down";
      if (ob.total_24h >= T.deliveryDownSample && obRate != null && obRate > T.deliveryErrDown) status = "down";
      if (status === "healthy" && connected === 0) status = "unknown";
    }
    checks.push({
      id: "whatsapp-provider",
      label: "Message delivery",
      status,
      latencyMs: ob.avg_send_ms_24h,
      errorRate: obRate,
      detail: accounts.length === 0
        ? "No WhatsApp account is connected."
        : `${connected}/${accounts.length} accounts connected · ${num(ob.sent_24h)} sent in 24h · ${num(ob.failed_24h)} failed`,
      metrics: [
        { label: "Accounts connected", value: `${connected}/${accounts.length}` },
        { label: "Sent 24h", value: num(ob.sent_24h) },
        { label: "Failed 24h", value: num(ob.failed_24h) },
      ],
    });
  }

  // --- Storage ---------------------------------------------------------------
  {
    const s = m.storage;
    checks.push({
      id: "storage",
      label: "Storage",
      status: storageProbe.ok ? "healthy" : "down",
      latencyMs: storageProbe.ok ? storageProbe.ms : null,
      errorRate: null,
      detail: storageProbe.ok
        ? `Storage API reachable · ${num(s.files)} tracked files · ${bytes(s.bytes)}`
        : `Storage API probe failed: ${storageProbe.error ?? "unknown error"}`,
      metrics: [
        { label: "Used", value: bytes(s.bytes) },
        { label: "Files", value: num(s.files) },
      ],
    });
  }

  // --- Workers ---------------------------------------------------------------
  const stuckQueues = queueList.filter(([, x]) => x.oldest_min != null && x.oldest_min > T.queueWaitDegradedMin).length;
  {
    let status: HealthStatus = "healthy";
    if (stuckQueues > 0) status = m.workers.active === 0 ? "down" : "degraded";
    const w = m.workflows;
    checks.push({
      id: "worker",
      label: "Workers",
      status,
      latencyMs: w.avg_ms_24h,
      errorRate: ratio(w.failed_24h, w.runs_24h),
      detail: stuckQueues > 0
        ? `${stuckQueues} queue${stuckQueues === 1 ? " has" : "s have"} jobs waiting over ${T.queueWaitDegradedMin} min · ${m.workers.active} worker${m.workers.active === 1 ? "" : "s"} active`
        : pending === 0
          ? "Nothing is waiting, so no jobs are stuck."
          : `${m.workers.active} worker${m.workers.active === 1 ? "" : "s"} active · no stuck jobs`,
      metrics: [
        { label: "Active workers (5m)", value: num(m.workers.active) },
        { label: "Workflow runs 24h", value: num(w.runs_24h) },
        { label: "Workflow failures", value: num(w.failed_24h) },
      ],
    });
  }

  // --- Alerts: the same thresholds, evaluated live ---------------------------
  const alerts: AlertRule[] = [
    {
      id: "api-5xx", name: `API 5xx rate > ${T.apiErrDegraded * 100}% (5 min)`, domain: "api", severity: "warning",
      condition: `≥ ${T.apiMinSample} requests in 5 min and 5xx ratio > ${T.apiErrDegraded * 100}%`,
      firing: apiFiring, current: a.req_5m > 0 ? `${pct(apiRate5, 2)} of ${num(a.req_5m)} requests` : "No traffic",
    },
    {
      id: "api-p95", name: `API p95 latency > ${T.apiP95DegradedMs} ms (5 min)`, domain: "api", severity: "warning",
      condition: `≥ ${T.apiMinSample} requests in 5 min and p95 > ${T.apiP95DegradedMs} ms`,
      firing: apiSlow, current: a.p95_ms != null ? `p95 ${ms(a.p95_ms)}` : "No traffic",
    },
    {
      id: "queue-failed", name: "Failed queue jobs", domain: "queue", severity: "warning",
      condition: "Any job in a failed / dead-letter state", firing: failed > 0, current: `${num(failed)} failed`,
    },
    {
      id: "queue-wait", name: `Oldest queued job waiting > ${T.queueWaitDegradedMin} min`, domain: "queue", severity: "critical",
      condition: `A due job has waited longer than ${T.queueWaitDegradedMin} min`,
      firing: oldest != null && oldest > T.queueWaitDegradedMin, current: oldest != null ? `${round1(oldest)} min` : "Nothing waiting",
    },
    {
      id: "db-connections", name: `Database connections > ${T.dbConnDegradedPct}%`, domain: "database", severity: "warning",
      condition: `Connections in use exceed ${T.dbConnDegradedPct}% of the limit`,
      firing: m.database.connections != null && !!m.database.max_connections &&
        (m.database.connections / m.database.max_connections) * 100 >= T.dbConnDegradedPct,
      current: `${m.database.connections ?? "?"}/${m.database.max_connections ?? "?"}`,
    },
    {
      id: "webhook-failures", name: `Inbound webhook failures > ${T.webhookErrDegraded * 100}% (24 h)`, domain: "webhook", severity: "warning",
      condition: `≥ ${T.webhookMinSample} deliveries in 24 h and failed + rejected > ${T.webhookErrDegraded * 100}%`,
      firing: whFiring, current: wh.received_24h > 0 ? `${pct(whRate)} of ${num(wh.received_24h)} deliveries` : "No deliveries",
    },
    {
      id: "ai-errors", name: `AI provider error rate > ${T.aiErrDegraded * 100}% (24 h)`, domain: "ai-provider", severity: "warning",
      condition: `≥ ${T.aiMinSample} AI requests in 24 h and error / timeout ratio > ${T.aiErrDegraded * 100}%`,
      firing: aiFiring, current: ai.req_24h > 0 ? `${pct(aiRate)} of ${num(ai.req_24h)} requests` : "No AI requests",
    },
    {
      id: "delivery-failures", name: `Message delivery failures > ${T.deliveryErrDegraded * 100}% (24 h)`, domain: "whatsapp-provider", severity: "warning",
      condition: `≥ ${T.deliveryMinSample} sends in 24 h and failed ratio > ${T.deliveryErrDegraded * 100}%`,
      firing: obFiring, current: ob.total_24h > 0 ? `${pct(obRate)} of ${num(ob.total_24h)} sends` : "No sends",
    },
    {
      id: "account-broken", name: "WhatsApp account in error / suspended", domain: "whatsapp-provider", severity: "critical",
      condition: "Any connected account reports status error or suspended",
      firing: brokenAccounts > 0, current: `${brokenAccounts} of ${accounts.length} accounts`,
    },
  ];

  // --- Roll-up ---------------------------------------------------------------
  const known = checks.filter((c) => c.status !== "unknown");
  const worst = known.length === 0 ? "unknown" : known.reduce<HealthStatus>((acc, c) => worse(acc, c.status), "healthy");
  // One failing provider, queue or endpoint degrades the platform; only the
  // application or the database being down takes it down.
  const coreDown = checks.some((c) => (c.id === "application" || c.id === "database") && c.status === "down");
  const overall: HealthStatus = worst === "down" && !coreDown ? "degraded" : worst;
  const score = known.length === 0
    ? null
    : Math.round(known.reduce((s, c) => s + (c.status === "healthy" ? 100 : c.status === "degraded" ? 60 : 0), 0) / known.length);

  const errors: ErrorEvent[] = ev.errors.map((e) => ({
    id: e.id, message: e.message, service: e.service, level: e.level, count: Number(e.count),
    firstSeen: e.first_seen, lastSeen: e.last_seen, detail: e.detail || undefined,
  }));
  const traces: TraceSpan[] = ev.traces.map((t) => ({
    traceId: t.trace_id, name: t.name, service: t.service, durationMs: Number(t.duration_ms),
    startedAt: t.started_at, status: t.ok ? "ok" : "error", spans: Number(t.spans),
  }));

  return {
    generatedAt: new Date().toISOString(),
    overallStatus: overall,
    healthScore: score,
    unmeasured: checks.length - known.length,
    checks,
    errors,
    traces,
    logs: ev.logs,
    alerts,
    metrics: {
      requestsPerMin: round1(a.req_5m / 5),
      p50Ms: a.p50_ms,
      p95Ms: a.p95_ms,
      p99Ms: a.p99_ms,
      errorRate: apiRate5,
      activeUsers: m.realtime.users_15m,
      processUptimeSeconds: host.uptimeSeconds,
    },
    sources: m.sources.map((s) => ({ id: s.id, label: s.label, rows24h: Number(s.rows_24h), lastAt: s.last_at })),
  };
}
