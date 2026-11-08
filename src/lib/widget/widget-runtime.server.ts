/**
 * Public Live Chat Widget runtime (server-only).
 *
 * Mirrors the authenticated `chatbotChat` server-fn but runs unauthenticated
 * for the embeddable widget. Uses `supabaseAdmin` under strict validation:
 *   - Chatbot must exist, status='active', and have an enabled deployment on
 *     the `web` or `livechat` channel.
 *   - Visitor sessions are pinned to `channel='livechat'` and identified by
 *     an HMAC-signed visitor token so a caller can't hop into another
 *     visitor's session.
 *   - Rate-limited per (chatbotId, ip) at the route boundary — not here.
 *
 * This file is `.server.ts` — only import it from route handlers.
 */
import { createHmac, timingSafeEqual, randomUUID } from "crypto";
import { sbAny } from "@/lib/supabase/untyped";

export type WidgetRole = "user" | "assistant" | "system";

export interface WidgetAttachment {
  url: string;
  name: string;
  mime: string;
  size: number;
  kind: "image" | "document" | "audio";
}

export interface WidgetMessage {
  id: string;
  role: WidgetRole;
  content: string;
  created_at: string;
  attachments?: WidgetAttachment[] | null;
  read_at?: string | null;
}

export interface WidgetBot {
  id: string;
  workspace_id: string;
  name: string;
  avatar_url: string | null;
  welcome_message: string;
  fallback_message: string;
  greeting: string | null;
  status: string;
  system_prompt: string;
  language: string | null;
  personality: string | null;
  tone: string | null;
  provider_id: string | null;
  model: string | null;
  temperature: number;
  max_tokens: number;
  rag_enabled: boolean;
  rag_min_similarity: number;
  rag_match_count: number;
  handoff_enabled: boolean;
  handoff_keywords: string[];
  flow: unknown;
  organization_prompt: string | null;
  department_prompt: string | null;
  escalation_prompt: string | null;
}

function signingSecret(): string {
  const secret = process.env.WIDGET_SIGNING_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "WIDGET_SIGNING_SECRET is not configured — refusing to sign widget visitor tokens.",
    );
  }
  return secret;
}

/** HMAC-sign a visitor token so callers can't forge another visitor's session. */
export function signVisitor(sessionId: string, visitorId: string): string {
  const payload = `${sessionId}.${visitorId}`;
  const sig = createHmac("sha256", signingSecret()).update(payload).digest("hex").slice(0, 32);
  return `${visitorId}.${sig}`;
}

export function verifyVisitor(sessionId: string, token: string): string | null {
  const [visitorId, sig] = token.split(".");
  if (!visitorId || !sig) return null;
  const expected = createHmac("sha256", signingSecret())
    .update(`${sessionId}.${visitorId}`)
    .digest("hex")
    .slice(0, 32);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? visitorId : null;
}

export type EmbeddableBotBlock = "not_found" | "inactive" | "not_deployed";

export interface EmbeddableBotResult {
  bot: WidgetBot | null;
  reason: EmbeddableBotBlock | null;
  /** Visitor-safe explanation of why the chat can't run. */
  message: string | null;
}

const BLOCK_MESSAGES: Record<EmbeddableBotBlock, string> = {
  not_found: "This chat widget isn't linked to a chatbot yet.",
  inactive: "This chat is currently paused by its owner.",
  not_deployed: "This chatbot has no active web deployment yet.",
};

/**
 * Fetch bot only if publicly embeddable, with the blocking reason when not.
 *
 * A bot counts as web-deployed only when it is wired to at least one active
 * chat widget — linking a widget is the only way to publish a bot to the web.
 */
export async function loadEmbeddableBotDetailed(botId: string): Promise<EmbeddableBotResult> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data: bot } = await supabaseAdmin
    .from("chatbots")
    .select("*")
    .eq("id", botId)
    .maybeSingle();
  if (!bot) return { bot: null, reason: "not_found", message: BLOCK_MESSAGES.not_found };
  if ((bot as { status?: string }).status !== "active") {
    return { bot: null, reason: "inactive", message: BLOCK_MESSAGES.inactive };
  }

  // Web publishing goes only through Chat Widgets (schedule, domains and
  // routing live there). Bot-level web/livechat deployments no longer count.
  const { data: widget } = await supabaseAdmin
    .from("chat_widgets")
    .select("id")
    .eq("chatbot_id", botId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (!widget) {
    return { bot: null, reason: "not_deployed", message: BLOCK_MESSAGES.not_deployed };
  }

  return { bot: bot as unknown as WidgetBot, reason: null, message: null };
}

/** Fetch bot only if publicly embeddable. */
export async function loadEmbeddableBot(botId: string): Promise<WidgetBot | null> {
  return (await loadEmbeddableBotDetailed(botId)).bot;
}

/** How long a returning visitor's open conversation is reused. */
const REUSE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Create a fresh livechat session for a new visitor. */
export async function createWidgetSession(
  botId: string,
  visitorMeta?: {
    page?: string;
    referrer?: string;
    userAgent?: string;
    visitorName?: string;
    visitorEmail?: string;
    visitorPhone?: string;
    visitorKey?: string;
    language?: string;
    timezone?: string;
    ipAddress?: string;
    /** Skip reuse and start a new conversation (the visitor pressed "New conversation"). */
    newConversation?: boolean;
  previousSessionId?: string;
  previousVisitorToken?: string;
  },
): Promise<{ sessionId: string; visitorToken: string; bot: WidgetBot } | null> {
  const bot = await loadEmbeddableBot(botId);
  if (!bot) return null;

  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

  // A returning visitor keeps their open conversation for 30 days instead of
  // starting a new session every time the widget is reopened.
  // Reuse and "New conversation" are proven with the signed token the server issued
  // for the previous session. The visitorKey is client-chosen and not a secret, so it
  // must never grant access to another visitor's conversation.
  const prevId = visitorMeta?.previousSessionId;
  const prevToken = visitorMeta?.previousVisitorToken;
  const prevVisitorId = prevId && prevToken ? verifyVisitor(prevId, prevToken) : null;
  if (prevId && prevVisitorId) {
    const { data: prev } = await supabaseAdmin
      .from("chatbot_sessions")
      .select("id, external_id, status, created_at, chatbot_id")
      .eq("id", prevId)
      .eq("chatbot_id", bot.id)
      .eq("channel", "livechat")
      .maybeSingle();
    const row = prev as { id: string; external_id: string; status: string; created_at: string } | null;
    if (row && row.external_id === prevVisitorId && row.status === "active") {
      if (visitorMeta?.newConversation) {
        await supabaseAdmin
          .from("chatbot_sessions")
          .update({ status: "closed" } as never)
          .eq("id", row.id);
      } else if (Date.now() - new Date(row.created_at).getTime() < REUSE_WINDOW_MS) {
        return { sessionId: row.id, visitorToken: signVisitor(row.id, row.external_id), bot };
      }
    }
  }

  const visitorId = randomUUID();

  // Register/refresh the persistent visitor so the Live Chat → Visitors tab
  // sees real-time traffic (one row per browser, not per session).
  let livechatVisitorId: string | null = null;
  try {
    const { upsertVisitor, identifyVisitor } = await import("@/lib/livechat/visitor-engine.server");
    const visitor = await upsertVisitor({
      workspaceId: bot.workspace_id,
      visitorKey: visitorMeta?.visitorKey?.trim() || visitorId,
      chatbotId: bot.id,
      userAgent: visitorMeta?.userAgent ?? null,
      language: visitorMeta?.language ?? null,
      timezone: visitorMeta?.timezone ?? null,
      page: visitorMeta?.page ?? null,
      referrer: visitorMeta?.referrer ?? null,
      ipAddress: visitorMeta?.ipAddress ?? null,
    });
    livechatVisitorId = visitor?.id ?? null;
    if (livechatVisitorId) {
      await identifyVisitor(livechatVisitorId, bot.workspace_id, {
        displayName: visitorMeta?.visitorName ?? null,
        email: visitorMeta?.visitorEmail ?? null,
        phone: visitorMeta?.visitorPhone ?? null,
      });
    }
  } catch (e) {
    console.warn("[widget] visitor registration failed", e);
  }

  const { data: sess, error } = await supabaseAdmin
    .from("chatbot_sessions")
    .insert({
      workspace_id: bot.workspace_id,
      chatbot_id: bot.id,
      channel: "livechat",
      external_id: visitorId,
      status: "active",
      metadata: {
        ...(visitorMeta ?? {}),
        visitor_name: visitorMeta?.visitorName ?? null,
        visitor_email: visitorMeta?.visitorEmail ?? null,
        visitor_phone: visitorMeta?.visitorPhone ?? null,
        visitor_key: visitorMeta?.visitorKey?.trim() || null,
        livechat_visitor_id: livechatVisitorId,
      },
    } as never)
    .select("id")
    .maybeSingle();
  if (error || !sess) {
    console.error("[widget] createWidgetSession failed", error);
    return null;
  }

  const sessionId = (sess as { id: string }).id;

  if (livechatVisitorId) {
    try {
      const { recordEvent } = await import("@/lib/livechat/visitor-engine.server");
      await recordEvent({
        workspaceId: bot.workspace_id,
        visitorId: livechatVisitorId,
        sessionId,
        eventType: "widget_open",
        url: visitorMeta?.page,
        referrer: visitorMeta?.referrer,
      });
    } catch {
      /* non-fatal */
    }
  }

  return { sessionId, visitorToken: signVisitor(sessionId, visitorId), bot };
}

export async function loadWidgetHistory(sessionId: string, limit = 50): Promise<WidgetMessage[]> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const [{ data }, { data: sess }] = await Promise.all([
    supabaseAdmin
      .from("chatbot_messages")
      .select("id, role, content, created_at, attachments, read_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(limit),
    supabaseAdmin
      .from("chatbot_sessions")
      .select("conversation_id")
      .eq("id", sessionId)
      .maybeSingle(),
  ]);
  const bot = ((data ?? []) as WidgetMessage[]).filter((m) => m.role !== "system");

  // Human agent replies live in the unified inbox — surface them to the visitor.
  const conversationId = (sess as { conversation_id?: string | null } | null)?.conversation_id;
  if (!conversationId) return bot;

  const { data: agentRows } = await supabaseAdmin
    .from("messages")
    .select(
      "id, body, created_at, sent_by, direction, read_at, media_url, media_type, media_size, metadata",
    )
    .eq("conversation_id", conversationId)
    .eq("direction", "outbound")
    .not("sent_by", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  const agentMsgs: WidgetMessage[] = (
    (agentRows ?? []) as {
      id: string;
      body: string | null;
      created_at: string;
      read_at: string | null;
      media_url: string | null;
      media_type: string | null;
      media_size: number | null;
      metadata: Record<string, unknown> | null;
    }[]
  )
    .map((m) => {
      const meta = (m.metadata ?? {}) as Record<string, unknown>;
      const listed = Array.isArray(meta.attachments)
        ? (meta.attachments as WidgetAttachment[]).filter((x) => x && x.url)
        : [];
      const mime = m.media_type ?? "";
      const attachments: WidgetAttachment[] = listed.length
        ? listed
        : m.media_url
          ? [
              {
                url: m.media_url,
                name: (meta.media_name as string | undefined) ?? "Attachment",
                mime: mime || "application/octet-stream",
                size: m.media_size ?? 0,
                kind: mime.startsWith("image/")
                  ? "image"
                  : mime.startsWith("audio/")
                    ? "audio"
                    : "document",
              },
            ]
          : [];
      return {
        id: m.id,
        role: "assistant" as const,
        content: (m.body ?? "").trim(),
        created_at: m.created_at,
        attachments: attachments.length ? attachments : null,
        read_at: m.read_at,
      };
    })
    .filter((m) => m.content.length > 0 || (m.attachments?.length ?? 0) > 0);

  return [...bot, ...agentMsgs].sort((a, b) =>
    a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
  );
}

export interface WidgetStatus {
  sessionId: string;
  status: string;
  handoff: boolean;
  handoffState: "ai" | "human" | "queued" | null;
  assignedTo: {
    id: string;
    name: string;
    avatar_url: string | null;
  } | null;
  queuePosition: number | null;
  queueStatus: "waiting" | "assigned" | null;
  /** True while a human agent is typing a reply in the Inbox. */
  agentTyping: boolean;
}

/**
 * Publish (or clear) the visitor's typing indicator for the conversation
 * behind a widget session. The session id is used as the `user_id` so agents
 * see it through the normal Inbox typing hooks.
 */
export async function setVisitorTyping(sessionId: string, typing: boolean): Promise<void> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data: sess } = await supabaseAdmin
    .from("chatbot_sessions")
    .select("id, conversation_id, workspace_id")
    .eq("id", sessionId)
    .maybeSingle();
  const s = sess as { conversation_id: string | null; workspace_id: string | null } | null;
  if (!s?.conversation_id || !s.workspace_id) return;

  if (!typing) {
    await supabaseAdmin
      .from("conversation_typing")
      .delete()
      .eq("conversation_id", s.conversation_id)
      .eq("user_id", sessionId);
    return;
  }

  const now = Date.now();
  await sbAny(supabaseAdmin)
    .from("conversation_typing")
    .upsert(
      {
        conversation_id: s.conversation_id,
        workspace_id: s.workspace_id,
        user_id: sessionId,
        started_at: new Date(now).toISOString(),
        expires_at: new Date(now + 8000).toISOString(),
      },
      { onConflict: "conversation_id,user_id" },
    );
}

/** Load the current public-facing status of a livechat session (handoff, queue, assignment). */
export async function loadWidgetStatus(sessionId: string): Promise<WidgetStatus | null> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data: sess } = await supabaseAdmin
    .from("chatbot_sessions")
    .select("id, status, conversation_id, handoff_reason, handed_off_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (!sess) return null;

  const s = sess as {
    id: string;
    status: string;
    conversation_id: string | null;
    handoff_reason: string | null;
    handed_off_at: string | null;
  };

  const { data: conv } = await supabaseAdmin
    .from("conversations")
    .select(
      "handoff_state, assigned_to, assignee:profiles!conversations_assigned_to_profiles_fkey (id, display_name, avatar_url)",
    )
    .eq("id", s.conversation_id ?? "")
    .maybeSingle();

  const c = conv as {
    handoff_state: "ai" | "human" | "queued" | null;
    assigned_to: string | null;
    assignee: { id: string; display_name: string | null; avatar_url: string | null } | null;
  } | null;

  const handoffState = c?.handoff_state ?? (s.status === "handed_off" ? "human" : "ai");
  const handoff =
    handoffState === "human" || handoffState === "queued" || s.status === "handed_off";

  let queuePosition: number | null = null;
  let queueStatus: "waiting" | "assigned" | null = null;
  if (handoffState === "queued") {
    const { data: q } = await supabaseAdmin
      .from("handoff_queue")
      .select("status")
      .eq("conversation_id", s.conversation_id ?? "")
      .eq("status", "waiting")
      .maybeSingle();
    queueStatus = (q as { status: "waiting" | "assigned" } | null)?.status ?? null;
  }

  // Agent typing: any live typing row on this conversation that is not the
  // visitor's own (the visitor writes with user_id = sessionId).
  let agentTyping = false;
  if (s.conversation_id) {
    const { data: typingRows } = await supabaseAdmin
      .from("conversation_typing")
      .select("user_id")
      .eq("conversation_id", s.conversation_id)
      .gt("expires_at", new Date().toISOString());
    agentTyping = (typingRows ?? []).some((r) => (r as { user_id: string }).user_id !== sessionId);
  }

  return {
    sessionId,
    status: s.status,
    handoff,
    handoffState,
    assignedTo: c?.assignee?.id
      ? {
          id: c.assignee.id,
          name: c.assignee.display_name ?? "Agent",
          avatar_url: c.assignee.avatar_url ?? null,
        }
      : null,
    queuePosition,
    queueStatus,
    agentTyping,
  };
}

function isHandedOff(
  sessionStatus: string | null,
  handoffState: "ai" | "human" | "queued" | null,
): boolean {
  return sessionStatus === "handed_off" || handoffState === "human" || handoffState === "queued";
}

/** Very small in-memory rate limiter per (bot, ip). Best-effort; edge workers may reset it. */
const bucket = new Map<string, { count: number; ts: number }>();
export function checkWidgetRate(key: string, limitPerMinute = 30): boolean {
  const now = Date.now();
  const b = bucket.get(key);
  if (!b || now - b.ts > 60_000) {
    bucket.set(key, { count: 1, ts: now });
    return true;
  }
  b.count += 1;
  return b.count <= limitPerMinute;
}

/**
 * Run one turn for the widget. Persists user + assistant messages and returns
 * the assistant reply plus handoff flag when applicable.
 */
export async function runWidgetTurn(args: {
  bot: WidgetBot;
  sessionId: string;
  message: string;
  attachments?: WidgetAttachment[];
}): Promise<{ reply: string; handoff: boolean; latencyMs: number; model: string }> {
  const start = Date.now();
  const { bot, sessionId, attachments } = args;
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

  const cleaned = args.message
    .slice(0, 4000)
    .replace(/<\s*\/?\s*system\s*>/gi, "")
    .replace(/^\s*(ignore|disregard)\s+(all\s+)?previous\s+instructions.*/gim, "[filtered]");

  // Check whether the session / conversation is already handed off so we
  // don't re-escalate or repeat the handoff message on every visitor message.
  const { data: sessionRow } = await supabaseAdmin
    .from("chatbot_sessions")
    .select("id, status, conversation_id")
    .eq("id", sessionId)
    .maybeSingle();

  const sessionStatus =
    (sessionRow as { status?: string; conversation_id?: string | null } | null)?.status ?? null;
  const conversationIdFromSession =
    (sessionRow as { conversation_id?: string | null } | null)?.conversation_id ?? null;

  const { data: convRow } = conversationIdFromSession
    ? await supabaseAdmin
        .from("conversations")
        .select("id, handoff_state")
        .eq("id", conversationIdFromSession)
        .maybeSingle()
    : { data: null };

  const conversationHandoffState =
    (convRow as { handoff_state?: "ai" | "human" | "queued" } | null)?.handoff_state ?? null;
  const alreadyHandedOff = isHandedOff(sessionStatus, conversationHandoffState);

  const { data: userMsgRow } = await supabaseAdmin
    .from("chatbot_messages")
    .insert({
      workspace_id: bot.workspace_id,
      session_id: sessionId,
      role: "user",
      content: cleaned,
      attachments: attachments && attachments.length ? attachments : null,
      read_at: new Date().toISOString(),
    } as never)
    .select("id")
    .single();
  const userMessageId = (userMsgRow as { id?: string } | null)?.id ?? null;

  // Mirror the visitor turn into the unified inbox so agents see live chat.
  const { ensureConversationForSession, bridgeMessage, markConversationHandoff } =
    await import("@/lib/livechat/inbox-bridge.server");
  const conversationId = await ensureConversationForSession({
    workspaceId: bot.workspace_id,
    sessionId,
    chatbotId: bot.id,
  });

  if (conversationId) {
    await bridgeMessage({
      workspaceId: bot.workspace_id,
      conversationId,
      direction: "inbound",
      body: cleaned,
      attachments: attachments && attachments.length ? attachments : null,
    });
  }

  // If already handed off, just acknowledge; do not persist or bridge the
  // generic reply again — the original handoff message is already stored.
  if (alreadyHandedOff) {
    return {
      reply: "",
      handoff: true,
      latencyMs: Date.now() - start,
      model: "",
    };
  }

  // Fast handoff by keyword — skip AI entirely.
  const lower = cleaned.toLowerCase();
  const hitsHandoff =
    bot.handoff_enabled &&
    (bot.handoff_keywords ?? []).some((k) => k && lower.includes(k.toLowerCase()));
  if (hitsHandoff) {
    await supabaseAdmin
      .from("chatbot_sessions")
      .update({
        status: "handed_off",
        handoff_reason: "keyword",
        handed_off_at: new Date().toISOString(),
        ai_escalation_reason: "Visitor requested a human agent",
        ai_updated_at: new Date().toISOString(),
      } as never)
      .eq("id", sessionId);
    const reply = "Connecting you with a human agent";
    await sbAny(supabaseAdmin)
      .from("chatbot_messages")
      .insert({
        workspace_id: bot.workspace_id,
        session_id: sessionId,
        role: "assistant",
        content: reply,
        latency_ms: Date.now() - start,
      } as never);
    if (conversationId) {
      await bridgeMessage({
        workspaceId: bot.workspace_id,
        conversationId,
        direction: "outbound",
        body: reply,
        fromBot: true,
      });
      await markConversationHandoff(conversationId, "Visitor requested a human agent");
    }
    return { reply, handoff: true, latencyMs: Date.now() - start, model: "" };
  }

  // Recent history for both reply + analysis
  const { data: histRows } = await supabaseAdmin
    .from("chatbot_messages")
    .select("role,content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(12);
  const history = ((histRows ?? []) as { role: string; content: string }[])
    .reverse()
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
      content: m.content,
    }))
    // Drop the just-inserted user turn so it's not duplicated in the reply prompt
    .slice(0, -1);

  // AI Assistant pipeline: KB retrieval → reply + analysis in parallel
  const { retrieveKb, analyzeConversation, generateAssistantReply, persistAnalysis } =
    await import("./livechat-ai.server");

  const kbHits = await retrieveKb(bot.workspace_id, cleaned, 4);

  const [replyResult, analysis] = await Promise.all([
    generateAssistantReply({ bot, userMessage: cleaned, history, kbHits }),
    analyzeConversation({ bot, userMessage: cleaned, history, kbHits }),
  ]);

  const shouldEscalate =
    analysis.escalate ||
    analysis.intent === "handoff_request" ||
    analysis.intent === "complaint" ||
    analysis.sentiment === "frustrated";

  const finalReply = shouldEscalate
    ? `${replyResult.reply}\n\n_I'm bringing a human teammate into this chat to help further._`
    : replyResult.reply;

  await sbAny(supabaseAdmin)
    .from("chatbot_messages")
    .insert({
      workspace_id: bot.workspace_id,
      session_id: sessionId,
      role: "assistant",
      content: finalReply,
      latency_ms: Date.now() - start,
      model: replyResult.model,
      ai_intent: analysis.intent,
      ai_sentiment: analysis.sentiment,
      ai_language: analysis.language,
      ai_kb_hits: kbHits.length
        ? kbHits.map((h) => ({
            article_id: h.articleId,
            title: h.title,
            similarity: h.similarity,
          }))
        : null,
    } as never);

  if (conversationId) {
    await bridgeMessage({
      workspaceId: bot.workspace_id,
      conversationId,
      direction: "outbound",
      body: finalReply,
      fromBot: true,
    });
    if (shouldEscalate) {
      await markConversationHandoff(conversationId, analysis.escalationReason || analysis.intent);
    }
  }

  // Fire-and-forget: persist analysis + optional handoff
  void persistAnalysis(sessionId, userMessageId, analysis, kbHits);

  if (shouldEscalate) {
    await supabaseAdmin
      .from("chatbot_sessions")
      .update({
        status: "handed_off",
        handoff_reason: analysis.escalationReason || analysis.intent,
        handed_off_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
      } as never)
      .eq("id", sessionId);
  } else {
    await supabaseAdmin
      .from("chatbot_sessions")
      .update({ last_message_at: new Date().toISOString() } as never)
      .eq("id", sessionId);
  }

  return {
    reply: finalReply,
    handoff: shouldEscalate,
    latencyMs: Date.now() - start,
    model: replyResult.model,
  };
}

export interface VisitorConversation {
  sessionId: string;
  visitorToken: string | null;
  status: string;
  createdAt: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
}

/**
 * All livechat sessions this visitor has had with the bot, newest first.
 * The caller must already have verified `sessionId` + its visitor token.
 */
export async function listVisitorConversations(
  botId: string,
  sessionId: string,
): Promise<VisitorConversation[]> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data: current } = await supabaseAdmin
    .from("chatbot_sessions")
    .select("metadata")
    .eq("id", sessionId)
    .maybeSingle();
  const visitorKey = (current as { metadata?: { visitor_key?: string } } | null)?.metadata
    ?.visitor_key;
  if (!visitorKey) return [];

  const { data: rows } = await supabaseAdmin
    .from("chatbot_sessions")
    .select("id, external_id, status, created_at")
    .eq("chatbot_id", botId)
    .eq("channel", "livechat")
    .eq("metadata->>visitor_key", visitorKey)
    .order("created_at", { ascending: false })
    .limit(20);
  const sessions = (rows ?? []) as Array<{
    id: string;
    external_id: string;
    status: string;
    created_at: string;
  }>;

  const result: VisitorConversation[] = [];
  for (const s of sessions) {
    const { data: last } = await supabaseAdmin
      .from("chatbot_messages")
      .select("content, created_at")
      .eq("session_id", s.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const msg = last as { content?: string; created_at?: string } | null;
    // Only the caller's own session carries a token. Other sessions with the same
    // visitorKey are listed without one, so they cannot be opened by key alone.
    result.push({
      sessionId: s.id,
      visitorToken: s.id === sessionId ? signVisitor(s.id, s.external_id) : null,
      status: s.status,
      createdAt: s.created_at,
      lastMessage: msg?.content ?? null,
      lastMessageAt: msg?.created_at ?? null,
    });
  }
  return result;
}
