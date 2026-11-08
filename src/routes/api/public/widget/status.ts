/**
 * Public widget status endpoint. Returns the current handoff state and
 * assignment info for a verified session so the widget can react when an
 * agent takes over or joins the queue.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  loadWidgetStatus,
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

export const Route = createFileRoute("/api/public/widget/status")({
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
        if (!checkWidgetRate(`status:${sessionId}:${ip}`, 60)) {
          return json(429, { error: "Too many status requests" });
        }

        if (!verifyVisitor(sessionId, visitorToken)) return json(401, { error: "Invalid session" });
        const status = await loadWidgetStatus(sessionId);
        if (!status) return json(404, { error: "Session not found" });
        return json(200, status);
      },
    },
  },
});
