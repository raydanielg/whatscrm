import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";

const FiltersSchema = z.object({
  days: z.number().int().min(1).max(90).default(7),
  method: z.string().optional(),
  statusBucket: z.string().optional(), // "2xx" | "3xx" | "4xx" | "5xx"
  pathContains: z.string().optional(),
  apiKeyId: z.string().uuid().optional(),
});

export type ApiAnalyticsFilters = z.infer<typeof FiltersSchema>;

async function getOrgId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return data?.organization_id ?? null;
}

export const getApiAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => FiltersSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const orgId = await getOrgId(supabase, userId);
    if (!orgId) return emptyResult();

    const since = new Date(Date.now() - data.days * 86400_000).toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase
      .from("api_gateway_logs")
      .select("id, method, path, status_code, latency_ms, error, api_key_id, created_at")
      .eq("organization_id", orgId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(10000);
    if (data.method) q = q.eq("method", data.method);
    if (data.apiKeyId) q = q.eq("api_key_id", data.apiKeyId);
    if (data.pathContains) q = q.ilike("path", `%${sanitizeSearchTerm(data.pathContains)}%`);
    const { data: logs } = await q;
    let rows: LogRow[] = (logs ?? []) as LogRow[];
    if (data.statusBucket) rows = rows.filter((r) => statusBucket(r.status_code) === data.statusBucket);

    const latencies = rows.map((r) => r.latency_ms ?? 0).filter((n) => n > 0);
    const successes = rows.filter((r) => (r.status_code ?? 0) > 0 && (r.status_code ?? 0) < 400).length;
    const failures = rows.filter((r) => (r.status_code ?? 0) >= 400).length;
    const totals = {
      requests: rows.length,
      successes,
      failures,
      success_rate: rows.length ? Math.round((successes / rows.length) * 1000) / 10 : 0,
      failure_rate: rows.length ? Math.round((failures / rows.length) * 1000) / 10 : 0,
      avg_latency_ms: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
      p50_latency_ms: percentile(latencies, 0.5),
      p95_latency_ms: percentile(latencies, 0.95),
      p99_latency_ms: percentile(latencies, 0.99),
      errors: failures,
    };

    const byDay = bucketByDay(rows, data.days);
    const byHour = bucketByHour(rows.slice(0, 3000));
    const byStatus = Object.entries(groupCount(rows, (r) => statusBucket(r.status_code)))
      .map(([bucket, count]) => ({ bucket, count }));
    const topPaths = Object.entries(groupCount(rows, (r) => r.path ?? "/"))
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    const errorTrends = bucketErrorsByDay(rows, data.days);
    const latencyBuckets = latencyHistogram(latencies);
    const monthly = bucketByMonth(rows);

    // API Key usage
    const keyCounts = groupCount(rows.filter((r) => r.api_key_id), (r) => r.api_key_id as string);
    const keyIds = Object.keys(keyCounts);
    let apiKeyUsage: Array<{ id: string; name: string; prefix: string; count: number; last_used_at: string | null }> = [];
    if (keyIds.length) {
      const { data: keys } = await supabase
        .from("api_keys")
        .select("id, name, prefix, last_used_at")
        .in("id", keyIds);
      apiKeyUsage = (keys ?? [])
        .map((k: { id: string; name: string; prefix: string; last_used_at: string | null }) => ({ ...k, count: keyCounts[k.id] ?? 0 }))
        .sort((a, b) => b.count - a.count);
    }

    // OAuth usage
    const { data: oauthTokens } = await supabase
      .from("oauth_access_tokens")
      .select("id, client_id, last_used_at, revoked_at, expires_at")
      .eq("organization_id", orgId)
      .gte("created_at", since);
    const oauth = {
      total_tokens: oauthTokens?.length ?? 0,
      active_tokens:
        (oauthTokens ?? []).filter(
          (t: { revoked_at: string | null; expires_at: string | null }) =>
            !t.revoked_at && (!t.expires_at || new Date(t.expires_at) > new Date()),
        ).length,
      recently_used:
        (oauthTokens ?? []).filter(
          (t: { last_used_at: string | null }) =>
            t.last_used_at && new Date(t.last_used_at).getTime() > Date.now() - 86400_000,
        ).length,
    };

    // Webhook deliveries
    const { data: webhooks } = await supabase
      .from("webhook_deliveries")
      .select("status, duration_ms, response_status, created_at, attempt, succeeded_at, dead_letter_at")
      .eq("organization_id", orgId)
      .gte("created_at", since)
      .limit(10000);
    const wh = webhooks ?? [];
    const webhookStats = {
      total: wh.length,
      succeeded: wh.filter((w: { succeeded_at: string | null }) => w.succeeded_at).length,
      failed: wh.filter((w: { status: string }) => w.status === "failed").length,
      dead_letter: wh.filter((w: { dead_letter_at: string | null }) => w.dead_letter_at).length,
      pending: wh.filter((w: { status: string }) => w.status === "pending" || w.status === "retrying").length,
      avg_duration_ms:
        wh.length
          ? Math.round(
              wh.reduce((a: number, b: { duration_ms: number | null }) => a + (b.duration_ms ?? 0), 0) / wh.length,
            )
          : 0,
    };

    // Rate limit hits (requests that hit 429)
    const rateLimitHits = rows.filter((r) => r.status_code === 429).length;
    const rateLimitByDay = bucketByDay(rows.filter((r) => r.status_code === 429), data.days);

    return {
      totals,
      byDay,
      byHour,
      byStatus,
      topPaths,
      errorTrends,
      latencyBuckets,
      monthly,
      apiKeyUsage,
      oauth,
      webhookStats,
      rateLimit: { hits: rateLimitHits, byDay: rateLimitByDay },
    };
  });

export const listApiLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => FiltersSchema.extend({ limit: z.number().int().min(1).max(500).default(100) }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const orgId = await getOrgId(supabase, userId);
    if (!orgId) return [];
    const since = new Date(Date.now() - data.days * 86400_000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase
      .from("api_gateway_logs")
      .select("id, method, path, status_code, latency_ms, ip, error, created_at, api_key_id")
      .eq("organization_id", orgId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.method) q = q.eq("method", data.method);
    if (data.apiKeyId) q = q.eq("api_key_id", data.apiKeyId);
    if (data.pathContains) q = q.ilike("path", `%${sanitizeSearchTerm(data.pathContains)}%`);
    const { data: rows } = await q;
    let out = (rows ?? []) as Array<LogRow & { ip: unknown }>;
    if (data.statusBucket) out = out.filter((r) => statusBucket(r.status_code) === data.statusBucket);
    return out.map((r) => ({ ...r, ip: r.ip == null ? null : String(r.ip) }));
  });

export const exportApiLogsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => FiltersSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const orgId = await getOrgId(supabase, userId);
    if (!orgId) return "";
    const since = new Date(Date.now() - data.days * 86400_000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase
      .from("api_gateway_logs")
      .select("created_at, method, path, status_code, latency_ms, ip, api_key_id, error")
      .eq("organization_id", orgId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(10000);
    if (data.method) q = q.eq("method", data.method);
    if (data.apiKeyId) q = q.eq("api_key_id", data.apiKeyId);
    if (data.pathContains) q = q.ilike("path", `%${sanitizeSearchTerm(data.pathContains)}%`);
    const { data: rows } = await q;
    let all = (rows ?? []) as Array<LogRow & { ip: unknown }>;
    if (data.statusBucket) all = all.filter((r) => statusBucket(r.status_code) === data.statusBucket);
    const header = ["timestamp", "method", "path", "status", "latency_ms", "ip", "api_key_id", "error"];
    const csv = [header.join(",")]
      .concat(
        all.map((r) =>
          [
            r.created_at,
            r.method,
            csvEscape(r.path ?? ""),
            r.status_code ?? "",
            r.latency_ms ?? "",
            r.ip == null ? "" : String(r.ip),
            r.api_key_id ?? "",
            csvEscape(r.error ?? ""),
          ].join(","),
        ),
      )
      .join("\n");
    return csv;
  });

// ---------- helpers ----------

type LogRow = {
  id?: string;
  method?: string | null;
  path?: string | null;
  status_code?: number | null;
  latency_ms?: number | null;
  error?: string | null;
  api_key_id?: string | null;
  created_at?: string;
};

function groupCount<T>(rows: T[], key: (r: T) => string | null | undefined): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    acc[k] = (acc[k] ?? 0) + 1;
  }
  return acc;
}

function statusBucket(s: number | null | undefined): string {
  if (!s) return "unknown";
  if (s < 300) return "2xx";
  if (s < 400) return "3xx";
  if (s < 500) return "4xx";
  return "5xx";
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx] ?? 0;
}

function bucketByDay(rows: LogRow[], days: number) {
  const map = new Map<string, { count: number; success: number; failure: number; latencySum: number; latencyN: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    map.set(d, { count: 0, success: 0, failure: 0, latencySum: 0, latencyN: 0 });
  }
  for (const r of rows) {
    const d = (r.created_at ?? "").slice(0, 10);
    const b = map.get(d);
    if (!b) continue;
    b.count++;
    if ((r.status_code ?? 0) >= 400) b.failure++;
    else if ((r.status_code ?? 0) > 0) b.success++;
    if (r.latency_ms) {
      b.latencySum += r.latency_ms;
      b.latencyN++;
    }
  }
  return Array.from(map.entries()).map(([day, v]) => ({
    day,
    count: v.count,
    success: v.success,
    failure: v.failure,
    avg_latency: v.latencyN ? Math.round(v.latencySum / v.latencyN) : 0,
  }));
}

function bucketByHour(rows: LogRow[]) {
  const map = new Map<string, number>();
  for (let i = 23; i >= 0; i--) {
    const d = new Date(Date.now() - i * 3600_000);
    map.set(d.toISOString().slice(0, 13) + ":00", 0);
  }
  for (const r of rows) {
    const key = (r.created_at ?? "").slice(0, 13) + ":00";
    if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([hour, count]) => ({ hour: hour.slice(11), count }));
}

function bucketErrorsByDay(rows: LogRow[], days: number) {
  const map = new Map<string, { "4xx": number; "5xx": number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    map.set(d, { "4xx": 0, "5xx": 0 });
  }
  for (const r of rows) {
    const d = (r.created_at ?? "").slice(0, 10);
    const b = map.get(d);
    if (!b) continue;
    const s = r.status_code ?? 0;
    if (s >= 500) b["5xx"]++;
    else if (s >= 400) b["4xx"]++;
  }
  return Array.from(map.entries()).map(([day, v]) => ({ day, "4xx": v["4xx"], "5xx": v["5xx"] }));
}

function latencyHistogram(latencies: number[]) {
  const buckets = [
    { label: "<50ms", max: 50 },
    { label: "50-100ms", max: 100 },
    { label: "100-250ms", max: 250 },
    { label: "250-500ms", max: 500 },
    { label: "500ms-1s", max: 1000 },
    { label: "1-3s", max: 3000 },
    { label: ">3s", max: Infinity },
  ];
  const out = buckets.map((b) => ({ label: b.label, count: 0 }));
  for (const l of latencies) {
    for (let i = 0; i < buckets.length; i++) {
      if (l <= buckets[i].max) {
        out[i].count++;
        break;
      }
    }
  }
  return out;
}

function bucketByMonth(rows: LogRow[]) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const m = (r.created_at ?? "").slice(0, 7);
    if (!m) continue;
    map.set(m, (map.get(m) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, count]) => ({ month, count }));
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function emptyResult() {
  return {
    totals: {
      requests: 0,
      successes: 0,
      failures: 0,
      success_rate: 0,
      failure_rate: 0,
      avg_latency_ms: 0,
      p50_latency_ms: 0,
      p95_latency_ms: 0,
      p99_latency_ms: 0,
      errors: 0,
    },
    byDay: [] as ReturnType<typeof bucketByDay>,
    byHour: [] as ReturnType<typeof bucketByHour>,
    byStatus: [] as Array<{ bucket: string; count: number }>,
    topPaths: [] as Array<{ path: string; count: number }>,
    errorTrends: [] as ReturnType<typeof bucketErrorsByDay>,
    latencyBuckets: [] as ReturnType<typeof latencyHistogram>,
    monthly: [] as ReturnType<typeof bucketByMonth>,
    apiKeyUsage: [] as Array<{ id: string; name: string; prefix: string; count: number; last_used_at: string | null }>,
    oauth: { total_tokens: 0, active_tokens: 0, recently_used: 0 },
    webhookStats: { total: 0, succeeded: 0, failed: 0, dead_letter: 0, pending: 0, avg_duration_ms: 0 },
    rateLimit: { hits: 0, byDay: [] as ReturnType<typeof bucketByDay> },
  };
}
