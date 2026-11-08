/**
 * Public visitor tracking endpoint. Called by the embedded widget/tracker
 * script on page load and route changes to record anonymous visitor
 * activity, referrer, UTM parameters, device/browser and page views.
 *
 * No authentication — CORS wide-open. Trust boundary is:
 *   - chatbotId must resolve to an active, embeddable bot.
 *   - Rate limited per IP.
 *   - Callers can only write against their own visitor_key.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { loadEmbeddableBot, checkWidgetRate } from "@/lib/widget/widget-runtime.server";
import { upsertVisitor, recordEvent } from "@/lib/livechat/visitor-engine.server";
import { dispatchLivechatAutomations } from "@/lib/livechat/livechat-automation.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const BodySchema = z.object({
  chatbotId: z.string().uuid(),
  visitorKey: z.string().min(6).max(128),
  page: z.string().max(2048).optional(),
  referrer: z.string().max(2048).optional(),
  language: z.string().max(32).optional(),
  timezone: z.string().max(64).optional(),
  utm: z
    .object({
      source: z.string().max(128).nullable().optional(),
      medium: z.string().max(128).nullable().optional(),
      campaign: z.string().max(128).nullable().optional(),
      term: z.string().max(128).nullable().optional(),
      content: z.string().max(128).nullable().optional(),
    })
    .optional(),
  event: z.enum(["pageview", "custom", "identify"]).default("pageview"),
  eventName: z.string().max(120).optional(),
  properties: z.record(z.unknown()).optional(),
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/widget/track")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json(400, { error: "Invalid JSON" });
        }
        const parsed = BodySchema.safeParse(raw);
        if (!parsed.success) return json(400, { error: "Invalid input" });
        const body = parsed.data;

        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
          null;
        if (!checkWidgetRate(`track:${body.chatbotId}:${ip ?? "unknown"}`, 60)) {
          return json(429, { error: "Too many track requests" });
        }

        const bot = await loadEmbeddableBot(body.chatbotId);
        if (!bot) return json(404, { error: "Chatbot not available" });

        const country = request.headers.get("cf-ipcountry");
        const city = request.headers.get("cf-ipcity");

        const visitor = await upsertVisitor({
          workspaceId: bot.workspace_id,
          visitorKey: body.visitorKey,
          chatbotId: bot.id,
          userAgent: request.headers.get("user-agent"),
          language: body.language ?? null,
          timezone: body.timezone ?? null,
          page: body.page ?? null,
          referrer: body.referrer ?? null,
          ipAddress: ip,
          country: country || null,
          city: city || null,
          utm: body.utm ?? null,
        });
        if (!visitor) return json(500, { error: "Track failed" });

        await recordEvent({
          workspaceId: bot.workspace_id,
          visitorId: visitor.id,
          eventType: body.event,
          eventName: body.eventName,
          url: body.page,
          referrer: body.referrer,
          properties: body.properties,
        });

        // Fire automation dispatcher — non-blocking failure semantics.
        try {
          const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
          await dispatchLivechatAutomations({
            supabase: supabaseAdmin,
            workspaceId: bot.workspace_id,
            visitor: visitor as never,
            event: {
              eventType: body.event,
              eventName: body.eventName ?? null,
              url: body.page ?? null,
              properties: body.properties ?? null,
            },
          });
        } catch (err) {
          console.warn("[widget/track] automation dispatch error:", err);
        }


        return json(200, {
          visitorId: visitor.id,
          returning: visitor.visits_count > 1,
          knownContact: !!visitor.contact_id,
        });
      },
    },
  },
});
