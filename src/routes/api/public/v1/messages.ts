import { createFileRoute } from "@tanstack/react-router";
import { withGateway, jsonOk, jsonError, parseJson, preflight } from "@/lib/api/gateway.server";
import { z } from "zod";

const SendMessageSchema = z.object({
  conversation_id: z.string().uuid().optional(),
  to: z.string().min(6).max(40).optional(),
  channel: z.enum(["whatsapp", "sms", "email"]).default("whatsapp"),
  type: z.enum(["text", "template", "image", "document"]).default("text"),
  body: z.string().max(4096).optional(),
  template_name: z.string().max(200).optional(),
  template_variables: z.record(z.string(), z.string()).optional(),
  media_url: z.string().url().optional(),
}).refine((v) => v.conversation_id || v.to, { message: "conversation_id or to is required" });

export const Route = createFileRoute("/api/public/v1/messages")({
  server: {
    handlers: {
      OPTIONS: () => preflight(),
      POST: withGateway(
        { requiredScopes: ["messages:write"], rateLimit: { limit: 300, windowSeconds: 60 } },
        async (ctx, req) => {
          const body = await parseJson<unknown>(req);
          const parsed = SendMessageSchema.safeParse(body);
          if (!parsed.success) {
            return jsonError("validation_error", "Invalid message payload", { issues: parsed.error.issues }, ctx.requestId);
          }

          // Enqueue via message_outbox for the async delivery worker.
          const { data, error } = await ctx.supabase
            .from("message_outbox")
            .insert({
              organization_id: ctx.organizationId,
              conversation_id: parsed.data.conversation_id ?? null,
              recipient: parsed.data.to ?? null,
              channel: parsed.data.channel,
              message_type: parsed.data.type,
              body: parsed.data.body ?? null,
              template_name: parsed.data.template_name ?? null,
              template_variables: parsed.data.template_variables ?? null,
              media_url: parsed.data.media_url ?? null,
              status: "queued",
              source: "api",
            })
            .select("id, status, created_at")
            .single();

          if (error) return jsonError("internal_error", error.message, {}, ctx.requestId);
          return jsonOk(
            { id: data.id, status: data.status, queued_at: data.created_at },
            { status: 202, requestId: ctx.requestId },
          );
        },
      ),
    },
  },
});
