/**
 * Helpdesk & Ticketing server functions — Phase 21.
 *
 * Tickets are backed by `conversations` (channel-agnostic). This module adds
 * SLA tracking, escalations, categories, macros, watchers, CSAT, and AI
 * assistance on top of it.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { sbAny } from "@/lib/supabase/untyped";
import { GEMINI_CHAT_URL } from "@/lib/ai/gemini.server";

async function getWorkspaceId(userId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data } = await sbAny(supabaseAdmin).from("workspace_members")
    .select("workspace_id").eq("user_id", userId).limit(1).maybeSingle();
  if (!data) throw new Error("No workspace found");
  return (data as { workspace_id: string }).workspace_id;
}

/* ============================ Ticket Queue ============================ */

export const listTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    status: z.string().optional(),
    priority: z.string().optional(),
    assignee: z.string().optional(),
    categoryId: z.string().uuid().optional(),
    search: z.string().optional(),
    breached: z.boolean().optional(),
    limit: z.number().min(1).max(200).default(50),
  }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    let q = sbAny(context.supabase).from("conversations")
      .select("id, subject, status, priority, channel, assigned_to, assigned_team_id, contact_id, ticket_category_id, escalation_level, first_response_at, resolved_at, last_message_at, created_at, updated_at, last_message_preview, ai_summary")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status as never);
    if (data.priority) q = q.eq("priority", data.priority as never);
    if (data.assignee === "me") q = q.eq("assigned_to", context.userId);
    else if (data.assignee === "unassigned") q = q.is("assigned_to", null);
    else if (data.assignee) q = q.eq("assigned_to", data.assignee);
    if (data.categoryId) q = q.eq("ticket_category_id", data.categoryId);
    if (data.search) q = q.ilike("subject", `%${sanitizeSearchTerm(data.search)}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getTicket = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: ticket, error } = await sbAny(context.supabase).from("conversations")
      .select("*").eq("id", data.id).eq("workspace_id", workspaceId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!ticket) throw new Error("Ticket not found");

    const [{ data: messages }, { data: sla }, { data: escalations }, { data: watchers }, { data: notes }] = await Promise.all([
      sbAny(context.supabase).from("messages").select("id, body, direction, sent_by, is_internal, created_at, metadata").eq("conversation_id", data.id).order("created_at", { ascending: true }).limit(200),
      (sbAny(context.supabase).from("ticket_sla_tracking") as any).select("*").eq("ticket_id", data.id).maybeSingle(),
      (sbAny(context.supabase).from("ticket_escalations") as any).select("*").eq("ticket_id", data.id).order("created_at", { ascending: false }),
      (sbAny(context.supabase).from("ticket_watchers") as any).select("*").eq("ticket_id", data.id),
      sbAny(context.supabase).from("conversation_notes").select("*").eq("conversation_id", data.id).order("created_at", { ascending: false }).limit(50),
    ]);
    return { ticket, messages: messages ?? [], sla, escalations: escalations ?? [], watchers: watchers ?? [], notes: notes ?? [] };
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.string().optional(),
  priority: z.string().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  assigned_team_id: z.string().uuid().nullable().optional(),
  ticket_category_id: z.string().uuid().nullable().optional(),
  subject: z.string().optional(),
});
export const updateTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const k of ["status","priority","assigned_to","assigned_team_id","ticket_category_id","subject"] as const) {
      if (data[k] !== undefined) patch[k] = data[k];
    }
    if (data.status === "resolved") patch.resolved_at = new Date().toISOString();
    const { error } = await sbAny(context.supabase).from("conversations")
      .update(patch as never).eq("id", data.id).eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const replyToTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    id: z.string().uuid(),
    body: z.string().min(1),
    isInternal: z.boolean().default(false),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: conv } = await sbAny(context.supabase).from("conversations")
      .select("id, workspace_id, first_response_at")
      .eq("id", data.id).eq("workspace_id", workspaceId).maybeSingle();
    if (!conv) throw new Error("Ticket not found");
    const { error } = await (sbAny(context.supabase).from("messages") as any).insert({
      workspace_id: workspaceId,
      conversation_id: data.id,
      body: data.body,
      direction: "outbound",
      sent_by: context.userId,
      is_internal: data.isInternal,
      status: "sent",
    });
    if (error) throw new Error(error.message);
    const patch: Record<string, unknown> = { last_message_at: new Date().toISOString(), last_message_preview: data.body.slice(0, 240), last_message_from: "agent" };
    if (!data.isInternal && !(conv as { first_response_at: string | null }).first_response_at) {
      patch.first_response_at = new Date().toISOString();
    }
    await (sbAny(context.supabase).from("conversations") as any).update(patch).eq("id", data.id);
    return { ok: true };
  });

export const addWatcher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ ticketId: z.string().uuid(), userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { error } = await (sbAny(context.supabase).from("ticket_watchers") as any).insert({
      workspace_id: workspaceId, ticket_id: data.ticketId, user_id: data.userId, added_by: context.userId,
    });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    return { ok: true };
  });

export const removeWatcher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ ticketId: z.string().uuid(), userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { error } = await (sbAny(context.supabase).from("ticket_watchers") as any).delete()
      .eq("ticket_id", data.ticketId).eq("user_id", data.userId).eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============================ Escalations ============================ */

export const escalateTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    ticketId: z.string().uuid(),
    reason: z.string().min(1),
    escalatedTo: z.string().uuid().nullable().optional(),
    escalatedToTeam: z.string().uuid().nullable().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: current } = await sbAny(context.supabase).from("conversations")
      .select("escalation_level, assigned_to").eq("id", data.ticketId).eq("workspace_id", workspaceId).maybeSingle();
    const level = ((current as { escalation_level: number | null } | null)?.escalation_level ?? 0) + 1;
    const { error } = await (sbAny(context.supabase).from("ticket_escalations") as any).insert({
      workspace_id: workspaceId,
      ticket_id: data.ticketId,
      level,
      reason: data.reason,
      escalated_from: (current as { assigned_to: string | null } | null)?.assigned_to ?? null,
      escalated_to: data.escalatedTo ?? null,
      escalated_to_team: data.escalatedToTeam ?? null,
      auto: false,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    await sbAny(context.supabase).from("conversations").update({ escalation_level: level,
      priority: "high",
      assigned_to: data.escalatedTo ?? (current as { assigned_to: string | null } | null)?.assigned_to,
      assigned_team_id: data.escalatedToTeam ?? null,
      updated_at: new Date().toISOString(),
    }).eq("id", data.ticketId);
    return { ok: true, level };
  });

/* ============================ SLA Management ============================ */

const PRIORITY_HOURS: Record<string, { first: number; resolution: number }> = {
  urgent: { first: 0.25, resolution: 4 },
  high: { first: 1, resolution: 8 },
  normal: { first: 4, resolution: 24 },
  low: { first: 8, resolution: 72 },
};

export const attachSla = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    ticketId: z.string().uuid(),
    policyId: z.string().uuid().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: conv } = await sbAny(context.supabase).from("conversations")
      .select("id, priority, created_at").eq("id", data.ticketId).eq("workspace_id", workspaceId).maybeSingle();
    if (!conv) throw new Error("Ticket not found");
    const c = conv as { id: string; priority: string; created_at: string };
    let firstMin: number, resolutionMin: number;
    if (data.policyId) {
      const { data: policy } = await sbAny(context.supabase).from("sla_policies")
        .select("first_response_minutes, resolution_minutes").eq("id", data.policyId).maybeSingle();
      firstMin = (policy as { first_response_minutes: number } | null)?.first_response_minutes ?? 60;
      resolutionMin = (policy as { resolution_minutes: number } | null)?.resolution_minutes ?? 1440;
    } else {
      const p = PRIORITY_HOURS[c.priority] ?? PRIORITY_HOURS.normal;
      firstMin = p.first * 60; resolutionMin = p.resolution * 60;
    }
    const base = new Date(c.created_at).getTime();
    const firstDue = new Date(base + firstMin * 60_000).toISOString();
    const resolutionDue = new Date(base + resolutionMin * 60_000).toISOString();
    const { error } = await (sbAny(context.supabase).from("ticket_sla_tracking") as any).upsert({
      workspace_id: workspaceId,
      ticket_id: data.ticketId,
      sla_policy_id: data.policyId ?? null,
      first_response_due_at: firstDue,
      resolution_due_at: resolutionDue,
      paused: false,
    }, { onConflict: "ticket_id" });
    if (error) throw new Error(error.message);
    return { ok: true, firstDue, resolutionDue };
  });

export const pauseSla = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ ticketId: z.string().uuid(), pause: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: tracking } = await (sbAny(context.supabase).from("ticket_sla_tracking") as any)
      .select("*").eq("ticket_id", data.ticketId).eq("workspace_id", workspaceId).maybeSingle();
    if (!tracking) throw new Error("No SLA attached");
    const t = tracking as { paused: boolean; paused_at: string | null; total_pause_seconds: number };
    if (data.pause) {
      await (sbAny(context.supabase).from("ticket_sla_tracking") as any).update({
        paused: true, paused_at: new Date().toISOString(),
      }).eq("ticket_id", data.ticketId);
    } else if (t.paused && t.paused_at) {
      const pausedFor = Math.floor((Date.now() - new Date(t.paused_at).getTime()) / 1000);
      await (sbAny(context.supabase).from("ticket_sla_tracking") as any).update({
        paused: false, paused_at: null,
        total_pause_seconds: (t.total_pause_seconds ?? 0) + pausedFor,
      }).eq("ticket_id", data.ticketId);
    }
    return { ok: true };
  });

export const slaMonitor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: rows } = await sbAny(context.supabase)
      .from("ticket_sla_tracking")
      .select("*, conversations!inner(id, subject, status, priority, assigned_to)")
      .eq("workspace_id", workspaceId)
      .order("resolution_due_at", { ascending: true })
      .limit(500);
    const now = Date.now();
    return (rows ?? []).map((r) => {
      const rec = r as { resolution_due_at: string | null; first_response_due_at: string | null; first_response_breached: boolean; resolution_breached: boolean };
      const resDue = rec.resolution_due_at ? new Date(rec.resolution_due_at).getTime() : null;
      const frDue = rec.first_response_due_at ? new Date(rec.first_response_due_at).getTime() : null;
      const resIn = resDue !== null ? Math.round((resDue - now) / 60_000) : null;
      const frIn = frDue !== null ? Math.round((frDue - now) / 60_000) : null;
      const state = (resIn !== null && resIn < 0) || rec.resolution_breached ? "breached"
        : (resIn !== null && resIn < 60) ? "at_risk" : "ok";
      return { ...r, minutes_to_resolution: resIn, minutes_to_first_response: frIn, state };
    });
  });

/* ============================ Categories ============================ */

export const listCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data } = await (sbAny(context.supabase).from("ticket_categories") as any)
      .select("*").eq("workspace_id", workspaceId).order("sort_order").order("name");
    return data ?? [];
  });

export const saveCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1),
    description: z.string().optional(),
    color: z.string().optional(),
    icon: z.string().optional(),
    default_priority: z.string().optional(),
    default_sla_policy_id: z.string().uuid().nullable().optional(),
    parent_id: z.string().uuid().nullable().optional(),
    sort_order: z.number().optional(),
    is_active: z.boolean().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    if (data.id) {
      const { id, ...rest } = data;
      const { error } = await (sbAny(context.supabase).from("ticket_categories") as any)
        .update(rest).eq("id", id).eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: row, error } = await (sbAny(context.supabase).from("ticket_categories") as any)
      .insert({ ...data, workspace_id: workspaceId, created_by: context.userId })
      .select("id").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { error } = await (sbAny(context.supabase).from("ticket_categories") as any)
      .delete().eq("id", data.id).eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============================ Macros ============================ */

export const listMacros = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data } = await (sbAny(context.supabase).from("ticket_macros") as any)
      .select("*").eq("workspace_id", workspaceId).order("usage_count", { ascending: false }).order("name");
    return data ?? [];
  });

export const saveMacro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1),
    description: z.string().optional(),
    body: z.string().min(1),
    actions: z.array(z.object({ type: z.string(), value: z.unknown().optional() })).default([]),
    tags: z.array(z.string()).optional(),
    category_id: z.string().uuid().nullable().optional(),
    is_shared: z.boolean().optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    if (data.id) {
      const { id, ...rest } = data;
      const { error } = await (sbAny(context.supabase).from("ticket_macros") as any)
        .update(rest).eq("id", id).eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: row, error } = await (sbAny(context.supabase).from("ticket_macros") as any)
      .insert({ ...data, workspace_id: workspaceId, created_by: context.userId })
      .select("id").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteMacro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { error } = await (sbAny(context.supabase).from("ticket_macros") as any)
      .delete().eq("id", data.id).eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const applyMacro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ ticketId: z.string().uuid(), macroId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: macro } = await (sbAny(context.supabase).from("ticket_macros") as any)
      .select("*").eq("id", data.macroId).eq("workspace_id", workspaceId).maybeSingle();
    if (!macro) throw new Error("Macro not found");
    const m = macro as { body: string; actions: Array<{ type: string; value?: unknown }>; usage_count: number };
    // Post reply
    await (sbAny(context.supabase).from("messages") as any).insert({
      workspace_id: workspaceId,
      conversation_id: data.ticketId,
      body: m.body,
      direction: "outbound",
      sent_by: context.userId,
      is_internal: false,
      status: "sent",
    });
    // Apply actions
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const a of m.actions ?? []) {
      if (a.type === "set_status") patch.status = a.value;
      if (a.type === "set_priority") patch.priority = a.value;
      if (a.type === "set_category") patch.ticket_category_id = a.value;
    }
    if (Object.keys(patch).length > 1) {
      await (sbAny(context.supabase).from("conversations") as any).update(patch).eq("id", data.ticketId).eq("workspace_id", workspaceId);
    }
    await (sbAny(context.supabase).from("ticket_macros") as any).update({ usage_count: (m.usage_count ?? 0) + 1 }).eq("id", data.macroId);
    return { ok: true };
  });

/* ============================ CSAT ============================ */

export const listCsatSurveys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data } = await (sbAny(context.supabase).from("csat_surveys") as any)
      .select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
    return data ?? [];
  });

export const saveCsatSurvey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1),
    question: z.string().min(1),
    scale: z.enum(["stars_5","nps_10","thumbs"]),
    follow_up_question: z.string().optional(),
    send_on: z.enum(["resolved","closed"]).default("resolved"),
    delay_minutes: z.number().min(0).default(0),
    channel: z.enum(["email","whatsapp","in_app"]).default("email"),
    is_active: z.boolean().default(true),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    if (data.id) {
      const { id, ...rest } = data;
      const { error } = await (sbAny(context.supabase).from("csat_surveys") as any)
        .update(rest).eq("id", id).eq("workspace_id", workspaceId);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: row, error } = await (sbAny(context.supabase).from("csat_surveys") as any)
      .insert({ ...data, workspace_id: workspaceId, created_by: context.userId })
      .select("id").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const csatSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
    const { data: rows } = await sbAny(context.supabase).from("csat_responses")
      .select("rating, score_type, agent_id, submitted_at, comment, sentiment")
      .eq("workspace_id", workspaceId).gte("submitted_at", since);
    const all = rows ?? [];
    const csat = all.filter((r) => (r as { score_type: string }).score_type === "csat");
    const nps = all.filter((r) => (r as { score_type: string }).score_type === "nps");
    const avg = (xs: typeof all) => xs.length ? xs.reduce((a, b) => a + ((b as { rating: number }).rating ?? 0), 0) / xs.length : 0;
    const promoters = nps.filter((r) => ((r as { rating: number }).rating ?? 0) >= 9).length;
    const detractors = nps.filter((r) => ((r as { rating: number }).rating ?? 0) <= 6).length;
    return {
      total: all.length,
      csat_avg: Number(avg(csat).toFixed(2)),
      nps: nps.length ? Math.round(((promoters - detractors) / nps.length) * 100) : 0,
      recent: all.slice(0, 20),
    };
  });

/* ============================ Analytics ============================ */

export const helpdeskAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ days: z.number().min(1).max(365).default(30) }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const since = new Date(Date.now() - data.days * 24 * 3600_000).toISOString();
    const [
      { data: created },
      { data: resolved },
      { data: open },
      { data: breached },
      { data: escalations },
    ] = await Promise.all([
      sbAny(context.supabase).from("conversations").select("id, priority, created_at, first_response_at, resolved_at, assigned_to")
        .eq("workspace_id", workspaceId).gte("created_at", since).is("deleted_at", null),
      sbAny(context.supabase).from("conversations").select("id, resolved_at, created_at, assigned_to")
        .eq("workspace_id", workspaceId).eq("status", "resolved").gte("resolved_at", since),
      sbAny(context.supabase).from("conversations").select("id, priority, status", { count: "exact", head: true })
        .eq("workspace_id", workspaceId).in("status", ["open","pending","waiting"] as never).is("deleted_at", null),
      (sbAny(context.supabase).from("ticket_sla_tracking") as any).select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId).eq("resolution_breached", true),
      (sbAny(context.supabase).from("ticket_escalations") as any).select("id, level, created_at")
        .eq("workspace_id", workspaceId).gte("created_at", since),
    ]);
    const createdRows = (created ?? []) as Array<{ id: string; priority: string; created_at: string; first_response_at: string | null; resolved_at: string | null; assigned_to: string | null }>;
    const resolvedRows = (resolved ?? []) as Array<{ id: string; created_at: string; resolved_at: string; assigned_to: string | null }>;
    const firstResp = createdRows.filter((r) => r.first_response_at).map((r) => (new Date(r.first_response_at!).getTime() - new Date(r.created_at).getTime()) / 60000);
    const resolution = resolvedRows.map((r) => (new Date(r.resolved_at).getTime() - new Date(r.created_at).getTime()) / 60000);
    const avg = (xs: number[]) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;
    // by priority
    const byPriority: Record<string, number> = {};
    for (const r of createdRows) byPriority[r.priority] = (byPriority[r.priority] ?? 0) + 1;
    return {
      created: createdRows.length,
      resolved: resolvedRows.length,
      open_count: (open as unknown as { count?: number } | null)?.count ?? 0,
      breached_count: (breached as unknown as { count?: number } | null)?.count ?? 0,
      escalations: (escalations ?? []).length,
      avg_first_response_min: avg(firstResp),
      avg_resolution_min: avg(resolution),
      by_priority: byPriority,
    };
  });

/* ============================ AI Assist ============================ */

export const aiSuggestReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({
    ticketId: z.string().uuid(),
    tone: z.enum(["friendly","formal","empathetic","concise"]).default("friendly"),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: conv } = await sbAny(context.supabase).from("conversations")
      .select("id, subject, ai_summary").eq("id", data.ticketId).eq("workspace_id", workspaceId).maybeSingle();
    if (!conv) throw new Error("Ticket not found");
    const { data: recent } = await sbAny(context.supabase).from("messages")
      .select("body, direction, sent_by, created_at").eq("conversation_id", data.ticketId)
      .order("created_at", { ascending: false }).limit(10);
    const transcript = ((recent ?? []) as Array<{ body: string; direction: string; sent_by: string | null }>)
      .reverse().map((m) => `${m.direction === "outbound" ? "Agent" : "Customer"}: ${m.body}`).join("\n");
    const key = process.env.GEMINI_API_KEY;
    if (!key) return { suggestion: "AI Gateway not configured. Please set GEMINI_API_KEY." };
    const c = conv as { subject: string | null; ai_summary: string | null };
    const prompt = `You are a helpdesk agent. Draft a ${data.tone} reply to the customer.\nTicket subject: ${c.subject}\nContext summary: ${c.ai_summary ?? "n/a"}\n\nRecent transcript:\n${transcript}\n\nReply:`;
    try {
      const res = await fetch(GEMINI_CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json"},
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [
            { role: "system", content: "You draft concise, actionable helpdesk replies. Do not invent facts." },
            { role: "user", content: prompt },
          ],
        }),
      });
      const j = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      return { suggestion: j.choices?.[0]?.message?.content ?? "" };
    } catch (e) {
      return { suggestion: "", error: (e as Error).message };
    }
  });

export const aiTriageTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ ticketId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data: conv } = await sbAny(context.supabase).from("conversations")
      .select("id, subject, last_message_preview, priority").eq("id", data.ticketId).eq("workspace_id", workspaceId).maybeSingle();
    if (!conv) throw new Error("Ticket not found");
    const key = process.env.GEMINI_API_KEY;
    if (!key) return { priority: null, category: null, tags: [], summary: null };
    const { data: cats } = await (sbAny(context.supabase).from("ticket_categories") as any)
      .select("id, name").eq("workspace_id", workspaceId).eq("is_active", true);
    const c = conv as { subject: string | null; last_message_preview: string | null; priority: string };
    const categoryList = ((cats ?? []) as Array<{ id: string; name: string }>).map((k) => `${k.id}: ${k.name}`).join("\n");
    const prompt = `Classify this support ticket. Respond with JSON only.\nSubject: ${c.subject}\nMessage: ${c.last_message_preview}\n\nAvailable categories:\n${categoryList}\n\nReturn: {"priority":"urgent|high|normal|low","category_id":"<uuid or null>","tags":["..."],"summary":"one-sentence summary","sentiment":"positive|neutral|negative"}`;
    try {
      const res = await fetch(GEMINI_CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json"},
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [
            { role: "system", content: "You are a support ticket triage classifier. Output only valid JSON." },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
        }),
      });
      const j = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
      const parsed = JSON.parse(j.choices?.[0]?.message?.content ?? "{}") as {
        priority?: string; category_id?: string | null; tags?: string[]; summary?: string; sentiment?: string;
      };
      // apply summary + priority if provided
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (parsed.summary) patch.ai_summary = parsed.summary;
      if (parsed.priority) patch.priority = parsed.priority;
      if (parsed.category_id) patch.ticket_category_id = parsed.category_id;
      await (sbAny(context.supabase).from("conversations") as any).update(patch).eq("id", data.ticketId).eq("workspace_id", workspaceId);
      return parsed;
    } catch (e) {
      return { error: (e as Error).message };
    }
  });

/* ============================ Team Members ============================ */

export const listAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { data } = await sbAny(context.supabase)
      .from("workspace_members")
      .select("user_id, role, profiles(id, full_name, email, avatar_url)")
      .eq("workspace_id", workspaceId);
    return data ?? [];
  });
