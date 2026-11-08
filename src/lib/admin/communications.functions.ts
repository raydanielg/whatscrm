/**
 * Server functions for the Communication Tools module inside Super Admin.
 * Handles announcements, maintenance notices, release notes, support tickets
 * (with internal notes), platform-wide in-app / email notification broadcasts,
 * knowledge-base entries (incl. FAQ), and system-message templates.
 *
 * Every mutation and privileged read goes through the caller's authenticated
 * RLS context; we verify platform-staff role before performing writes.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { sbAny } from "@/lib/supabase/untyped";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertStaff(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["superadmin", "support"]);
  if (error) throw new Error("Unable to verify platform role");
  if (!data || data.length === 0) throw new Error("Forbidden: platform staff only");
  return data[0].role as "superadmin" | "support";
}

/* -------------------------------------------------------------------------- */
/* Announcements + Maintenance                                                */
/* -------------------------------------------------------------------------- */

export const listAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { data, error } = await supabase
      .from("platform_announcements")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const AnnouncementInput = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1),
  body: z.string().optional().nullable(),
  severity: z.enum(["info", "success", "warning", "critical"]).default("info"),
  kind: z.enum(["announcement", "maintenance"]).default("announcement"),
  audience: z.string().default("all"),
  cta_label: z.string().optional().nullable(),
  cta_url: z.string().optional().nullable(),
  starts_at: z.string().optional().nullable(),
  expires_at: z.string().optional().nullable(),
  translations: z.record(z.string(), z.any()).default({}),
  publish: z.boolean().default(false),
});

export const upsertAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => AnnouncementInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const payload: Record<string, unknown> = {
      title: data.title,
      body: data.body ?? "",
      severity: data.severity,
      kind: data.kind,
      audience: data.audience,
      cta_label: data.cta_label ?? null,
      cta_url: data.cta_url ?? null,
      starts_at: data.starts_at ?? null,
      expires_at: data.expires_at ?? null,
      translations: data.translations,
      published_at: data.publish ? new Date().toISOString() : null,
      created_by: userId,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { data: row, error } = await (supabase as any)
        .from("platform_announcements")
        .update(payload)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await (supabase as any)
      .from("platform_announcements")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });


export const toggleAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid(), publish: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { error } = await supabase
      .from("platform_announcements")
      .update({ published_at: data.publish ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { error } = await sbAny(supabase).from("platform_announcements").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------------------------------------------------- */
/* Release Notes                                                              */
/* -------------------------------------------------------------------------- */

export const listReleaseNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { data, error } = await supabase
      .from("release_notes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const ReleaseNoteInput = z.object({
  id: z.string().uuid().optional(),
  version: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  category: z.enum(["feature", "improvement", "fix", "security", "breaking"]).default("improvement"),
  translations: z.record(z.string(), z.any()).default({}),
  publish: z.boolean().default(false),
});

export const upsertReleaseNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => ReleaseNoteInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const payload = {
      version: data.version,
      title: data.title,
      body: data.body,
      category: data.category,
      translations: data.translations,
      published_at: data.publish ? new Date().toISOString() : null,
      created_by: userId,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { data: row, error } = await supabase
        .from("release_notes")
        .update(payload)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await sbAny(supabase).from("release_notes").insert(payload).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteReleaseNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { error } = await sbAny(supabase).from("release_notes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------------------------------------------------- */
/* Support Tickets                                                            */
/* -------------------------------------------------------------------------- */

export const listTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        status: z.array(z.string()).optional(),
        priority: z.array(z.string()).optional(),
        search: z.string().optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    let q = supabase
      .from("platform_support_tickets")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (data.status?.length) q = q.in("status", data.status);
    if (data.priority?.length) q = q.in("priority", data.priority);
    if (data.search) q = q.ilike("subject", `%${sanitizeSearchTerm(data.search)}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getTicketDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const [{ data: ticket, error: e1 }, { data: messages, error: e2 }] = await Promise.all([
      sbAny(supabase).from("platform_support_tickets").select("*").eq("id", data.id).single(),
      sbAny(supabase).from("support_ticket_messages").select("*").eq("ticket_id", data.id).order("created_at", { ascending: true }),
    ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);
    return { ticket, messages: messages ?? [] };
  });

export const replyTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        ticket_id: z.string().uuid(),
        body: z.string().min(1),
        is_internal: z.boolean().default(false),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { data: msg, error } = await supabase
      .from("support_ticket_messages")
      .insert({
        ticket_id: data.ticket_id,
        author_id: userId,
        body: data.body,
        is_internal: data.is_internal,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    // update ticket first_response_at if empty and not internal
    if (!data.is_internal) {
      await supabase
        .from("platform_support_tickets")
        .update({ first_response_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", data.ticket_id)
        .is("first_response_at", null);
    }
    return msg;
  });

export const updateTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["open", "pending", "in_progress", "resolved", "closed"]).optional(),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
        category: z.string().optional(),
        assigned_to: z.string().uuid().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.status) {
      patch.status = data.status;
      if (data.status === "resolved" || data.status === "closed") patch.resolved_at = new Date().toISOString();
    }
    if (data.priority) patch.priority = data.priority;
    if (data.category) patch.category = data.category;
    if (data.assigned_to !== undefined) patch.assigned_to = data.assigned_to;
    const { error } = await (supabase as any).from("platform_support_tickets").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------------------------------------------------- */
/* Notifications broadcast                                                    */
/* -------------------------------------------------------------------------- */

export const broadcastNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        title: z.string().min(1),
        body: z.string().optional(),
        category: z.string().default("system"),
        channel: z.enum(["in_app", "email"]).default("in_app"),
        action_url: z.string().optional().nullable(),
        audience: z.enum(["all", "owners", "admins"]).default("all"),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { assertPlatformStaff } = await import("@/lib/admin/platform-guard.server");
    await assertPlatformStaff(supabase, userId);
    // Recipient lookups span every tenant and the inserts target other users'
    // notifications (RLS only allows user_id = auth.uid()), so after the staff
    // check both run on the guarded service-role client.
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const admin = sbAny(supabaseAdmin);

    // Resolve target user ids via profiles/organization_members.
    let userIds: string[] = [];
    if (data.audience === "all") {
      const { data: rows, error: lookupErr } = await admin.from("profiles").select("id").limit(10000);
      if (lookupErr) throw new Error(`Recipient lookup failed: ${lookupErr.message}`);
      userIds = (rows ?? []).map((r: { id: string }) => r.id);
    } else {
      const role = data.audience === "owners" ? "owner" : "admin";
      const { data: rows, error: lookupErr } = await admin
        .from("organization_members")
        .select("user_id")
        .eq("role", role);
      if (lookupErr) throw new Error(`Recipient lookup failed: ${lookupErr.message}`);
      userIds = Array.from(new Set((rows ?? []).map((r: { user_id: string }) => r.user_id)));
    }
    if (userIds.length === 0) return { sent: 0 };

    const rows = userIds.map((uid) => ({
      user_id: uid,
      channel: data.channel,
      status: "unread" as const,
      title: data.title,
      body: data.body ?? null,
      action_url: data.action_url ?? null,
      category: data.category,
      data: { source: "platform_broadcast", sent_by: userId },
    }));
    // chunk inserts to keep payloads reasonable
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await admin.from("notifications").insert(chunk);
      if (error) {
        throw new Error(`Broadcast insert failed after ${i} of ${rows.length}: ${error.message}`);
      }
    }

    return { sent: rows.length };
  });

/* -------------------------------------------------------------------------- */
/* Knowledge Base / FAQ                                                       */
/* -------------------------------------------------------------------------- */

export const listKbArticles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ workspace_id: z.string().uuid().optional(), only_faq: z.boolean().default(false) }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    let q = supabase
      .from("kb_articles")
      .select(
        "id,workspace_id,category_id,slug,title,summary,status,tags,is_faq,faq_question,language,translations,view_count,helpful_count,unhelpful_count,published_at,updated_at,created_at",
      )
      .order("updated_at", { ascending: false })
      .limit(500);

    if (data.workspace_id) q = q.eq("workspace_id", data.workspace_id);
    if (data.only_faq) q = q.eq("is_faq", true);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/* -------------------------------------------------------------------------- */
/* System message templates                                                   */
/* -------------------------------------------------------------------------- */

export const listSystemTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { data, error } = await sbAny(supabase).from("system_message_templates").select("*").order("code");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const SystemTemplateInput = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1),
  channel: z.enum(["in_app", "email", "whatsapp"]).default("in_app"),
  subject: z.string().optional().nullable(),
  body: z.string().min(1),
  translations: z.record(z.string(), z.any()).default({}),
  variables: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
});

export const upsertSystemTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => SystemTemplateInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const payload = {
      code: data.code,
      channel: data.channel,
      subject: data.subject ?? null,
      body: data.body,
      translations: data.translations,
      variables: data.variables,
      enabled: data.enabled,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { data: row, error } = await supabase
        .from("system_message_templates")
        .update(payload)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await sbAny(supabase).from("system_message_templates").insert(payload).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteSystemTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { error } = await sbAny(supabase).from("system_message_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
