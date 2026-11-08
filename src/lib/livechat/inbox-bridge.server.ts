/**
 * Inbox Bridge — mirrors widget messages into the unified inbox schema
 * (`public.conversations` + `public.messages`) so live chat is a first-class
 * omnichannel channel alongside WhatsApp/Email/etc.
 *
 * Every widget session is linked to exactly one conversation row. Visitor
 * (user) messages become inbound; assistant/agent messages become outbound.
 *
 * The bridge is deliberately fire-and-forget from the widget's perspective —
 * failures log but never break the widget UX.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sbAny } from "@/lib/supabase/untyped";

interface EnsureArgs {
  workspaceId: string;
  sessionId: string;
  contactId?: string | null;
  /** Fallback label when the visitor is anonymous. */
  visitorLabel?: string | null;
  /** Chatbot that serves this widget — acts as the Live Chat "account". */
  chatbotId?: string | null;
  routing?: {
    departmentId?: string | null;
    agentId?: string | null;
    routedTo?: string;
  };
}

async function admin(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

/**
 * Anonymous visitors still need a `contacts` row because `conversations`
 * requires one. We create a lightweight placeholder keyed by session so the
 * conversation shows up in the inbox immediately, and the visitor engine can
 * later enrich/merge it once the person identifies themselves.
 */
async function ensureVisitorContact(
  db: SupabaseClient,
  workspaceId: string,
  sessionId: string,
  visitorLabel?: string | null,
  visitor?: { name?: string | null; email?: string | null; phone?: string | null },
): Promise<string | null> {
  const shortId = sessionId.slice(0, 8);
  const name = visitor?.name?.trim() || visitorLabel?.trim() || `Website visitor ${shortId}`;
  const email = visitor?.email?.trim() || null;
  const phone = visitor?.phone?.trim() || null;

  // Prefer identity matching on email/phone so repeat visitors merge.
  for (const [col, val] of [["email", email], ["phone", phone]] as const) {
    if (!val) continue;
    const { data: match } = await db
      .from("contacts")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq(col, val)
      .maybeSingle();
    if (match) return (match as { id: string }).id;
  }

  const { data: existing } = await db
    .from("contacts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("source", "live_chat")
    .eq("name", name)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  const { data: created, error } = await db
    .from("contacts")
    .insert({
      workspace_id: workspaceId,
      name,
      display_name: name,
      email,
      phone,
      source: "live_chat",
      lifecycle_stage: "lead",
    } as never)
    .select("id")
    .maybeSingle();
  if (error || !created) {
    console.warn("[inbox-bridge] failed to create visitor contact", error?.message);
    return null;
  }
  return (created as { id: string }).id;
}

/** Stable inbox thread key for a returning widget visitor. */
export function liveChatThreadKey(chatbotId: string | null | undefined, visitorKey: string): string {
  return `lc:${chatbotId ?? "any"}:${visitorKey}`;
}

function readVisitorKey(meta: Record<string, unknown>): string | null {
  const raw =
    (typeof meta.visitorKey === "string" && meta.visitorKey) ||
    (typeof meta.visitor_key === "string" && meta.visitor_key) ||
    null;
  const trimmed = raw ? raw.trim() : "";
  return trimmed ? trimmed : null;
}

/**
 * Ensure the widget session has a linked conversation. Creates a placeholder
 * contact for anonymous visitors so live chat always reaches the inbox.
 *
 * Repeat visitors (same browser => same stable `visitorKey`) continue their
 * existing thread instead of spawning a new conversation per session.
 */
export async function ensureConversationForSession(a: EnsureArgs): Promise<string | null> {
  const db = await admin();

  const { data: sess } = await db
    .from("chatbot_sessions")
    .select("conversation_id, contact_id, chatbot_id, metadata")
    .eq("id", a.sessionId)
    .maybeSingle();
  const s = (sess ?? {}) as {
    conversation_id?: string | null;
    contact_id?: string | null;
    chatbot_id?: string | null;
    metadata?: Record<string, unknown> | null;
  };
  const meta = (s.metadata ?? {}) as Record<string, unknown>;
  const chatbotId = a.chatbotId ?? s.chatbot_id ?? null;
  const visitorKey = readVisitorKey(meta);
  // One inbox conversation per widget session. The visitor's sessions still
  // share one contact (below), so agents see every conversation on that contact.
  const threadKey = visitorKey ? liveChatThreadKey(chatbotId, `${visitorKey}:${a.sessionId}`) : null;

  if (s.conversation_id) {
    // A soft-deleted thread must come back to the inbox as soon as the visitor
    // writes again — otherwise the new messages land on a hidden conversation.
    const patch: Record<string, unknown> = { deleted_at: null };
    // Heal older threads created before visitor-key linking existed.
    if (threadKey) patch.external_conversation_id = threadKey;
    await sbAny(db).from("conversations").update(patch as never).eq("id", s.conversation_id);
    return s.conversation_id;
  }

  const visitor = {
    name: typeof meta.visitor_name === "string" ? meta.visitor_name : null,
    email: typeof meta.visitor_email === "string" ? meta.visitor_email : null,
    phone: typeof meta.visitor_phone === "string" ? meta.visitor_phone : null,
  };

  // 1) Same browser returning → reuse the stable thread.
  if (threadKey) {
    const { data: existing } = await db
      .from("conversations")
      .select("id, contact_id")
      .eq("workspace_id", a.workspaceId)
      .eq("external_conversation_id", threadKey)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const found = existing as { id: string; contact_id: string | null } | null;
    if (found) {
      await db
        .from("conversations")
        .update({ deleted_at: null, status: "open" } as never)
        .eq("id", found.id);
      await db
        .from("chatbot_sessions")
        .update({
          conversation_id: found.id,
          contact_id: a.contactId ?? s.contact_id ?? found.contact_id ?? null,
        } as never)
        .eq("id", a.sessionId);
      return found.id;
    }
  }

  const contactId =
    a.contactId ??
    s.contact_id ??
    (await ensureVisitorContact(db, a.workspaceId, a.sessionId, a.visitorLabel, visitor));
  if (!contactId) return null;

  const routedTo = a.routing?.routedTo ?? "ai";
  const { data: convo, error } = await db
    .from("conversations")
    .insert({
      workspace_id: a.workspaceId,
      contact_id: contactId,
      channel: "webchat",
      status: "open",
      subject: "Live chat",
      is_demo: false,
      external_conversation_id: threadKey,
      assigned_to: a.routing?.agentId ?? null,
      department_id: a.routing?.departmentId ?? null,
      handoff_state: routedTo === "ai" ? "ai" : "queued",
      ai_enabled: routedTo === "ai",
      last_message_at: new Date().toISOString(),
      metadata: {
        source: "live_chat",
        session_id: a.sessionId,
        visitor_key: visitorKey,
        // Live Chat account id in the inbox selector is `livechat:<chatbot_id>`.
        chatbot_id: chatbotId,
      },
    } as never)
    .select("id")
    .maybeSingle();
  if (error || !convo) {
    console.warn("[inbox-bridge] failed to create conversation", error?.message);
    return null;
  }
  const conversationId = (convo as { id: string }).id;
  await db
    .from("chatbot_sessions")
    .update({ conversation_id: conversationId, contact_id: contactId } as never)
    .eq("id", a.sessionId);
  return conversationId;
}



export interface BridgeAttachment {
  url: string;
  name: string;
  mime: string;
  size: number;
  kind: "image" | "audio" | "document";
}

export interface BridgeMessageArgs {
  workspaceId: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  body: string;
  agentId?: string | null;
  /** Marks bot replies so they aren't echoed back into the widget. */
  fromBot?: boolean;
  /** Widget uploads mirrored so agents can view media in the inbox. */
  attachments?: BridgeAttachment[] | null;
}

export async function bridgeMessage(a: BridgeMessageArgs): Promise<void> {
  try {
    const db = await admin();
    const attachments = (a.attachments ?? []).filter((x) => x && x.url);
    const primary = attachments[0] ?? null;

    await sbAny(db).from("messages").insert({
      workspace_id: a.workspaceId,
      conversation_id: a.conversationId,
      direction: a.direction,
      body: a.body,
      status: "delivered",
      is_demo: false,
      sent_by: a.agentId ?? null,
      media_url: primary?.url ?? null,
      media_type: primary?.mime ?? null,
      media_size: primary?.size ?? null,
      metadata: {
        source: "live_chat",
        from_bot: a.fromBot ?? false,
        ...(primary ? { media_name: primary.name, media_kind: primary.kind } : {}),
        ...(attachments.length ? { attachments } : {}),
      },
    } as never);

    const preview = a.body.trim()
      ? a.body.slice(0, 200)
      : primary
        ? primary.kind === "image"
          ? "📷 Photo"
          : primary.kind === "audio"
            ? "🎤 Voice message"
            : `📎 ${primary.name}`
        : "";
    const patch: Record<string, unknown> = {
      last_message_at: new Date().toISOString(),
      last_message_preview: preview,
      last_message_from: a.direction === "inbound" ? "contact" : "agent",
      // New activity un-hides a previously soft-deleted thread.
      deleted_at: null,
    };
    if (a.direction === "outbound") patch.unread_count = 0;
    await sbAny(db).from("conversations").update(patch as never).eq("id", a.conversationId);

    if (a.direction === "inbound") {
      // Increment unread without clobbering concurrent updates.
      const { data: row } = await db
        .from("conversations")
        .select("unread_count")
        .eq("id", a.conversationId)
        .maybeSingle();
      const current = ((row as { unread_count?: number } | null)?.unread_count ?? 0) + 1;
      await db
        .from("conversations")
        .update({ unread_count: current } as never)
        .eq("id", a.conversationId);
    }
  } catch (err) {
    console.warn("[inbox-bridge] bridgeMessage failed:", (err as Error).message);
  }
}

/**
 * Flip the mirrored conversation into the human handoff queue.
 * Also inserts the `handoff_queue` row (so it appears in the queue panel and
 * can be assigned) and notifies workspace members so the handoff is not silent.
 */
export async function markConversationHandoff(
  conversationId: string,
  reason: string | null,
): Promise<void> {
  try {
    const db = await admin();
    const { data: conv } = await db
      .from("conversations")
      .select("workspace_id")
      .eq("id", conversationId)
      .maybeSingle();
    const workspaceId = (conv as { workspace_id: string } | null)?.workspace_id ?? null;

    await db
      .from("conversations")
      .update({
        handoff_state: "queued",
        ai_enabled: false,
        status: "open",
        priority: "high",
        ai_summary: reason ?? null,
      } as never)
      .eq("id", conversationId);

    if (!workspaceId) return;

    // Keep one waiting queue entry per conversation (no duplicates on repeat messages).
    const { data: existing } = await db
      .from("handoff_queue")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("status", "waiting")
      .maybeSingle();
    if (!existing) {
      await db.from("handoff_queue").insert({
        workspace_id: workspaceId,
        conversation_id: conversationId,
        reason: reason ?? null,
        priority: "high",
        status: "waiting",
      } as never);
    }

    // Notify active workspace members (owners/admins/agents) about the handoff.
    const [{ data: members }, { data: workspace }] = await Promise.all([
      db.from("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("status", "active"),
      db.from("workspaces").select("organization_id").eq("id", workspaceId).maybeSingle(),
    ]);
    const userIds = Array.from(
      new Set(((members ?? []) as { user_id: string }[]).map((m) => m.user_id)),
    );
    const organizationId = workspace?.organization_id;
    if (userIds.length > 0 && organizationId) {
      const { error: notificationError } = await db.from("notifications").insert(
        userIds.map((uid) => ({
          user_id: uid,
          organization_id: organizationId,
          channel: "in_app" as const,
          status: "unread" as const,
          category: "livechat_handoff",
          title: "Visitor needs a human agent",
          body: reason ?? "A live chat visitor requested a human agent.",
          action_url: `/inbox?conversationId=${conversationId}`,
          data: { conversation_id: conversationId, workspace_id: workspaceId },
        })),
      );
      if (notificationError) console.warn("[inbox-bridge] handoff notification failed:", notificationError);
    }
  } catch (err) {
    console.warn("[inbox-bridge] markConversationHandoff failed:", (err as Error).message);
  }
}

/** Called when an agent takes over — flips the conversation to human. */
export async function markHumanTakeover(conversationId: string, agentId: string): Promise<void> {
  const db = await admin();
  await db
    .from("conversations")
    .update({
      handoff_state: "human",
      ai_enabled: false,
      assigned_to: agentId,
    } as never)
    .eq("id", conversationId);
}
