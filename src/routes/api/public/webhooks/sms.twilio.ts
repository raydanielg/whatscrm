/**
 * Inbound SMS webhook (Twilio-compatible).
 *
 *   POST /api/public/webhooks/sms/twilio
 *
 * Security:
 *  - `X-Twilio-Signature` is verified (HMAC-SHA1 over the full request URL +
 *    sorted POST params) against TWILIO_AUTH_TOKEN before any work happens.
 *    Unsigned or mismatching requests get 401 and are recorded as rejected.
 *  - Idempotency: Twilio retries deliveries, so each `MessageSid` /`SmsSid`
 *    is claimed once in `inbound_webhook_deliveries`; retries are acked
 *    without reprocessing, so no duplicate conversations can be created.
 */
import { createFileRoute } from "@tanstack/react-router";

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function twiml(status = 200): Response {
  return new Response(EMPTY_TWIML, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export const Route = createFileRoute("/api/public/webhooks/sms/twilio")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authToken = process.env["TWILIO_AUTH_TOKEN"];
        if (!authToken) {
          return new Response("sms webhook not configured", { status: 503 });
        }

        const form = await request.formData();
        const params: Record<string, string> = {};
        for (const [k, v] of form.entries()) {
          if (typeof v === "string") params[k] = v;
        }

        const {
          verifyTwilioSignature,
          claimWebhookDelivery,
          completeWebhookDelivery,
          recordRejectedDelivery,
        } = await import("@/lib/webhooks/idempotency.server");

        const signature = request.headers.get("x-twilio-signature");
        const sid = params["MessageSid"] ?? params["SmsSid"] ?? params["SmsMessageSid"] ?? "";

        // Twilio signs the exact URL it was configured with (https on the
        // published host); rebuild it from the forwarded proto/host headers.
        const url = new URL(request.url);
        const proto = request.headers.get("x-forwarded-proto") ?? "https";
        const host = request.headers.get("x-forwarded-host") ?? url.host;
        const signedUrl = `${proto}://${host}${url.pathname}${url.search}`;

        if (!verifyTwilioSignature(signedUrl, params, authToken, signature)) {
          await recordRejectedDelivery({
            provider: "sms",
            deliveryKey: `unverified:${sid || "unknown"}:${Date.now()}`,
            reason: "Invalid or missing X-Twilio-Signature",
          });
          return new Response("invalid signature", { status: 401 });
        }

        if (!sid) return twiml();

        const claim = await claimWebhookDelivery({
          provider: "sms",
          deliveryKey: sid,
          payload: params,
        });
        // Retry of an already-handled message — ack and stop.
        if (!claim.fresh) return twiml();

        try {
          const { ingestInboundSms } = await import("@/lib/sms/webhook.server");
          const result = await ingestInboundSms(params);
          await completeWebhookDelivery(
            claim.id,
            result.handled ? "processed" : "ignored",
            result.reason ?? null,
          );
        } catch (err) {
          console.error("[sms-webhook] processing error:", err);
          await completeWebhookDelivery(claim.id, "failed", (err as Error).message);
        }

        return twiml();
      },
    },
  },
});
