/**
 * Client-callable outbound delivery for the Inbox composer.
 * Thin wrapper — all logic lives in `outbound.server.ts`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { explainWhatsAppDeliveryFailure } from "@/lib/messaging/whatsapp-delivery-errors";

const DeliverSchema = z.object({ messageId: z.string().uuid() });

export const deliverOutboundMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeliverSchema.parse(input))
  .handler(async ({ data, context }) => {
    // RLS check: the caller must be able to see the message in their workspace.
    const { data: visible, error } = await context.supabase
      .from("messages")
      .select("id")
      .eq("id", data.messageId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!visible) throw new Error("Message not found");

    const { deliverInboxMessage } = await import("@/lib/inbox/outbound.server");
    return deliverInboxMessage({ messageId: data.messageId, userId: context.userId });
  });

/** A confirmed failed receipt may be resent; clear its old provider ID first. */
export const retryFailedOutboundMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeliverSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: visible, error: readError } = await context.supabase
      .from("messages")
      .select("id, direction, status, failed_reason")
      .eq("id", data.messageId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!visible || visible.direction !== "outbound" || visible.status !== "failed") {
      throw new Error("This message is no longer available to retry");
    }
    const failure = explainWhatsAppDeliveryFailure(visible.failed_reason);
    if (!failure.retryable) throw new Error(failure.action ?? failure.summary);

    const { data: reset, error: updateError } = await context.supabase
      .from("messages")
      .update({
        status: "queued",
        failed_reason: null,
        provider_message_id: null,
        external_message_id: null,
        delivered_at: null,
        read_at: null,
      })
      .eq("id", data.messageId)
      .eq("status", "failed")
      .eq("direction", "outbound")
      .select("id")
      .maybeSingle();
    if (updateError) throw new Error(updateError.message);
    if (!reset) throw new Error("The message changed while retrying. Refresh the conversation.");

    const { deliverInboxMessage } = await import("@/lib/inbox/outbound.server");
    return deliverInboxMessage({ messageId: data.messageId, userId: context.userId });
  });

const ReactSchema = z.object({ messageId: z.string().uuid(), emoji: z.string().max(16) });

/** Push a reaction toggled in the UI out to the message's external channel. */
export const deliverReaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ReactSchema.parse(input))
  .handler(async ({ data, context }) => {
    // RLS check: the caller must be able to see the message in their workspace.
    const { data: visible, error } = await context.supabase
      .from("messages")
      .select("id")
      .eq("id", data.messageId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!visible) throw new Error("Message not found");

    const { deliverReaction: deliver } = await import("@/lib/inbox/outbound.server");
    return deliver({ messageId: data.messageId, emoji: data.emoji });
  });

const ResumeSchema = z.object({ conversationId: z.string().uuid() });

/** Re-deliver messages left stuck at `queued` (e.g. a dropped send request). */
export const resumeQueuedMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ResumeSchema.parse(input))
  .handler(async ({ data, context }) => {
    // RLS check: caller must be able to see the conversation in their workspace.
    const { data: visible, error } = await context.supabase
      .from("conversations")
      .select("id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!visible) throw new Error("Conversation not found");

    const { deliverQueuedMessages } = await import("@/lib/inbox/outbound.server");
    return deliverQueuedMessages({ conversationId: data.conversationId, userId: context.userId });
  });
