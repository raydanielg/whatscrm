/**
 * Helpdesk collaboration — server functions.
 *
 * All operations are workspace-scoped and never surface to the customer
 * portal. Internal notes reuse `conversation_notes` and are excluded from
 * the customer's message stream by the existing portal queries.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sbAny } from "@/lib/supabase/untyped";
import { GEMINI_CHAT_URL } from "@/lib/ai/gemini.server";

async function getWorkspaceId(userId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data } = await sbAny(supabaseAdmin).from("workspace_members")
    .select("workspace_id").eq("user_id", userId).limit(1).maybeSingle();
  if (!data) throw new Error("No workspace found");
  return (data as { workspace_id: string }).workspace_id;
}

async function logActivity(
  workspaceId: string, ticketId: string, actorId: string,
  action: string, meta: Record<string, unknown> = {},
) {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  await (sbAny(supabaseAdmin).from("ticket_activity") as unknown as { insert: (r: unknown) => Promise<unknown> }).insert({
    workspace_id: workspaceId, ticket_id: ticketId, actor_id: actorId,
    actor_type: "agent", action, meta,
  });
}

/* ============================ Notes ============================ */

const MENTION_RE = /@\[([^\]]+)\]\(([0-9a-f-]{36})\)/g;

function parseMentions(body: string): string[] {
  const ids = new Set<string>();
  for (const m of body.matchAll(MENTION_RE)) ids.add(m[2]);
  return Array.from(ids);
}

export const listNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ ticketId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: notes } = await sbAny(context.supabase)
      .from("conversation_notes")
      .select("id, body, author_id, mentions, is_pinned, pinned_at, edited_at, created_at, updated_at")
      .eq("workspace_id", workspaceId).eq("conversation_id", data.ticketId)
      .is("deleted_at", null)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false });
    return notes ?? [];
  });

export const createNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({
    ticketId: z.string().uuid(),
    body: z.string().min(1),
    isPinned: z.boolean().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const mentions = parseMentions(data.body);
    const { data: note, error } = await sbAny(context.supabase)
      .from("conversation_notes")
      .insert({
        workspace_id: workspaceId,
        conversation_id: data.ticketId,
        author_id: context.userId,
        body: data.body,
        mentions,
        is_pinned: data.isPinned ?? false,
        pinned_at: data.isPinned ? new Date().toISOString() : null,
      })
      .select("id").single();
    if (error) throw new Error(error.message);
    // Fan out @mentions -> ticket_mentions + notifications
    if (mentions.length > 0) {
      const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
      await sbAny(supabaseAdmin).from("ticket_mentions").insert(
        mentions.map((uid) => ({
          workspace_id: workspaceId,
          ticket_id: data.ticketId,
          note_id: (note as { id: string }).id,
          mentioned_user_id: uid,
          mentioned_by: context.userId,
          content: data.body.slice(0, 500),
        })),
      );
      const admin = sbAny(supabaseAdmin);
      const [workspace, recipients] = await Promise.all([
        admin.from("workspaces").select("organization_id").eq("id", workspaceId).single(),
        admin.from("workspace_members").select("user_id").eq("workspace_id", workspaceId)
          .eq("status", "active").in("user_id", mentions),
      ]);
      const organizationId: string | null = workspace.data?.organization_id ?? null;
      if (organizationId && recipients.data?.length) {
        const { error: notificationError } = await admin.from("notifications").insert(
          recipients.data.map((member: { user_id: string }) => ({
            user_id: member.user_id,
            organization_id: organizationId,
            channel: "in_app",
            status: "unread",
            category: "ticket_mention",
            title: "You were mentioned on a ticket",
            body: data.body.slice(0, 240),
            action_url: `/helpdesk/${data.ticketId}`,
            data: { ticket_id: data.ticketId, note_id: (note as { id: string }).id, workspace_id: workspaceId },
          })),
        );
        if (notificationError) console.warn("[helpdesk] mention notification failed:", notificationError);
      }
    }
    await logActivity(workspaceId, data.ticketId, context.userId, "note_added",
      { note_id: (note as { id: string }).id, pinned: data.isPinned ?? false });
    return { id: (note as { id: string }).id };
  });

export const updateNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({
    id: z.string().uuid(),
    body: z.string().min(1).optional(),
    isPinned: z.boolean().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = { edited_at: new Date().toISOString() };
    if (data.body !== undefined) { patch.body = data.body; patch.mentions = parseMentions(data.body); }
    if (data.isPinned !== undefined) {
      patch.is_pinned = data.isPinned;
      patch.pinned_at = data.isPinned ? new Date().toISOString() : null;
    }
    const { error } = await (sbAny(context.supabase).from("conversation_notes") as unknown as { update: (p: unknown) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> } })
      .update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase).from("conversation_notes")
      .update({ deleted_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============================ Attachments ============================ */

export const listNoteAttachments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ ticketId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: rows } = await sbAny(context.supabase).from("attachments")
      .select("id, file_id, entity_type, entity_id, attached_by, created_at, files(name, size_bytes, mime_type, bucket, path)")
      .eq("workspace_id", workspaceId)
      .eq("entity_type", "ticket_note")
      .eq("entity_id", data.ticketId)
      .order("created_at", { ascending: false });
    return rows ?? [];
  });

export const attachFileToTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({
    ticketId: z.string().uuid(),
    fileId: z.string().uuid(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { error } = await sbAny(context.supabase).from("attachments").insert({
      workspace_id: workspaceId,
      file_id: data.fileId,
      entity_type: "ticket_note",
      entity_id: data.ticketId,
      attached_by: context.userId,
    });
    if (error) throw new Error(error.message);
    await logActivity(workspaceId, data.ticketId, context.userId, "attachment_added", { file_id: data.fileId });
    return { ok: true };
  });

/* ============================ Tasks & Subtasks ============================ */

export const listTicketTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ ticketId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: tasks } = await sbAny(context.supabase).from("tasks")
      .select("id, parent_task_id, title, description, status, priority, due_at, assigned_to, created_by, completed_at, created_at")
      .eq("workspace_id", workspaceId)
      .eq("entity_type", "ticket").eq("entity_id", data.ticketId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    return tasks ?? [];
  });

export const createTicketTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({
    ticketId: z.string().uuid(),
    title: z.string().min(1),
    description: z.string().optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
    dueAt: z.string().datetime().optional(),
    assignedTo: z.string().uuid().optional(),
    parentTaskId: z.string().uuid().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: row, error } = await sbAny(context.supabase).from("tasks").insert({
      workspace_id: workspaceId,
      title: data.title,
      description: data.description,
      status: "open",
      priority: data.priority,
      due_at: data.dueAt,
      assigned_to: data.assignedTo,
      parent_task_id: data.parentTaskId,
      entity_type: "ticket",
      entity_id: data.ticketId,
      owner_id: context.userId,
      created_by: context.userId,
    }).select("id").single();
    if (error) throw new Error(error.message);
    await logActivity(workspaceId, data.ticketId, context.userId, "task_created",
      { task_id: (row as { id: string }).id, subtask: !!data.parentTaskId });
    return { id: (row as { id: string }).id };
  });

export const toggleTicketTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ id: z.string().uuid(), done: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const patch = data.done
      ? { status: "completed", completed_at: new Date().toISOString() }
      : { status: "open", completed_at: null };
    const { error } = await sbAny(context.supabase).from("tasks").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============================ Linked Tickets ============================ */

export const listTicketLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ ticketId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: rows } = await sbAny(context.supabase)
      .from("ticket_links")
      .select("id, ticket_id, linked_ticket_id, link_type, created_at, linked:conversations!ticket_links_linked_ticket_id_fkey(id, subject, status, priority, ticket_number)")
      .eq("workspace_id", workspaceId)
      .or(`ticket_id.eq.${data.ticketId},linked_ticket_id.eq.${data.ticketId}`)
      .order("created_at", { ascending: false });
    return rows ?? [];
  });

export const linkTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({
    ticketId: z.string().uuid(),
    linkedTicketId: z.string().uuid(),
    linkType: z.enum(["related", "duplicate", "blocks", "blocked_by", "causes", "caused_by"]).default("related"),
  }).parse(i))
  .handler(async ({ data, context }) => {
    if (data.ticketId === data.linkedTicketId) throw new Error("Cannot link a ticket to itself");
    const workspaceId = await getWorkspaceId(context.userId);
    const { error } = await sbAny(context.supabase).from("ticket_links").insert({
      workspace_id: workspaceId,
      ticket_id: data.ticketId,
      linked_ticket_id: data.linkedTicketId,
      link_type: data.linkType,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    await logActivity(workspaceId, data.ticketId, context.userId, "ticket_linked",
      { linked_ticket_id: data.linkedTicketId, link_type: data.linkType });
    return { ok: true };
  });

export const unlinkTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase).from("ticket_links").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============================ CRM linking ============================ */

export const listCrmLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ ticketId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: rows } = await sbAny(context.supabase).from("ticket_crm_links")
      .select("id, entity_type, entity_id, created_at")
      .eq("workspace_id", workspaceId).eq("ticket_id", data.ticketId)
      .order("created_at", { ascending: false });
    if (!rows || rows.length === 0) return [];
    // Hydrate labels
    const out: Array<{ id: string; entity_type: string; entity_id: string; label: string }> = [];
    for (const r of rows as Array<{ id: string; entity_type: string; entity_id: string }>) {
      let label = r.entity_id.slice(0, 8);
      try {
        if (r.entity_type === "deal") {
          const { data: d } = await sbAny(context.supabase).from("deals").select("title").eq("id", r.entity_id).maybeSingle();
          if (d) label = (d as { title: string }).title;
        } else if (r.entity_type === "company") {
          const { data: d } = await sbAny(context.supabase).from("companies").select("name").eq("id", r.entity_id).maybeSingle();
          if (d) label = (d as { name: string }).name;
        } else if (r.entity_type === "contact") {
          const { data: d } = await sbAny(context.supabase).from("contacts").select("first_name, last_name, email").eq("id", r.entity_id).maybeSingle();
          if (d) { const c = d as { first_name?: string; last_name?: string; email?: string }; label = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || label; }
        } else if (r.entity_type === "invoice") {
          const { data: d } = await sbAny(context.supabase).from("invoices").select("invoice_number").eq("id", r.entity_id).maybeSingle();
          if (d) label = `Invoice ${(d as { invoice_number: string }).invoice_number}`;
        } else if (r.entity_type === "quote") {
          const { data: d } = await sbAny(context.supabase).from("quotes").select("quote_number").eq("id", r.entity_id).maybeSingle();
          if (d) label = `Quote ${(d as { quote_number: string }).quote_number}`;
        }
      } catch { /* ignore */ }
      out.push({ id: r.id, entity_type: r.entity_type, entity_id: r.entity_id, label });
    }
    return out;
  });

export const addCrmLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({
    ticketId: z.string().uuid(),
    entityType: z.enum(["deal", "company", "contact", "order", "invoice", "quote"]),
    entityId: z.string().uuid(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { error } = await sbAny(context.supabase).from("ticket_crm_links").insert({
      workspace_id: workspaceId,
      ticket_id: data.ticketId,
      entity_type: data.entityType,
      entity_id: data.entityId,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    await logActivity(workspaceId, data.ticketId, context.userId, "crm_linked",
      { entity_type: data.entityType, entity_id: data.entityId });
    return { ok: true };
  });

export const removeCrmLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase).from("ticket_crm_links").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============================ Watchers / Mentionable agents ============================ */

export const listMentionableAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data } = await sbAny(context.supabase).from("workspace_members")
      .select("user_id, profiles(full_name, email, avatar_url)")
      .eq("workspace_id", workspaceId);
    return (data ?? []) as Array<{ user_id: string; profiles: { full_name?: string; email?: string; avatar_url?: string } | null }>;
  });

/* ============================ Audit Timeline ============================ */

export const listTicketActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ ticketId: z.string().uuid(), limit: z.number().int().min(1).max(200).default(100) }).parse(i))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: rows } = await sbAny(context.supabase).from("ticket_activity")
      .select("id, action, actor_id, actor_type, from_value, to_value, meta, created_at")
      .eq("workspace_id", workspaceId).eq("ticket_id", data.ticketId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    return rows ?? [];
  });

/* ============================ KB & AI Suggestions ============================ */

export const suggestKbArticles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ ticketId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: conv } = await sbAny(context.supabase).from("conversations")
      .select("subject, description, ai_summary, last_message_preview")
      .eq("id", data.ticketId).eq("workspace_id", workspaceId).maybeSingle();
    if (!conv) return [];
    const c = conv as { subject: string | null; description: string | null; ai_summary: string | null; last_message_preview: string | null };
    const q = [c.subject, c.ai_summary, c.description, c.last_message_preview].filter(Boolean).join(" ").slice(0, 200);
    if (!q) return [];
    // Fallback: text search on kb_articles title/body (RAG embeddings may not always be available).
    const { data: articles } = await (sbAny(context.supabase).from("kb_articles" as never) as unknown as {
      select: (s: string) => { eq: (c: string, v: string) => { eq: (c: string, v: string) => { textSearch: (c: string, q: string, o: unknown) => { limit: (n: number) => Promise<{ data: Array<{ id: string; title: string; slug: string; summary: string | null }> | null }> } } } };
    })
      .select("id, title, slug, summary, status")
      .eq("workspace_id", workspaceId)
      .eq("status", "published")
      .textSearch("title", q.split(/\s+/).filter(Boolean).slice(0, 6).join(" | "), { type: "websearch", config: "english" })
      .limit(5);
    const results = articles ?? [];
    // Cache
    if (results.length > 0) {
      const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
      await (sbAny(supabaseAdmin).from("ticket_ai_suggestions") as unknown as { insert: (r: unknown) => Promise<unknown> }).insert(
        results.map((a) => ({
          workspace_id: workspaceId, ticket_id: data.ticketId, kind: "kb_article",
          payload: { article_id: a.id, title: a.title, slug: a.slug, summary: a.summary },
        })),
      );
    }
    return results;
  });

export const suggestNextActions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ ticketId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: conv } = await sbAny(context.supabase).from("conversations")
      .select("subject, priority, status, ai_summary").eq("id", data.ticketId).eq("workspace_id", workspaceId).maybeSingle();
    if (!conv) throw new Error("Ticket not found");
    const key = process.env.GEMINI_API_KEY;
    if (!key) return { actions: [] as Array<{ label: string; kind: string }> };
    const c = conv as { subject: string | null; priority: string; status: string; ai_summary: string | null };
    const prompt = `Given this helpdesk ticket, propose 3 concise next best actions for the agent as a JSON array of {label, kind} where kind is one of: reply, escalate, create_task, resolve, request_info, link_kb, assign.\nSubject: ${c.subject}\nPriority: ${c.priority}\nStatus: ${c.status}\nSummary: ${c.ai_summary ?? "n/a"}\nReturn ONLY JSON.`;
    try {
      const res = await fetch(GEMINI_CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json"},
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [
            { role: "system", content: "Return only valid JSON. No prose." },
            { role: "user", content: prompt },
          ],
        }),
      });
      const j = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const raw = j.choices?.[0]?.message?.content ?? "[]";
      const cleaned = raw.replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
      const actions = JSON.parse(cleaned) as Array<{ label: string; kind: string }>;
      return { actions };
    } catch {
      return { actions: [] as Array<{ label: string; kind: string }> };
    }
  });
