/**
 * Monitoring Center — Super Admin platform health.
 *
 * Everything returned here is measured. It used to be a synthetic snapshot
 * (hard-coded health cards, invented errors, Math.random() traces, fake logs and
 * fake alert rules). Where the platform genuinely cannot measure something the
 * field is `null` / status `"unknown"` — the page renders that as "—", never a
 * made-up figure. In particular there is no uptime history and no distributed
 * tracing in this app, so neither is reported.
 *
 * Platform staff only: the numbers span every tenant.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type HealthStatus = "healthy" | "degraded" | "down" | "unknown";

export type HealthDomain =
  | "application"
  | "database"
  | "realtime"
  | "queue"
  | "webhook"
  | "api"
  | "ai-provider"
  | "whatsapp-provider"
  | "storage"
  | "worker";

export type HealthCheck = {
  id: HealthDomain;
  label: string;
  status: HealthStatus;
  /** Measured latency for this subsystem, or null when there is nothing to measure. */
  latencyMs: number | null;
  /** Failure ratio 0..1 over the check's window, or null when there was no traffic. */
  errorRate: number | null;
  detail: string;
  metrics: { label: string; value: string }[];
};

export type ErrorEvent = {
  id: string;
  message: string;
  service: string;
  level: "error" | "warning";
  count: number;
  firstSeen: string;
  lastSeen: string;
  detail?: string;
};

export type TraceSpan = {
  traceId: string;
  name: string;
  service: string;
  durationMs: number;
  startedAt: string;
  status: "ok" | "error";
  spans: number;
};

export type LogEntry = {
  ts: string;
  level: "debug" | "info" | "warn" | "error";
  service: string;
  message: string;
};

/** A threshold rule evaluated against live measurements on every refresh. */
export type AlertRule = {
  id: string;
  name: string;
  domain: HealthDomain;
  condition: string;
  severity: "critical" | "warning";
  firing: boolean;
  /** The measured value the rule was evaluated against, as display text. */
  current: string;
};

export type DataSource = {
  id: string;
  label: string;
  rows24h: number;
  lastAt: string | null;
};

export type MonitoringSnapshot = {
  generatedAt: string;
  overallStatus: HealthStatus;
  /** 0..100 over the checks that have a signal, or null when none do. */
  healthScore: number | null;
  /** How many checks have no signal yet (status "unknown"). */
  unmeasured: number;
  checks: HealthCheck[];
  errors: ErrorEvent[];
  traces: TraceSpan[];
  logs: LogEntry[];
  alerts: AlertRule[];
  metrics: {
    requestsPerMin: number;
    p50Ms: number | null;
    p95Ms: number | null;
    p99Ms: number | null;
    errorRate: number | null;
    activeUsers: number;
    processUptimeSeconds: number | null;
  };
  sources: DataSource[];
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

export const getMonitoringSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MonitoringSnapshot> => {
    await assertPlatformStaff(context.supabase, context.userId);
    const { buildMonitoringCenterSnapshot } = await import("./monitoring-center.server");
    return buildMonitoringCenterSnapshot();
  });
