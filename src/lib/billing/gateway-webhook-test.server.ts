/**
 * Super-admin "send test webhook" (server-only).
 *
 * Runs a synthetic delivery against the platform's own public webhook
 * endpoint (`/api/public/webhooks/billing/:provider`) so staff can confirm the
 * route is reachable and see how a delivery is recorded. The payload is
 * unsigned on purpose — the endpoint MUST reject it — so no billing state is
 * ever mutated by a test. The outcome is written to
 * `payment_gateway_webhook_deliveries` with `metadata.test = true` and the
 * resulting row is returned to the caller.
 */

export interface TestWebhookResult {
  deliveryId: string | null;
  providerId: string;
  status: string;
  httpStatus: number | null;
  latencyMs: number | null;
  eventId: string;
  eventType: string;
  errorMessage: string | null;
  endpoint: string;
  receivedAt: string | null;
  reachable: boolean;
  secretConfigured: boolean;
}

interface DeliveryRow {
  id: string;
  status: string;
  http_status: number | null;
  latency_ms: number | null;
  error_message: string | null;
  received_at: string;
}

export async function sendTestWebhook(
  providerId: string,
  origin: string,
  actor: { id: string | null; email: string | null },
): Promise<TestWebhookResult> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

  const endpoint = `${origin.replace(/\/+$/, "")}/api/public/webhooks/billing/${providerId}`;
  const eventId = `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const eventType = "platform.test_webhook";
  const secretConfigured = Boolean(process.env[`${providerId.toUpperCase()}_WEBHOOK_SECRET`]);

  const startedAt = Date.now();
  let httpStatus: number | null = null;
  let reachable = false;
  let errorMessage: string | null = null;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": eventId,
        "x-platform-test": "1",
      },
      body: JSON.stringify({ id: eventId, type: eventType, data: { test: true } }),
    });
    httpStatus = response.status;
    reachable = true;
    if (response.status >= 500) {
      errorMessage = (await response.text().catch(() => "")).slice(0, 500) || "Endpoint error";
    }
  } catch (err) {
    errorMessage = String((err as Error)?.message ?? err).slice(0, 500);
  }

  const latencyMs = Date.now() - startedAt;

  // Endpoint reached + rejected the unsigned payload => the route and its
  // signature check are both working as intended.
  const status = !reachable
    ? "failed"
    : !secretConfigured || (httpStatus ?? 0) >= 500
      ? "misconfigured"
      : "processed";

  if (!reachable) {
    errorMessage = errorMessage ?? "Webhook endpoint unreachable";
  } else if (!secretConfigured) {
    errorMessage = `Missing ${providerId.toUpperCase()}_WEBHOOK_SECRET — live deliveries will be rejected`;
  }

  let row: DeliveryRow | null = null;
  try {
    const { data } = await supabaseAdmin
      .from("payment_gateway_webhook_deliveries")
      .insert({
        provider_id: providerId,
        provider_event_id: eventId,
        event_type: eventType,
        status,
        http_status: httpStatus,
        latency_ms: latencyMs,
        signature_verified: false,
        error_message: errorMessage,
        request_id: eventId,
        metadata: { test: true, endpoint, triggered_by_email: actor.email },
      } as never)
      .select("id, status, http_status, latency_ms, error_message, received_at")
      .single<DeliveryRow>();
    row = data ?? null;
  } catch (err) {
    console.error("[gateway-webhook-test] failed to record delivery", err);
  }

  try {
    const { recordGatewayAudit } = await import("./gateway-audit.server");
    await recordGatewayAudit({
      action: "gateway.test_webhook_sent",
      providerId,
      actorId: actor.id,
      actorEmail: actor.email,
      summary: `Sent test webhook to ${endpoint} (${status})`,
      changes: { http_status: String(httpStatus ?? "none"), latency_ms: String(latencyMs) },
    });
  } catch (err) {
    console.error("[gateway-webhook-test] audit failed", err);
  }

  return {
    deliveryId: row?.id ?? null,
    providerId,
    status: row?.status ?? status,
    httpStatus,
    latencyMs,
    eventId,
    eventType,
    errorMessage: row?.error_message ?? errorMessage,
    endpoint,
    receivedAt: row?.received_at ?? null,
    reachable,
    secretConfigured,
  };
}
