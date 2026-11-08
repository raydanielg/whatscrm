/**
 * Public widget rating endpoint. Stores CSAT (1-5) + optional comment on
 * the chatbot session. Idempotent — a visitor can update their rating.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { verifyVisitor, checkWidgetRate } from "@/lib/widget/widget-runtime.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

const BodySchema = z.object({
  sessionId: z.string().uuid(),
  visitorToken: z.string().min(10).max(200),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export const Route = createFileRoute("/api/public/widget/rate")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      POST: async ({ request }) => {
        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
          "unknown";
        if (!checkWidgetRate(`rate:${ip}`, 10)) {
          return json(429, { error: "Too many attempts" });
        }

        let body: unknown;
        try { body = await request.json(); } catch { return json(400, { error: "Invalid JSON" }); }
        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) return json(400, { error: "Invalid input" });

        const { sessionId, visitorToken, rating, comment } = parsed.data;
        if (!verifyVisitor(sessionId, visitorToken)) return json(401, { error: "Invalid session" });

        const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
        const { error } = await supabaseAdmin
          .from("chatbot_sessions")
          .update({
            rating,
            rating_comment: comment ?? null,
            rated_at: new Date().toISOString(),
          } as never)
          .eq("id", sessionId);
        if (error) return json(500, { error: "Could not save rating" });
        return json(200, { ok: true });
      },
    },
  },
});
