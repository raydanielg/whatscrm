/**
 * Server-side security audit trail.
 *
 * Mirrors `audit-telemetry.ts` (browser) for code that runs on the server:
 * server functions, webhook handlers and API routes. Writes go through the
 * service-role client so an event is still recorded when the *reason* for the
 * event is that the caller had no access.
 */
import { isAccessDenial, asPostgrestError, type AuditSeverity } from "./audit-telemetry";
import { sbAny } from "@/lib/supabase/untyped";

export type ServerAuditEvent = {
  eventType: string;
  severity?: AuditSeverity;
  workspaceId?: string | null;
  actorId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  data?: Record<string, unknown>;
};

/** Best-effort write; never throws so auditing can't break the request. */
export async function recordServerAuditEvent(event: ServerAuditEvent): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    await sbAny(supabaseAdmin).from("security_events").insert({
      workspace_id: event.workspaceId ?? null,
      actor_id: event.actorId ?? null,
      severity: event.severity ?? "info",
      event_type: event.eventType,
      resource_type: event.resourceType ?? null,
      resource_id: event.resourceId ?? null,
      ip_address: event.ip ?? null,
      user_agent: event.userAgent?.slice(0, 300) ?? null,
      data: { source: "server", ...(event.data ?? {}) },
    });
  } catch (error) {
    console.error("[audit] failed to record security event", event.eventType, error);
  }
}

/** Pulls caller IP + user agent out of an incoming request. */
export function requestAuditContext(request: Request): { ip: string | null; userAgent: string | null } {
  const forwarded = request.headers.get("x-forwarded-for");
  return {
    ip: forwarded?.split(",")[0]?.trim() || request.headers.get("cf-connecting-ip") || null,
    userAgent: request.headers.get("user-agent"),
  };
}

/**
 * Audits a Supabase result on the server. Denials land as `rls.denied`
 * (critical); other errors as `db.error` (warning). Returns the error so the
 * caller can keep its own control flow.
 */
export async function auditServerDbError(
  error: unknown,
  context: {
    operation?: string;
    resource?: string;
    workspaceId?: string | null;
    actorId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  } = {},
): Promise<void> {
  if (!error) return;
  const denied = isAccessDenial(error);
  const parsed = asPostgrestError(error);
  await recordServerAuditEvent({
    eventType: denied ? "rls.denied" : "db.error",
    severity: denied ? "critical" : "warning",
    workspaceId: context.workspaceId ?? null,
    actorId: context.actorId ?? null,
    resourceType: "database",
    resourceId: context.resource ?? "unknown",
    ip: context.ip ?? null,
    userAgent: context.userAgent ?? null,
    data: {
      operation: context.operation ?? "read",
      pg_code: parsed?.code ?? null,
      message: parsed?.message?.slice(0, 500) ?? (error instanceof Error ? error.message.slice(0, 500) : null),
      details: parsed?.details?.slice(0, 500) ?? null,
    },
  });
}

/** Audits a database function invocation performed on the server. */
export async function auditServerRpc(
  fn: string,
  outcome: { error?: unknown; durationMs?: number },
  context: { workspaceId?: string | null; actorId?: string | null } = {},
): Promise<void> {
  const denied = isAccessDenial(outcome.error);
  const failed = !!outcome.error;
  await recordServerAuditEvent({
    eventType: denied ? "rpc.denied" : failed ? "rpc.failed" : "rpc.call",
    severity: denied ? "critical" : failed ? "warning" : "info",
    workspaceId: context.workspaceId ?? null,
    actorId: context.actorId ?? null,
    resourceType: "rpc",
    resourceId: fn,
    data: {
      duration_ms: outcome.durationMs ?? null,
      pg_code: asPostgrestError(outcome.error)?.code ?? null,
      message: asPostgrestError(outcome.error)?.message?.slice(0, 300) ?? null,
    },
  });
}
