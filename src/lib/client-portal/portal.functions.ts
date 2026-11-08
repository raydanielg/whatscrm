/**
 * Customer Portal server functions.
 *
 * Scopes all reads to the contact record whose email matches the signed-in
 * auth user's email.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sbAny } from "@/lib/supabase/untyped";
import { GEMINI_CHAT_URL } from "@/lib/ai/gemini.server";

/**
 * Schema-less view of the admin client. Typing the client with the generated
 * `Database` makes TypeScript parse every long `.select("a, b, c, ...")`
 * string literal in this 2k-line file, which alone costs minutes of
 * typecheck time. Runtime behaviour is unchanged.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedClient = SupabaseClient<any, "public", any>;

type ContactCtx = {
  contactId: string;
  workspaceId: string;
  email: string;
  name: string | null;
  phone: string | null;
  company_id: string | null;
};

async function resolveContact(email: string): Promise<ContactCtx | null> {
  const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
  if (!email) return null;
  const { data } = await supabaseAdmin
    .from("contacts")
    .select("id, workspace_id, email, name, first_name, last_name, phone, company_id")
    .ilike("email", email)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const row = data as {
    id: string; workspace_id: string; email: string | null;
    name: string | null; first_name: string | null; last_name: string | null;
    phone: string | null; company_id: string | null;
  };
  const displayName = row.name ?? [row.first_name, row.last_name].filter(Boolean).join(" ") ?? null;
  return {
    contactId: row.id, workspaceId: row.workspace_id,
    email: row.email ?? email, name: displayName || null,
    phone: row.phone, company_id: row.company_id,
  };
}

async function requireContact(context: { claims: { email?: string } }): Promise<ContactCtx> {
  const email = context.claims?.email ?? "";
  const ctx = await resolveContact(email);
  if (!ctx) throw new Error("No customer profile linked to this account. Contact support to link your email.");
  return ctx;
}

/* ---------------- Overview ---------------- */

export const getPortalOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;

    const [conv, appts, invs, deals] = await Promise.all([
      sbAny(supabaseAdmin).from("conversations").select("id", { count: "exact", head: true })
        .eq("workspace_id", c.workspaceId).eq("contact_id", c.contactId).neq("status", "resolved"),
      sbAny(supabaseAdmin).from("booking_appointments").select("id", { count: "exact", head: true })
        .eq("workspace_id", c.workspaceId).eq("customer_email", c.email).gte("start_at", new Date().toISOString()),
      sbAny(supabaseAdmin).from("invoices").select("id, total, amount_paid, status", { count: "exact" })
        .eq("workspace_id", c.workspaceId).eq("contact_id", c.contactId).in("status", ["sent", "overdue", "partial"]),
      sbAny(supabaseAdmin).from("deals").select("id", { count: "exact", head: true })
        .eq("workspace_id", c.workspaceId).eq("contact_id", c.contactId),
    ]);

    let outstanding = 0;
    if (Array.isArray(invs.data)) {
      for (const r of invs.data as Array<{ total: number; amount_paid: number | null }>) {
        outstanding += Math.max(0, (r.total ?? 0) - (r.amount_paid ?? 0));
      }
    }

    return {
      contact: { id: c.contactId, name: c.name, email: c.email, phone: c.phone },
      counters: {
        open_conversations: conv.count ?? 0,
        upcoming_appointments: appts.count ?? 0,
        open_invoices: invs.count ?? 0,
        open_deals: deals.count ?? 0,
        outstanding_cents: outstanding,
      },
    };
  });

/* ---------------- Conversations ---------------- */

const PORTAL_CHANNELS = ["whatsapp", "instagram", "messenger", "telegram", "email", "livechat", "sms"] as const;
type PortalChannel = (typeof PORTAL_CHANNELS)[number];
// Map portal-facing channel to underlying DB enum values
const CHANNEL_MAP: Record<PortalChannel, "whatsapp" | "instagram" | "messenger" | "telegram" | "email" | "webchat" | "sms"> = {
  whatsapp: "whatsapp", instagram: "instagram", messenger: "messenger", telegram: "telegram",
  email: "email", livechat: "webchat", sms: "sms",
};

type ListedConversation = {
  id: string;
  subject: string | null;
  status: string | null;
  channel: string | null;
  priority: string | null;
  assigned_to: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_from: string | null;
  unread_count: number | null;
  created_at: string;
  ai_summary: string | null;
  agent: { display_name: string | null; avatar_url: string | null } | null;
};

export const listMyConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    q: z.string().trim().max(200).optional(),
    channel: z.enum(PORTAL_CHANNELS).optional(),
    status: z.enum(["open", "pending", "resolved", "snoozed"]).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    unread_only: z.boolean().optional(),
    limit: z.number().int().min(1).max(200).default(100),
  }).parse(v ?? {}))
  .handler(async ({ data, context }): Promise<ListedConversation[]> => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    let q = supabaseAdmin
      .from("conversations")
      .select("id, subject, status, channel, priority, assigned_to, last_message_at, last_message_preview, last_message_from, unread_count, created_at, ai_summary")
      .eq("workspace_id", c.workspaceId).eq("contact_id", c.contactId)
      .is("deleted_at", null)
      .eq("is_archived", false)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(data.limit);
    if (data.channel) q = q.eq("channel", CHANNEL_MAP[data.channel]);
    if (data.status) q = q.eq("status", data.status);
    if (data.from) q = q.gte("last_message_at", data.from);
    if (data.to) q = q.lte("last_message_at", data.to);
    if (data.unread_only) q = q.gt("unread_count", 0);
    if (data.q) q = q.or(`subject.ilike.%${sanitizeSearchTerm(data.q)}%,last_message_preview.ilike.%${sanitizeSearchTerm(data.q)}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<Omit<ListedConversation, "agent">>;

    const agentIds = Array.from(new Set(list.map((r) => r.assigned_to).filter((v): v is string => Boolean(v))));
    let agents: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
    if (agentIds.length) {
      const { data: profs } = await sbAny(supabaseAdmin).from("profiles")
        .select("id, display_name, full_name, avatar_url").in("id", agentIds);
      agents = Object.fromEntries(
        ((profs ?? []) as Array<{ id: string; display_name: string | null; full_name: string | null; avatar_url: string | null }>)
          .map((p) => [p.id, { display_name: p.display_name ?? p.full_name, avatar_url: p.avatar_url }]),
      );
    }
    return list.map((r) => ({ ...r, agent: r.assigned_to ? agents[r.assigned_to] ?? null : null }));
  });

type PortalMessage = {
  id: string; body: string | null; direction: string; message_type: string | null;
  status: string | null; created_at: string; media_url: string | null; media_type: string | null;
  media_thumbnail_url: string | null; media_duration_seconds: number | null; media_size: number | null;
  edited_at: string | null; deleted_at: string | null; reply_to_id: string | null; sent_by: string | null;
};
type PortalAttachment = {
  id: string; message_id: string; url: string | null; mime_type: string | null; file_name: string | null;
  size_bytes: number | null; duration_seconds: number | null; thumbnail_url: string | null;
  width: number | null; height: number | null; created_at: string;
};
type PortalNote = { id: string; body: string; is_pinned: boolean; created_at: string; updated_at: string; author_id: string | null };
type ConversationDetail = {
  conversation: {
    id: string; workspace_id: string; subject: string | null; status: string | null; channel: string | null;
    priority: string | null; assigned_to: string | null; created_at: string; last_message_at: string | null;
    ai_summary: string | null;
    agent: { display_name: string | null; avatar_url: string | null; job_title: string | null } | null;
  };
  messages: PortalMessage[];
  attachments: PortalAttachment[];
  intelligence: {
    summary: string | null; key_points: string[] | null; sentiment: string | null; intent: string | null;
    urgency: string | null; priority: string | null; topics: string[] | null; analyzed_at: string | null;
  } | null;
  notes: PortalNote[];
};

export const getConversationDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ conversation_id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<ConversationDetail> => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data: conv } = await sbAny(supabaseAdmin).from("conversations")
      .select("id, workspace_id, subject, status, channel, priority, assigned_to, created_at, last_message_at, ai_summary")
      .eq("id", data.conversation_id).eq("contact_id", c.contactId).is("deleted_at", null).maybeSingle();
    if (!conv) throw new Error("Conversation not found");
    const convRow = conv as ConversationDetail["conversation"] & { workspace_id: string };

    const [msgs, intel, notes, agent] = await Promise.all([
      sbAny(supabaseAdmin).from("messages")
        .select("id, body, direction, message_type, status, created_at, media_url, media_type, media_thumbnail_url, media_duration_seconds, media_size, edited_at, deleted_at, reply_to_id, sent_by")
        .eq("conversation_id", data.conversation_id).eq("is_internal", false)
        .order("created_at", { ascending: true }).limit(500),
      sbAny(supabaseAdmin).from("conversation_intelligence")
        .select("summary, key_points, sentiment, intent, urgency, priority, topics, analyzed_at")
        .eq("conversation_id", data.conversation_id).maybeSingle(),
      sbAny(supabaseAdmin).from("notes")
        .select("id, body, is_pinned, created_at, updated_at, author_id")
        .eq("workspace_id", convRow.workspace_id)
        .eq("entity_type", "conversation").eq("entity_id", data.conversation_id)
        .is("deleted_at", null).order("is_pinned", { ascending: false }).order("created_at", { ascending: false }).limit(50),
      convRow.assigned_to
        ? sbAny(supabaseAdmin).from("profiles")
            .select("id, display_name, full_name, avatar_url, job_title").eq("id", convRow.assigned_to).maybeSingle()
        : Promise.resolve({ data: null as null }),
    ]);

    const messageList = (msgs.data ?? []) as PortalMessage[];
    const messageIds = messageList.map((m) => m.id);
    let attachments: PortalAttachment[] = [];
    if (messageIds.length) {
      const { data: a } = await sbAny(supabaseAdmin).from("message_attachments")
        .select("id, message_id, url, mime_type, file_name, size_bytes, duration_seconds, thumbnail_url, width, height, created_at")
        .eq("workspace_id", convRow.workspace_id).in("message_id", messageIds);
      attachments = (a ?? []) as PortalAttachment[];
    }

    const agentRow = (agent as { data: { display_name: string | null; full_name: string | null; avatar_url: string | null; job_title: string | null } | null }).data;
    return {
      conversation: {
        ...convRow,
        agent: agentRow ? {
          display_name: agentRow.display_name ?? agentRow.full_name,
          avatar_url: agentRow.avatar_url,
          job_title: agentRow.job_title,
        } : null,
      },
      messages: messageList,
      attachments,
      intelligence: (intel.data as ConversationDetail["intelligence"]) ?? null,
      notes: ((notes.data ?? []) as PortalNote[]).filter((n) => !((n.body ?? "").toLowerCase().startsWith("internal:"))),
    };
  });



export const listMyMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ conversation_id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data: conv } = await sbAny(supabaseAdmin).from("conversations")
      .select("id").eq("id", data.conversation_id).eq("contact_id", c.contactId).maybeSingle();
    if (!conv) throw new Error("Conversation not found");
    const { data: msgs, error } = await supabaseAdmin
      .from("messages")
      .select("id, body, direction, message_type, status, created_at, media_url, media_type, media_thumbnail_url, media_duration_seconds")
      .eq("conversation_id", data.conversation_id)
      .eq("is_internal", false)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return msgs ?? [];
  });

export const addConversationNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    conversation_id: z.string().uuid(),
    body: z.string().trim().min(1).max(2000),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data: conv } = await sbAny(supabaseAdmin).from("conversations")
      .select("id, workspace_id").eq("id", data.conversation_id).eq("contact_id", c.contactId).maybeSingle();
    if (!conv) throw new Error("Conversation not found");
    const { error } = await sbAny(supabaseAdmin).from("conversation_notes").insert({
      workspace_id: (conv as { workspace_id: string }).workspace_id,
      conversation_id: data.conversation_id,
      author_id: context.userId, body: `customer: ${data.body}`,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const PortalAttachmentInput = z.object({
  storage_path: z.string().min(1).max(500),
  file_name: z.string().min(1).max(255),
  mime_type: z.string().min(1).max(200),
  size_bytes: z.number().int().min(0).max(100 * 1024 * 1024),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration_seconds: z.number().int().positive().optional(),
});

export const sendPortalMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    conversation_id: z.string().uuid(),
    body: z.string().trim().max(4000).optional().default(""),
    attachments: z.array(PortalAttachmentInput).max(10).optional().default([]),
  }).refine((d) => d.body.length > 0 || d.attachments.length > 0, {
    message: "Message body or at least one attachment is required",
  }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data: conv } = await sbAny(supabaseAdmin).from("conversations")
      .select("id, workspace_id").eq("id", data.conversation_id).eq("contact_id", c.contactId).maybeSingle();
    if (!conv) throw new Error("Conversation not found");
    const workspaceId = (conv as { workspace_id: string }).workspace_id;

    const firstMime = data.attachments[0]?.mime_type ?? "";
    let msgType: "text" | "image" | "video" | "audio" | "document" = "text";
    if (data.attachments.length > 0) {
      if (firstMime.startsWith("image/")) msgType = "image";
      else if (firstMime.startsWith("video/")) msgType = "video";
      else if (firstMime.startsWith("audio/")) msgType = "audio";
      else msgType = "document";
    }

    const { data: msg, error } = await sbAny(supabaseAdmin).from("messages").insert({
      conversation_id: data.conversation_id,
      workspace_id: workspaceId,
      direction: "inbound",
      message_type: msgType,
      body: data.body || null,
      status: "delivered",
      is_internal: false,
    } as never).select("id").single();
    if (error) throw new Error(error.message);
    const messageId = (msg as { id: string }).id;

    if (data.attachments.length) {
      const rows = await Promise.all(data.attachments.map(async (a) => {
        const { data: signed } = await supabaseAdmin
          .storage.from("attachments")
          .createSignedUrl(a.storage_path, 60 * 60 * 24 * 30);
        return {
          workspace_id: workspaceId,
          message_id: messageId,
          storage_bucket: "attachments",
          storage_path: a.storage_path,
          url: signed?.signedUrl ?? null,
          mime_type: a.mime_type,
          file_name: a.file_name,
          size_bytes: a.size_bytes,
          width: a.width ?? null,
          height: a.height ?? null,
          duration_seconds: a.duration_seconds ?? null,
          uploaded_by: context.userId,
          visibility: "workspace",
        };
      }));
      const { error: aErr } = await sbAny(supabaseAdmin).from("message_attachments").insert(rows as never);
      if (aErr) throw new Error(aErr.message);

      const first = data.attachments[0];
      const firstUrl = rows[0]?.url ?? null;
      await sbAny(supabaseAdmin).from("messages").update({
        media_url: firstUrl,
        media_type: first.mime_type,
        media_size: first.size_bytes,
      } as never).eq("id", messageId);
    }

    const preview = data.body
      ? data.body.slice(0, 160)
      : data.attachments.length === 1
        ? `📎 ${data.attachments[0].file_name}`
        : `📎 ${data.attachments.length} attachments`;
    await sbAny(supabaseAdmin).from("conversations")
      .update({ last_message_at: new Date().toISOString(), last_message_preview: preview, last_message_from: "customer", status: "open" } as never)
      .eq("id", data.conversation_id);
    return { id: messageId };
  });

/**
 * Signed upload URL so customers can upload attachments directly to Storage
 * with client-side progress. Conversation ownership is verified.
 */
export const createPortalAttachmentUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    conversation_id: z.string().uuid(),
    file_name: z.string().min(1).max(255),
    mime_type: z.string().min(1).max(200),
    size_bytes: z.number().int().min(1).max(100 * 1024 * 1024),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data: conv } = await sbAny(supabaseAdmin).from("conversations")
      .select("id, workspace_id").eq("id", data.conversation_id).eq("contact_id", c.contactId).maybeSingle();
    if (!conv) throw new Error("Conversation not found");
    const workspaceId = (conv as { workspace_id: string }).workspace_id;
    const safe = data.file_name.replace(/[^\w.\-]/g, "_").slice(-120);
    const path = `${workspaceId}/${data.conversation_id}/portal/${Date.now()}-${crypto.randomUUID()}-${safe}`;
    const { data: signed, error } = await supabaseAdmin
      .storage.from("attachments")
      .createSignedUploadUrl(path);
    if (error || !signed) throw new Error(error?.message ?? "Failed to sign upload");
    return { bucket: "attachments", path, token: signed.token, signedUrl: signed.signedUrl };
  });

// Called by the client after opening a conversation, so unread badge clears.
// Persists a per-user last-read watermark in conversation_read_state so the
// state syncs across devices and sessions, and also zeroes the shared
// conversations.unread_count for portal contacts.
export const markConversationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    conversation_id: z.string().uuid(),
    last_read_at: z.string().datetime().optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const last_read_at = data.last_read_at ?? new Date().toISOString();
    await sbAny(supabaseAdmin).from("conversation_read_state").upsert({
      user_id: context.userId,
      conversation_id: data.conversation_id,
      last_read_at,
    } as never, { onConflict: "user_id,conversation_id" });
    await sbAny(supabaseAdmin).from("conversations")
      .update({ unread_count: 0 } as never)
      .eq("id", data.conversation_id).eq("contact_id", c.contactId);
    return { ok: true, last_read_at };
  });

// Returns the current user's last-read watermarks for one or many conversations.
export const getMyConversationReadState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    conversation_ids: z.array(z.string().uuid()).min(1).max(500),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data: rows } = await supabaseAdmin
      .from("conversation_read_state")
      .select("conversation_id, last_read_at")
      .eq("user_id", context.userId)
      .in("conversation_id", data.conversation_ids);
    const map: Record<string, string> = {};
    for (const r of (rows ?? []) as Array<{ conversation_id: string; last_read_at: string }>) {
      map[r.conversation_id] = r.last_read_at;
    }
    return map;
  });

/* ---------------- Floating chat widget ---------------- */

// Get-or-create the customer's live-chat conversation for the floating widget.
export const getOrCreatePortalChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data: existing } = await supabaseAdmin
      .from("conversations")
      .select("id")
      .eq("workspace_id", c.workspaceId)
      .eq("contact_id", c.contactId)
      .eq("channel", "webchat")
      .is("deleted_at", null)
      .in("status", ["open", "pending", "snoozed"])
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (existing) return { id: (existing as { id: string }).id };
    const { data: conv, error } = await sbAny(supabaseAdmin).from("conversations").insert({
      workspace_id: c.workspaceId,
      contact_id: c.contactId,
      subject: "Live chat",
      channel: "webchat",
      status: "open",
      priority: "normal",
      last_message_at: new Date().toISOString(),
    } as never).select("id").single();
    if (error) throw new Error(error.message);
    return { id: (conv as { id: string }).id };
  });


/* ---------------- Appointments ---------------- */

export const listMyAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data, error } = await supabaseAdmin
      .from("booking_appointments")
      .select("id, start_at, end_at, status, location_kind, join_url, cancellation_reason, customer_name, event_type_id")
      .eq("workspace_id", c.workspaceId).eq("customer_email", c.email)
      .order("start_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const cancelMyAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    appointment_id: z.string().uuid(),
    reason: z.string().max(500).optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { error } = await sbAny(supabaseAdmin).from("booking_appointments")
      .update({ status: "cancelled", cancellation_reason: data.reason ?? "Cancelled by customer" } as never)
      .eq("id", data.appointment_id).eq("customer_email", c.email);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Invoices ---------------- */

export const listMyInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data, error } = await supabaseAdmin
      .from("invoices")
      .select("id, invoice_number, status, total, amount_paid, amount_due, currency, issue_date, due_date, paid_at, public_token, created_at")
      .eq("workspace_id", c.workspaceId).eq("contact_id", c.contactId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/* ---------------- Tickets (support conversations, distinguished via subject prefix) ---------------- */

export const listMyTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data, error } = await supabaseAdmin
      .from("conversations")
      .select("id, subject, status, priority, created_at, last_message_at, channel")
      .eq("workspace_id", c.workspaceId).eq("contact_id", c.contactId)
      .not("subject", "is", null)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    subject: z.string().trim().min(3).max(200),
    body: z.string().trim().min(3).max(4000),
    priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data: conv, error } = await sbAny(supabaseAdmin).from("conversations").insert({
      workspace_id: c.workspaceId,
      contact_id: c.contactId,
      subject: data.subject,
      channel: "webchat",
      status: "open",
      priority: data.priority,
      last_message_at: new Date().toISOString(),
      last_message_preview: data.body.slice(0, 160),
    } as never).select("id").single();
    if (error) throw new Error(error.message);
    const conversationId = (conv as { id: string }).id;
    await sbAny(supabaseAdmin).from("messages").insert({
      conversation_id: conversationId,
      workspace_id: c.workspaceId,
      direction: "inbound",
      message_type: "text",
      body: data.body,
      status: "delivered",
      is_internal: false,
    } as never);
    return { id: conversationId };
  });

/* ---------------- Orders / Deals ---------------- */

export const listMyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data, error } = await supabaseAdmin
      .from("deals")
      .select("id, title, amount, currency, stage_id, status, expected_close_date, created_at")
      .eq("workspace_id", c.workspaceId).eq("contact_id", c.contactId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/* ---------------- Files (via contact conversations' attachments) ---------------- */

export const listMyFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    // Get files uploaded in this customer's conversations
    const { data: convs } = await supabaseAdmin
      .from("conversations").select("id").eq("workspace_id", c.workspaceId).eq("contact_id", c.contactId);
    const convIds = ((convs as Array<{ id: string }> | null) ?? []).map((r) => r.id);
    if (convIds.length === 0) return [];
    const { data, error } = await supabaseAdmin
      .from("messages")
      .select("id, media_url, media_type, media_size, created_at, body")
      .in("conversation_id", convIds)
      .not("media_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).map((m) => {
      const row = m as { id: string; media_url: string | null; media_type: string | null; media_size: number | null; created_at: string; body: string | null };
      return {
        id: row.id,
        name: row.body?.slice(0, 60) || "Attachment",
        url: row.media_url,
        mime_type: row.media_type,
        size: row.media_size,
        created_at: row.created_at,
      };
    });
  });

/* ---------------- Profile ---------------- */

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data } = await sbAny(supabaseAdmin).from("contacts")
      .select("id, first_name, last_name, name, email, phone, whatsapp, company_id, job_title, timezone, locale, avatar_url, preferences")
      .eq("id", c.contactId).maybeSingle();
    return data;
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    first_name: z.string().trim().max(80).optional().nullable(),
    last_name: z.string().trim().max(80).optional().nullable(),
    phone: z.string().trim().max(40).optional().nullable(),
    whatsapp: z.string().trim().max(40).optional().nullable(),
    job_title: z.string().trim().max(120).optional().nullable(),
    timezone: z.string().trim().max(80).optional().nullable(),
    locale: z.string().trim().max(20).optional().nullable(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || undefined;
    const payload = { ...data, ...(name ? { name } : {}), updated_at: new Date().toISOString() };
    const { error } = await sbAny(supabaseAdmin).from("contacts")
      .update(payload as never)
      .eq("id", c.contactId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Notifications ---------------- */

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data, error } = await supabaseAdmin
      .from("notifications")
      .select("id, title, body, category, action_url, status, read_at, created_at, data")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid().optional(), all: z.boolean().optional() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const nowIso = new Date().toISOString();
    let q = sbAny(supabaseAdmin).from("notifications")
      .update({ read_at: nowIso, status: "read" } as never)
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (data.id) q = q.eq("id", data.id);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Knowledge Base (customer-facing published articles) ---------------- */

export const listKbArticles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ query: z.string().trim().max(200).optional() }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    let q = supabaseAdmin
      .from("kb_articles")
      .select("id, slug, title, summary, tags, view_count, updated_at, published_at, category_id")
      .eq("workspace_id", c.workspaceId)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(50);
    if (data.query) q = q.ilike("title", `%${sanitizeSearchTerm(data.query)}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getKbArticle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ slug: z.string().trim().min(1).max(200) }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data: row, error } = await supabaseAdmin
      .from("kb_articles")
      .select("id, slug, title, summary, content_md, tags, updated_at, published_at, view_count")
      .eq("workspace_id", c.workspaceId)
      .eq("status", "published")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Article not found");
    // fire-and-forget view increment
    const r = row as { id: string; view_count: number | null };
    await sbAny(supabaseAdmin).from("kb_articles")
      .update({ view_count: (r.view_count ?? 0) + 1 } as never)
      .eq("id", r.id);
    return row;
  });

/* ---------------- AI Assistant (portal-scoped) ---------------- */

export const portalAiChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    messages: z.array(z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1).max(4000),
    })).min(1).max(30),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("AI assistant is not configured");

    const system = `You are a helpful support assistant for ${c.name ?? "the customer"}. ` +
      `Answer questions about their account, orders, invoices, and appointments concisely. ` +
      `If you don't know, suggest they open a support ticket. Never invent order or invoice details.`;

    const res = await fetch(GEMINI_CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [{ role: "system", content: system }, ...data.messages],
        temperature: 0.4,
        max_tokens: 600,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`AI request failed (${res.status}): ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const reply = json.choices?.[0]?.message?.content ?? "";
    return { reply };
  });

/* ---------------- Tasks ---------------- */

export const listMyTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data, error } = await supabaseAdmin
      .from("tasks")
      .select("id, title, status, priority, due_at, completed_at, created_at")
      .eq("workspace_id", c.workspaceId)
      .eq("entity_type", "contact")
      .eq("entity_id", c.contactId)
      .is("deleted_at", null)
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/* ---------------- Payments ---------------- */

export const listMyPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data, error } = await supabaseAdmin
      .from("payments")
      .select("id, amount, currency, method, status, paid_at, reference, invoice_id, created_at")
      .eq("workspace_id", c.workspaceId)
      .eq("contact_id", c.contactId)
      .order("paid_at", { ascending: false, nullsFirst: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/* ---------------- Dashboard bundle ---------------- */

export const getDashboardBundle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const nowIso = new Date().toISOString();

    const [appts, convs, orders, invs, pays, tickets, notifs, tasks, kb, contactRow] = await Promise.all([
      sbAny(supabaseAdmin).from("booking_appointments")
        .select("id, start_at, end_at, status, location_kind, join_url, event_type_id, customer_name")
        .eq("workspace_id", c.workspaceId).eq("customer_email", c.email)
        .gte("start_at", nowIso)
        .order("start_at", { ascending: true }).limit(5),
      sbAny(supabaseAdmin).from("conversations")
        .select("id, subject, status, channel, last_message_at, last_message_preview, unread_count")
        .eq("workspace_id", c.workspaceId).eq("contact_id", c.contactId)
        .order("last_message_at", { ascending: false, nullsFirst: false }).limit(5),
      sbAny(supabaseAdmin).from("deals")
        .select("id, title, amount, currency, status, expected_close_date, created_at")
        .eq("workspace_id", c.workspaceId).eq("contact_id", c.contactId)
        .order("created_at", { ascending: false }).limit(5),
      sbAny(supabaseAdmin).from("invoices")
        .select("id, invoice_number, status, total, amount_paid, amount_due, currency, due_date, paid_at")
        .eq("workspace_id", c.workspaceId).eq("contact_id", c.contactId)
        .order("created_at", { ascending: false }).limit(5),
      sbAny(supabaseAdmin).from("payments")
        .select("id, amount, currency, method, status, paid_at, reference")
        .eq("workspace_id", c.workspaceId).eq("contact_id", c.contactId)
        .order("paid_at", { ascending: false, nullsFirst: false }).limit(5),
      sbAny(supabaseAdmin).from("conversations")
        .select("id, subject, status, priority, created_at")
        .eq("workspace_id", c.workspaceId).eq("contact_id", c.contactId)
        .not("subject", "is", null)
        .order("created_at", { ascending: false }).limit(5),
      sbAny(supabaseAdmin).from("notifications")
        .select("id, title, body, category, action_url, status, read_at, created_at")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false }).limit(5),
      sbAny(supabaseAdmin).from("tasks")
        .select("id, title, status, priority, due_at, completed_at")
        .eq("workspace_id", c.workspaceId)
        .eq("entity_type", "contact").eq("entity_id", c.contactId)
        .is("deleted_at", null)
        .neq("status", "completed")
        .order("due_at", { ascending: true, nullsFirst: false }).limit(5),
      sbAny(supabaseAdmin).from("kb_articles")
        .select("id, slug, title, summary, updated_at")
        .eq("workspace_id", c.workspaceId).eq("status", "published")
        .order("published_at", { ascending: false, nullsFirst: false }).limit(5),
      sbAny(supabaseAdmin).from("contacts")
        .select("preferences, avatar_url")
        .eq("id", c.contactId).maybeSingle(),
    ]);

    let outstanding = 0;
    for (const r of ((invs.data as Array<{ total: number; amount_paid: number | null; status: string }> | null) ?? [])) {
      if (["sent", "overdue", "partial"].includes(r.status)) {
        outstanding += Math.max(0, (r.total ?? 0) - (r.amount_paid ?? 0));
      }
    }
    const unread = ((notifs.data as Array<{ read_at: string | null }> | null) ?? [])
      .filter((n) => !n.read_at).length;

    const prefs = (contactRow.data as { preferences: unknown; avatar_url: string | null } | null)?.preferences ?? {};
    const dashboardPrefs = (prefs as { dashboard?: { widgets?: string[]; order?: string[] } }).dashboard ?? {};

    return {
      contact: { id: c.contactId, name: c.name, email: c.email, avatar_url: (contactRow.data as { avatar_url: string | null } | null)?.avatar_url ?? null },
      appointments: appts.data ?? [],
      conversations: convs.data ?? [],
      orders: orders.data ?? [],
      invoices: invs.data ?? [],
      payments: pays.data ?? [],
      tickets: tickets.data ?? [],
      notifications: notifs.data ?? [],
      tasks: tasks.data ?? [],
      kb: kb.data ?? [],
      counters: { outstanding_cents: outstanding, unread_notifications: unread },
      prefs: dashboardPrefs,
    };
  });

export const saveDashboardPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    widgets: z.array(z.string().max(50)).max(30),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data: row } = await sbAny(supabaseAdmin).from("contacts")
      .select("preferences").eq("id", c.contactId).maybeSingle();
    const existing = ((row as { preferences: Record<string, unknown> } | null)?.preferences ?? {}) as Record<string, unknown>;
    const next = { ...existing, dashboard: { widgets: data.widgets } };
    const { error } = await sbAny(supabaseAdmin).from("contacts")
      .update({ preferences: next, updated_at: new Date().toISOString() } as never)
      .eq("id", c.contactId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Preferences ---------------- */

export const getMyPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data } = await sbAny(supabaseAdmin).from("contacts")
      .select("preferences, do_not_contact").eq("id", c.contactId).maybeSingle();
    const prefs = ((data as { preferences: Record<string, unknown> } | null)?.preferences ?? {}) as Record<string, unknown>;
    return {
      do_not_contact: (data as { do_not_contact: boolean } | null)?.do_not_contact ?? false,
      communication: (prefs.communication ?? { email: true, sms: true, whatsapp: true, push: true, phone: true }) as Record<string, boolean>,
      notifications: (prefs.notifications ?? { product_updates: true, invoices: true, appointments: true, tickets: true, marketing: false, weekly_digest: false }) as Record<string, boolean>,
      privacy: (prefs.privacy ?? { profile_visible_to_agents: true, share_activity_with_ai: true, personalized_recommendations: true }) as Record<string, boolean>,
    };
  });

export const saveMyPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    do_not_contact: z.boolean().optional(),
    communication: z.record(z.string(), z.boolean()).optional(),
    notifications: z.record(z.string(), z.boolean()).optional(),
    privacy: z.record(z.string(), z.boolean()).optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data: row } = await sbAny(supabaseAdmin).from("contacts").select("preferences").eq("id", c.contactId).maybeSingle();
    const existing = ((row as { preferences: Record<string, unknown> } | null)?.preferences ?? {}) as Record<string, unknown>;
    const merged = {
      ...existing,
      ...(data.communication ? { communication: { ...(existing.communication as object ?? {}), ...data.communication } } : {}),
      ...(data.notifications ? { notifications: { ...(existing.notifications as object ?? {}), ...data.notifications } } : {}),
      ...(data.privacy ? { privacy: { ...(existing.privacy as object ?? {}), ...data.privacy } } : {}),
    };
    const payload: Record<string, unknown> = { preferences: merged, updated_at: new Date().toISOString() };
    if (typeof data.do_not_contact === "boolean") payload.do_not_contact = data.do_not_contact;
    const { error } = await sbAny(supabaseAdmin).from("contacts").update(payload as never).eq("id", c.contactId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Address ---------------- */

export const listMyAddresses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data, error } = await sbAny(supabaseAdmin).from("addresses")
      .select("id, label, address_type, street1, street2, city, region, postal_code, country, is_primary")
      .eq("workspace_id", c.workspaceId).eq("entity_type", "contact").eq("entity_id", c.contactId)
      .order("is_primary", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveMyAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    id: z.string().uuid().optional(),
    label: z.string().trim().max(60).optional().nullable(),
    address_type: z.enum(["billing", "shipping", "home", "work", "other"]).default("home"),
    street1: z.string().trim().max(200),
    street2: z.string().trim().max(200).optional().nullable(),
    city: z.string().trim().max(100),
    region: z.string().trim().max(100).optional().nullable(),
    postal_code: z.string().trim().max(20).optional().nullable(),
    country: z.string().trim().max(80),
    is_primary: z.boolean().optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    if (data.is_primary) {
      await sbAny(supabaseAdmin).from("addresses").update({ is_primary: false } as never)
        .eq("workspace_id", c.workspaceId).eq("entity_type", "contact").eq("entity_id", c.contactId);
    }
    if (data.id) {
      const { error } = await sbAny(supabaseAdmin).from("addresses").update({
        label: data.label, address_type: data.address_type, street1: data.street1, street2: data.street2,
        city: data.city, region: data.region, postal_code: data.postal_code, country: data.country,
        is_primary: data.is_primary ?? false, updated_at: new Date().toISOString(),
      } as never).eq("id", data.id).eq("entity_id", c.contactId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await sbAny(supabaseAdmin).from("addresses").insert({
      workspace_id: c.workspaceId, entity_type: "contact", entity_id: c.contactId,
      label: data.label, address_type: data.address_type, street1: data.street1, street2: data.street2,
      city: data.city, region: data.region, postal_code: data.postal_code, country: data.country,
      is_primary: data.is_primary ?? false,
    } as never).select("id").single();
    if (error) throw new Error(error.message);
    return { id: (ins as { id: string }).id };
  });

export const deleteMyAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { error } = await sbAny(supabaseAdmin).from("addresses").delete()
      .eq("id", data.id).eq("entity_id", c.contactId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Connected Channels ---------------- */

export const listMyChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data, error } = await sbAny(supabaseAdmin).from("channel_identities")
      .select("id, channel, external_id, display_name, verified, first_seen_at, last_seen_at")
      .eq("workspace_id", c.workspaceId).eq("contact_id", c.contactId)
      .order("last_seen_at", { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/* ---------------- Active Sessions ---------------- */

export const listMySessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data, error } = await sbAny(supabaseAdmin).from("sessions")
      .select("id, device, user_agent, ip_address, location, last_seen_at, revoked_at, created_at")
      .eq("user_id", context.userId)
      .is("revoked_at", null)
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []).map((s) => ({ ...s, ip_address: s.ip_address == null ? null : String(s.ip_address) }));

  });

export const revokeMySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid().optional(), all_others: z.boolean().optional() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const nowIso = new Date().toISOString();
    let q = sbAny(supabaseAdmin).from("sessions")
      .update({ revoked_at: nowIso } as never)
      .eq("user_id", context.userId)
      .is("revoked_at", null);
    if (data.id) q = q.eq("id", data.id);
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Avatar upload ---------------- */

export const uploadMyAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    data_url: z.string().min(30).max(6_000_000), // ~4MB base64
    filename: z.string().trim().max(120).default("avatar.png"),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const m = /^data:(image\/(png|jpeg|jpg|webp|gif));base64,(.+)$/i.exec(data.data_url);
    if (!m) throw new Error("Invalid image data");
    const mime = m[1];
    const ext = m[2].toLowerCase().replace("jpeg", "jpg");
    const buf = Buffer.from(m[3], "base64");
    if (buf.length > 4 * 1024 * 1024) throw new Error("Image too large (max 4MB)");
    const path = `portal/${c.contactId}/${Date.now()}.${ext}`;
    const up = await supabaseAdmin.storage.from("avatars").upload(path, buf, { contentType: mime, upsert: true });
    if (up.error) throw new Error(up.error.message);
    const signed = await supabaseAdmin.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
    const url = signed.data?.signedUrl ?? null;
    await sbAny(supabaseAdmin).from("contacts")
      .update({ avatar_url: url, updated_at: new Date().toISOString() } as never)
      .eq("id", c.contactId);
    return { url };
  });

/* ---------------- Billing: Quotes ---------------- */

export const listMyQuotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data, error } = await supabaseAdmin
      .from("quotes")
      .select("id, quote_number, title, status, currency, subtotal, discount_total, tax_total, total, valid_until, sent_at, accepted_at, rejected_at, public_token, created_at, version")
      .eq("workspace_id", c.workspaceId).eq("contact_id", c.contactId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getMyQuoteDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data: q, error } = await sbAny(supabaseAdmin).from("quotes")
      .select("id, quote_number, title, status, currency, subtotal, discount_total, tax_total, total, valid_until, sent_at, viewed_at, accepted_at, rejected_at, terms, notes, public_token, created_at")
      .eq("id", data.id).eq("contact_id", c.contactId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!q) throw new Error("Quote not found");
    const { data: items } = await sbAny(supabaseAdmin).from("quote_line_items")
      .select("id, name, description, quantity, unit_price, discount_pct, tax_rate, subtotal, total, sort_order")
      .eq("quote_id", data.id).order("sort_order", { ascending: true });
    return { quote: q, items: items ?? [] };
  });

export const respondToQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    id: z.string().uuid(),
    action: z.enum(["accept", "reject"]),
    reason: z.string().max(500).optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const nowIso = new Date().toISOString();
    const patch = data.action === "accept"
      ? { status: "accepted", accepted_at: nowIso }
      : { status: "rejected", rejected_at: nowIso, notes: data.reason ?? null };
    const { error } = await sbAny(supabaseAdmin).from("quotes")
      .update({ ...patch, updated_at: nowIso } as never)
      .eq("id", data.id).eq("contact_id", c.contactId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Billing: Invoice Detail + Timeline ---------------- */

export const getMyInvoiceDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data: inv, error } = await sbAny(supabaseAdmin).from("invoices")
      .select("id, invoice_number, status, currency, subtotal, discount_total, tax_total, total, amount_paid, amount_due, issue_date, due_date, sent_at, viewed_at, paid_at, voided_at, billing_address, terms, notes, public_token, created_at, deal_id, quote_id")
      .eq("id", data.id).eq("contact_id", c.contactId).is("deleted_at", null).maybeSingle();
    if (error) throw new Error(error.message);
    if (!inv) throw new Error("Invoice not found");
    const row = inv as { id: string; status: string; sent_at: string | null; viewed_at: string | null; paid_at: string | null; voided_at: string | null; created_at: string; due_date: string | null };
    const [items, pays] = await Promise.all([
      sbAny(supabaseAdmin).from("invoice_line_items")
        .select("id, name, description, quantity, unit_price, discount_pct, tax_rate, subtotal, total, sort_order")
        .eq("invoice_id", data.id).order("sort_order", { ascending: true }),
      sbAny(supabaseAdmin).from("payments")
        .select("id, amount, currency, method, status, paid_at, reference, processor, processor_ref, created_at")
        .eq("invoice_id", data.id).order("created_at", { ascending: true }),
    ]);
    const payments = (pays.data ?? []) as Array<{ id: string; amount: number; currency: string; method: string | null; status: string; paid_at: string | null; reference: string | null; created_at: string }>;
    type Event = { kind: string; at: string; label: string; detail?: string | null };
    const timeline: Event[] = [];
    timeline.push({ kind: "created", at: row.created_at, label: "Invoice created" });
    if (row.sent_at) timeline.push({ kind: "sent", at: row.sent_at, label: "Sent to customer" });
    if (row.viewed_at) timeline.push({ kind: "viewed", at: row.viewed_at, label: "Viewed by customer" });
    for (const p of payments) {
      if (p.paid_at || p.created_at) {
        timeline.push({
          kind: p.status === "refunded" ? "refunded" : "payment",
          at: p.paid_at ?? p.created_at,
          label: p.status === "refunded" ? `Refund ${p.reference ?? ""}` : `Payment received (${p.method ?? "manual"})`,
          detail: `${p.amount} ${p.currency}`,
        });
      }
    }
    if (row.paid_at) timeline.push({ kind: "paid", at: row.paid_at, label: "Marked paid" });
    if (row.voided_at) timeline.push({ kind: "voided", at: row.voided_at, label: "Voided" });
    timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    const refundedTotal = payments.filter((p) => p.status === "refunded").reduce((s, p) => s + (p.amount ?? 0), 0);
    return { invoice: inv, items: items.data ?? [], payments, timeline, refunded_total: refundedTotal };
  });

/* ---------------- Billing: Orders (deals) + Tracking ---------------- */

export const getMyOrderDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data: deal, error } = await sbAny(supabaseAdmin).from("deals")
      .select("id, title, description, amount, currency, status, stage_id, pipeline_id, expected_close_date, actual_close_date, created_at, updated_at")
      .eq("id", data.id).eq("contact_id", c.contactId).is("deleted_at", null).maybeSingle();
    if (error) throw new Error(error.message);
    if (!deal) throw new Error("Order not found");
    const row = deal as { id: string; pipeline_id: string | null; stage_id: string | null };
    const [stages, history, invs] = await Promise.all([
      row.pipeline_id
        ? sbAny(supabaseAdmin).from("deal_stages")
            .select("id, name, position, is_won, is_lost, color, stage_type")
            .eq("pipeline_id", row.pipeline_id).eq("is_active", true)
            .order("position", { ascending: true })
        : Promise.resolve({ data: [] as unknown[] }),
      sbAny(supabaseAdmin).from("deal_stage_history")
        .select("id, from_stage_id, to_stage_id, from_status, to_status, created_at, duration_seconds")
        .eq("deal_id", data.id).order("created_at", { ascending: true }),
      sbAny(supabaseAdmin).from("invoices")
        .select("id, invoice_number, status, total, currency, issue_date, due_date, paid_at")
        .eq("deal_id", data.id).order("created_at", { ascending: false }),
    ]);
    return {
      order: deal,
      stages: (stages.data ?? []) as Array<{ id: string; name: string; position: number; is_won: boolean; is_lost: boolean; color: string | null; stage_type: string | null }>,
      history: history.data ?? [],
      invoices: invs.data ?? [],
    };
  });

/* ---------------- Billing: Subscriptions ---------------- */

export const listMySubscriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await requireContact(context);
    type SubRow = {
      id: string; plan_id: string; status: string; provider: string | null; seats: number | null;
      trial_ends_at: string | null; current_period_start: string | null; current_period_end: string | null;
      cancel_at: string | null; canceled_at: string | null; grace_period_ends_at: string | null; created_at: string;
      plan: { name: string; price_cents: number; currency: string; interval: string } | null;
    };
    if (!c.company_id) return [] as SubRow[];
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data: subs, error } = await sbAny(supabaseAdmin).from("subscriptions")
      .select("id, plan_id, status, provider, seats, trial_ends_at, current_period_start, current_period_end, cancel_at, canceled_at, grace_period_ends_at, created_at")
      .eq("organization_id", c.company_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return [] as SubRow[];
    const list = (subs ?? []) as Array<Omit<SubRow, "plan">>;
    const planIds = Array.from(new Set(list.map((s) => s.plan_id).filter(Boolean)));
    let plans: Record<string, { name: string; price_cents: number; currency: string; interval: string }> = {};
    if (planIds.length) {
      const { data: p } = await sbAny(supabaseAdmin).from("plans")
        .select("id, name, price_cents, currency, interval").in("id", planIds);
      plans = Object.fromEntries(((p ?? []) as Array<{ id: string; name: string; price_cents: number; currency: string; interval: string }>).map((x) => [x.id, x]));
    }
    return list.map((s): SubRow => ({ ...s, plan: plans[s.plan_id] ?? null }));
  });

/* ---------------- Billing: Upcoming Payments ---------------- */

export const listMyUpcomingPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const nowIso = new Date().toISOString();
    const [invs, subs] = await Promise.all([
      sbAny(supabaseAdmin).from("invoices")
        .select("id, invoice_number, currency, amount_due, total, due_date, status")
        .eq("workspace_id", c.workspaceId).eq("contact_id", c.contactId)
        .in("status", ["sent", "overdue", "partial", "draft"])
        .not("due_date", "is", null)
        .order("due_date", { ascending: true })
        .limit(50),
      c.company_id
        ? sbAny(supabaseAdmin).from("subscriptions")
            .select("id, plan_id, status, current_period_end")
            .eq("organization_id", c.company_id)
            .in("status", ["active", "trialing", "past_due"])
            .gte("current_period_end", nowIso)
            .order("current_period_end", { ascending: true }).limit(20)
        : Promise.resolve({ data: [] as unknown[] }),
    ]);
    const subRows = (subs.data ?? []) as Array<{ id: string; plan_id: string; current_period_end: string }>;
    const planIds = Array.from(new Set(subRows.map((s) => s.plan_id).filter(Boolean)));
    let plans: Record<string, { name: string; price_cents: number; currency: string; interval: string }> = {};
    if (planIds.length) {
      const { data: p } = await sbAny(supabaseAdmin).from("plans")
        .select("id, name, price_cents, currency, interval").in("id", planIds);
      plans = Object.fromEntries(((p ?? []) as Array<{ id: string; name: string; price_cents: number; currency: string; interval: string }>).map((x) => [x.id, x]));
    }
    return {
      invoices: invs.data ?? [],
      subscriptions: subRows.map((s) => ({ ...s, plan: plans[s.plan_id] ?? null })),
    };
  });

/* ---------------- Billing: Initiate Online Payment (stub) ---------------- */

export const initiateInvoicePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ invoice_id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data: inv } = await sbAny(supabaseAdmin).from("invoices")
      .select("id, public_token, amount_due, total, currency, invoice_number")
      .eq("id", data.invoice_id).eq("contact_id", c.contactId).maybeSingle();
    if (!inv) throw new Error("Invoice not found");
    const row = inv as { id: string; public_token: string | null; amount_due: number; total: number; currency: string };
    // Route to hosted payment page (public token). Real payment providers plug in here.
    const url = row.public_token ? `/invoices/public/${row.public_token}?pay=1` : `/client/billing/invoice/${row.id}`;
    return { checkout_url: url, amount_due: row.amount_due ?? row.total, currency: row.currency };
  });

/* ---------------- Appointments: Detail, Reschedule, Feedback, Notes, ICS ---------------- */

type JsonValue = string | number | boolean | null | { [k: string]: JsonValue } | JsonValue[];
type JsonObject = { [k: string]: JsonValue };

type Appt = {
  id: string; start_at: string; end_at: string; status: string;
  location_kind: string | null; join_url: string | null; meeting_password: string | null;
  cancellation_reason: string | null; customer_name: string; customer_email: string | null;
  customer_timezone: string; event_type_id: string | null; reschedule_of: string | null;
  manage_token: string; meeting_notes: string | null; recording_url: string | null;
  answers: JsonObject; external_calendar_events: JsonObject;
  location_details: JsonObject; created_at: string; updated_at: string;
};

async function loadEventTypeMap(workspaceId: string, ids: string[]) {
  if (ids.length === 0) return {} as Record<string, { name: string; duration_minutes: number; color: string | null }>;
  const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
  const { data } = await sbAny(supabaseAdmin).from("booking_event_types")
    .select("id, name, duration_minutes, color").eq("workspace_id", workspaceId).in("id", ids);
  return Object.fromEntries(((data ?? []) as Array<{ id: string; name: string; duration_minutes: number; color: string | null }>).map((x) => [x.id, x]));
}

export const getMyAppointmentDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const cols = "id, start_at, end_at, status, location_kind, join_url, meeting_password, cancellation_reason, customer_name, customer_email, customer_timezone, event_type_id, reschedule_of, manage_token, meeting_notes, recording_url, answers, external_calendar_events, location_details, created_at, updated_at";
    const { data: appt, error } = await sbAny(supabaseAdmin).from("booking_appointments")
      .select(cols).eq("id", data.id).eq("workspace_id", c.workspaceId).eq("customer_email", c.email).maybeSingle();
    if (error) throw new Error(error.message);
    if (!appt) throw new Error("Appointment not found");
    const row = appt as Appt;

    // Walk reschedule chain (max 20)
    const chain: Appt[] = [row];
    let cursor = row.reschedule_of;
    for (let i = 0; i < 20 && cursor; i++) {
      const { data: prev } = await sbAny(supabaseAdmin).from("booking_appointments")
        .select(cols).eq("id", cursor).eq("workspace_id", c.workspaceId).maybeSingle();
      if (!prev) break;
      const p = prev as Appt;
      chain.push(p);
      cursor = p.reschedule_of;
    }

    // Forward chain (successors)
    const { data: successors } = await sbAny(supabaseAdmin).from("booking_appointments")
      .select(cols).eq("reschedule_of", row.id).eq("workspace_id", c.workspaceId);
    const forward = ((successors ?? []) as Appt[]);

    const [reminders, eventTypes] = await Promise.all([
      sbAny(supabaseAdmin).from("booking_reminders")
        .select("id, channel, kind, send_at, status, sent_at").eq("appointment_id", row.id).order("send_at", { ascending: true }),
      loadEventTypeMap(c.workspaceId, Array.from(new Set(
        [row, ...chain, ...forward].map((a) => a.event_type_id).filter((x): x is string => !!x)
      ))),
    ]);

    const feedback = (row.answers?.customer_feedback ?? null) as { rating?: number; comment?: string; submitted_at?: string } | null;

    const payload = {
      appointment: row,
      event_type: row.event_type_id ? eventTypes[row.event_type_id] ?? null : null,
      history: chain.map((a) => ({
        ...a,
        event_type: a.event_type_id ? eventTypes[a.event_type_id] ?? null : null,
      })),
      forward: forward.map((a) => ({
        ...a,
        event_type: a.event_type_id ? eventTypes[a.event_type_id] ?? null : null,
      })),
      reminders: reminders.data ?? [],
      feedback,
    };
    return JSON.parse(JSON.stringify(payload)) as typeof payload;
  });

export const updateAppointmentNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    appointment_id: z.string().uuid(),
    notes: z.string().max(5000),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    // Store customer-authored notes under answers.customer_notes to avoid overwriting internal meeting_notes
    const { data: row } = await sbAny(supabaseAdmin).from("booking_appointments")
      .select("answers").eq("id", data.appointment_id).eq("workspace_id", c.workspaceId).eq("customer_email", c.email).maybeSingle();
    if (!row) throw new Error("Appointment not found");
    const answers = (((row as { answers: Record<string, unknown> }).answers) ?? {}) as Record<string, unknown>;
    const next = { ...answers, customer_notes: { text: data.notes, updated_at: new Date().toISOString() } };
    const { error } = await sbAny(supabaseAdmin).from("booking_appointments")
      .update({ answers: next, updated_at: new Date().toISOString() } as never)
      .eq("id", data.appointment_id).eq("workspace_id", c.workspaceId).eq("customer_email", c.email);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const submitAppointmentFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    appointment_id: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(2000).optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data: row } = await sbAny(supabaseAdmin).from("booking_appointments")
      .select("answers, status, end_at").eq("id", data.appointment_id).eq("workspace_id", c.workspaceId).eq("customer_email", c.email).maybeSingle();
    if (!row) throw new Error("Appointment not found");
    const answers = (((row as { answers: Record<string, unknown> }).answers) ?? {}) as Record<string, unknown>;
    const next = {
      ...answers,
      customer_feedback: {
        rating: data.rating,
        comment: data.comment ?? "",
        submitted_at: new Date().toISOString(),
      },
    };
    const { error } = await sbAny(supabaseAdmin).from("booking_appointments")
      .update({ answers: next, updated_at: new Date().toISOString() } as never)
      .eq("id", data.appointment_id).eq("workspace_id", c.workspaceId).eq("customer_email", c.email);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getRescheduleLink = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data: row } = await sbAny(supabaseAdmin).from("booking_appointments")
      .select("manage_token, status").eq("id", data.id).eq("workspace_id", c.workspaceId).eq("customer_email", c.email).maybeSingle();
    if (!row) throw new Error("Appointment not found");
    const r = row as { manage_token: string; status: string };
    if (["cancelled", "no_show", "completed"].includes(r.status)) throw new Error(`Cannot reschedule a ${r.status} appointment`);
    return { url: `/book/manage/${r.manage_token}` };
  });

export const getAppointmentIcs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data: row } = await sbAny(supabaseAdmin).from("booking_appointments")
      .select("id, start_at, end_at, status, customer_name, customer_email, join_url, location_kind, meeting_notes, event_type_id")
      .eq("id", data.id).eq("workspace_id", c.workspaceId).eq("customer_email", c.email).maybeSingle();
    if (!row) throw new Error("Appointment not found");
    const a = row as { id: string; start_at: string; end_at: string; status: string; customer_name: string; customer_email: string | null; join_url: string | null; location_kind: string | null; meeting_notes: string | null; event_type_id: string | null };
    let title = "Appointment";
    if (a.event_type_id) {
      const { data: ev } = await sbAny(supabaseAdmin).from("booking_event_types").select("name").eq("id", a.event_type_id).maybeSingle();
      title = ((ev as { name: string } | null)?.name) ?? title;
    }
    const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
    const location = a.join_url ?? (a.location_kind ?? "");
    const uid = `${a.id}@wacrm`;
    const status = a.status === "cancelled" ? "CANCELLED" : a.status === "completed" ? "CONFIRMED" : "CONFIRMED";
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//WACRM//Portal//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${fmt(new Date().toISOString())}`,
      `DTSTART:${fmt(a.start_at)}`,
      `DTEND:${fmt(a.end_at)}`,
      `SUMMARY:${esc(title)}`,
      location ? `LOCATION:${esc(location)}` : "",
      a.meeting_notes ? `DESCRIPTION:${esc(a.meeting_notes)}` : "",
      `STATUS:${status}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].filter(Boolean);
    return { ics: lines.join("\r\n"), filename: `appointment-${a.id.slice(0, 8)}.ics` };
  });

/* ---------------- Appointment Reminder Preferences ---------------- */

type ReminderPrefs = {
  channels: { email: boolean; sms: boolean; whatsapp: boolean; push: boolean };
  timings: { one_hour: boolean; twenty_four_hours: boolean; three_days: boolean };
};

const DEFAULT_REMINDER_PREFS: ReminderPrefs = {
  channels: { email: true, sms: false, whatsapp: false, push: true },
  timings: { one_hour: true, twenty_four_hours: true, three_days: false },
};

export const getMyReminderPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data } = await sbAny(supabaseAdmin).from("contacts")
      .select("preferences").eq("id", c.contactId).maybeSingle();
    const prefs = (((data as { preferences: Record<string, unknown> } | null)?.preferences) ?? {}) as Record<string, unknown>;
    const r = (prefs.appointment_reminders ?? {}) as Partial<ReminderPrefs>;
    return {
      channels: { ...DEFAULT_REMINDER_PREFS.channels, ...(r.channels ?? {}) },
      timings: { ...DEFAULT_REMINDER_PREFS.timings, ...(r.timings ?? {}) },
    } as ReminderPrefs;
  });

export const saveMyReminderPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    channels: z.object({
      email: z.boolean(), sms: z.boolean(), whatsapp: z.boolean(), push: z.boolean(),
    }),
    timings: z.object({
      one_hour: z.boolean(), twenty_four_hours: z.boolean(), three_days: z.boolean(),
    }),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data: row } = await sbAny(supabaseAdmin).from("contacts")
      .select("preferences").eq("id", c.contactId).maybeSingle();
    const existing = (((row as { preferences: Record<string, unknown> } | null)?.preferences) ?? {}) as Record<string, unknown>;
    const next = { ...existing, appointment_reminders: data };
    const { error } = await sbAny(supabaseAdmin).from("contacts")
      .update({ preferences: next, updated_at: new Date().toISOString() } as never)
      .eq("id", c.contactId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Support Center: Ticket detail, messages, feedback, escalation ---------------- */

export const getTicketDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data: row, error } = await supabaseAdmin
      .from("conversations")
      .select("id, subject, status, priority, created_at, updated_at, last_message_at, channel, metadata, assigned_to")
      .eq("id", data.id).eq("workspace_id", c.workspaceId).eq("contact_id", c.contactId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Ticket not found");
    const ticket = row as {
      id: string; subject: string | null; status: string; priority: string;
      created_at: string; updated_at: string; last_message_at: string | null;
      channel: string; metadata: JsonObject | null; assigned_to: string | null;
    };

    const { data: msgs } = await supabaseAdmin
      .from("messages")
      .select("id, direction, body, message_type, media_url, media_type, media_size, created_at, is_internal, status")
      .eq("conversation_id", ticket.id)
      .eq("is_internal", false)
      .order("created_at", { ascending: true })
      .limit(500);

    const meta = (ticket.metadata ?? {}) as Record<string, unknown>;
    const feedback = (meta.customer_feedback ?? null) as { rating?: number; comment?: string; submitted_at?: string } | null;
    const escalations = (meta.escalations ?? []) as Array<{ reason: string; at: string; from: string; to: string }>;

    const payload = {
      ticket,
      messages: msgs ?? [],
      feedback,
      escalations,
    };
    return JSON.parse(JSON.stringify(payload)) as typeof payload;
  });

export const addTicketMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    id: z.string().uuid(),
    body: z.string().trim().min(1).max(4000),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    // Verify ownership
    const { data: t } = await sbAny(supabaseAdmin).from("conversations")
      .select("id, status").eq("id", data.id).eq("workspace_id", c.workspaceId).eq("contact_id", c.contactId).maybeSingle();
    if (!t) throw new Error("Ticket not found");

    const nowIso = new Date().toISOString();
    const { error } = await sbAny(supabaseAdmin).from("messages").insert({
      conversation_id: data.id,
      workspace_id: c.workspaceId,
      direction: "inbound",
      message_type: "text",
      body: data.body,
      status: "delivered",
      is_internal: false,
      sender_type: "contact",
    } as never);
    if (error) throw new Error(error.message);
    // Reopen if resolved/closed
    const status = (t as { status: string }).status;
    const nextStatus = status === "resolved" || status === "closed" ? "open" : status;
    await sbAny(supabaseAdmin).from("conversations")
      .update({
        last_message_at: nowIso,
        last_message_preview: data.body.slice(0, 160),
        status: nextStatus,
        updated_at: nowIso,
      } as never)
      .eq("id", data.id);
    return { ok: true };
  });

export const closeTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { error } = await sbAny(supabaseAdmin).from("conversations")
      .update({ status: "resolved", updated_at: new Date().toISOString() } as never)
      .eq("id", data.id).eq("workspace_id", c.workspaceId).eq("contact_id", c.contactId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const submitTicketFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    id: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(2000).optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data: row } = await sbAny(supabaseAdmin).from("conversations")
      .select("metadata").eq("id", data.id).eq("workspace_id", c.workspaceId).eq("contact_id", c.contactId).maybeSingle();
    if (!row) throw new Error("Ticket not found");
    const meta = (((row as { metadata: Record<string, unknown> | null } | null)?.metadata) ?? {}) as Record<string, unknown>;
    const next = {
      ...meta,
      customer_feedback: {
        rating: data.rating,
        comment: data.comment ?? "",
        submitted_at: new Date().toISOString(),
      },
    };
    const { error } = await sbAny(supabaseAdmin).from("conversations")
      .update({ metadata: next, updated_at: new Date().toISOString() } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const escalateTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    id: z.string().uuid(),
    reason: z.string().trim().min(3).max(500),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data: row } = await sbAny(supabaseAdmin).from("conversations")
      .select("priority, metadata").eq("id", data.id).eq("workspace_id", c.workspaceId).eq("contact_id", c.contactId).maybeSingle();
    if (!row) throw new Error("Ticket not found");
    const r = row as { priority: string; metadata: Record<string, unknown> | null };
    const order = ["low", "normal", "high", "urgent"];
    const idx = order.indexOf(r.priority);
    const next = order[Math.min(order.length - 1, Math.max(0, idx) + 1)];
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const escalations = Array.isArray(meta.escalations) ? (meta.escalations as unknown[]) : [];
    const newMeta = {
      ...meta,
      escalations: [...escalations, { reason: data.reason, at: new Date().toISOString(), from: r.priority, to: next }],
    };
    const nowIso = new Date().toISOString();
    const { error } = await sbAny(supabaseAdmin).from("conversations")
      .update({ priority: next, metadata: newMeta, status: "open", updated_at: nowIso } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    // Append visible message so agents see the reason
    await sbAny(supabaseAdmin).from("messages").insert({
      conversation_id: data.id,
      workspace_id: c.workspaceId,
      direction: "inbound",
      message_type: "text",
      body: `[Customer escalation] Priority raised from ${r.priority} to ${next}. Reason: ${data.reason}`,
      status: "delivered",
      is_internal: false,
      sender_type: "contact",
    } as never);
    return { priority: next };
  });

export const suggestKbArticles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    query: z.string().trim().min(2).max(500),
    limit: z.number().int().min(1).max(10).optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const limit = data.limit ?? 5;
    const like = `%${sanitizeSearchTerm(data.query.replace(/[%_]/g, " ").slice(0, 100))}%`;
    const { data: rows, error } = await supabaseAdmin
      .from("kb_articles")
      .select("id, slug, title, summary, tags, is_faq, view_count, updated_at")
      .eq("workspace_id", c.workspaceId).eq("status", "published")
      .or(`title.ilike.${like},summary.ilike.${like}`)
      .order("view_count", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listFaqs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data, error } = await supabaseAdmin
      .from("kb_articles")
      .select("id, slug, title, summary, faq_question, tags, view_count")
      .eq("workspace_id", c.workspaceId).eq("status", "published").eq("is_faq", true)
      .order("view_count", { ascending: false, nullsFirst: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const aiSuggestSelfHelp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    subject: z.string().trim().min(3).max(200),
    body: z.string().trim().min(3).max(4000),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const key = process.env.GEMINI_API_KEY;
    if (!key) return { summary: null, steps: [], articles: [] as Array<{ id: string; slug: string; title: string; summary: string | null }> };
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;

    // Pull top KB titles for grounding
    const { data: kb } = await supabaseAdmin
      .from("kb_articles")
      .select("id, slug, title, summary")
      .eq("workspace_id", c.workspaceId).eq("status", "published")
      .order("view_count", { ascending: false, nullsFirst: false })
      .limit(30);
    const kbList = ((kb as Array<{ id: string; slug: string; title: string; summary: string | null }> | null) ?? []);
    const catalog = kbList.map((a, i) => `${i + 1}. [${a.slug}] ${a.title} — ${a.summary ?? ""}`).join("\n");

    const prompt = `A customer is about to open a support ticket. Suggest whether they can self-serve first.
Subject: ${data.subject}
Details: ${data.body}

Available help articles:
${catalog || "(none)"}

Respond as strict JSON with this shape:
{"summary": string, "steps": string[], "article_slugs": string[]}
Keep summary under 240 chars. Provide 2-4 concrete self-help steps. Only include slugs from the list above (max 3).`;

    const res = await fetch(GEMINI_CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a customer support triage assistant. Prefer self-service. Respond in strict JSON only." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return { summary: null, steps: [], articles: [] as Array<{ id: string; slug: string; title: string; summary: string | null }> };
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: { summary?: string; steps?: string[]; article_slugs?: string[] } = {};
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }
    const slugs = new Set((parsed.article_slugs ?? []).slice(0, 3));
    const articles = kbList.filter((a) => slugs.has(a.slug)).slice(0, 3);
    return {
      summary: parsed.summary ?? null,
      steps: Array.isArray(parsed.steps) ? parsed.steps.slice(0, 5) : [],
      articles,
    };
  });

/* ---------------- Notifications v2: filters + prefs ---------------- */

const NOTIF_CATEGORIES = [
  "messages", "appointments", "invoices", "payments",
  "orders", "tickets", "campaigns", "announcements", "system",
] as const;
type NotifCategory = (typeof NOTIF_CATEGORIES)[number];

// Map raw category strings from various producers into the customer-facing category set.
function normalizeNotifCategory(raw: string | null | undefined): NotifCategory {
  const v = (raw ?? "").toLowerCase();
  if (["message", "chat", "conversation", "reply"].some((k) => v.includes(k))) return "messages";
  if (["appointment", "booking", "meeting", "reminder"].some((k) => v.includes(k))) return "appointments";
  if (["invoice", "quote"].some((k) => v.includes(k))) return "invoices";
  if (["payment", "receipt", "refund"].some((k) => v.includes(k))) return "payments";
  if (["order", "deal", "shipment"].some((k) => v.includes(k))) return "orders";
  if (["ticket", "support"].some((k) => v.includes(k))) return "tickets";
  if (["campaign", "marketing", "broadcast"].some((k) => v.includes(k))) return "campaigns";
  if (["announcement", "product_update", "release"].some((k) => v.includes(k))) return "announcements";
  return "system";
}

export const listMyNotificationsV2 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    category: z.enum(NOTIF_CATEGORIES).optional(),
    unread_only: z.boolean().optional(),
    limit: z.number().int().min(1).max(200).default(100),
  }).parse(v ?? {}))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    let q = supabaseAdmin
      .from("notifications")
      .select("id, title, body, category, channel, action_url, status, read_at, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.unread_only) q = q.is("read_at", null);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const enriched = ((rows ?? []) as Array<{
      id: string; title: string | null; body: string | null; category: string | null;
      channel: string | null; action_url: string | null; status: string | null;
      read_at: string | null; created_at: string;
    }>).map((r) => ({ ...r, group: normalizeNotifCategory(r.category) }));

    const filtered = data.category ? enriched.filter((r) => r.group === data.category) : enriched;

    // Group counts (over the whole result set, ignoring the category filter)
    const counts: Record<NotifCategory, number> = {
      messages: 0, appointments: 0, invoices: 0, payments: 0,
      orders: 0, tickets: 0, campaigns: 0, announcements: 0, system: 0,
    };
    let unread = 0;
    for (const r of enriched) {
      counts[r.group] += 1;
      if (!r.read_at) unread += 1;
    }
    return { items: filtered, counts, unread_total: unread };
  });

export const getMyNotificationPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data } = await sbAny(supabaseAdmin).from("contacts").select("preferences").eq("id", c.contactId).maybeSingle();
    const prefs = ((data as { preferences: Record<string, unknown> } | null)?.preferences ?? {}) as Record<string, unknown>;
    const channelPrefs = (prefs.notification_channels ?? {}) as Record<string, Record<string, boolean>>;

    const defaults = () => ({ in_app: true, email: true, whatsapp: false, push: true });
    const result: Record<NotifCategory, { in_app: boolean; email: boolean; whatsapp: boolean; push: boolean }> = {
      messages: defaults(), appointments: defaults(), invoices: defaults(), payments: defaults(),
      orders: defaults(), tickets: defaults(), campaigns: { in_app: true, email: false, whatsapp: false, push: false },
      announcements: defaults(), system: { in_app: true, email: false, whatsapp: false, push: false },
    };
    for (const k of NOTIF_CATEGORIES) {
      const saved = channelPrefs[k];
      if (saved) result[k] = { ...result[k], ...saved };
    }
    return result;
  });

export const updateMyNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    category: z.enum(NOTIF_CATEGORIES),
    channels: z.object({
      in_app: z.boolean().optional(),
      email: z.boolean().optional(),
      whatsapp: z.boolean().optional(),
      push: z.boolean().optional(),
    }),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data: row } = await sbAny(supabaseAdmin).from("contacts").select("preferences").eq("id", c.contactId).maybeSingle();
    const existing = ((row as { preferences: Record<string, unknown> } | null)?.preferences ?? {}) as Record<string, unknown>;
    const channels = ((existing.notification_channels ?? {}) as Record<string, Record<string, boolean>>);
    channels[data.category] = { ...(channels[data.category] ?? {}), ...data.channels };
    const { error } = await sbAny(supabaseAdmin).from("contacts").update({
      preferences: { ...existing, notification_channels: channels },
      updated_at: new Date().toISOString(),
    } as never).eq("id", c.contactId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- File Center ---------------- */

const FILE_ENTITY = z.enum(["conversation", "ticket", "order", "general"]);
type FileEntity = z.infer<typeof FILE_ENTITY>;

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
const BLOCKED_MIMES = ["application/x-msdownload", "application/x-msdos-program", "application/x-sh", "application/x-executable"];
const BLOCKED_EXTS = [".exe", ".bat", ".cmd", ".com", ".scr", ".msi", ".dll", ".sh", ".ps1", ".jar"];

function safeFilename(name: string): string {
  return name.replace(/[^\w.\-\s]/g, "_").replace(/\s+/g, "_").slice(0, 180);
}

// Verify the customer owns the entity they're linking a file to.
async function assertEntityOwnership(
  entity: FileEntity, entityId: string | null, c: ContactCtx,
): Promise<void> {
  if (entity === "general") return;
  const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
  if (!entityId) throw new Error("Entity id required.");
  if (entity === "conversation" || entity === "ticket") {
    const { data } = await sbAny(supabaseAdmin).from("conversations").select("id")
      .eq("id", entityId).eq("workspace_id", c.workspaceId).eq("contact_id", c.contactId).maybeSingle();
    if (!data) throw new Error("Not authorized for this conversation.");
    return;
  }
  if (entity === "order") {
    const { data } = await sbAny(supabaseAdmin).from("deals").select("id")
      .eq("id", entityId).eq("workspace_id", c.workspaceId).eq("contact_id", c.contactId).maybeSingle();
    if (!data) throw new Error("Not authorized for this order.");
    return;
  }
}

export const requestFileUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    filename: z.string().trim().min(1).max(200),
    mime_type: z.string().trim().max(200),
    size_bytes: z.number().int().min(0).max(MAX_FILE_SIZE),
    entity_type: FILE_ENTITY.default("general"),
    entity_id: z.string().uuid().optional().nullable(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const lowerName = data.filename.toLowerCase();
    if (BLOCKED_MIMES.includes(data.mime_type.toLowerCase())) {
      throw new Error("This file type is not allowed.");
    }
    if (BLOCKED_EXTS.some((ext) => lowerName.endsWith(ext))) {
      throw new Error("Executable files are not allowed.");
    }
    await assertEntityOwnership(data.entity_type, data.entity_id ?? null, c);

    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const safe = safeFilename(data.filename);
    const path = `portal/${c.workspaceId}/${c.contactId}/${crypto.randomUUID()}-${safe}`;

    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("attachments").createSignedUploadUrl(path);
    if (sErr || !signed) throw new Error(sErr?.message ?? "Failed to prepare upload.");
    return { path, token: signed.token, bucket: "attachments" };
  });

export const finalizeFileUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    path: z.string().min(1).max(500),
    filename: z.string().trim().min(1).max(200),
    mime_type: z.string().trim().max(200),
    size_bytes: z.number().int().min(0).max(MAX_FILE_SIZE),
    entity_type: FILE_ENTITY.default("general"),
    entity_id: z.string().uuid().optional().nullable(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    // Enforce path prefix so nothing else can be finalized under this contact.
    const prefix = `portal/${c.workspaceId}/${c.contactId}/`;
    if (!data.path.startsWith(prefix)) throw new Error("Invalid path.");
    await assertEntityOwnership(data.entity_type, data.entity_id ?? null, c);

    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data: fileRow, error: fErr } = await sbAny(supabaseAdmin).from("files").insert({
      workspace_id: c.workspaceId,
      uploader_id: context.userId,
      bucket: "attachments",
      path: data.path,
      name: data.filename,
      mime_type: data.mime_type,
      size_bytes: data.size_bytes,
      is_public: false,
      metadata: { entity_type: data.entity_type, entity_id: data.entity_id ?? null, source: "customer_portal" },
    } as never).select("id").maybeSingle();
    if (fErr) throw new Error(fErr.message);
    const fileId = (fileRow as { id: string } | null)?.id;
    if (!fileId) throw new Error("Failed to record file.");

    if (data.entity_type !== "general" && data.entity_id) {
      await sbAny(supabaseAdmin).from("attachments").insert({
        workspace_id: c.workspaceId,
        file_id: fileId,
        entity_type: data.entity_type,
        entity_id: data.entity_id,
        attached_by: context.userId,
      } as never);
    }
    return { ok: true, file_id: fileId };
  });

export const listPortalFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    entity_type: FILE_ENTITY.optional(),
    entity_id: z.string().uuid().optional().nullable(),
    query: z.string().trim().max(200).optional(),
    limit: z.number().int().min(1).max(200).default(100),
  }).parse(v ?? {}))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;

    // Collect entity ids owned by this contact so we can list files attached to them by anyone.
    const [convs, orders] = await Promise.all([
      sbAny(supabaseAdmin).from("conversations").select("id, subject")
        .eq("workspace_id", c.workspaceId).eq("contact_id", c.contactId),
      sbAny(supabaseAdmin).from("deals").select("id, title")
        .eq("workspace_id", c.workspaceId).eq("contact_id", c.contactId),
    ]);
    const convRows = ((convs.data as Array<{ id: string; subject: string | null }> | null) ?? []);
    const dealRows = ((orders.data as Array<{ id: string; title: string | null }> | null) ?? []);
    const convIds = convRows.map((r) => r.id);
    const dealIds = dealRows.map((r) => r.id);
    const entityLabel = new Map<string, string>();
    convRows.forEach((r) => entityLabel.set(r.id, r.subject || "Conversation"));
    dealRows.forEach((r) => entityLabel.set(r.id, r.title || "Order"));

    // Files uploaded by this customer (via portal)
    const ownFiles = await sbAny(supabaseAdmin).from("files")
      .select("id, name, mime_type, size_bytes, path, bucket, created_at, metadata")
      .eq("workspace_id", c.workspaceId)
      .eq("uploader_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    // Files attached to my entities (uploaded by staff)
    let attached: Array<{ file_id: string; entity_type: string; entity_id: string }> = [];
    if (convIds.length || dealIds.length) {
      const filters: Array<{ entity_type: string; ids: string[] }> = [];
      if (convIds.length) filters.push({ entity_type: "conversation", ids: convIds });
      if (convIds.length) filters.push({ entity_type: "ticket", ids: convIds });
      if (dealIds.length) filters.push({ entity_type: "order", ids: dealIds });
      const results = await Promise.all(filters.map((f) =>
        sbAny(supabaseAdmin).from("attachments")
          .select("file_id, entity_type, entity_id")
          .eq("workspace_id", c.workspaceId).eq("entity_type", f.entity_type).in("entity_id", f.ids)
      ));
      attached = results.flatMap((r) => (r.data ?? [])) as typeof attached;
    }
    const attachedFileIds = attached.map((a) => a.file_id);
    const attachedFiles = attachedFileIds.length
      ? await sbAny(supabaseAdmin).from("files")
        .select("id, name, mime_type, size_bytes, path, bucket, created_at, uploader_id")
        .in("id", attachedFileIds).eq("workspace_id", c.workspaceId)
      : { data: [] as Array<Record<string, unknown>>, error: null };

    const attachedMeta = new Map<string, { entity_type: string; entity_id: string }>();
    for (const a of attached) attachedMeta.set(a.file_id, { entity_type: a.entity_type, entity_id: a.entity_id });

    type FileItem = {
      id: string; name: string; mime_type: string | null; size_bytes: number | null;
      created_at: string; entity_type: string; entity_id: string | null;
      entity_label: string | null; source: "uploaded" | "shared";
    };
    const list: FileItem[] = [];
    for (const row of (ownFiles.data ?? []) as Array<{
      id: string; name: string; mime_type: string | null; size_bytes: number | null;
      created_at: string; metadata: Record<string, unknown> | null;
    }>) {
      const meta = row.metadata ?? {};
      const et = (meta.entity_type as string) ?? "general";
      const eid = (meta.entity_id as string | null) ?? null;
      list.push({
        id: row.id, name: row.name, mime_type: row.mime_type, size_bytes: row.size_bytes,
        created_at: row.created_at, entity_type: et, entity_id: eid,
        entity_label: eid ? entityLabel.get(eid) ?? null : null, source: "uploaded",
      });
    }
    for (const row of (attachedFiles.data ?? []) as Array<{
      id: string; name: string; mime_type: string | null; size_bytes: number | null; created_at: string;
    }>) {
      const meta = attachedMeta.get(row.id);
      if (!meta) continue;
      list.push({
        id: row.id, name: row.name, mime_type: row.mime_type, size_bytes: row.size_bytes,
        created_at: row.created_at, entity_type: meta.entity_type, entity_id: meta.entity_id,
        entity_label: entityLabel.get(meta.entity_id) ?? null, source: "shared",
      });
    }
    // dedupe by file id, sort desc
    const seen = new Set<string>();
    const deduped = list.filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)));
    deduped.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    let filtered = deduped;
    if (data.entity_type) filtered = filtered.filter((f) => f.entity_type === data.entity_type);
    if (data.entity_id) filtered = filtered.filter((f) => f.entity_id === data.entity_id);
    if (data.query) {
      const q = data.query.toLowerCase();
      filtered = filtered.filter((f) => f.name.toLowerCase().includes(q));
    }

    return {
      items: filtered.slice(0, data.limit),
      counters: {
        total: deduped.length,
        conversation: deduped.filter((f) => f.entity_type === "conversation").length,
        ticket: deduped.filter((f) => f.entity_type === "ticket").length,
        order: deduped.filter((f) => f.entity_type === "order").length,
        uploaded: deduped.filter((f) => f.source === "uploaded").length,
        shared: deduped.filter((f) => f.source === "shared").length,
      },
    };
  });

export const getFileDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ file_id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data: file } = await sbAny(supabaseAdmin).from("files")
      .select("id, bucket, path, name, uploader_id, workspace_id")
      .eq("id", data.file_id).maybeSingle();
    if (!file) throw new Error("File not found.");
    const row = file as { id: string; bucket: string; path: string; name: string; uploader_id: string | null; workspace_id: string };
    if (row.workspace_id !== c.workspaceId) throw new Error("Not authorized.");

    // Authorize: uploader is the customer, OR file attached to an entity owned by the customer.
    let ok = row.uploader_id === context.userId;
    if (!ok) {
      const { data: atts } = await sbAny(supabaseAdmin).from("attachments")
        .select("entity_type, entity_id").eq("file_id", row.id).eq("workspace_id", c.workspaceId);
      const entries = (atts as Array<{ entity_type: string; entity_id: string }> | null) ?? [];
      for (const a of entries) {
        if (a.entity_type === "conversation" || a.entity_type === "ticket") {
          const { data: conv } = await sbAny(supabaseAdmin).from("conversations").select("id")
            .eq("id", a.entity_id).eq("contact_id", c.contactId).maybeSingle();
          if (conv) { ok = true; break; }
        } else if (a.entity_type === "order" || a.entity_type === "deal") {
          const { data: deal } = await sbAny(supabaseAdmin).from("deals").select("id")
            .eq("id", a.entity_id).eq("contact_id", c.contactId).maybeSingle();
          if (deal) { ok = true; break; }
        }
      }
    }
    if (!ok) throw new Error("Not authorized to download this file.");

    const { data: signed, error } = await supabaseAdmin.storage
      .from(row.bucket).createSignedUrl(row.path, 60 * 5, { download: row.name });
    if (error || !signed) throw new Error(error?.message ?? "Failed to sign URL.");

    // Audit
    await sbAny(supabaseAdmin).from("media_access_log").insert({
      workspace_id: c.workspaceId, accessed_by: context.userId, file_id: row.id, action: "download",
    } as never).then(() => undefined, () => undefined);

    return { url: signed.signedUrl, name: row.name };
  });

export const deleteMyFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ file_id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const { data: file } = await sbAny(supabaseAdmin).from("files")
      .select("id, bucket, path, uploader_id, workspace_id")
      .eq("id", data.file_id).maybeSingle();
    if (!file) throw new Error("File not found.");
    const row = file as { id: string; bucket: string; path: string; uploader_id: string | null; workspace_id: string };
    if (row.workspace_id !== c.workspaceId || row.uploader_id !== context.userId) {
      throw new Error("You can only delete files you uploaded.");
    }
    await supabaseAdmin.storage.from(row.bucket).remove([row.path]);
    await sbAny(supabaseAdmin).from("attachments").delete().eq("file_id", row.id);
    await sbAny(supabaseAdmin).from("files").delete().eq("id", row.id);
    return { ok: true };
  });

/* ---------------- Entities picker for File Center attach ---------------- */

export const listMyFileEntities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = await requireContact(context);
    const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
  const supabaseAdmin = _admin as unknown as UntypedClient;
    const [convs, deals] = await Promise.all([
      sbAny(supabaseAdmin).from("conversations")
        .select("id, subject, status, last_message_at")
        .eq("workspace_id", c.workspaceId).eq("contact_id", c.contactId)
        .is("deleted_at", null).order("last_message_at", { ascending: false, nullsFirst: false }).limit(50),
      sbAny(supabaseAdmin).from("deals")
        .select("id, title, status, created_at")
        .eq("workspace_id", c.workspaceId).eq("contact_id", c.contactId)
        .order("created_at", { ascending: false }).limit(50),
    ]);
    return {
      conversations: (convs.data ?? []) as Array<{ id: string; subject: string | null; status: string | null; last_message_at: string | null }>,
      orders: (deals.data ?? []) as Array<{ id: string; title: string | null; status: string | null; created_at: string }>,
    };
  });
