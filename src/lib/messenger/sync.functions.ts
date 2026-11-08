/**
 * Facebook Messenger conversation sync.
 *
 * Pulls threads + message history for a linked Facebook Page and materialises
 * them into the omnichannel inbox tables:
 *
 *   messenger_accounts (source of truth for page + token)
 *   channel_identities  → per-contact external Messenger ID
 *   contacts            → linked customer record
 *   conversations       → one row per Messenger thread (channel='messenger')
 *   messages            → full message history, deduped on provider_message_id
 *
 * Read state is preserved via conversations.unread_count (from Graph's thread
 * unread_count) and per-message status ('read' when we can prove the page has
 * seen it, otherwise 'delivered').
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";
import { normalizeMetaAttachment, type MetaAttachment } from "@/lib/messaging/meta-attachment";

const GRAPH = "https://graph.facebook.com/v21.0";
const THREAD_FIELDS = "id,updated_time,unread_count,snippet,participants,can_reply";
const MESSAGE_FIELDS = "id,from,to,message,created_time,attachments,tags";
const MAX_THREADS = 50;
const MAX_MESSAGES_PER_THREAD = 50;

type Json = Record<string, unknown>;

interface Participant {
  id: string;
  name?: string;
  email?: string;
}

interface GraphThread {
  id: string;
  updated_time?: string;
  unread_count?: number;
  snippet?: string;
  can_reply?: boolean;
  participants?: { data?: Participant[] };
}

interface GraphMessage {
  id: string;
  message?: string;
  created_time?: string;
  from?: Participant;
  to?: { data?: Participant[] };
  attachments?: { data?: MetaAttachment[] };
  tags?: { data?: Array<{ name?: string }> };
}

async function graphGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const text = await res.text();
  let body: unknown = null;
  try { body = JSON.parse(text); } catch { /* ignore */ }
  if (!res.ok) {
    const msg =
      (body as { error?: { message?: string } } | null)?.error?.message ??
      text.slice(0, 240);
    throw new Error(`Graph ${res.status}: ${msg}`);
  }
  return body as T;
}

export const syncMessengerConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { accountId: string; limit?: number }) =>
    z
      .object({
        accountId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // 1) Look up the account through the caller's RLS-scoped client so we
    //    confirm workspace membership before touching the admin client.
    const { data: acctRow, error: acctErr } = await context.supabase
      .from("messenger_accounts")
      .select("id, workspace_id, page_id, page_name, status")
      .eq("id", data.accountId)
      .maybeSingle();
    if (acctErr) throw new Error(acctErr.message);
    if (!acctRow) throw new Error("Messenger account not found");
    if (acctRow.status !== "connected") {
      throw new Error(`Account is ${acctRow.status}. Reconnect the Page before syncing.`);
    }

    // 2) Read the encrypted page token and any Meta app secret via the
    //    server-only admin client (never leaks to the browser).
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: tokenRow, error: tokErr } = await supabaseAdmin
      .from("messenger_accounts")
      .select("access_token_ciphertext")
      .eq("id", data.accountId)
      .maybeSingle();
    if (tokErr) throw new Error(tokErr.message);
    if (!tokenRow?.access_token_ciphertext) {
      throw new Error("Page has no stored access token. Reconnect it to sync.");
    }
    // Keep Node crypto out of the browser graph. This module is imported by
    // React components because it exports a createServerFn stub, so any static
    // import of token-crypto.server.ts is bundled for the client by Vite.
    const { decryptToken } = await import("@/lib/instagram/token-crypto.server");
    const pageToken = decryptToken(tokenRow.access_token_ciphertext);
    const pageId = acctRow.page_id;
    const workspaceId = acctRow.workspace_id;

    const threadLimit = Math.min(MAX_THREADS, data.limit ?? MAX_THREADS);

    // 3) Fetch threads.
    const threadsUrl =
      `${GRAPH}/${encodeURIComponent(pageId)}/conversations` +
      `?platform=messenger&fields=${encodeURIComponent(THREAD_FIELDS)}` +
      `&limit=${threadLimit}&access_token=${encodeURIComponent(pageToken)}`;

    const threadsResp = await graphGet<{ data?: GraphThread[] }>(threadsUrl);
    const threads = threadsResp.data ?? [];

    const stats = {
      threads: threads.length,
      conversations: 0,
      messagesInserted: 0,
      contacts: 0,
      errors: [] as string[],
    };

    for (const thread of threads) {
      try {
        const summary = await syncOneThread({
          admin: supabaseAdmin,
          workspaceId,
          accountRowId: acctRow.id,
          pageId,
          pageToken,
          thread,
        });
        stats.conversations += 1;
        stats.messagesInserted += summary.messagesInserted;
        stats.contacts += summary.contactsUpserted;
      } catch (err) {
        const msg = (err as Error).message;
        console.error("[messenger-sync] thread failed:", thread.id, msg);
        stats.errors.push(`${thread.id}: ${msg}`);
      }
    }

    // 4) Stamp last_verified_at so operators can see when we last talked to Meta.
    await supabaseAdmin
      .from("messenger_accounts")
      .update({ last_verified_at: new Date().toISOString() })
      .eq("id", acctRow.id);

    return { ok: true, ...stats };
  });

// ---------- per-thread ----------

interface ThreadCtx {
  admin: { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  workspaceId: string;
  accountRowId: string;
  pageId: string;
  pageToken: string;
  thread: GraphThread;
}

async function syncOneThread(ctx: ThreadCtx) {
  const { admin, workspaceId, accountRowId, pageId, pageToken, thread } = ctx;

  // Identify the customer participant (anyone that isn't the page).
  const participants = thread.participants?.data ?? [];
  const customer = participants.find((p) => p.id && p.id !== pageId) ?? participants[0];
  if (!customer?.id) throw new Error("thread has no customer participant");

  // 1) Upsert channel_identity → contact.
  const { contactId, contactsUpserted } = await resolveContact({
    admin,
    workspaceId,
    externalId: customer.id,
    displayName: customer.name ?? null,
  });

  // 2) Upsert the conversation for this thread.
  const unread = Math.max(0, Number(thread.unread_count ?? 0));
  const lastAt = thread.updated_time ?? new Date().toISOString();

  const { ensureMessengerThread } = await import("./thread.server");
  const { conversationId } = await ensureMessengerThread(admin, {
    workspaceId, accountId: accountRowId, pageId, customerPsid: customer.id,
    contactId, graphThreadId: thread.id, inbound: false,
    preview: thread.snippet, reopen: unread > 0, source: "messenger_sync",
  });

  // 3) Fetch messages for this thread.
  const msgsUrl =
    `${GRAPH}/${encodeURIComponent(thread.id)}/messages` +
    `?fields=${encodeURIComponent(MESSAGE_FIELDS)}` +
    `&limit=${MAX_MESSAGES_PER_THREAD}&access_token=${encodeURIComponent(pageToken)}`;

  const msgsResp = await graphGet<{ data?: GraphMessage[] }>(msgsUrl);
  const msgs = (msgsResp.data ?? []).slice().reverse(); // oldest → newest for chronological insert

  let messagesInserted = 0;
  for (const m of msgs) {
    const providerId = m.id;
    if (!providerId) continue;

    // Dedupe by (conversation_id, provider_message_id).
    const { data: dupe } = await admin
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("provider_message_id", providerId)
      .maybeSingle();
    if (dupe) continue;

    const fromId = m.from?.id ?? "";
    const direction: "inbound" | "outbound" = fromId === pageId ? "outbound" : "inbound";

    // Outbound messages the page sent are "sent" (customer may not have read them).
    // Inbound messages: if the thread's unread_count is 0 the page has read
    // everything, so we can mark inbound history as "read"; otherwise "delivered".
    const status: "sent" | "delivered" | "read" =
      direction === "outbound" ? "sent" : unread === 0 ? "read" : "delivered";

    const attachments = m.attachments?.data ?? [];
    const { mediaUrl, mediaType, messageType } = normalizeMetaAttachment(attachments[0]);

    const metadata: Json = {
      source: "messenger_sync",
      from: m.from ?? null,
      to: m.to?.data ?? null,
      tags: m.tags?.data ?? null,
      attachments,
    };

    const { error: insErr } = await sbAny(admin).from("messages").insert({
      workspace_id: workspaceId,
      conversation_id: conversationId,
      direction,
      status,
      body: m.message ?? "",
      media_url: mediaUrl,
      media_type: mediaType,
      message_type: messageType,
      provider_message_id: providerId,
      from_address: m.from?.id ?? null,
      to_address: m.to?.data?.[0]?.id ?? null,
      created_at: m.created_time ?? new Date().toISOString(),
      metadata,
    });
    if (insErr) {
      // Duplicate deliveries are fine — log and continue.
      if (!String(insErr.message ?? "").toLowerCase().includes("duplicate")) {
        console.warn("[messenger-sync] message insert failed:", insErr.message);
      }
      continue;
    }
    messagesInserted += 1;
  }

  // 4) Refresh last_seen_at on the identity so it sorts recently.
  // The insert trigger increments unread_count for inbound history. Apply
  // Graph's snapshot after insertion so syncing does not count it a second time.
  const { error: refreshError } = await admin.from("conversations").update({
    last_message_at: lastAt,
    last_message_preview: thread.snippet ?? null,
    unread_count: unread,
  }).eq("id", conversationId);
  if (refreshError) throw new Error(refreshError.message);
  await admin
    .from("channel_identities")
    .update({ last_seen_at: lastAt })
    .eq("workspace_id", workspaceId)
    .eq("channel", "messenger")
    .eq("external_id", customer.id);

  return { messagesInserted, contactsUpserted };
}

// ---------- contact + identity resolution ----------

interface ResolveArgs {
  admin: { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  workspaceId: string;
  externalId: string;
  displayName: string | null;
}

async function resolveContact({ admin, workspaceId, externalId, displayName }: ResolveArgs) {
  // Existing identity?
  const { data: existingIdRaw } = await admin
    .from("channel_identities")
    .select("id, contact_id")
    .eq("workspace_id", workspaceId)
    .eq("channel", "messenger")
    .eq("external_id", externalId)
    .maybeSingle();
  const existingId = existingIdRaw as { id: string; contact_id: string | null } | null;

  if (existingId?.contact_id) {
    return { contactId: existingId.contact_id, contactsUpserted: 0 };
  }

  // Otherwise create a fresh contact and identity row.
  const { data: contactRaw, error: cErr } = await admin
    .from("contacts")
    .insert({
      workspace_id: workspaceId,
      name: displayName ?? `Messenger user ${externalId.slice(-6)}`,
      display_name: displayName,
      source: "messenger",
    })
    .select("id")
    .maybeSingle();
  if (cErr) throw new Error(cErr.message);
  const contactId = (contactRaw as { id: string }).id;

  if (existingId) {
    await admin
      .from("channel_identities")
      .update({
        contact_id: contactId,
        display_name: displayName,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", existingId.id);
  } else {
    const { error: idErr } = await sbAny(admin).from("channel_identities").insert({
      workspace_id: workspaceId,
      contact_id: contactId,
      channel: "messenger",
      external_id: externalId,
      display_name: displayName,
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    });
    if (idErr) throw new Error(idErr.message);
  }

  return { contactId, contactsUpserted: 1 };
}
