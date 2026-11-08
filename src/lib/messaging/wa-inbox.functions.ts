import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * WA Chatbot conversation inbox — agent actions.
 *
 * Sending goes through the Baileys worker, so it must run server-side. The
 * caller's own (RLS-scoped) client is used to authorize access to the
 * conversation before any privileged write happens.
 */

const sendSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().min(1).max(4096),
});

export const sendWaAgentReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => sendSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // RLS check — the user must be able to read this conversation.
    const { data: convo, error: convoErr } = await supabase
      .from("conversations")
      .select("id, workspace_id, contact_id, metadata, channel")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convoErr) throw new Error(convoErr.message);
    if (!convo) throw new Error("Conversation not found");

    const metadata = (convo.metadata ?? {}) as Record<string, unknown>;
    const sessionId = typeof metadata.wa_session_id === "string" ? metadata.wa_session_id : null;
    if (!sessionId) throw new Error("This conversation is not linked to a WhatsApp instance");

    const { data: contact } = await supabase
      .from("contacts")
      .select("phone")
      .eq("id", convo.contact_id)
      .maybeSingle();
    const to = contact?.phone;
    if (!to) throw new Error("Contact has no phone number");

    const { WorkerAPI } = await import("./qr-worker.server");
    const { recordOutboundWaMessage } = await import("./wa-inbox.server");
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

    const result = await WorkerAPI.sendMessage(sessionId, {
      to,
      type: "text",
      text: data.body,
      client_message_id: `agent:${data.conversationId}:${crypto.randomUUID()}`,
    });

    if (!result.available) {
      throw new Error("WhatsApp worker is not configured");
    }

    const failed = !result.ok;
    await recordOutboundWaMessage(supabaseAdmin, {
      workspaceId: convo.workspace_id,
      conversationId: convo.id,
      to,
      body: data.body,
      messageType: "text",
      providerMessageId:
        (result.data as { message_id?: string } | null)?.message_id ?? null,
      sentBy: userId,
      status: failed ? "failed" : "sent",
      failedReason: failed ? result.error || `Worker status ${result.status}` : null,
    });

    if (failed) {
      throw new Error(result.error || `WhatsApp worker returned ${result.status}`);
    }
    return { ok: true as const };
  });

const pauseSchema = z.object({
  conversationId: z.string().uuid(),
  paused: z.boolean(),
});

/** Pause/resume the auto-reply bot for a single conversation (agent takeover). */
export const setWaBotPaused = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => pauseSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: convo, error } = await supabase
      .from("conversations")
      .select("id, metadata")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!convo) throw new Error("Conversation not found");

    const next = {
      ...((convo.metadata ?? {}) as Record<string, unknown>),
      wa_bot_paused: data.paused,
    };
    const { error: updErr } = await supabase
      .from("conversations")
      .update({ metadata: next as never })
      .eq("id", data.conversationId);
    if (updErr) throw new Error(updErr.message);
    return { ok: true as const, paused: data.paused };
  });
