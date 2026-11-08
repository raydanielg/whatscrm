/**
 * Client-callable server functions for the messaging layer.
 *
 * These are the entry points the app uses to enqueue an outbound WhatsApp
 * message, sync templates, and drain the outbox on demand.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const OutboundPayloadSchema = z.object({
  to: z.string().min(1),
  type: z.enum([
    "text", "image", "video", "audio", "document", "sticker",
    "location", "contacts", "template", "interactive", "reaction",
  ]),
  text: z.object({ body: z.string(), preview_url: z.boolean().optional() }).optional(),
  media: z.object({
    kind: z.enum(["image", "video", "audio", "document", "sticker"]),
    url: z.string().url().optional(),
    mediaId: z.string().optional(),
    storagePath: z.string().optional(),
    filename: z.string().optional(),
    caption: z.string().optional(),
    mimeType: z.string().optional(),
  }).optional(),
  template: z.object({
    name: z.string(),
    language: z.string(),
    components: z.array(z.record(z.string(), z.unknown())).optional(),
  }).optional(),
  interactive: z.record(z.string(), z.unknown()).optional(),
  location: z.object({
    latitude: z.number(), longitude: z.number(),
    name: z.string().optional(), address: z.string().optional(),
  }).optional(),
  reaction: z.object({ messageId: z.string(), emoji: z.string() }).optional(),
  contacts: z.array(z.record(z.string(), z.unknown())).optional(),
  contextMessageId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const EnqueueSchema = z.object({
  channelAccountId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  messageId: z.string().uuid().optional(),
  payload: OutboundPayloadSchema,
  idempotencyKey: z.string().max(200).optional(),
});

/** Enqueue an outbound message. RLS ensures the user belongs to the workspace. */
export const enqueueOutboundMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => EnqueueSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Verify caller can access the channel account (RLS applies).
    const { data: acc, error: aErr } = await context.supabase
      .from("channel_accounts" as never)
      .select("id, workspace_id, provider, status")
      .eq("id", data.channelAccountId)
      .maybeSingle();
    if (aErr || !acc) throw new Error("Channel account not found");
    const account = acc as unknown as { id: string; workspace_id: string; provider: string; status: string };
    if (account.status !== "connected") throw new Error(`Channel account not connected (status=${account.status})`);

    const { data: row, error } = await context.supabase
      .from("message_outbox" as never)
      .insert({
        workspace_id: account.workspace_id,
        channel_account_id: account.id,
        conversation_id: data.conversationId ?? null,
        message_id: data.messageId ?? null,
        provider: account.provider,
        to_address: data.payload.to,
        payload: data.payload,
        idempotency_key: data.idempotencyKey ?? null,
        status: "queued",
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { outboxId: (row as { id: string }).id };
  });

/** Force-drain the outbox (used by cron + manual runs). Admin-only. */
export const drainOutboxNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ batch: z.number().int().min(1).max(200).optional() }).parse(input))
  .handler(async ({ data, context }) => {
    // Only workspace owners/admins in ANY workspace may trigger this; we
    // gate by superadmin OR any admin membership.
    const { data: isSuper } = await context.supabase
      .from("user_roles" as never)
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "superadmin")
      .maybeSingle();
    const { data: admin } = await context.supabase
      .from("workspace_members" as never)
      .select("workspace_id")
      .eq("user_id", context.userId)
      .in("role", ["owner", "admin"])
      .limit(1)
      .maybeSingle();
    if (!isSuper && !admin) throw new Error("Forbidden");

    const { drainOutbox } = await import("./queue.server");
    return await drainOutbox(`user:${context.userId}`, data.batch ?? 25);
  });

/** Sync WhatsApp templates from Meta for a channel account. Admin-only. */
export const syncTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ channelAccountId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Confirm caller is admin of the account's workspace.
    const { data: acc } = await context.supabase
      .from("channel_accounts" as never)
      .select("workspace_id")
      .eq("id", data.channelAccountId)
      .maybeSingle();
    if (!acc) throw new Error("Channel account not found");
    const ws = (acc as { workspace_id: string }).workspace_id;
    const { data: role } = await context.supabase
      .from("workspace_members" as never)
      .select("role")
      .eq("workspace_id", ws)
      .eq("user_id", context.userId)
      .maybeSingle();
    const r = (role as { role: string } | null)?.role;
    if (r !== "owner" && r !== "admin") throw new Error("Forbidden");

    const { syncTemplatesForAccount } = await import("./templates.server");
    return await syncTemplatesForAccount(data.channelAccountId);
  });

/**
 * Retry a failed / dead-lettered outbox row. Re-queues it with attempts reset
 * so the worker will try again on the next drain.
 */
export const retryOutboundMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ outboxId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("message_outbox" as never)
      .select("id, workspace_id, status, message_id")
      .eq("id", data.outboxId)
      .maybeSingle();
    if (error || !row) throw new Error("Outbox row not found");
    const r = row as { id: string; workspace_id: string; status: string; message_id: string | null };
    if (r.status !== "failed" && r.status !== "dead_letter") {
      throw new Error(`Cannot retry status=${r.status}`);
    }
    const { error: uErr } = await context.supabase
      .from("message_outbox" as never)
      .update({
        status: "queued",
        attempts: 0,
        next_attempt_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
        last_error: null,
        last_error_code: null,
        failed_at: null,
      } as never)
      .eq("id", r.id);
    if (uErr) throw new Error(uErr.message);
    if (r.message_id) {
      await context.supabase
        .from("messages" as never)
        .update({ status: "queued" } as never)
        .eq("id", r.message_id);
    }
    return { ok: true };
  });

/** Cancel a queued outbox row (before it's sent). */
export const cancelOutboundMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ outboxId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("message_outbox" as never)
      .select("id, status, message_id")
      .eq("id", data.outboxId)
      .maybeSingle();
    const r = row as { id: string; status: string; message_id: string | null } | null;
    if (!r) throw new Error("Outbox row not found");
    if (r.status === "sent") throw new Error("Message already sent");
    await context.supabase
      .from("message_outbox" as never)
      .update({
        status: "failed",
        last_error: "cancelled_by_user",
        last_error_code: "cancelled",
        failed_at: new Date().toISOString(),
      } as never)
      .eq("id", r.id);
    if (r.message_id) {
      await context.supabase
        .from("messages" as never)
        .update({ status: "failed" } as never)
        .eq("id", r.message_id);
    }
    return { ok: true };
  });

const ScheduleSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().min(1).max(4096),
  scheduledFor: z.string().datetime(),
  messageType: z.string().default("text"),
  attachments: z.array(z.record(z.string(), z.unknown())).default([]),
  payload: OutboundPayloadSchema.optional(),
});

/** Schedule a message for later delivery via the scheduler cron. */
export const scheduleOutboundMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ScheduleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: conv } = await context.supabase
      .from("conversations" as never)
      .select("workspace_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    const c = conv as { workspace_id: string } | null;
    if (!c) throw new Error("Conversation not found");

    const { data: row, error } = await context.supabase
      .from("scheduled_messages" as never)
      .insert({
        workspace_id: c.workspace_id,
        conversation_id: data.conversationId,
        created_by: context.userId,
        body: data.body,
        message_type: data.messageType,
        scheduled_for: data.scheduledFor,
        attachments: data.attachments,
        metadata: data.payload ? { payload: data.payload } : {},
        status: "pending",
      } as never)
      .select("id, scheduled_for")
      .single();
    if (error) throw new Error(error.message);
    return row as { id: string; scheduled_for: string };
  });

/** Force-run the scheduled-messages processor. Admin-only. */
export const processScheduledNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ batch: z.number().int().min(1).max(200).optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase
      .from("workspace_members" as never)
      .select("workspace_id")
      .eq("user_id", context.userId)
      .in("role", ["owner", "admin"])
      .limit(1)
      .maybeSingle();
    if (!admin) throw new Error("Forbidden");
    const { processDueScheduled } = await import("./scheduler.server");
    return await processDueScheduled(data.batch ?? 50);
  });
