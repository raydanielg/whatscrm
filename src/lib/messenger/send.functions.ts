/**
 * Client-callable server functions for sending & scheduling Messenger
 * messages using stored Facebook Page access tokens.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";
import { MessengerSendError, redactSecrets } from "./errors";
import { assertSendablePsid, resolveMessengerRecipient } from "./psid";

const AttachmentSchema = z
  .object({
    type: z.enum(["image", "video", "audio", "file"]),
    url: z.string().url(),
  })
  .nullable()
  .optional();

const SendSchema = z.object({
  workspaceId: z.string().uuid(),
  messengerAccountId: z.string().uuid(),
  recipientPsid: z.string().min(3).max(64).optional(),
  conversationId: z.string().uuid().optional(),
  text: z.string().max(2000).optional().nullable(),
  attachment: AttachmentSchema,
  messagingType: z.enum(["RESPONSE", "UPDATE", "MESSAGE_TAG"]).optional(),
  tag: z.string().max(64).optional().nullable(),
});

const ScheduleSchema = SendSchema.extend({
  scheduledFor: z.string().datetime(),
});

/** Resolve the PSID and page id for the send. Uses admin only to read the encrypted token; all workspace checks stay under RLS. */
async function resolveTarget(opts: {
  supabase: import("@supabase/supabase-js").SupabaseClient;
  workspaceId: string;
  messengerAccountId: string;
  recipientPsid?: string;
  conversationId?: string;
}) {
  const { supabase, workspaceId, messengerAccountId, recipientPsid, conversationId } = opts;

  // RLS ensures the caller belongs to this workspace.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: accRow, error: accErr } = await (sbAny(supabase).from("messenger_accounts" as any) as any)
    .select("id, workspace_id, page_id, status")
    .eq("id", messengerAccountId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (accErr) throw new Error(accErr.message);
  if (!accRow) throw new Error("Messenger account not found");
  if (accRow.status !== "connected") throw new Error("Messenger account not connected");

  const pageId = accRow.page_id as string;
  let psid = recipientPsid?.trim() || null;
  const convId = conversationId ?? null;

  if (convId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: conv } = await (sbAny(supabase).from("conversations" as any) as any)
      .select("id, contact_id, workspace_id, channel, external_conversation_id, metadata")
      .eq("id", convId)
      .maybeSingle();
    if (!conv || conv.workspace_id !== workspaceId) throw new Error("Conversation not found");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: lastInbound } = await (sbAny(supabase).from("messages" as any) as any)
      .select("from_address")
      .eq("conversation_id", convId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const resolved = resolveMessengerRecipient(conv, pageId, lastInbound?.from_address ?? null);
    if (!resolved.ok) throw new MessengerSendError(resolved.kind, resolved.reason, { local: true });
    if (psid && psid !== resolved.psid) {
      throw new MessengerSendError(
        "invalid_recipient",
        "The PSID entered does not belong to the selected conversation",
        { local: true },
      );
    }
    psid = resolved.psid;
  }
  if (!psid) {
    throw new MessengerSendError("invalid_recipient", "Recipient PSID could not be resolved", { local: true });
  }
  assertSendablePsid(psid, pageId);

  return { psid, conversationId: convId, pageId, messengerAccountId: accRow.id as string };
}

/** Client-facing message for a send failure; never includes Meta internals or tokens. */
function toClientError(err: unknown): Error {
  if (err instanceof MessengerSendError) {
    const out = new Error(err.userMessage());
    out.name = `MessengerSendError:${err.kind}`;
    return out;
  }
  return new Error(redactSecrets((err as Error)?.message ?? "Messenger send failed"));
}

export const sendMessengerNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => SendSchema.parse(input))
  .handler(async ({ data, context }) => {
    const target = await resolveTarget({
      supabase: context.supabase,
      workspaceId: data.workspaceId,
      messengerAccountId: data.messengerAccountId,
      recipientPsid: data.recipientPsid,
      conversationId: data.conversationId,
    }).catch((err) => { throw toClientError(err); });

    // Fetch token via admin (never returned to the client).
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: tokRow, error: tokErr } = await supabaseAdmin
      .from("messenger_accounts")
      .select("access_token_ciphertext")
      .eq("id", data.messengerAccountId)
      .maybeSingle();
    if (tokErr || !tokRow?.access_token_ciphertext) {
      throw new Error("Page access token missing — reconnect this page");
    }

    const { sendMessengerMessage } = await import("./send.server");
    let result;
    try {
      result = await sendMessengerMessage({
        pageId: target.pageId,
        accessTokenCipher: tokRow.access_token_ciphertext,
        recipientPsid: target.psid,
        text: data.text ?? null,
        attachment: data.attachment ?? null,
        messagingType: data.messagingType,
        tag: data.tag ?? null,
      });
    } catch (err) {
      // Only a genuinely invalid token flips the Page to `expired`; a window
      // or recipient rejection must not disable sending for the whole Page.
      const { handleMessengerSendError } = await import("./token.server");
      await handleMessengerSendError(data.messengerAccountId, err);
      throw toClientError(err);
    }


    // Record an outbound message row for the inbox (best-effort).
    if (target.conversationId) {
      try {
        // The echo webhook for this send may already have stored the row.
        if (result.messageId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: echoed } = await (sbAny(supabaseAdmin).from("messages") as any)
            .select("id")
            .eq("workspace_id", data.workspaceId)
            .eq("provider_message_id", result.messageId)
            .limit(1);
          if (Array.isArray(echoed) && echoed.length > 0) {
            return { ok: true as const, messageId: result.messageId, recipientPsid: target.psid };
          }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sbAny(supabaseAdmin).from("messages") as any).insert({
          workspace_id: data.workspaceId,
          conversation_id: target.conversationId,
          direction: "outbound",
          message_type: data.attachment ? data.attachment.type : "text",
          body: data.text ?? "",
          status: "sent",
          provider: "messenger",
          provider_message_id: result.messageId || null,
          sender_user_id: context.userId,
          metadata: data.attachment ? { attachment: data.attachment } : {},
        });
        await supabaseAdmin
          .from("conversations")
          .update({
            last_message_at: new Date().toISOString(),
            last_message_preview: data.text ?? `[${data.attachment?.type ?? "attachment"}]`,
          })
          .eq("id", target.conversationId);
      } catch {
        // non-fatal; UI can still confirm the Graph send.
      }
    }

    return { ok: true as const, messageId: result.messageId, recipientPsid: target.psid };
  });

export const scheduleMessengerSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => ScheduleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const target = await resolveTarget({
      supabase: context.supabase,
      workspaceId: data.workspaceId,
      messengerAccountId: data.messengerAccountId,
      recipientPsid: data.recipientPsid,
      conversationId: data.conversationId,
    }).catch((err) => { throw toClientError(err); });

    if (!target.conversationId) {
      throw new Error(
        "Scheduling requires an existing Messenger conversation. Send once from the inbox first, then schedule further messages.",
      );
    }
    if (new Date(data.scheduledFor).getTime() <= Date.now() + 30_000) {
      throw new Error("scheduledFor must be at least 30 seconds in the future");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (sbAny(context.supabase).from("scheduled_messages" as any) as any)
      .insert({
        workspace_id: data.workspaceId,
        conversation_id: target.conversationId,
        created_by: context.userId,
        body: data.text ?? "",
        message_type: data.attachment ? data.attachment.type : "text",
        scheduled_for: data.scheduledFor,
        status: "pending",
        attachments: data.attachment ? [data.attachment] : [],
        metadata: {
          channel: "messenger",
          messenger_account_id: data.messengerAccountId,
          page_id: target.pageId,
          recipient_psid: target.psid,
          messaging_type: data.messagingType ?? "RESPONSE",
          tag: data.tag ?? null,
          attachment: data.attachment ?? null,
        },
      })
      .select("id, scheduled_for")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true as const, id: row.id as string, scheduledFor: row.scheduled_for as string };
  });

export const listMessengerScheduled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ workspaceId: z.string().uuid(), limit: z.number().int().min(1).max(200).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (sbAny(context.supabase).from("scheduled_messages" as any) as any)
      .select("id, conversation_id, body, message_type, scheduled_for, status, sent_at, error, metadata, attachments, created_at")
      .eq("workspace_id", data.workspaceId)
      .contains("metadata", { channel: "messenger" })
      .order("scheduled_for", { ascending: true })
      .limit(data.limit ?? 100);
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { rows: (rows ?? []) as any[] };
  });

export const cancelMessengerScheduled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ id: z.string().uuid(), workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sbAny(context.supabase).from("scheduled_messages" as any) as any)
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .eq("workspace_id", data.workspaceId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const listMessengerConversationsForSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        messengerAccountId: z.string().uuid().optional(),
        search: z.string().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = (sbAny(context.supabase).from("conversations" as any) as any)
      .select("id, contact_id, channel_account_id, last_message_at, last_message_preview, external_conversation_id, metadata")
      .eq("workspace_id", data.workspaceId)
      .eq("channel", "messenger")
      .order("last_message_at", { ascending: false })
      .limit(50);
    const { data: convs, error } = await q;
    if (error) throw new Error(error.message);
    const all = (convs ?? []) as Array<{
      id: string;
      contact_id: string | null;
      channel_account_id: string | null;
      last_message_at: string | null;
      last_message_preview: string | null;
      metadata: { account_id?: string | null } | null;
    }>;
    // Threads created before account tagging (webhook-created, older syncs) have
    // no account_id in metadata — keep them visible instead of hiding the list.
    const scoped = data.messengerAccountId
      ? all.filter((c) => {
          const accId = c.metadata?.account_id ?? c.channel_account_id ?? null;
          return !accId || accId === data.messengerAccountId;
        })
      : all;
    const list = scoped;
    const contactIds = Array.from(new Set(list.map((c) => c.contact_id).filter(Boolean))) as string[];

    let contacts: Record<string, { name: string | null; phone: string | null }> = {};
    if (contactIds.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: contactRows } = await (sbAny(context.supabase).from("contacts" as any) as any)
        .select("id, first_name, last_name, display_name, name, phone")
        .in("id", contactIds);
      for (const r of (contactRows ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; display_name: string | null; name: string | null; phone: string | null }>) {
        const name = r.display_name?.trim() || [r.first_name, r.last_name].filter(Boolean).join(" ").trim() || r.name?.trim() || null;
        contacts[r.id] = { name, phone: r.phone };
      }
    }
    const filtered = list
      .map((c) => ({
        ...c,
        contact: c.contact_id ? contacts[c.contact_id] ?? null : null,
      }))
      .filter((c) => {
        if (!data.search) return true;
        const s = data.search.toLowerCase();
        return (
          (c.contact?.name ?? "").toLowerCase().includes(s) ||
          (c.last_message_preview ?? "").toLowerCase().includes(s)
        );
      });
    return { conversations: filtered };
  });
