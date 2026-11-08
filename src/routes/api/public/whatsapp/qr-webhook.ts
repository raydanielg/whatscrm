/**
 * Baileys worker → WACRM webhook endpoint.
 *
 * Contract:
 *   POST /api/public/whatsapp/qr-webhook
 *   Headers:
 *     Content-Type: application/json
 *     X-WACRM-Timestamp: <unix seconds>            (required, ±5 min skew)
 *     X-WACRM-Signature: sha256=<hex hmac>         (HMAC of `${ts}.${rawBody}`)
 *     X-WACRM-Event-Id: <string>                   (required, unique per event)
 *   Body:
 *     { session_id, workspace_id, event_type, data }
 *
 * Idempotency:
 *   The `event_id` is inserted with a UNIQUE constraint FIRST. On conflict
 *   (23505) the endpoint returns 200 without re-applying any side effects.
 *
 * Security:
 *   - HMAC-SHA256 with `WA_QR_WEBHOOK_SECRET`, timing-safe compare.
 *   - Timestamp window (±300s) rejects replayed captures.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, X-WACRM-Timestamp, X-WACRM-Signature, X-WACRM-Event-Id",
  "Access-Control-Max-Age": "86400",
} as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function verifySignature(rawBody: string, timestamp: string, signature: string, secret: string) {
  if (!timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const skew = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (skew > 300) return false;

  const provided = signature.startsWith("sha256=") ? signature.slice(7) : signature;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/whatsapp/qr-webhook")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      POST: async ({ request }) => {
        const secret = process.env.WA_QR_WEBHOOK_SECRET;
        if (!secret) return json({ error: "Webhook secret not configured" }, 500);

        const rawBody = await request.text();
        const timestamp = request.headers.get("x-wacrm-timestamp") ?? "";
        const signature = request.headers.get("x-wacrm-signature") ?? "";
        const eventId = request.headers.get("x-wacrm-event-id") ?? "";

        if (!eventId) return json({ error: "Missing X-WACRM-Event-Id" }, 400);
        if (!verifySignature(rawBody, timestamp, signature, secret)) {
          return json({ error: "Invalid signature" }, 401);
        }

        let payload: {
          session_id?: string;
          workspace_id?: string;
          event_type?: string;
          data?: Record<string, unknown>;
        };
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }

        const { session_id, workspace_id, event_type, data } = payload;
        if (!event_type) return json({ error: "Missing event_type" }, 400);

        const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

        // 1) Insert delivery record — the UNIQUE(event_id) constraint enforces
        //    idempotency. Duplicate deliveries never reach the side-effect step.
        const { data: delivery, error: insErr } = await supabaseAdmin
          .from("wa_qr_webhook_deliveries")
          .insert({
            event_id: eventId,
            event_type,
            session_id: session_id ?? null,
            workspace_id: workspace_id ?? null,
            payload: (data ?? {}) as never,
            signature,
            status: "received",
          })
          .select("id")
          .single();

        if (insErr) {
          // 23505 = unique_violation → duplicate delivery, ack success.
          if ((insErr as { code?: string }).code === "23505") {
            return json({ ok: true, duplicate: true });
          }
          return json({ error: insErr.message }, 500);
        }

        // 2) Apply side effects, then mark processed.
        try {
          await dispatch(supabaseAdmin, event_type, session_id, data ?? {}, workspace_id);
          await supabaseAdmin
            .from("wa_qr_webhook_deliveries")
            .update({ status: "processed", processed_at: new Date().toISOString() })
            .eq("id", delivery.id);
          return json({ ok: true });
        } catch (e) {
          await supabaseAdmin
            .from("wa_qr_webhook_deliveries")
            .update({
              status: "failed",
              error: e instanceof Error ? e.message : String(e),
              processed_at: new Date().toISOString(),
            })
            .eq("id", delivery.id);
          return json({ error: "Processing failed" }, 500);
        }
      },
    },
  },
});

async function dispatch(
  admin: unknown,
  eventType: string,
  sessionId: string | undefined,
  data: Record<string, any>,
  workspace_id?: string,
) {
  const db = admin as any;

  switch (eventType) {
    case "session.qr_updated": {
      if (!sessionId) return;
      await db
        .from("whatsapp_qr_sessions")
        .update({
          status: "awaiting_scan",
          qr_expires_at: data.qr_expires_at ?? null,
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", sessionId);
      return;
    }
    case "session.scanned": {
      if (!sessionId) return;
      await db
        .from("whatsapp_qr_sessions")
        .update({ status: "scanned", last_seen_at: new Date().toISOString() })
        .eq("id", sessionId);
      return;
    }
    case "session.connected": {
      if (!sessionId) return;
      await db
        .from("whatsapp_qr_sessions")
        .update({
          status: "connected",
          phone_number: data.phone_number ?? null,
          display_name: data.display_name ?? null,
          device_platform: data.device_platform ?? null,
          connected_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", sessionId);
      return;
    }
    case "session.disconnected": {
      if (!sessionId) return;
      await db
        .from("whatsapp_qr_sessions")
        .update({
          status: "disconnected",
          disconnected_at: new Date().toISOString(),
          error_message: data.reason ?? null,
        })
        .eq("id", sessionId);
      return;
    }
    case "session.error": {
      if (!sessionId) return;
      await db
        .from("whatsapp_qr_sessions")
        .update({ status: "error", error_message: data.error ?? "Worker error" })
        .eq("id", sessionId);
      return;
    }
    case "message.received": {
      // 1) Persist the message into the WA Chatbot conversation inbox so
      //    agents can read and reply. 2) Fan it into the auto-reply engine,
      //    unless an agent has taken over (bot paused on that thread).
      //    Failures are logged and swallowed — ingestion and auto-reply must
      //    never break webhook acknowledgement.
      if (!sessionId) return;
      let botPaused = false;
      let conversationId: string | null = null;
      try {
        const { ingestInboundWaMessage } = await import("@/lib/messaging/wa-inbox.server");
        const res = await ingestInboundWaMessage(db, sessionId, data ?? {});
        botPaused = res?.botPaused ?? false;
        conversationId = res?.conversationId ?? null;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[qr-webhook] inbox ingest failed", err);
      }
      if (botPaused) return;
      try {
        const { runAutoReplyForSession } = await import("@/lib/messaging/wa-auto-reply.server");
        await runAutoReplyForSession(db, sessionId, data ?? {}, { conversationId });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[qr-webhook] auto-reply failed", err);
      }
      return;
    }
    case "message.status": {
      // Reconcile delivery/read receipts against the outbound message row.
      try {
        const { applyWaMessageStatus } = await import("@/lib/messaging/wa-inbox.server");
        await applyWaMessageStatus(db, workspace_id ?? "", data ?? {});
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[qr-webhook] status apply failed", err);
      }
      return;
    }
    default:
      // Unknown event types are recorded but not acted on.
      return;
  }
}
