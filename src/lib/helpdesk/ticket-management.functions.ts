/**
 * Ticket Management — CRUD, merge, split, parent/child, bulk, advanced filters.
 * All calls scoped to caller's workspace via requireSupabaseAuth + RLS.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { sbAny } from "@/lib/supabase/untyped";

async function getWorkspaceId(userId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data } = await supabaseAdmin
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("No workspace found");
  return (data as { workspace_id: string }).workspace_id;
}

async function logActivity(
  supabase: any,
  workspaceId: string,
  ticketId: string,
  actorId: string,
  action: string,
  fromValue: unknown = null,
  toValue: unknown = null,
  meta: Record<string, unknown> = {},
) {
  await sbAny(supabase).from("ticket_activity").insert({
    workspace_id: workspaceId,
    ticket_id: ticketId,
    actor_id: actorId,
    actor_type: "agent",
    action,
    from_value: fromValue as never,
    to_value: toValue as never,
    meta: meta as never,
  });
}

/* ============================ CREATE ============================ */

export const createTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        subject: z.string().trim().min(1).max(300),
        description: z.string().max(20000).optional(),
        priority: z.string().default("normal"),
        status: z.string().default("open"),
        channel: z.string().default("web"),
        contact_id: z.string().uuid().optional(),
        category_id: z.string().uuid().optional(),
        subcategory_id: z.string().uuid().optional(),
        department_id: z.string().uuid().optional(),
        assigned_to: z.string().uuid().optional(),
        assigned_team_id: z.string().uuid().optional(),
        ticket_type: z.string().default("question"),
        tags: z.array(z.string()).max(30).default([]),
        custom_fields: z.record(z.any()).default({}),
        parent_ticket_id: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const insertPayload = {
      workspace_id: workspaceId,
      subject: data.subject,
      description: data.description ?? null,
      priority: data.priority as never,
      status: data.status as never,
      channel: data.channel as never,
      contact_id: data.contact_id ?? null,
      ticket_category_id: data.category_id ?? null,
      subcategory_id: data.subcategory_id ?? null,
      department_id: data.department_id ?? null,
      assigned_to: data.assigned_to ?? null,
      assigned_team_id: data.assigned_team_id ?? null,
      ticket_type: data.ticket_type,
      tags: data.tags as never,
      custom_fields: data.custom_fields as never,
      parent_ticket_id: data.parent_ticket_id ?? null,
      last_message_at: new Date().toISOString(),
      last_message_preview: data.description?.slice(0, 200) ?? data.subject,
    };
    const { data: row, error } = await context.supabase
      .from("conversations")
      .insert(insertPayload as never)
      .select("id, ticket_number")
      .single();
    if (error) throw new Error(error.message);
    await logActivity(context.supabase, workspaceId, (row as { id: string }).id, context.userId, "created", null, {
      subject: data.subject,
      priority: data.priority,
    });
    return row;
  });

/* ============================ UPDATE ============================ */

export const updateTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z.object({
          subject: z.string().min(1).max(300).optional(),
          description: z.string().max(20000).optional(),
          priority: z.string().optional(),
          status: z.string().optional(),
          ticket_category_id: z.string().uuid().nullable().optional(),
          subcategory_id: z.string().uuid().nullable().optional(),
          department_id: z.string().uuid().nullable().optional(),
          assigned_to: z.string().uuid().nullable().optional(),
          assigned_team_id: z.string().uuid().nullable().optional(),
          ticket_type: z.string().optional(),
          tags: z.array(z.string()).max(30).optional(),
          custom_fields: z.record(z.any()).optional(),
          parent_ticket_id: z.string().uuid().nullable().optional(),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: before } = await context.supabase
      .from("conversations")
      .select("id, subject, status, priority, assigned_to, ticket_category_id, tags")
      .eq("id", data.id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!before) throw new Error("Ticket not found");
    const { error } = await context.supabase
      .from("conversations")
      .update(data.patch as never)
      .eq("id", data.id)
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    await logActivity(
      context.supabase,
      workspaceId,
      data.id,
      context.userId,
      "updated",
      before as never,
      data.patch,
    );
    return { ok: true };
  });

/* ============================ DELETE / RESTORE ============================ */

export const deleteTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ id: z.string().uuid(), hard: z.boolean().default(false) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    if (data.hard) {
      const { error } = await context.supabase
        .from("conversations")
        .delete()
        .eq("id", data.id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("conversations")
        .update({ deleted_at: new Date().toISOString() } as never)
        .eq("id", data.id)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message);
      await logActivity(context.supabase, workspaceId, data.id, context.userId, "deleted");
    }
    return { ok: true };
  });

export const restoreTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { error } = await context.supabase
      .from("conversations")
      .update({ deleted_at: null } as never)
      .eq("id", data.id)
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    await logActivity(context.supabase, workspaceId, data.id, context.userId, "restored");
    return { ok: true };
  });

/* ============================ MERGE ============================ */

export const mergeTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        primary_id: z.string().uuid(),
        merge_ids: z.array(z.string().uuid()).min(1).max(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    // Move all messages from merged tickets into the primary
    for (const mid of data.merge_ids) {
      if (mid === data.primary_id) continue;
      await context.supabase
        .from("messages")
        .update({ conversation_id: data.primary_id } as never)
        .eq("conversation_id", mid);
      await context.supabase
        .from("conversations")
        .update({
          merged_into_id: data.primary_id,
          status: "closed" as never,
          deleted_at: new Date().toISOString(),
        } as never)
        .eq("id", mid)
        .eq("workspace_id", workspaceId);
      await logActivity(context.supabase, workspaceId, mid, context.userId, "merged", null, {
        into: data.primary_id,
      });
      await logActivity(context.supabase, workspaceId, data.primary_id, context.userId, "linked", null, {
        merged_from: mid,
      });
    }
    return { ok: true, primary_id: data.primary_id };
  });

/* ============================ SPLIT ============================ */

export const splitTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        source_id: z.string().uuid(),
        message_ids: z.array(z.string().uuid()).min(1).max(200),
        new_subject: z.string().trim().min(1).max(300),
        new_priority: z.string().default("normal"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: source } = await context.supabase
      .from("conversations")
      .select("contact_id, channel, department_id, ticket_category_id")
      .eq("id", data.source_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!source) throw new Error("Source ticket not found");
    const s = source as {
      contact_id: string | null;
      channel: string | null;
      department_id: string | null;
      ticket_category_id: string | null;
    };
    const { data: created, error } = await context.supabase
      .from("conversations")
      .insert({
        workspace_id: workspaceId,
        subject: data.new_subject,
        priority: data.new_priority as never,
        status: "open" as never,
        channel: (s.channel ?? "web") as never,
        contact_id: s.contact_id,
        department_id: s.department_id,
        ticket_category_id: s.ticket_category_id,
        parent_ticket_id: data.source_id,
        last_message_at: new Date().toISOString(),
      } as never)
      .select("id, ticket_number")
      .single();
    if (error || !created) throw new Error(error?.message ?? "Split failed");
    const newId = (created as { id: string }).id;
    await context.supabase
      .from("messages")
      .update({ conversation_id: newId } as never)
      .in("id", data.message_ids);
    await logActivity(context.supabase, workspaceId, data.source_id, context.userId, "split", null, {
      into: newId,
      count: data.message_ids.length,
    });
    await logActivity(context.supabase, workspaceId, newId, context.userId, "created", null, {
      via: "split",
      parent: data.source_id,
    });
    return created;
  });

/* ============================ PARENT / CHILD ============================ */

export const setParentTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ child_id: z.string().uuid(), parent_id: z.string().uuid().nullable() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    if (data.parent_id === data.child_id) throw new Error("Ticket cannot parent itself");
    const { error } = await context.supabase
      .from("conversations")
      .update({ parent_ticket_id: data.parent_id } as never)
      .eq("id", data.child_id)
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    await logActivity(context.supabase, workspaceId, data.child_id, context.userId, "linked", null, {
      parent: data.parent_id,
    });
    return { ok: true };
  });

export const listChildren = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ parent_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: rows } = await context.supabase
      .from("conversations")
      .select("id, ticket_number, subject, status, priority, assigned_to")
      .eq("workspace_id", workspaceId)
      .eq("parent_ticket_id", data.parent_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    return rows ?? [];
  });

/* ============================ BULK ============================ */

export const bulkUpdateTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(500),
        patch: z.object({
          status: z.string().optional(),
          priority: z.string().optional(),
          assigned_to: z.string().uuid().nullable().optional(),
          assigned_team_id: z.string().uuid().nullable().optional(),
          ticket_category_id: z.string().uuid().nullable().optional(),
          department_id: z.string().uuid().nullable().optional(),
          add_tags: z.array(z.string()).optional(),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const patch: Record<string, unknown> = { ...data.patch };
    delete patch.add_tags;
    if (Object.keys(patch).length) {
      const { error } = await context.supabase
        .from("conversations")
        .update(patch as never)
        .in("id", data.ids)
        .eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message);
    }
    if (data.patch.add_tags?.length) {
      // Append tags per-row (RPC-less: read, merge, write)
      const { data: rows } = await context.supabase
        .from("conversations")
        .select("id, tags")
        .in("id", data.ids)
        .eq("workspace_id", workspaceId);
      for (const r of (rows ?? []) as { id: string; tags: string[] | null }[]) {
        const merged = Array.from(new Set([...(r.tags ?? []), ...data.patch.add_tags!]));
        await context.supabase
          .from("conversations")
          .update({ tags: merged as never } as never)
          .eq("id", r.id);
      }
    }
    for (const id of data.ids) {
      await logActivity(context.supabase, workspaceId, id, context.userId, "updated", null, {
        bulk: true,
        patch: data.patch,
      });
    }
    return { ok: true, count: data.ids.length };
  });

export const bulkDeleteTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { error } = await context.supabase
      .from("conversations")
      .update({ deleted_at: new Date().toISOString() } as never)
      .in("id", data.ids)
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    for (const id of data.ids) {
      await logActivity(context.supabase, workspaceId, id, context.userId, "deleted", null, { bulk: true });
    }
    return { ok: true, count: data.ids.length };
  });

/* ============================ ADVANCED SEARCH ============================ */

const sel = (s: string): string => s;

export const searchTickets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        q: z.string().optional(),
        status: z.array(z.string()).optional(),
        priority: z.array(z.string()).optional(),
        channel: z.array(z.string()).optional(),
        category_ids: z.array(z.string().uuid()).optional(),
        department_ids: z.array(z.string().uuid()).optional(),
        assignee_ids: z.array(z.string().uuid()).optional(),
        team_ids: z.array(z.string().uuid()).optional(),
        contact_id: z.string().uuid().optional(),
        tags_any: z.array(z.string()).optional(),
        created_from: z.string().optional(),
        created_to: z.string().optional(),
        include_deleted: z.boolean().default(false),
        parent_only: z.boolean().default(false),
        page: z.number().min(1).default(1),
        page_size: z.number().min(1).max(200).default(50),
        sort: z
          .enum(["last_message_at", "created_at", "priority", "ticket_number"])
          .default("last_message_at"),
        sort_dir: z.enum(["asc", "desc"]).default("desc"),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const from = (data.page - 1) * data.page_size;
    const to = from + data.page_size - 1;
    let q = context.supabase
      .from("conversations")
      .select(
        sel(
          "id, ticket_number, subject, description, status, priority, channel, assigned_to, assigned_team_id, contact_id, ticket_category_id, subcategory_id, department_id, tags, custom_fields, parent_ticket_id, merged_into_id, escalation_level, first_response_at, resolved_at, last_message_at, last_message_preview, created_at, updated_at",
        ),
        { count: "exact" },
      )
      .eq("workspace_id", workspaceId)
      .order(data.sort, { ascending: data.sort_dir === "asc", nullsFirst: false })
      .range(from, to);
    if (!data.include_deleted) q = q.is("deleted_at", null);
    if (data.parent_only) q = q.is("parent_ticket_id", null);
    if (data.q) q = q.ilike("subject", `%${sanitizeSearchTerm(data.q)}%`);
    if (data.status?.length) q = q.in("status", data.status as never);
    if (data.priority?.length) q = q.in("priority", data.priority as never);
    if (data.channel?.length) q = q.in("channel", data.channel as never);
    if (data.category_ids?.length) q = q.in("ticket_category_id", data.category_ids);
    if (data.department_ids?.length) q = q.in("department_id", data.department_ids);
    if (data.assignee_ids?.length) q = q.in("assigned_to", data.assignee_ids);
    if (data.team_ids?.length) q = q.in("assigned_team_id", data.team_ids);
    if (data.contact_id) q = q.eq("contact_id", data.contact_id);
    if (data.tags_any?.length) q = q.overlaps("tags", data.tags_any as never);
    if (data.created_from) q = q.gte("created_at", data.created_from);
    if (data.created_to) q = q.lte("created_at", data.created_to);
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);
    return {
      rows: (rows ?? []) as unknown as Array<Record<string, string | number | boolean | null | string[]>>,
      total: count ?? 0,
      page: data.page,
      page_size: data.page_size,
    };
  });

/* ============================ TIMELINE ============================ */

export const getTicketTimeline = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ ticket_id: z.string().uuid(), limit: z.number().min(1).max(500).default(100) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: rows } = await context.supabase
      .from("ticket_activity")
      .select("id, actor_id, actor_type, action, from_value, to_value, meta, created_at")
      .eq("workspace_id", workspaceId)
      .eq("ticket_id", data.ticket_id)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    return rows ?? [];
  });
