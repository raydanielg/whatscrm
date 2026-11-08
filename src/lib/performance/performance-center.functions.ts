/**
 * Performance Center — platform-wide server measurements.
 *
 * This used to return hard-coded "synthetic-but-realistic" numbers (LCP 1.9s,
 * bundle 218KB, 214 realtime channels, queue depth 42, ...) to ANY signed-in
 * user. Now it measures what the server can actually see — API gateway latency,
 * Postgres health, queues, sessions, host memory — and is staff-only.
 *
 * Browser-side figures (Core Web Vitals, bundle size, JS heap) are measured in
 * the viewer's own browser by `useBrowserVitals`; the server cannot observe
 * them. There is no platform-wide real-user-monitoring pipeline, so nothing here
 * pretends to be field data from other users.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PerfCategory =
  | "lazy-loading"
  | "code-splitting"
  | "images"
  | "caching"
  | "database"
  | "realtime"
  | "virtualization"
  | "pagination"
  | "background-jobs"
  | "queues"
  | "api"
  | "bundle"
  | "memory"
  | "cwv";

export type PerfSeverity = "critical" | "warning" | "ok" | "info";

/** One measured finding. `info` means "no measurement" and never affects the score. */
export type PerfFinding = {
  id: string;
  category: PerfCategory;
  title: string;
  detail: string;
  severity: PerfSeverity;
  impact: "high" | "medium" | "low";
  /** Where the number came from, shown next to the finding. */
  source: "server" | "browser";
};

export type PerfSnapshot = {
  generatedAt: string;
  server: {
    api: {
      reqPerMin: number;
      requests24h: number;
      p50Ms: number | null;
      p95Ms: number | null;
      p99Ms: number | null;
      /** 5xx ratio 0..1 over the last 5 minutes, null when there was no traffic. */
      errorRate: number | null;
    };
    database: {
      /** One timed round trip from the app server to Postgres (includes network). */
      probeMs: number | null;
      cacheHitPct: number | null;
      connections: number | null;
      maxConnections: number | null;
      sizeBytes: number | null;
    };
    queues: {
      depth: number;
      running: number;
      failed: number;
      oldestWaitMin: number | null;
      outboxSent24h: number;
      /** failed / (pending + running + failed), null when all queues are empty. */
      failureRate: number | null;
    };
    realtime: { sessions5m: number; users15m: number; conversations5m: number };
    process: { memoryPct: number | null; cpuPct: number | null; uptimeSeconds: number | null };
  };
  findings: PerfFinding[];
};

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

export const getPerformanceSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PerfSnapshot> => {
    await assertPlatformStaff(context.supabase, context.userId);
    const { buildPerformanceSnapshot } = await import("./performance-center.server");
    return buildPerformanceSnapshot();
  });
