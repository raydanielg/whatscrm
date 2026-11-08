/**
 * Public widget conversations endpoint. Lists every conversation the verified
 * visitor has had with this bot, so the widget can show past chats.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  listVisitorConversations,
  verifyVisitor,
  checkWidgetRate,
} from "@/lib/widget/widget-runtime.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/widget/conversations")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ request }) => {
        const url = new URL(request.url);
        const chatbotId = url.searchParams.get("chatbotId") ?? "";
        const sessionId = url.searchParams.get("sessionId") ?? "";
        const visitorToken = url.searchParams.get("visitorToken") ?? "";
        if (!chatbotId || !sessionId || !visitorToken) return json(400, { error: "Missing params" });

        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
          "unknown";
        if (!checkWidgetRate(`conversations:${sessionId}:${ip}`, 60)) {
          return json(429, { error: "Too many requests" });
        }

        if (!verifyVisitor(sessionId, visitorToken)) return json(401, { error: "Invalid session" });
        const conversations = await listVisitorConversations(chatbotId, sessionId);
        return json(200, { conversations });
      },
    },
  },
});
