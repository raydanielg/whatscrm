import { sbAny } from "@/lib/supabase/untyped";
/**
 * Platform audit trail for payment gateway changes.
 *
 * Every super-admin mutation on `payment_gateway_settings` (add, configure,
 * enable/disable, default switch, delete) is written to
 * `platform_audit_logs` through the service-role client so the record exists
 * even when the caller's own RLS context would not allow the write.
 *
 * Best-effort: an audit failure never breaks the gateway action.
 */

export type GatewayAuditAction =
  | "gateway.created"
  | "gateway.updated"
  | "gateway.enabled"
  | "gateway.disabled"
  | "gateway.default_changed"
  | "gateway.mode_changed"
  | "gateway.deleted"
  | "gateway.webhooks_replayed"
  | "gateway.test_webhook_sent"
  | "gateway.links_verified"
  | "gateway.plan_linked"
  | "gateway.plan_link_updated"
  | "gateway.plan_unlinked";

export type GatewayAuditInput = {
  action: GatewayAuditAction;
  providerId: string;
  actorId: string | null;
  actorEmail?: string | null;
  summary: string;
  changes?: Record<string, unknown>;
  /** Defaults to "payment_gateway"; plan links use "plan_gateway_link". */
  resourceType?: "payment_gateway" | "plan_gateway_link";
  /** Overrides the resource id (defaults to the provider id). */
  resourceId?: string;
};

/** Values that must never be echoed into the audit payload verbatim. */
const SENSITIVE = /(secret|token|password|private)/i;

function sanitize(changes: Record<string, unknown> | undefined) {
  if (!changes) return {};
  return Object.fromEntries(
    Object.entries(changes).map(([key, value]) => [
      key,
      SENSITIVE.test(key) && typeof value === "string" && value.length > 0
        ? // Secret *names* are safe to keep; anything longer is redacted.
          (/^[A-Za-z_][A-Za-z0-9_]*$/.test(value) ? value : "[redacted]")
        : value,
    ]),
  );
}

export async function recordGatewayAudit(input: GatewayAuditInput): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    await sbAny(supabaseAdmin).from("platform_audit_logs").insert({
      actor_id: input.actorId,
      actor_email: input.actorEmail ?? null,
      action: input.action,
      resource_type: input.resourceType ?? "payment_gateway",
      resource_id: input.resourceId ?? input.providerId,
      summary: input.summary,
      changes: sanitize(input.changes),
    } as never);
  } catch (error) {
    console.error("[gateway-audit] failed to record", input.action, error);
  }
}
