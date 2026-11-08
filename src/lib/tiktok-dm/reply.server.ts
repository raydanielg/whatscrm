/**
 * Deliver an Inbox reply on a TikTok DM thread through Business Messaging.
 */
import type { Admin, FetchImpl } from "@/lib/social-inbox/platforms.server";
import { sendTikTokDmText, validAccessToken, type TikTokBusinessAccountRow } from "./client.server";
import { TIKTOK_DM_SOURCE } from "./protocol";

type Meta = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" && v ? v : null);

export function isTikTokDmConversation(conv: { channel: string; metadata: Meta | null }): boolean {
  return conv.channel === "tiktok" && (conv.metadata ?? {}).source === TIKTOK_DM_SOURCE;
}

export async function deliverTikTokDmReply(args: {
  admin: Admin;
  conv: { id: string; workspace_id: string; metadata: Meta | null };
  msg: { body: string | null; reply_to_id: string | null };
  fetchImpl?: FetchImpl;
}): Promise<{ providerMessageId: string | null }> {
  const { admin, conv, msg } = args;
  const meta = conv.metadata ?? {};
  const text = msg.body?.trim();
  if (!text) throw new Error("TikTok messages must contain text.");
  const accountId = s(meta.account_id);
  const conversationId = s(meta.tiktok_conversation_id);
  if (!accountId || !conversationId) throw new Error("This conversation is not linked to a TikTok Business account.");

  const { data } = await admin
    .from("tiktok_business_accounts")
    .select("id, workspace_id, business_id, username, display_name, access_token, refresh_token, expires_at, refresh_expires_at, status")
    .eq("id", accountId)
    .eq("workspace_id", conv.workspace_id)
    .maybeSingle();
  const account = data as TikTokBusinessAccountRow | null;
  if (!account || account.status === "disconnected")
    throw new Error("The TikTok Business account for this thread is disconnected. Reconnect it.");

  let referencedMessageId: string | null = null;
  if (msg.reply_to_id) {
    const { data: quoted } = await admin
      .from("messages")
      .select("provider_message_id, conversation_id")
      .eq("id", msg.reply_to_id)
      .maybeSingle();
    const q = quoted as { provider_message_id?: string; conversation_id?: string } | null;
    if (q?.conversation_id === conv.id) referencedMessageId = s(q.provider_message_id);
  }

  const token = await validAccessToken(admin, account, args.fetchImpl);
  const providerMessageId = await sendTikTokDmText({
    token,
    businessId: account.business_id,
    conversationId,
    text,
    referencedMessageId,
    fetchImpl: args.fetchImpl,
  });
  return { providerMessageId };
}
