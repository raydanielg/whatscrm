/**
 * Support Organization — queues, routing (round-robin / least-busy / skill / VIP / language),
 * manual assignment, transfers, followers/watchers, mentions, team inbox.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sbAny } from "@/lib/supabase/untyped";

async function getWorkspaceId(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("No workspace found");
  return data.workspace_id as string;
}

/* ------------------------- QUEUES ------------------------- */
export const listQueues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const wsId = await getWorkspaceId(sbAny(context.supabase), context.userId);
    const { data, error } = await sbAny(context.supabase)
      .from("support_queues")
      .select("*")
      .eq("workspace_id", wsId)
      .order("priority", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const upsertQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1),
        description: z.string().optional().nullable(),
        color: z.string().optional(),
        icon: z.string().optional().nullable(),
        department_id: z.string().uuid().nullable().optional(),
        inbox_id: z.string().uuid().nullable().optional(),
        strategy: z.enum(["round_robin", "least_busy", "skill", "vip", "language", "manual"]),
        required_skills: z.array(z.string()).optional(),
        required_languages: z.array(z.string()).optional(),
        vip_only: z.boolean().optional(),
        priority: z.number().int().optional(),
        max_open_per_agent: z.number().int().optional(),
        is_active: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const wsId = await getWorkspaceId(sbAny(context.supabase), context.userId);
    const payload = { ...data, workspace_id: wsId, created_by: context.userId };
    const { data: row, error } = await sbAny(context.supabase)
      .from("support_queues")
      .upsert(payload)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase).from("support_queues").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ------------------------- AGENT SKILLS ------------------------- */
export const listAgentSkills = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const wsId = await getWorkspaceId(sbAny(context.supabase), context.userId);
    const { data } = await sbAny(context.supabase)
      .from("agent_skills")
      .select("*, profile:profiles!agent_skills_user_id_fkey(id, display_name, avatar_url, email)")
      .eq("workspace_id", wsId);
    return data ?? [];
  });

export const upsertAgentSkill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        skills: z.array(z.string()).optional(),
        languages: z.array(z.string()).optional(),
        handles_vip: z.boolean().optional(),
        max_concurrent: z.number().int().optional(),
        is_available: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const wsId = await getWorkspaceId(sbAny(context.supabase), context.userId);
    const { data: row, error } = await sbAny(context.supabase)
      .from("agent_skills")
      .upsert({ ...data, workspace_id: wsId }, { onConflict: "workspace_id,user_id" })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

/* ------------------------- ROUTING ENGINE ------------------------- */
async function pickAgent(
  supabase: any,
  wsId: string,
  queue: any,
  ticket: { is_vip?: boolean; language?: string; required_skill?: string },
): Promise<string | null> {
  const { data: agents } = await supabase
    .from("agent_skills")
    .select("*")
    .eq("workspace_id", wsId)
    .eq("is_available", true);
  if (!agents || agents.length === 0) return null;
  let pool = agents as any[];

  if (queue.vip_only || ticket.is_vip) pool = pool.filter((a) => a.handles_vip);
  if ((queue.required_skills ?? []).length > 0)
    pool = pool.filter((a) => queue.required_skills.every((s: string) => (a.skills ?? []).includes(s)));
  if (ticket.required_skill)
    pool = pool.filter((a) => (a.skills ?? []).includes(ticket.required_skill));
  if ((queue.required_languages ?? []).length > 0)
    pool = pool.filter((a) => queue.required_languages.some((l: string) => (a.languages ?? []).includes(l)));
  if (ticket.language)
    pool = pool.filter((a) => (a.languages ?? []).includes(ticket.language));
  pool = pool.filter((a) => (a.current_load ?? 0) < (a.max_concurrent ?? 10));
  if (pool.length === 0) return null;

  if (queue.strategy === "least_busy") {
    pool.sort((a, b) => (a.current_load ?? 0) - (b.current_load ?? 0));
    return pool[0].user_id;
  }
  if (queue.strategy === "manual") return null;
  // round_robin default
  const cursor = (queue.round_robin_cursor ?? 0) % pool.length;
  const picked = pool[cursor];
  await supabase
    .from("support_queues")
    .update({ round_robin_cursor: (queue.round_robin_cursor ?? 0) + 1 })
    .eq("id", queue.id);
  return picked.user_id;
}

export const enqueueTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        queue_id: z.string().uuid(),
        ticket_id: z.string().uuid(),
        is_vip: z.boolean().optional(),
        language: z.string().optional(),
        required_skill: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const wsId = await getWorkspaceId(sbAny(context.supabase), context.userId);
    const { data: queue } = await sbAny(context.supabase)
      .from("support_queues")
      .select("*")
      .eq("id", data.queue_id)
      .single();
    if (!queue) throw new Error("Queue not found");

    const agent = await pickAgent(sbAny(context.supabase), wsId, queue, data);
    const status = agent ? "assigned" : "waiting";

    const { data: row, error } = await sbAny(context.supabase)
      .from("queue_tickets")
      .upsert(
        {
          workspace_id: wsId,
          queue_id: data.queue_id,
          ticket_id: data.ticket_id,
          status,
          assigned_to: agent,
          assigned_at: agent ? new Date().toISOString() : null,
        },
        { onConflict: "queue_id,ticket_id" },
      )
      .select()
      .single();
    if (error) throw error;

    if (agent) {
      await sbAny(context.supabase)
        .from("conversations")
        .update({ assigned_to: agent })
        .eq("id", data.ticket_id);
    }
    return row;
  });

export const listQueueTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ queue_id: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const wsId = await getWorkspaceId(sbAny(context.supabase), context.userId);
    let q = sbAny(context.supabase)
      .from("queue_tickets")
      .select("*, ticket:conversations(id, ticket_number, subject, priority, status, assigned_to)")
      .eq("workspace_id", wsId)
      .order("entered_at", { ascending: true });
    if (data.queue_id) q = q.eq("queue_id", data.queue_id);
    const { data: rows } = await q;
    return rows ?? [];
  });

/* ------------------------- MANUAL ASSIGN & TRANSFER ------------------------- */
export const assignTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ ticket_id: z.string().uuid(), user_id: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase)
      .from("conversations")
      .update({ assigned_to: data.user_id })
      .eq("id", data.ticket_id);
    if (error) throw error;
    if (data.user_id) {
      await sbAny(context.supabase)
        .from("queue_tickets")
        .update({ assigned_to: data.user_id, status: "assigned", assigned_at: new Date().toISOString() })
        .eq("ticket_id", data.ticket_id);
    }
    return { ok: true };
  });

export const transferTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        ticket_id: z.string().uuid(),
        to_user_id: z.string().uuid().nullable().optional(),
        to_department_id: z.string().uuid().nullable().optional(),
        transfer_type: z.enum(["agent", "department", "queue"]).default("agent"),
        reason: z.string().optional(),
        note: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const wsId = await getWorkspaceId(sbAny(context.supabase), context.userId);
    const { data: current } = await sbAny(context.supabase)
      .from("conversations")
      .select("assigned_to")
      .eq("id", data.ticket_id)
      .single();
    const { error } = await sbAny(context.supabase).from("conversation_transfers").insert({
      workspace_id: wsId,
      conversation_id: data.ticket_id,
      from_user_id: current?.assigned_to ?? null,
      to_user_id: data.to_user_id ?? null,
      to_department_id: data.to_department_id ?? null,
      transfer_type: data.transfer_type,
      reason: data.reason,
      note: data.note,
      performed_by: context.userId,
    });
    if (error) throw error;
    if (data.to_user_id) {
      await sbAny(context.supabase)
        .from("conversations")
        .update({ assigned_to: data.to_user_id })
        .eq("id", data.ticket_id);
    }
    return { ok: true };
  });

/* ------------------------- FOLLOWERS / WATCHERS ------------------------- */
export const listWatchers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ ticket_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await sbAny(context.supabase)
      .from("ticket_watchers")
      .select("*, profile:profiles!ticket_watchers_user_id_fkey(id, display_name, avatar_url, email)")
      .eq("ticket_id", data.ticket_id);
    return rows ?? [];
  });

export const addWatcher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ ticket_id: z.string().uuid(), user_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const wsId = await getWorkspaceId(sbAny(context.supabase), context.userId);
    const { error } = await sbAny(context.supabase).from("ticket_watchers").insert({
      workspace_id: wsId,
      ticket_id: data.ticket_id,
      user_id: data.user_id,
      added_by: context.userId,
    });
    if (error && !String(error.message).includes("duplicate")) throw error;
    return { ok: true };
  });

export const removeWatcher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ ticket_id: z.string().uuid(), user_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase)
      .from("ticket_watchers")
      .delete()
      .eq("ticket_id", data.ticket_id)
      .eq("user_id", data.user_id);
    if (error) throw error;
    return { ok: true };
  });

/* ------------------------- MENTIONS ------------------------- */
export const createMention = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        ticket_id: z.string().uuid(),
        mentioned_user_id: z.string().uuid(),
        note_id: z.string().uuid().optional(),
        content: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const wsId = await getWorkspaceId(sbAny(context.supabase), context.userId);
    const { data: row, error } = await sbAny(context.supabase)
      .from("ticket_mentions")
      .insert({
        workspace_id: wsId,
        ticket_id: data.ticket_id,
        mentioned_user_id: data.mentioned_user_id,
        note_id: data.note_id,
        content: data.content,
        mentioned_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    try {
      const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
      const admin = sbAny(supabaseAdmin);
      const [workspace, member] = await Promise.all([
        admin.from("workspaces").select("organization_id").eq("id", wsId).single(),
        admin.from("workspace_members").select("user_id").eq("workspace_id", wsId)
          .eq("user_id", data.mentioned_user_id).eq("status", "active").maybeSingle(),
      ]);
      if (workspace.error || member.error) throw workspace.error ?? member.error;
      if (workspace.data?.organization_id && member.data) {
        const { error: notificationError } = await admin.from("notifications").insert({
          user_id: data.mentioned_user_id,
          organization_id: workspace.data.organization_id,
          channel: "in_app",
          status: "unread",
          category: "ticket_mention",
          title: "You were mentioned on a ticket",
          body: data.content ?? "",
          action_url: `/helpdesk/${data.ticket_id}`,
          data: { ticket_id: data.ticket_id, workspace_id: wsId },
        });
        if (notificationError) throw notificationError;
      }
    } catch (notificationError) {
      console.warn("[helpdesk] mention notification failed:", notificationError);
    }
    return row;
  });

export const listMyMentions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await sbAny(context.supabase)
      .from("ticket_mentions")
      .select("*, ticket:conversations(id, ticket_number, subject)")
      .eq("mentioned_user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    return data ?? [];
  });

export const markMentionRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await sbAny(context.supabase)
      .from("ticket_mentions")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("mentioned_user_id", context.userId);
    return { ok: true };
  });

/* ------------------------- TEAM INBOX ------------------------- */
export const listTeamInboxes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const wsId = await getWorkspaceId(sbAny(context.supabase), context.userId);
    const { data } = await sbAny(context.supabase)
      .from("inboxes")
      .select("*, members:inbox_members(user_id, role, profile:profiles!inbox_members_user_id_fkey(display_name, avatar_url))")
      .eq("workspace_id", wsId)
      .eq("is_archived", false);
    return data ?? [];
  });

export const listWorkspaceMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const wsId = await getWorkspaceId(sbAny(context.supabase), context.userId);
    const { data } = await sbAny(context.supabase)
      .from("workspace_members")
      .select("user_id, role, profile:profiles!workspace_members_user_id_fkey(id, display_name, avatar_url, email)")
      .eq("workspace_id", wsId);
    return data ?? [];
  });
