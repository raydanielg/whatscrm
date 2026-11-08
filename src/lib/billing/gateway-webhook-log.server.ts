import { sbAny } from "@/lib/supabase/untyped";
/**
 * Payment gateway webhook delivery telemetry (server-only).
 *
 * Every inbound `/api/public/webhooks/billing/:provider` delivery is recorded
 * with its outcome, latency and error so super admins can see gateway health
 * without digging through runtime logs. Best-effort: a failed write never
 * affects the webhook response.
 */

export type GatewayWebhookStatus =
  | "processed"
  | "duplicate"
  | "failed"
  | "invalid_signature"
  | "misconfigured";

export interface GatewayWebhookDelivery {
  providerId: string;
  status: GatewayWebhookStatus;
  eventId?: string | null;
  eventType?: string | null;
  httpStatus?: number | null;
  latencyMs?: number | null;
  signatureVerified?: boolean;
  errorMessage?: string | null;
  requestId?: string | null;
  sourceIp?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordGatewayWebhookDelivery(
  delivery: GatewayWebhookDelivery,
): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    await sbAny(supabaseAdmin).from("payment_gateway_webhook_deliveries").insert({
      provider_id: delivery.providerId,
      provider_event_id: delivery.eventId ?? null,
      event_type: delivery.eventType ?? null,
      status: delivery.status,
      http_status: delivery.httpStatus ?? null,
      latency_ms: delivery.latencyMs ?? null,
      signature_verified: delivery.signatureVerified ?? false,
      error_message: delivery.errorMessage?.slice(0, 1000) ?? null,
      request_id: delivery.requestId ?? null,
      source_ip: delivery.sourceIp ?? null,
      metadata: JSON.parse(JSON.stringify(delivery.metadata ?? {})),
    });
  } catch (error) {
    console.error("[gateway-webhook-log] failed to record delivery", error);
  }
}

/** Caller IP + delivery id from the incoming request, for the log row. */
export function webhookRequestContext(request: Request): {
  sourceIp: string | null;
  requestId: string | null;
} {
  const forwarded = request.headers.get("x-forwarded-for");
  return {
    sourceIp:
      forwarded?.split(",")[0]?.trim() || request.headers.get("cf-connecting-ip") || null,
    requestId:
      request.headers.get("stripe-request-id") ??
      request.headers.get("x-request-id") ??
      null,
  };
}
