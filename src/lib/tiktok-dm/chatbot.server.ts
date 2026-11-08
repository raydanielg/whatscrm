/**
 * TikTok DM chatbot: answer a new customer message with the workspace's
 * TikTok bot through the shared chatbot dispatcher, then send the reply as a
 * TikTok DM and mirror it into the Inbox thread.
 *
 * Bot resolution: a bot created on the TikTok Chatbot page
 * (widget_config.channel = "tiktok", pinned to this account or to all
 * accounts) wins; otherwise a Channels-tab deployment on "tiktok".
 */
import { findDeployedBot, dispatchChannelBot, type DispatchBot } from "@/lib/chatbots/channel-dispatch.server";
import type { Admin } from "@/lib/social-inbox/platforms.server";
import { sbAny } from "@/lib/supabase/untyped";
import { sendTikTokDmText, validAccessToken, type TikTokBusinessAccountRow } from "./client.server";
import { TIKTOK_DM_SOURCE, type TikTokDmMessage } from "./protocol";

const BOT_COLUMNS =
  "id, workspace_id, status, fallback_message, welcome_message, model, provider_id, temperature, max_tokens, system_prompt, handoff_enabled, handoff_keywords, language, personality, tone, widget_config";

export async function findTikTokBot(
  admin: Admin,
  account: { id: string; workspace_id: string },
): Promise<DispatchBot | null> {
  const { data } = await admin
    .from("chatbots")
    .select(BOT_COLUMNS)
    .eq("workspace_id", account.workspace_id)
    .eq("status", "active")
    .contains("widget_config", { channel: "tiktok" })
    .order("updated_at", { ascending: false });
  const bots = (data ?? []) as Array<DispatchBot & { widget_config: { tiktok_account_id?: string | null } | null }>;
  const pinned = bots.find((b) => b.widget_config?.tiktok_account_id === account.id);
  const anyAccount = bots.find((b) => !b.widget_config?.tiktok_account_id);
  if (pinned ?? anyAccount) return (pinned ?? anyAccount)!;
  return findDeployedBot(admin, { workspaceId: account.workspace_id, channel: "tiktok", accountId: account.id });
}

export async function runTikTokChatbot(
  admin: Admin,
  account: { id: string; workspace_id: string; business_id: string },
  m: TikTokDmMessage,
  thread: { conversationId: string; contactId: string },
  fetchImpl?: typeof fetch,
): Promise<{ replied: boolean; reply?: string }> {
  const bot = await findTikTokBot(admin, account);
  if (!bot) return { replied: false };

  const result = await dispatchChannelBot({
    admin,
    channel: "tiktok",
    workspaceId: account.workspace_id,
    accountId: account.id,
    externalId: m.userId,
    userText: m.text,
    conversationId: thread.conversationId,
    contactId: thread.contactId,
    sessionMetadata: { tiktok_account_id: account.id, tiktok_conversation_id: m.conversationId },
    bot,
  });
  if (!result?.reply) return { replied: false };

  const { data } = await admin
    .from("tiktok_business_accounts")
    .select("id, workspace_id, business_id, username, display_name, access_token, refresh_token, expires_at, refresh_expires_at, status")
    .eq("id", account.id)
    .maybeSingle();
  const row = data as TikTokBusinessAccountRow | null;
  if (!row) return { replied: false };

  const token = await validAccessToken(admin, row, fetchImpl);
  const messageId = await sendTikTokDmText({
    token,
    businessId: row.business_id,
    conversationId: m.conversationId,
    text: result.reply,
    fetchImpl,
  });

  await sbAny(admin)
    .from("messages")
    .insert({
      workspace_id: account.workspace_id,
      conversation_id: thread.conversationId,
      direction: "outbound",
      status: "sent",
      body: result.reply,
      message_type: "text",
      provider_message_id: messageId,
      external_message_id: messageId,
      from_address: row.business_id,
      to_address: m.userId,
      metadata: {
        source: "chatbot",
        channel_source: TIKTOK_DM_SOURCE,
        chatbot_id: result.botId,
        handed_off: result.handedOff,
      },
    });
  return { replied: true, reply: result.reply };
}
