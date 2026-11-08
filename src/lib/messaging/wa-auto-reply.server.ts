/**
 * WhatsApp QR auto-reply engine.
 *
 * Wired into the QR webhook (`message.received` events). Evaluates
 * `whatsapp_auto_replies` rules for the incoming session (session-scoped
 * rules first, then workspace-wide rules where `session_id IS NULL`), then
 * dispatches the winning reply through the Baileys worker.
 *
 * Matching mirrors `src/components/app/wa-chatbot/test-console.tsx` so the
 * simulator and live runtime stay in lockstep.
 */
import { WorkerAPI } from "./qr-worker.server";
import {
  DEFAULT_LANGUAGE_MIN_CONFIDENCE,
  detectLanguage,
  isHandoffRequest,
  matchesLanguage,
  normalizeMinConfidence,
  type WaTriggerType,
} from "./wa-trigger-matching";

type TriggerType = WaTriggerType;
type ReplyType = "text" | "image" | "video" | "document" | "audio" | "location";

interface Rule {
  id: string;
  workspace_id: string;
  session_id: string | null;
  name: string;
  trigger_type: TriggerType;
  keywords: string[];
  reply_type: ReplyType;
  reply_text: string | null;
  media_url: string | null;
  media_caption: string | null;
  enabled: boolean;
  match_case: boolean;
  priority: number;
  cooldown_seconds: number;
  min_confidence?: number | string | null;
  hit_count: number;

  last_triggered_at: string | null;
  active_hours: unknown;
}

interface Ctx {
  message: string;
  senderName: string;
  senderPhone: string;
  isFirstMessage: boolean;
  isOffline: boolean;
}

function ruleMatches(rule: Rule, ctx: Ctx): boolean {
  if (!rule.enabled) return false;
  const raw = ctx.message ?? "";
  const msg = rule.match_case ? raw : raw.toLowerCase();
  const kws = (rule.keywords ?? []).map((k) => (rule.match_case ? k : k.toLowerCase()));

  switch (rule.trigger_type) {
    case "welcome": return ctx.isFirstMessage;
    case "offline": return ctx.isOffline;
    case "any": return raw.trim().length > 0;
    case "exact": return kws.some((k) => msg === k);
    case "starts_with": return kws.some((k) => !!k && msg.startsWith(k));
    case "contains": return kws.some((k) => !!k && msg.includes(k));
    case "regex":
      for (const k of kws) {
        try {
          if (new RegExp(k, rule.match_case ? "" : "i").test(raw)) return true;
        } catch { /* invalid regex — skip */ }
      }
      return false;
    case "handoff":
      return isHandoffRequest(raw, rule.keywords ?? []).ok;
    case "language":
      return matchesLanguage(
        raw,
        rule.keywords ?? [],
        rule.min_confidence == null
          ? DEFAULT_LANGUAGE_MIN_CONFIDENCE
          : normalizeMinConfidence(rule.min_confidence),
      ).ok;
    default:
      return false;
  }
}

function renderVars(tpl: string, ctx: Ctx): string {
  return tpl
    .replaceAll("{{name}}", ctx.senderName || "there")
    .replaceAll("{{phone}}", ctx.senderPhone || "")
    .replaceAll("{{time}}", new Date().toLocaleTimeString());
}

function isOnCooldown(rule: Rule, now: number): boolean {
  if (!rule.cooldown_seconds || !rule.last_triggered_at) return false;
  const last = new Date(rule.last_triggered_at).getTime();
  if (!Number.isFinite(last)) return false;
  return (now - last) / 1000 < rule.cooldown_seconds;
}

interface IncomingMessage {
  from?: string;
  text?: string;
  contact_name?: string;
  message_id?: string;
  type?: string;
  from_me?: boolean;
  is_first_message?: boolean;
  timestamp?: string | number;
}

/**
 * Called from the QR webhook when a `message.received` event is dispatched.
 * Loads applicable rules, picks the highest-priority match, and sends a reply
 * via the Baileys worker. All errors are logged and swallowed — the webhook
 * ack path must never be blocked by auto-reply failures.
 */
export async function runAutoReplyForSession(
  admin: unknown,
  sessionId: string,
  msg: IncomingMessage,
  opts?: { conversationId?: string | null },
): Promise<{
  triggered: boolean;
  ruleId?: string;
  error?: string;
  handoff?: { status: string; agentId: string | null; reason: string };
}> {
  if (!sessionId) return { triggered: false };
  if (msg.from_me) return { triggered: false };
  const from = msg.from?.trim();
  const text = (msg.text ?? "").toString();
  if (!from) return { triggered: false };

  const db = admin as any; // eslint-disable-line @typescript-eslint/no-explicit-any

  // Resolve session -> workspace for scoping workspace-wide rules.
  const { data: session } = await db
    .from("whatsapp_qr_sessions")
    .select("id, workspace_id, status")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session?.workspace_id) return { triggered: false };
  if (session.status && session.status !== "connected") return { triggered: false };

  // Rules scoped to the session OR workspace-wide (session_id IS NULL).
  const { data: rulesData, error: rulesErr } = await db
    .from("whatsapp_auto_replies")
    .select(
      "id, workspace_id, session_id, name, trigger_type, keywords, reply_type, reply_text, media_url, media_caption, enabled, match_case, priority, cooldown_seconds, hit_count, last_triggered_at, active_hours",
    )
    .eq("workspace_id", session.workspace_id)
    .eq("enabled", true)
    .or(`session_id.eq.${sessionId},session_id.is.null`)
    .order("priority", { ascending: true })
    .order("updated_at", { ascending: false });

  if (rulesErr || !rulesData || rulesData.length === 0) {
    return { triggered: false, error: rulesErr?.message };
  }

  // Derive "first message" from prior processed deliveries with this sender.
  let isFirstMessage = msg.is_first_message ?? false;
  if (msg.is_first_message === undefined) {
    const { count } = await db
      .from("wa_qr_webhook_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("event_type", "message.received")
      .contains("payload", { from });
    isFirstMessage = (count ?? 0) <= 1;
  }

  const ctx: Ctx = {
    message: text,
    senderName: msg.contact_name || "",
    senderPhone: from,
    isFirstMessage,
    isOffline: false,
  };

  const now = Date.now();
  const rules = rulesData as Rule[];
  // Session-scoped rules take precedence over workspace-wide at the same priority.
  const sorted = [...rules].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const aSession = a.session_id === sessionId ? 0 : 1;
    const bSession = b.session_id === sessionId ? 0 : 1;
    return aSession - bSession;
  });

  const winner = sorted.find((r) => !isOnCooldown(r, now) && ruleMatches(r, ctx));
  if (!winner) return { triggered: false };

  // Dispatch reply through the worker.
  const type = (winner.reply_type ?? "text") as ReplyType;
  const clientMessageId = `auto-reply:${winner.id}:${msg.message_id ?? crypto.randomUUID()}`;

  const workerPayload = {
    to: from,
    type: (type === "location" ? "text" : type) as
      | "text" | "image" | "video" | "audio" | "document",
    text: winner.reply_text ? renderVars(winner.reply_text, ctx) : undefined,
    media_url: winner.media_url ?? undefined,
    caption: winner.media_caption
      ? renderVars(winner.media_caption, ctx)
      : undefined,
    client_message_id: clientMessageId,
  };

  const result = await WorkerAPI.sendMessage(sessionId, workerPayload);
  if (!result.available) {
    return { triggered: false, error: "Worker not configured" };
  }
  if (!result.ok) {
    return { triggered: false, ruleId: winner.id, error: result.error || `Worker status ${result.status}` };
  }

  // Mirror the bot reply into the conversation inbox so agents see it inline.
  if (opts?.conversationId) {
    try {
      const { recordOutboundWaMessage } = await import("./wa-inbox.server");
      await recordOutboundWaMessage(db, {
        workspaceId: session.workspace_id,
        conversationId: opts.conversationId,
        to: from,
        body: workerPayload.text ?? workerPayload.caption ?? null,
        messageType: type,
        mediaUrl: winner.media_url ?? null,
        providerMessageId: result.data?.message_id ?? null,
        isBot: true,
      });
    } catch {
      /* inbox mirroring must never break auto-reply */
    }
  }

  // Bump analytics + cooldown timestamp.
  await db
    .from("whatsapp_auto_replies")
    .update({
      hit_count: (winner.hit_count ?? 0) + 1,
      last_triggered_at: new Date().toISOString(),
    })
    .eq("id", winner.id);

  // A handoff rule fired → route the thread to a human agent (round-robin /
  // skills-based, with cooldowns). Never blocks the webhook ack path.
  let handoff: { status: string; agentId: string | null; reason: string } | undefined;
  if (winner.trigger_type === "handoff" && opts?.conversationId) {
    try {
      const { routeWaHandoff } = await import("./wa-handoff-routing.server");
      const outcome = await routeWaHandoff(db, {
        workspaceId: session.workspace_id,
        conversationId: opts.conversationId,
        reason: `Auto-reply rule "${winner.name}" requested a human agent`,
        language: detectLanguage(text) || null,
      });
      handoff = {
        status: outcome.status,
        agentId: outcome.agentId,
        reason: outcome.reason,
      };
    } catch (err) {
      handoff = {
        status: "error",
        agentId: null,
        reason: err instanceof Error ? err.message : "Handoff routing failed",
      };
    }
  }

  return { triggered: true, ruleId: winner.id, handoff };
}

