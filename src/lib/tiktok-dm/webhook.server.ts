/**
 * TikTok Business Messaging webhook: verify the signature, then mirror DMs
 * into the Inbox (channel 'tiktok', metadata.source 'tiktok_dm').
 *
 * One conversation per TikTok conversation id. Message ids are stored as
 * `provider_message_id`, so TikTok's at-least-once retries are idempotent.
 */
import { ensureInboxThread } from "@/lib/inbox/thread-dedup.server";
import { resolveContact } from "@/lib/social-inbox/ingest.server";
import type { Admin } from "@/lib/social-inbox/platforms.server";
import { sbAny } from "@/lib/supabase/untyped";
import { tiktokDmAppCreds } from "./client.server";
import {
  TIKTOK_DM_SOURCE,
  parseTikTokDmEvent,
  tiktokDmThreadKey,
  verifyTikTokSignature,
  type TikTokDmMessage,
} from "./protocol";

interface AccountRef {
  id: string;
  workspace_id: string;
  business_id: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function messageExists(admin: Admin, workspaceId: string, providerId: string) {
  const { data } = await admin
    .from("messages")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("provider_message_id", providerId)
    .limit(1)
    .maybeSingle();
  return !!data;
}

export type IngestOutcome =
  | { status: "skipped" }
  | { status: "inserted"; conversationId: string; contactId: string };

export async function ingestTikTokDm(
  admin: Admin,
  account: AccountRef,
  m: TikTokDmMessage,
  opts: { echoDelayMs?: number } = {},
): Promise<IngestOutcome> {
  const skipped = { status: "skipped" } as const;
  if (await messageExists(admin, account.workspace_id, m.messageId)) return skipped;
  if (m.fromBusiness) {
    // Our own Inbox sends echo back as im_send_msg, sometimes before the send
    // call has stored the provider id. Give it a moment, then re-check.
    await sleep(opts.echoDelayMs ?? 2500);
    if (await messageExists(admin, account.workspace_id, m.messageId)) return skipped;
  }

  const contactId = await resolveContact(
    admin,
    { workspaceId: account.workspace_id, platform: "tiktok" },
    { authorId: m.userId, authorName: m.userName, authorAvatar: null },
  );
  const { conversationId } = await ensureInboxThread(admin, {
    workspaceId: account.workspace_id,
    channel: "tiktok",
    externalConversationId: tiktokDmThreadKey(account.business_id, m.conversationId),
    accountId: account.id,
    contactId,
    inbound: !m.fromBusiness,
    preview: m.text,
    metadata: {
      source: TIKTOK_DM_SOURCE,
      platform: "tiktok",
      business_id: account.business_id,
      tiktok_conversation_id: m.conversationId,
      chat_id: m.userId,
      author_id: m.userId,
      author_name: m.userName,
    },
  });

  const { error } = await sbAny(admin)
    .from("messages")
    .insert({
      workspace_id: account.workspace_id,
      conversation_id: conversationId,
      direction: m.fromBusiness ? "outbound" : "inbound",
      status: m.fromBusiness ? "sent" : "delivered",
      body: m.text,
      message_type: "text",
      provider_message_id: m.messageId,
      external_message_id: m.messageId,
      from_address: m.fromBusiness ? account.business_id : m.userId,
      to_address: m.fromBusiness ? m.userId : account.business_id,
      created_at: m.createdAt,
      metadata: {
        source: TIKTOK_DM_SOURCE,
        tiktok_message_type: m.type,
        tiktok_conversation_id: m.conversationId,
        referenced_message_id: m.referencedMessageId,
        ...(m.fromBusiness ? { external_echo: true } : {}),
      },
    });
  if (error) {
    if (String(error.message ?? "").toLowerCase().includes("duplicate")) return skipped;
    throw new Error(error.message);
  }
  return { status: "inserted", conversationId, contactId };
}

export async function handleTikTokDmWebhook(request: Request, rawBody: string): Promise<Response> {
  const creds = tiktokDmAppCreds();
  if (!creds) return new Response("TikTok Business Messaging is not configured", { status: 503 });

  const check = verifyTikTokSignature({
    header: request.headers.get("tiktok-signature"),
    rawBody,
    secret: creds.secret,
  });
  if (!check.ok) return new Response(check.reason, { status: 401 });

  let envelope: unknown;
  try {
    envelope = JSON.parse(rawBody);
  } catch {
    return new Response("invalid json", { status: 400 });
  }
  const m = parseTikTokDmEvent(envelope);
  if (!m) return new Response("ignored", { status: 200 });

  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const admin = sbAny(supabaseAdmin) as Admin;
  const { data } = await admin
    .from("tiktok_business_accounts")
    .select("id, workspace_id, business_id")
    .eq("business_id", m.businessId)
    .eq("status", "active");
  const accounts = (data ?? []) as AccountRef[];

  let failed = 0;
  for (const account of accounts) {
    try {
      const outcome = await ingestTikTokDm(admin, account, m);
      // Only a newly stored customer text triggers the bot, so TikTok's
      // retries never produce a second auto-reply.
      if (outcome.status === "inserted" && !m.fromBusiness && m.type === "text") {
        const { runTikTokChatbot } = await import("./chatbot.server");
        await runTikTokChatbot(admin, account, m, outcome).catch((err) =>
          console.warn("[tiktok-dm] chatbot failed:", (err as Error).message),
        );
      }
      await admin
        .from("tiktok_business_accounts")
        .update({ last_event_at: new Date().toISOString(), last_error: null })
        .eq("id", account.id);
    } catch (err) {
      failed++;
      console.warn("[tiktok-dm] ingest failed:", m.messageId, (err as Error).message);
    }
  }
  // A non-2xx makes TikTok retry (up to 72h); only ask for that on real failures.
  return new Response(failed ? "retry" : "ok", { status: failed ? 500 : 200 });
}
