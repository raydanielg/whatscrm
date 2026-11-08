/**
 * Public widget session endpoint. Creates a new livechat session for a
 * given chatbot and returns a signed visitor token used on subsequent
 * chat/history calls.
 *
 * CORS is wide-open by design — the widget must load from any customer
 * origin. Security relies on:
 *   - Bot must be `status='active'` AND have an enabled web/livechat deployment.
 *   - Rate limiting per IP + botId.
 *   - Sessions are opaque UUIDs; visitor tokens are HMAC-signed.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  createWidgetSession,
  loadEmbeddableBotDetailed,
  checkWidgetRate,
} from "@/lib/widget/widget-runtime.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const BodySchema = z.object({
  chatbotId: z.string().uuid(),
  page: z.string().max(2048).optional(),
  referrer: z.string().max(2048).optional(),
  // Stable per-browser key so repeat visits map to one visitor row.
  visitorKey: z.string().trim().min(6).max(80).optional(),
  language: z.string().max(20).optional(),
  timezone: z.string().max(60).optional(),
  // Pre-chat form — the visitor must identify themselves before chatting.
  visitorName: z.string().trim().min(2).max(120),
  visitorEmail: z.string().trim().email().max(255),
  visitorPhone: z.string().trim().min(6).max(32).regex(/^[+0-9()\s-]+$/, "Invalid phone"),
  newConversation: z.boolean().optional(),
  previousSessionId: z.string().uuid().optional(),
  previousVisitorToken: z.string().min(10).max(200).optional(),
});


function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/widget/session")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ request }) => {
        // Preview / configuration probe — returns just the public-facing bot
        // metadata without creating a session.
        const url = new URL(request.url);
        const botId = url.searchParams.get("chatbotId");
        if (!botId) return json(400, { error: "Missing chatbotId" });
        const { bot, message } = await loadEmbeddableBotDetailed(botId);
        if (!bot) return json(404, { error: message ?? "Chatbot not available" });
        return json(200, {
          bot: {
            id: bot.id,
            name: bot.name,
            avatarUrl: bot.avatar_url,
            welcomeMessage: bot.welcome_message,
            greeting: bot.greeting,
          },
        });
      },

      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json(400, { error: "Invalid JSON" });
        }
        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) {
          return json(400, {
            error: parsed.error.issues[0]?.message
              ? `Please provide your name, email and phone number`
              : "Invalid input",
          });
        }

        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
          "unknown";
        if (!checkWidgetRate(`session:${parsed.data.chatbotId}:${ip}`, 10)) {
          return json(429, { error: "Too many session requests" });
        }

        const probe = await loadEmbeddableBotDetailed(parsed.data.chatbotId);
        if (!probe.bot) return json(404, { error: probe.message ?? "Chatbot not available" });

        const result = await createWidgetSession(parsed.data.chatbotId, {
          page: parsed.data.page,
          referrer: parsed.data.referrer,
          userAgent: request.headers.get("user-agent") ?? undefined,
          visitorName: parsed.data.visitorName,
          visitorEmail: parsed.data.visitorEmail,
          visitorPhone: parsed.data.visitorPhone,
          visitorKey: parsed.data.visitorKey,
          language: parsed.data.language,
          timezone: parsed.data.timezone,
          ipAddress: ip !== "unknown" ? ip : undefined,
          newConversation: parsed.data.newConversation,
          previousSessionId: parsed.data.previousSessionId,
          previousVisitorToken: parsed.data.previousVisitorToken,
        });

        if (!result) return json(404, { error: "Chatbot not available" });

        return json(200, {
          sessionId: result.sessionId,
          visitorToken: result.visitorToken,
          bot: {
            id: result.bot.id,
            name: result.bot.name,
            avatarUrl: result.bot.avatar_url,
            welcomeMessage: result.bot.welcome_message,
            greeting: result.bot.greeting,
          },
        });
      },
    },
  },
});
