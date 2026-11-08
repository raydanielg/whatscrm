/**
 * Shared chatbot dispatch for inbound channel messages (server-only).
 *
 * `chatbot_deployments` rows (created from the Channels tab) decide which bot
 * answers on a channel. Each channel's inbound handler calls
 * `dispatchChannelBot`, which resolves the bot, keeps a `chatbot_sessions`
 * row per (bot, channel, sender), runs handoff + AI, and returns the reply
 * text for the caller to deliver through its own send path.
 */
import { sbAny } from "@/lib/supabase/untyped";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

export type BotChannel =
  | "whatsapp" | "instagram" | "messenger" | "telegram"
  | "livechat" | "web" | "sms" | "email" | "tiktok";

export interface DispatchBot {
  id: string;
  workspace_id: string;
  status: string;
  fallback_message: string | null;
  welcome_message: string | null;
  model: string | null;
  provider_id: string | null;
  temperature: number | null;
  max_tokens: number | null;
  system_prompt: string | null;
  handoff_enabled: boolean | null;
  handoff_keywords: string[] | null;
  language: string | null;
  personality: string | null;
  tone: string | null;
}

const BOT_COLUMNS =
  "id, workspace_id, status, fallback_message, welcome_message, model, provider_id, temperature, max_tokens, system_prompt, handoff_enabled, handoff_keywords, language, personality, tone";

const CHANNEL_LABELS: Record<BotChannel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Facebook Messenger",
  telegram: "Telegram",
  livechat: "Live Chat",
  web: "Web chat",
  sms: "SMS",
  email: "Email",
  tiktok: "TikTok",
};

/**
 * Newest active bot with an enabled deployment on `channel`. A deployment
 * pinned to `accountId` wins over a workspace-wide one (null account).
 */
export async function findDeployedBot(
  admin: Admin,
  args: { workspaceId: string; channel: BotChannel; accountId?: string | null },
): Promise<DispatchBot | null> {
  const { data: deps } = await admin
    .from("chatbot_deployments")
    .select("chatbot_id, channel_account_id")
    .eq("workspace_id", args.workspaceId)
    .eq("channel", args.channel)
    .eq("enabled", true);
  const rows = (deps ?? []) as { chatbot_id: string; channel_account_id: string | null }[];
  const matching = rows.filter(
    (d) => !d.channel_account_id || d.channel_account_id === args.accountId,
  );
  if (matching.length === 0) return null;

  const { data: bots } = await admin
    .from("chatbots")
    .select(BOT_COLUMNS)
    .in("id", matching.map((d) => d.chatbot_id))
    .eq("status", "active")
    .order("updated_at", { ascending: false });
  const list = (bots ?? []) as DispatchBot[];
  if (list.length === 0) return null;

  const pinned = new Set(
    matching.filter((d) => d.channel_account_id === args.accountId).map((d) => d.chatbot_id),
  );
  return list.find((b) => pinned.has(b.id)) ?? list[0];
}

export interface DispatchResult {
  /** Text to send back; null when no reply should be sent. */
  reply: string | null;
  handedOff: boolean;
  botId: string;
}

export interface DispatchArgs {
  admin: Admin;
  channel: BotChannel;
  workspaceId: string;
  accountId?: string | null;
  /** Stable sender id on the channel (chat id, phone, PSID, address). */
  externalId: string;
  userText: string;
  conversationId?: string | null;
  contactId?: string | null;
  sessionMetadata?: Record<string, unknown>;
  /** Pre-resolved bot (e.g. from a legacy lookup); skips the deployment query. */
  bot?: DispatchBot | null;
}

/**
 * Resolve the bot for this channel and produce a reply. Returns null when no
 * bot is deployed so callers fall through to their existing behaviour.
 */
export async function dispatchChannelBot(args: DispatchArgs): Promise<DispatchResult | null> {
  const { admin, channel, externalId } = args;
  const start = Date.now();

  const bot =
    args.bot ??
    (await findDeployedBot(admin, {
      workspaceId: args.workspaceId,
      channel,
      accountId: args.accountId,
    }));
  if (!bot) return null;

  const { data: existingRaw } = await admin
    .from("chatbot_sessions")
    .select("id, status")
    .eq("chatbot_id", bot.id)
    .eq("channel", channel)
    .eq("external_id", externalId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const existing = existingRaw as { id: string; status: string } | null;

  // A human owns this thread; stay silent.
  if (existing?.status === "handed_off") {
    return { reply: null, handedOff: true, botId: bot.id };
  }

  let sessionId = existing?.id ?? null;
  if (!sessionId) {
    const { data: created, error } = await admin
      .from("chatbot_sessions")
      .insert({
        workspace_id: bot.workspace_id,
        chatbot_id: bot.id,
        channel,
        external_id: externalId,
        contact_id: args.contactId ?? null,
        conversation_id: args.conversationId ?? null,
        status: "active",
        metadata: args.sessionMetadata ?? {},
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    sessionId = (created as { id: string }).id;
  }

  // Same prompt-injection heuristic as chatbotChat and the other channels.
  const cleaned = args.userText
    .replace(/<\s*\/?\s*system\s*>/gi, "")
    .replace(/^\s*(ignore|disregard)\s+(all\s+)?previous\s+instructions.*/gim, "[filtered]");

  await sbAny(admin).from("chatbot_messages").insert({
    workspace_id: bot.workspace_id,
    session_id: sessionId,
    role: "user",
    content: cleaned,
  });

  const lower = cleaned.toLowerCase();
  const handoff =
    bot.handoff_enabled &&
    (bot.handoff_keywords ?? []).some((k) => k && lower.includes(k.toLowerCase()));
  if (handoff) {
    const reply = "Connecting you with a human agent — one moment.";
    await admin
      .from("chatbot_sessions")
      .update({
        status: "handed_off",
        handoff_reason: "keyword",
        handed_off_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
    await sbAny(admin).from("chatbot_messages").insert({
      workspace_id: bot.workspace_id,
      session_id: sessionId,
      role: "assistant",
      content: reply,
      latency_ms: Date.now() - start,
    });
    return { reply, handedOff: true, botId: bot.id };
  }

  const { data: histRaw } = await admin
    .from("chatbot_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(10);
  const history = ((histRaw as { role: string; content: string }[] | null) ?? []).reverse();

  const system = [
    bot.system_prompt || `You are a helpful ${CHANNEL_LABELS[channel]} assistant.`,
    `Channel: ${CHANNEL_LABELS[channel]}.`,
    bot.personality ? `Personality:\n${bot.personality}` : "",
    bot.tone ? `Tone: ${bot.tone}.` : "",
    bot.language
      ? `Reply in language code "${bot.language}" unless the user writes another language.`
      : "",
    channel === "email"
      ? "Write a complete, polite email reply."
      : "Keep replies short and chat-appropriate (under 3 short sentences unless clarifying).",
  ]
    .filter(Boolean)
    .join("\n\n");

  let reply = bot.fallback_message ?? "Thanks for your message! We'll get back to you shortly.";
  let model = bot.model ?? "google/gemini-2.5-flash";
  let providerKind = "";
  try {
    const { runChat } = await import("@/lib/ai/complete.functions");
    const res = await runChat({
      workspaceId: bot.workspace_id,
      feature: `chatbot:${channel}`,
      primaryProviderId: bot.provider_id,
      request: {
        model: bot.model || "google/gemini-2.5-flash",
        temperature: bot.temperature ?? 0.4,
        max_tokens: bot.max_tokens ?? 500,
        messages: [
          { role: "system", content: system },
          ...history.map((m) => ({
            role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
            content: m.content,
          })),
          { role: "user", content: cleaned },
        ],
      },
    });
    reply = res.content?.trim() || reply;
    model = res.model || model;
    providerKind = res.providerKind;
  } catch (err) {
    console.warn(`[chatbot-dispatch:${channel}] AI call failed, using fallback:`, (err as Error).message);
  }

  await sbAny(admin).from("chatbot_messages").insert({
    workspace_id: bot.workspace_id,
    session_id: sessionId,
    role: "assistant",
    content: reply,
    latency_ms: Date.now() - start,
    model,
    provider_kind: providerKind,
  });
  await admin
    .from("chatbot_sessions")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", sessionId);

  return { reply, handedOff: false, botId: bot.id };
}
