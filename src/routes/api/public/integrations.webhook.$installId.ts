/**
 * Inbound integration webhook — one URL per connected integration.
 *
 *   POST /api/public/integrations/webhook/:installId
 *
 * This is the receiver for the marketplace's advertised inbound triggers
 * (`webhook-trigger.webhook_received`, `zapier.receive_action`,
 * `slack.slash_command`, ...). `installId` is `installed_integrations.id`.
 *
 * Security:
 *  - The raw body text is verified with `verifyInboundSignature` (HMAC-SHA256,
 *    constant time) against the install's stored secret before anything else
 *    touches the payload. `verifyInboundSignature` fails closed, so an install
 *    with no usable secret can never accept a delivery.
 *  - The signature header name comes from the provider manifest's
 *    `signature_header` config field (default `X-Signature`).
 *  - Rejected deliveries are audited in `inbound_webhook_deliveries`; responses
 *    never echo the body or any secret material.
 *
 * Idempotency: every verified delivery is claimed once on
 * `(provider, delivery_key)`, keyed by the provider's delivery id header when
 * it sends one and by the body digest otherwise.
 */
import { createFileRoute } from "@tanstack/react-router";
import { sbAny } from "@/lib/supabase/untyped";

const MAX_BODY_BYTES = 128 * 1024;
const RATE_PER_MINUTE = 120;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/integrations/webhook/$installId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const installId = params.installId;
        if (!UUID_RE.test(installId)) return json(404, { error: "not_found" });

        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
          "unknown";
        const { checkWidgetRate } = await import("@/lib/widget/widget-runtime.server");
        if (!checkWidgetRate(`integration-webhook:${installId}:${ip}`, RATE_PER_MINUTE)) {
          return json(429, { error: "rate_limited" });
        }

        const declaredLength = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
          return json(413, { error: "payload_too_large" });
        }
        const rawBody = await request.text();
        if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
          return json(413, { error: "payload_too_large" });
        }

        const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
        const { data: install } = await sbAny(supabaseAdmin)
          .from("installed_integrations")
          .select("id,workspace_id,provider_id,status,connection_key_cipher")
          .eq("id", installId)
          .maybeSingle();
        if (!install || install.status !== "active") return json(404, { error: "not_found" });

        const { getProvider } = await import("@/lib/integrations");
        const provider = getProvider(install.provider_id);
        const trigger = provider?.capabilities.find((c) => c.kind === "trigger");
        if (!provider || !trigger) return json(404, { error: "not_found" });

        const headerName = String(
          provider.configSchema.find((f) => f.key === "signature_header")?.defaultValue ??
            "x-signature",
        ).toLowerCase();

        let secret: string | undefined;
        try {
          const { decryptConnectionKey } = await import("@/lib/booking/providers/crypto.server");
          secret = decryptConnectionKey(install.connection_key_cipher) || undefined;
        } catch {
          secret = undefined;
        }

        const { verifyInboundSignature } = await import("@/lib/integrations/runtime.server");
        const { claimWebhookDelivery, completeWebhookDelivery, recordRejectedDelivery } =
          await import("@/lib/webhooks/idempotency.server");

        if (!verifyInboundSignature({ secret, header: request.headers.get(headerName), rawBody })) {
          await recordRejectedDelivery({
            provider: "integration",
            deliveryKey: `unverified:${installId}:${Date.now()}`,
            workspaceId: install.workspace_id,
            reason: `Invalid or missing ${headerName}`,
          });
          return json(401, { error: "invalid_signature" });
        }

        const { createHash } = await import("node:crypto");
        const deliveryId =
          request.headers.get("x-delivery-id") ??
          request.headers.get("x-request-id") ??
          createHash("sha256").update(rawBody).digest("hex");
        const eventType = `${install.provider_id}.${trigger.id}`;

        let body: unknown;
        try {
          body = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          body = { content_type: request.headers.get("content-type"), text: rawBody };
        }
        const url = new URL(request.url);
        const payload = {
          body,
          query: Object.fromEntries(url.searchParams),
          headers: {
            "content-type": request.headers.get("content-type"),
            "user-agent": request.headers.get("user-agent"),
          },
        };

        const claim = await claimWebhookDelivery({
          provider: "integration",
          deliveryKey: `${installId}:${deliveryId}`,
          workspaceId: install.workspace_id,
          payload: { event_type: eventType, install_id: installId, ...payload },
        });
        if (!claim.fresh) return json(200, { ok: true, duplicate: true });

        try {
          const { data: automations, error } = await sbAny(supabaseAdmin)
            .from("automations")
            .select("id,workspace_id,version")
            .eq("workspace_id", install.workspace_id)
            .eq("status", "active")
            .eq("trigger_type", eventType)
            .limit(200);
          if (error) throw new Error(error.message);

          const rows = (automations ?? []).map(
            (a: { id: string; workspace_id: string; version?: number }) => ({
              workspace_id: a.workspace_id,
              automation_id: a.id,
              version: a.version ?? 1,
              trigger_source: "integration_webhook",
              event_type: eventType,
              input: payload,
              idempotency_key: `${installId}:${deliveryId}`,
            }),
          );
          if (rows.length) {
            const { error: queueError } = await sbAny(supabaseAdmin)
              .from("workflow_queue")
              .insert(rows);
            if (queueError && queueError.code !== "23505") throw new Error(queueError.message);
          }

          await completeWebhookDelivery(
            claim.id,
            rows.length ? "processed" : "ignored",
            rows.length ? null : "no active automation listens for this trigger",
            install.workspace_id,
          );
          return json(200, { ok: true, event: eventType, enqueued: rows.length });
        } catch (err) {
          console.error("[integration-webhook] processing error:", err);
          await completeWebhookDelivery(claim.id, "failed", (err as Error).message);
          return json(500, { error: "processing_failed" });
        }
      },
    },
  },
});
