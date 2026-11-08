/**
 * Public widget chat endpoint. Runs one turn of the AI assistant for a
 * verified visitor session.
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  loadEmbeddableBot,
  verifyVisitor,
  runWidgetTurn,
  checkWidgetRate,
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

const AttachmentSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1).max(300),
  mime: z.string().min(1).max(120),
  size: z.number().int().min(0).max(50 * 1024 * 1024),
  kind: z.enum(["image", "document", "audio"]),
});

const BodySchema = z.object({
  chatbotId: z.string().uuid(),
  sessionId: z.string().uuid(),
  visitorToken: z.string().min(10).max(200),
  message: z.string().min(0).max(4000),
  attachments: z.array(AttachmentSchema).max(6).optional(),
});

export const Route = createFileRoute("/api/public/widget/chat")({
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

        const { chatbotId, sessionId, visitorToken, message, attachments } = parsed.data;
        if (!message.trim() && !(attachments && attachments.length)) {
          return json(400, { error: "Message or attachment required" });
        }

        // Rate limit before doing any DB work.
        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
          "unknown";
        if (!checkWidgetRate(`chat:${chatbotId}:${ip}`, 30)) {
          return json(429, { error: "Slow down — you're chatting a bit fast" });
        }

        if (!verifyVisitor(sessionId, visitorToken)) {
          return json(401, { error: "Invalid session" });
        }

        const bot = await loadEmbeddableBot(chatbotId);
        if (!bot) return json(404, { error: "Chatbot unavailable" });

        // Confirm the session actually belongs to this bot.
        const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
        const { data: sess } = await supabaseAdmin
          .from("chatbot_sessions")
          .select("id, chatbot_id, status")
          .eq("id", sessionId)
          .maybeSingle();
        if (!sess || (sess as { chatbot_id: string }).chatbot_id !== chatbotId) {
          return json(404, { error: "Session not found" });
        }
        if ((sess as { status: string }).status === "closed") {
          return json(410, { error: "Session closed" });
        }

        const result = await runWidgetTurn({ bot, sessionId, message, attachments });
        return json(200, result);
      },
    },
  },
});
