/**
 * Public widget typing endpoint. Lets a verified visitor publish (or clear)
 * a typing indicator that agents see in the unified Inbox.
 *
 * The visitor's `sessionId` doubles as the `user_id` on `conversation_typing`
 * (the column has no FK), so agent-side hooks pick it up unchanged.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  verifyVisitor,
  checkWidgetRate,
  setVisitorTyping,
} from "@/lib/widget/widget-runtime.server";

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
  typing: z.boolean(),
});

export const Route = createFileRoute("/api/public/widget/typing")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json(400, { error: "Invalid JSON" });
        }
        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) return json(400, { error: "Invalid input" });

        const { sessionId, visitorToken, typing } = parsed.data;

        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
          "unknown";
        if (!checkWidgetRate(`typing:${sessionId}:${ip}`, 60)) {
          return json(429, { error: "Too many typing updates" });
        }

        if (!verifyVisitor(sessionId, visitorToken)) {
          return json(401, { error: "Invalid session" });
        }

        await setVisitorTyping(sessionId, typing);
        return json(200, { ok: true });
      },
    },
  },
});
