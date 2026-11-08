/**
 * Detailed security audit telemetry (client side).
 *
 * Everything funnels into the existing `security_events` table through the
 * `log_security_event` RPC, so the Security Center, Compliance Center and
 * Admin → Audit views pick these up with no extra plumbing.
 *
 * Three categories are captured:
 *   auth.*  — sign in / sign out / user updated / recovery
 *   rls.*   — row-level-security + permission denials from PostgREST
 *   rpc.*   — database function invocations (call, failure, denial)
 *
 * Logging is best-effort and never throws: an audit failure must not break
 * the user-facing action that triggered it.
 */
import { supabase as db } from "@/integrations/supabase/client";
import { readActiveWorkspaceId } from "@/lib/tenant/active-tenant";
import { sbAny } from "@/lib/supabase/untyped";

export type AuditSeverity = "info" | "warning" | "critical";

export type AuditEvent = {
  eventType: string;
  severity?: AuditSeverity;
  workspaceId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  data?: Record<string, unknown>;
};

/** Verbose auditing is on by default; set VITE_AUDIT_VERBOSE="false" to log denials only. */
export const AUDIT_VERBOSE =
  String(import.meta.env["VITE_AUDIT_VERBOSE"] ?? "true").toLowerCase() !== "false";

/** Postgres/PostgREST codes that mean "the policy or grant blocked this". */
const DENIAL_CODES = new Set(["42501", "PGRST301", "PGRST116", "PGRST204"]);
const DENIAL_TEXT =
  /row-level security|violates row-level security|permission denied|not authorized|insufficient privilege|jwt|not a member of workspace/i;

export type PostgrestLikeError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
  status?: number | null;
};

export function asPostgrestError(error: unknown): PostgrestLikeError | null {
  if (!error || typeof error !== "object") return null;
  const e = error as Record<string, unknown>;
  if (typeof e["message"] !== "string" && typeof e["code"] !== "string") return null;
  return {
    code: typeof e["code"] === "string" ? e["code"] : null,
    message: typeof e["message"] === "string" ? e["message"] : null,
    details: typeof e["details"] === "string" ? e["details"] : null,
    hint: typeof e["hint"] === "string" ? e["hint"] : null,
    status: typeof e["status"] === "number" ? e["status"] : null,
  };
}

/** True when the error is an access denial rather than a normal failure. */
export function isAccessDenial(error: unknown): boolean {
  const e = asPostgrestError(error);
  if (!e) return false;
  if (e.code && DENIAL_CODES.has(e.code)) return true;
  if (e.status === 401 || e.status === 403) return true;
  return DENIAL_TEXT.test(`${e.message ?? ""} ${e.details ?? ""} ${e.hint ?? ""}`);
}

// ---------------------------------------------------------------------------
// Emission (deduped, fire-and-forget)
// ---------------------------------------------------------------------------

const DEDUPE_WINDOW_MS = 10_000;
const recent = new Map<string, number>();

function shouldEmit(fingerprint: string): boolean {
  const now = Date.now();
  for (const [key, at] of recent) if (now - at > DEDUPE_WINDOW_MS) recent.delete(key);
  if (recent.has(fingerprint)) return false;
  recent.set(fingerprint, now);
  return true;
}

function clientContext(): Record<string, unknown> {
  if (typeof window === "undefined") return { source: "ssr" };
  return {
    source: "web",
    path: window.location?.pathname ?? null,
    user_agent: window.navigator?.userAgent?.slice(0, 300) ?? null,
  };
}

/** Writes one audit row. Never throws; returns false when it was skipped/failed. */
export async function recordAuditEvent(event: AuditEvent): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const severity = event.severity ?? "info";
  if (!AUDIT_VERBOSE && severity === "info") return false;

  const workspaceId = event.workspaceId ?? readActiveWorkspaceId();
  const fingerprint = [event.eventType, workspaceId, event.resourceType, event.resourceId].join("|");
  if (!shouldEmit(fingerprint)) return false;

  try {
    const rpc = db.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: unknown }>;
    const { error } = await rpc("log_security_event", {
      _workspace_id: workspaceId,
      _event_type: event.eventType,
      _severity: severity,
      _resource_type: event.resourceType ?? null,
      _resource_id: event.resourceId ?? null,
      _data: { ...clientContext(), ...(event.data ?? {}) },
    });
    return !error;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Auth auditing
// ---------------------------------------------------------------------------

export type AuthAuditEvent =
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "USER_UPDATED"
  | "PASSWORD_RECOVERY"
  | "MFA_CHALLENGE_VERIFIED"
  | "SIGN_IN_FAILED";

const AUTH_SEVERITY: Record<string, AuditSeverity> = {
  SIGNED_IN: "info",
  SIGNED_OUT: "info",
  USER_UPDATED: "warning",
  PASSWORD_RECOVERY: "warning",
  MFA_CHALLENGE_VERIFIED: "info",
  SIGN_IN_FAILED: "warning",
};

export function auditAuthEvent(
  event: AuthAuditEvent | string,
  details: { userId?: string | null; email?: string | null; reason?: string | null } = {},
) {
  void recordAuditEvent({
    eventType: `auth.${event.toLowerCase()}`,
    severity: AUTH_SEVERITY[event] ?? "info",
    resourceType: "auth.user",
    resourceId: details.userId ?? null,
    data: {
      auth_event: event,
      // Emails are PII: keep only the domain so incident review still works.
      email_domain: details.email?.split("@")[1] ?? null,
      reason: details.reason ?? null,
      at: new Date().toISOString(),
    },
  });
}

// ---------------------------------------------------------------------------
// RLS / permission denial auditing
// ---------------------------------------------------------------------------

export type DenialContext = {
  operation?: string;
  resource?: string;
  queryKey?: unknown;
};

function describeKey(key: unknown): string | null {
  if (key == null) return null;
  if (typeof key === "string") return key;
  if (Array.isArray(key)) {
    const head = key.filter((p) => typeof p === "string" || typeof p === "number");
    return head.slice(0, 3).join(":") || null;
  }
  return null;
}

/** Logs an RLS/permission denial. Returns true when something was recorded. */
export function auditAccessDenial(error: unknown, context: DenialContext = {}): boolean {
  if (!isAccessDenial(error)) return false;
  const e = asPostgrestError(error);
  const resource = context.resource ?? describeKey(context.queryKey) ?? "unknown";
  void recordAuditEvent({
    eventType: "rls.denied",
    severity: "critical",
    resourceType: "database",
    resourceId: resource,
    data: {
      operation: context.operation ?? "read",
      pg_code: e?.code ?? null,
      http_status: e?.status ?? null,
      message: e?.message?.slice(0, 500) ?? null,
      details: e?.details?.slice(0, 500) ?? null,
      hint: e?.hint?.slice(0, 300) ?? null,
    },
  });
  return true;
}

/** Logs any non-denial query/mutation failure at warning level. */
export function auditQueryFailure(error: unknown, context: DenialContext = {}) {
  if (auditAccessDenial(error, context)) return;
  if (!AUDIT_VERBOSE) return;
  const e = asPostgrestError(error);
  if (!e) return;
  void recordAuditEvent({
    eventType: "db.error",
    severity: "warning",
    resourceType: "database",
    resourceId: context.resource ?? describeKey(context.queryKey) ?? "unknown",
    data: {
      operation: context.operation ?? "read",
      pg_code: e.code ?? null,
      message: e.message?.slice(0, 500) ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// RPC auditing
// ---------------------------------------------------------------------------

/** RPCs whose arguments must never be written to the audit trail. */
const SENSITIVE_ARG_KEYS = /token|secret|password|key|credential|signature/i;

function safeArgs(args: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!args) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (SENSITIVE_ARG_KEYS.test(k)) out[k] = "[redacted]";
    else if (v == null || typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") out[k] = v.length > 120 ? `${v.slice(0, 120)}` : v;
    else out[k] = Array.isArray(v) ? `[array:${v.length}]` : "[object]";
  }
  return out;
}

/**
 * Calls a database function with full audit coverage: one `rpc.call` row on
 * success, `rpc.denied` (critical) or `rpc.failed` (warning) on error.
 * Drop-in replacement for `sbAny(supabase).rpc(name, args)`.
 */
export async function auditedRpc<T = unknown>(
  fn: string,
  args?: Record<string, unknown>,
  options: { workspaceId?: string | null } = {},
): Promise<{ data: T | null; error: unknown }> {
  const startedAt = performance.now();
  // Never audit the audit sink itself — that would recurse.
  const selfLogging = fn === "log_security_event";
  const { data, error } = await (db.rpc as unknown as (n: string, a?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)(fn, args);
  const duration = Math.round(performance.now() - startedAt);

  if (!selfLogging) {
    const denied = isAccessDenial(error);
    const failed = !!error;
    void recordAuditEvent({
      eventType: denied ? "rpc.denied" : failed ? "rpc.failed" : "rpc.call",
      severity: denied ? "critical" : failed ? "warning" : "info",
      workspaceId: options.workspaceId ?? null,
      resourceType: "rpc",
      resourceId: fn,
      data: {
        args: safeArgs(args),
        duration_ms: duration,
        pg_code: asPostgrestError(error)?.code ?? null,
        message: asPostgrestError(error)?.message?.slice(0, 300) ?? null,
      },
    });
  }

  return { data: (data ?? null) as T | null, error };
}
