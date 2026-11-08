/**
 * Human Handoff — server functions.
 *
 * Powers: transfer to agent/department, queue management, working hours,
 * offline mode, fallback agent, agent availability & skills, priority queue,
 * conversation ownership, resume AI, take over, transfer history.
 *
 * All operations run through `requireSupabaseAuth` so RLS scopes them to
 * the caller's workspace.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sbAny } from "@/lib/supabase/untyped";

// ==================== schemas ====================

const PriorityEnum = z.enum(["low", "normal", "high", "urgent"]);
const PresenceEnum = z.enum(["online", "away", "busy", "offline"]);
const DayEnum = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
const DayHours = z.object({ open: z.string(), close: z.string(), enabled: z.boolean() });

export type HandoffPriority = z.infer<typeof PriorityEnum>;
export type AgentPresence = z.infer<typeof PresenceEnum>;

// ==================== Departments ====================

export const listDepartments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("departments" as never)
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as Department[];
  });

export const upsertDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    id: z.string().uuid().optional(),
    workspaceId: z.string().uuid(),
    name: z.string().min(1).max(60),
    description: z.string().max(400).nullable().optional(),
    color: z.string().optional(),
    fallbackAgentId: z.string().uuid().nullable().optional(),
    isActive: z.boolean().optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {
      workspace_id: data.workspaceId,
      name: data.name,
      description: data.description ?? null,
      color: data.color ?? "#075E54",
      fallback_agent_id: data.fallbackAgentId ?? null,
      is_active: data.isActive ?? true,
      created_by: context.userId,
    };
    if (data.id) patch.id = data.id;
    const { data: row, error } = await context.supabase
      .from("departments" as never)
      .upsert(patch as never, { onConflict: "id" })
      .select("*").single();
    if (error) throw new Error(error.message);
    return row as unknown as Department;
  });

export const deleteDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("departments" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { deleted: true as const };
  });

export const setDepartmentMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    workspaceId: z.string().uuid(),
    departmentId: z.string().uuid(),
    userIds: z.array(z.string().uuid()),
  }).parse(v))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("department_members" as never)
      .delete().eq("department_id", data.departmentId);
    if (data.userIds.length) {
      const rows = data.userIds.map((uid) => ({
        department_id: data.departmentId,
        user_id: uid,
        workspace_id: data.workspaceId,
      }));
      const { error } = await context.supabase
        .from("department_members" as never).insert(rows as never);
      if (error) throw new Error(error.message);
    }
    return { ok: true as const };
  });

// ==================== Agent availability ====================

export const listAgentAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("agent_availability" as never)
      .select("*")
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as AgentAvailability[];
  });

export const setMyAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    workspaceId: z.string().uuid(),
    presence: PresenceEnum.optional(),
    statusMessage: z.string().max(120).nullable().optional(),
    skills: z.array(z.string()).max(50).optional(),
    maxConcurrent: z.number().int().min(1).max(200).optional(),
    autoAwayMinutes: z.number().int().min(1).max(240).optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {
      workspace_id: data.workspaceId,
      user_id: context.userId,
      last_active_at: new Date().toISOString(),
    };
    if (data.presence) patch.presence = data.presence;
    if (data.statusMessage !== undefined) patch.status_message = data.statusMessage;
    if (data.skills) patch.skills = data.skills;
    if (data.maxConcurrent) patch.max_concurrent = data.maxConcurrent;
    if (data.autoAwayMinutes) patch.auto_away_minutes = data.autoAwayMinutes;

    const { data: row, error } = await context.supabase
      .from("agent_availability" as never)
      .upsert(patch as never, { onConflict: "workspace_id,user_id" })
      .select("*").single();
    if (error) throw new Error(error.message);
    return row as unknown as AgentAvailability;
  });

// heartbeat: bump last_active_at, keep presence
export const heartbeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("agent_availability" as never)
      .update({ last_active_at: new Date().toISOString() } as never)
      .eq("workspace_id", data.workspaceId)
      .eq("user_id", context.userId);
    return { ok: true as const };
  });

// ==================== Business hours ====================

export const getBusinessHours = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("business_hours" as never).select("*").eq("workspace_id", data.workspaceId).maybeSingle();
    return (row ?? null) as unknown as BusinessHours | null;
  });

export const upsertBusinessHours = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    workspaceId: z.string().uuid(),
    timezone: z.string().optional(),
    weeklySchedule: z.record(DayEnum, DayHours).optional(),
    holidays: z.array(z.object({ date: z.string(), label: z.string() })).optional(),
    offlineMessage: z.string().max(500).optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {
      workspace_id: data.workspaceId,
      updated_by: context.userId,
    };
    if (data.timezone) patch.timezone = data.timezone;
    if (data.weeklySchedule) patch.weekly_schedule = data.weeklySchedule;
    if (data.holidays) patch.holidays = data.holidays;
    if (data.offlineMessage !== undefined) patch.offline_message = data.offlineMessage;
    const { data: row, error } = await context.supabase
      .from("business_hours" as never)
      .upsert(patch as never, { onConflict: "workspace_id" })
      .select("*").single();
    if (error) throw new Error(error.message);
    return row as unknown as BusinessHours;
  });

// ==================== Handoff actions ====================

async function logEvent(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  row: Record<string, unknown>,
) {
  await sbAny(supabase).from("handoff_events" as never).insert(row as never);
}

/** Transfer conversation to a specific agent. */
export const transferToAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    conversationId: z.string().uuid(),
    toUserId: z.string().uuid(),
    note: z.string().max(500).optional(),
    reason: z.string().max(200).optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: conv, error: cErr } = await context.supabase
      .from("conversations" as never)
      .select("id, workspace_id, assigned_to, department_id")
      .eq("id", data.conversationId).single();
    if (cErr || !conv) throw new Error(cErr?.message ?? "Conversation not found");
    const c = conv as { id: string; workspace_id: string; assigned_to: string | null; department_id: string | null };

    const { error: uErr } = await context.supabase
      .from("conversations" as never)
      .update({
        assigned_to: data.toUserId,
        assigned_at: new Date().toISOString(),
        handoff_state: "human",
        ai_enabled: false,
      } as never)
      .eq("id", data.conversationId);
    if (uErr) throw new Error(uErr.message);

    await logEvent(context.supabase, {
      workspace_id: c.workspace_id,
      conversation_id: c.id,
      kind: "transfer_agent",
      from_user_id: c.assigned_to,
      to_user_id: data.toUserId,
      actor_id: context.userId,
      reason: data.reason ?? null,
      note: data.note ?? null,
    });
    return { ok: true as const };
  });

/** Transfer conversation to a department (queued if no agents online). */
export const transferToDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    conversationId: z.string().uuid(),
    departmentId: z.string().uuid(),
    priority: PriorityEnum.optional(),
    requiredSkills: z.array(z.string()).optional(),
    reason: z.string().max(200).optional(),
    note: z.string().max(500).optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: conv } = await context.supabase
      .from("conversations" as never)
      .select("id, workspace_id, assigned_to, department_id")
      .eq("id", data.conversationId).single();
    if (!conv) throw new Error("Conversation not found");
    const c = conv as { id: string; workspace_id: string; assigned_to: string | null; department_id: string | null };

    const { data: dept } = await context.supabase
      .from("departments" as never)
      .select("id, fallback_agent_id")
      .eq("id", data.departmentId).single();
    if (!dept) throw new Error("Department not found");
    const d = dept as { id: string; fallback_agent_id: string | null };

    // Find best online member
    const { data: members } = await context.supabase
      .from("department_members" as never)
      .select("user_id, priority")
      .eq("department_id", data.departmentId)
      .order("priority", { ascending: false });
    const memberIds = ((members ?? []) as Array<{ user_id: string }>).map((m) => m.user_id);

    let assigned: string | null = null;
    if (memberIds.length) {
      const { data: avail } = await context.supabase
        .from("agent_availability" as never)
        .select("user_id, presence, current_load, max_concurrent, skills")
        .eq("workspace_id", c.workspace_id)
        .in("user_id", memberIds);
      const eligible = ((avail ?? []) as Array<{
        user_id: string; presence: AgentPresence;
        current_load: number; max_concurrent: number; skills: string[];
      }>)
        .filter((a) => a.presence === "online" && a.current_load < a.max_concurrent)
        .filter((a) => !data.requiredSkills?.length
          || data.requiredSkills.every((s) => a.skills.includes(s)))
        .sort((a, b) => a.current_load - b.current_load);
      assigned = eligible[0]?.user_id ?? null;
    }

    if (assigned) {
      await sbAny(context.supabase).from("conversations" as never).update({
        assigned_to: assigned,
        department_id: data.departmentId,
        assigned_at: new Date().toISOString(),
        handoff_state: "human",
        ai_enabled: false,
      } as never).eq("id", c.id);
      await logEvent(context.supabase, {
        workspace_id: c.workspace_id,
        conversation_id: c.id,
        kind: "transfer_department",
        from_user_id: c.assigned_to,
        to_user_id: assigned,
        from_department_id: c.department_id,
        to_department_id: data.departmentId,
        actor_id: context.userId,
        reason: data.reason ?? null,
        note: data.note ?? null,
      });
      return { ok: true as const, mode: "assigned" as const, assignedTo: assigned };
    }

    // Try fallback agent
    if (d.fallback_agent_id) {
      await sbAny(context.supabase).from("conversations" as never).update({
        assigned_to: d.fallback_agent_id,
        department_id: data.departmentId,
        assigned_at: new Date().toISOString(),
        handoff_state: "human",
        ai_enabled: false,
      } as never).eq("id", c.id);
      await logEvent(context.supabase, {
        workspace_id: c.workspace_id,
        conversation_id: c.id,
        kind: "fallback_assigned",
        to_user_id: d.fallback_agent_id,
        from_department_id: c.department_id,
        to_department_id: data.departmentId,
        actor_id: context.userId,
        reason: data.reason ?? null,
      });
      return { ok: true as const, mode: "fallback" as const, assignedTo: d.fallback_agent_id };
    }

    // Otherwise queue
    await sbAny(context.supabase).from("handoff_queue" as never).upsert({
      workspace_id: c.workspace_id,
      conversation_id: c.id,
      target_department_id: data.departmentId,
      requested_by: context.userId,
      priority: data.priority ?? "normal",
      required_skills: data.requiredSkills ?? [],
      reason: data.reason ?? null,
      status: "waiting",
    } as never, { onConflict: "conversation_id,status" });
    await sbAny(context.supabase).from("conversations" as never).update({
      department_id: data.departmentId,
      handoff_state: "queued",
    } as never).eq("id", c.id);
    await logEvent(context.supabase, {
      workspace_id: c.workspace_id,
      conversation_id: c.id,
      kind: "queue_enter",
      from_department_id: c.department_id,
      to_department_id: data.departmentId,
      actor_id: context.userId,
      reason: data.reason ?? null,
      note: data.note ?? null,
    });
    return { ok: true as const, mode: "queued" as const };
  });

/** Agent claims (takes over) a conversation, disabling AI. */
export const takeOver = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    conversationId: z.string().uuid(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: conv } = await context.supabase
      .from("conversations" as never)
      .select("workspace_id, assigned_to")
      .eq("id", data.conversationId).single();
    if (!conv) throw new Error("Conversation not found");
    const c = conv as { workspace_id: string; assigned_to: string | null };
    await sbAny(context.supabase).from("conversations" as never).update({
      assigned_to: context.userId,
      assigned_at: new Date().toISOString(),
      handoff_state: "human",
      ai_enabled: false,
    } as never).eq("id", data.conversationId);
    await logEvent(context.supabase, {
      workspace_id: c.workspace_id,
      conversation_id: data.conversationId,
      kind: "takeover",
      from_user_id: c.assigned_to,
      to_user_id: context.userId,
      actor_id: context.userId,
    });
    // Also clear the queue entry if any
    await sbAny(context.supabase).from("handoff_queue" as never)
      .update({ status: "assigned", assigned_to: context.userId, assigned_at: new Date().toISOString() } as never)
      .eq("conversation_id", data.conversationId).eq("status", "waiting");
    return { ok: true as const };
  });

/** Hand back to AI (resume automated handling). */
export const resumeAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    conversationId: z.string().uuid(),
    note: z.string().max(500).optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: conv } = await context.supabase
      .from("conversations" as never)
      .select("workspace_id, assigned_to")
      .eq("id", data.conversationId).single();
    if (!conv) throw new Error("Conversation not found");
    const c = conv as { workspace_id: string; assigned_to: string | null };
    await sbAny(context.supabase).from("conversations" as never).update({
      handoff_state: "ai",
      ai_enabled: true,
    } as never).eq("id", data.conversationId);
    await logEvent(context.supabase, {
      workspace_id: c.workspace_id,
      conversation_id: data.conversationId,
      kind: "resume_ai",
      from_user_id: c.assigned_to,
      actor_id: context.userId,
      note: data.note ?? null,
    });
    return { ok: true as const };
  });

// ==================== Queue ====================

export const listQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    workspaceId: z.string().uuid(),
    status: z.enum(["waiting", "assigned", "cancelled", "expired"]).optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("handoff_queue" as never)
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("priority", { ascending: false })
      .order("entered_at", { ascending: true });
    q = q.eq("status", data.status ?? "waiting");
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as HandoffQueueItem[];
  });

export const claimFromQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ queueId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: item } = await context.supabase
      .from("handoff_queue" as never).select("*").eq("id", data.queueId).single();
    if (!item) throw new Error("Queue item not found");
    const q = item as HandoffQueueItem;
    if (q.status !== "waiting") throw new Error("Already claimed");

    await sbAny(context.supabase).from("handoff_queue" as never).update({
      status: "assigned",
      assigned_to: context.userId,
      assigned_at: new Date().toISOString(),
    } as never).eq("id", data.queueId);

    await sbAny(context.supabase).from("conversations" as never).update({
      assigned_to: context.userId,
      assigned_at: new Date().toISOString(),
      handoff_state: "human",
      ai_enabled: false,
    } as never).eq("id", q.conversation_id);

    await logEvent(context.supabase, {
      workspace_id: q.workspace_id,
      conversation_id: q.conversation_id,
      kind: "queue_assigned",
      to_user_id: context.userId,
      to_department_id: q.target_department_id,
      actor_id: context.userId,
    });
    return { ok: true as const };
  });

// ==================== History ====================

export const listHandoffHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    conversationId: z.string().uuid(),
    limit: z.number().int().min(1).max(200).optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("handoff_events" as never)
      .select("*")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as HandoffEvent[];
  });

// ==================== Working hours check ====================

export const isWithinBusinessHours = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("business_hours" as never).select("*")
      .eq("workspace_id", data.workspaceId).maybeSingle();
    if (!row) return { open: true, offlineMessage: "" };
    return { open: computeOpen(row as unknown as BusinessHours), offlineMessage: (row as unknown as BusinessHours).offline_message };
  });

function computeOpen(bh: BusinessHours): boolean {
  try {
    const tz = bh.timezone || "UTC";
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(now);
    const wd = parts.find((p) => p.type === "weekday")?.value.toLowerCase().slice(0, 3) ?? "mon";
    const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
    const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
    const iso = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(now);
    const holiday = (bh.holidays ?? []).some((h) => h.date === iso);
    if (holiday) return false;
    const day = bh.weekly_schedule?.[wd as keyof typeof bh.weekly_schedule];
    if (!day || !day.enabled) return false;
    const cur = `${hh}:${mm}`;
    return cur >= day.open && cur <= day.close;
  } catch { return true; }
}

// ==================== Types ====================

export interface Department {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  color: string;
  fallback_agent_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AgentAvailability {
  id: string;
  workspace_id: string;
  user_id: string;
  presence: AgentPresence;
  status_message: string | null;
  skills: string[];
  max_concurrent: number;
  current_load: number;
  auto_away_minutes: number;
  last_active_at: string;
}

export interface BusinessHours {
  workspace_id: string;
  timezone: string;
  weekly_schedule: Record<"mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun", { open: string; close: string; enabled: boolean }>;
  holidays: Array<{ date: string; label: string }>;
  offline_message: string;
}

export interface HandoffQueueItem {
  id: string;
  workspace_id: string;
  conversation_id: string;
  target_department_id: string | null;
  target_user_id: string | null;
  requested_by: string | null;
  priority: HandoffPriority;
  required_skills: string[];
  reason: string | null;
  status: "waiting" | "assigned" | "cancelled" | "expired";
  assigned_to: string | null;
  assigned_at: string | null;
  entered_at: string;
}

export interface HandoffEvent {
  id: string;
  workspace_id: string;
  conversation_id: string;
  kind:
    | "transfer_agent" | "transfer_department" | "takeover" | "resume_ai"
    | "queue_enter" | "queue_leave" | "queue_assigned" | "fallback_assigned" | "offline_bounced";
  from_user_id: string | null;
  to_user_id: string | null;
  from_department_id: string | null;
  to_department_id: string | null;
  actor_id: string | null;
  reason: string | null;
  note: string | null;
  created_at: string;
}
