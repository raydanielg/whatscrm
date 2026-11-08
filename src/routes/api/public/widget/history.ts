/**
 * Public widget history endpoint. Returns messages for a verified session
 * (used to restore a returning visitor's conversation on page reload).
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  loadWidgetHistory,
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

export const Route = createFileRoute("/api/public/widget/history")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ request }) => {
        const url = new URL(request.url);
        const sessionId = url.searchParams.get("sessionId") ?? "";
        const visitorToken = url.searchParams.get("visitorToken") ?? "";
        if (!sessionId || !visitorToken) return json(400, { error: "Missing params" });

        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
          "unknown";
        if (!checkWidgetRate(`history:${sessionId}:${ip}`, 60)) {
          return json(429, { error: "Too many history requests" });
        }

        if (!verifyVisitor(sessionId, visitorToken)) return json(401, { error: "Invalid session" });
        const messages = await loadWidgetHistory(sessionId);
        return json(200, { messages });
      },
    },
  },
});
