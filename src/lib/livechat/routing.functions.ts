/**
 * Intelligent routing management server functions:
 *
 *   - listAgentPresence: workspace agents with presence, load, skills, and languages
 *   - setMyPresence: current user updates own presence, status message, skills, languages, departments
 *   - listQueue: waiting conversations in the handoff queue
 *   - claimFromQueue: agent claims a queued conversation (with authorization check)
 *   - transferConversation: hand a conversation to another agent or department
 *   - supervisorOverride: privileged reassignment by workspace admin/owner,
 *     bypasses standard assignment; audited in `conversation_transfers`
 *   - previewRouting: dry-run the routing engine for a hypothetical visitor
 *
 * Auth: `requireSupabaseAuth` scopes queries through RLS. Supervisor
 * override additionally verifies the caller has the `admin` role via
 * `has_role` before reassigning.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

const WorkspaceInput = z.object({ workspaceId: z.string().uuid() });

export const listAgentPresence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => WorkspaceInput.parse(v))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("agent_availability")
      .select(
        "user_id, presence, status_message, skills, departments, languages, max_concurrent, current_load, last_active_at, last_assigned_at",
      )
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);

    const ids = ((rows ?? []) as { user_id: string }[]).map((r) => r.user_id);
    if (!ids.length) return [];
    const { data: profiles } = await context.supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url")
      .in("id", ids);
    const map = new Map(
      ((profiles ?? []) as { id: string; full_name: string | null; email: string | null; avatar_url: string | null }[]).map(
        (p) => [p.id, p],
      ),
    );
    return ((rows ?? []) as Array<Record<string, unknown>>).map((r) => {
      const p = map.get(r.user_id as string);
      return {
        ...r,
        display_name: p?.full_name ?? p?.email ?? "Agent",
        avatar_url: p?.avatar_url ?? null,
      };
    });
  });

const PresenceInput = z.object({
  workspaceId: z.string().uuid(),
  presence: z.enum(["online", "away", "busy", "offline"]).optional(),
  statusMessage: z.string().max(140).nullable().optional(),
  skills: z.array(z.string().min(1).max(40)).max(30).optional(),
  languages: z.array(z.string().min(2).max(10)).max(15).optional(),
  departments: z.array(z.string().uuid()).max(20).optional(),
  maxConcurrent: z.number().int().min(1).max(50).optional(),
});

export const setMyPresence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => PresenceInput.parse(v))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {
      last_active_at: new Date().toISOString(),
    };
    if (data.presence !== undefined) patch.presence = data.presence;
    if (data.statusMessage !== undefined) patch.status_message = data.statusMessage;
    if (data.skills !== undefined) patch.skills = data.skills;
    if (data.languages !== undefined) patch.languages = data.languages;
    if (data.departments !== undefined) patch.departments = data.departments;
    if (data.maxConcurrent !== undefined) patch.max_concurrent = data.maxConcurrent;

    const { error } = await context.supabase
      .from("agent_availability")
      .upsert(
        {
          workspace_id: data.workspaceId,
          user_id: context.userId,
          ...patch,
        } as never,
        { onConflict: "workspace_id,user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => WorkspaceInput.parse(v))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("handoff_queue")
      .select(
        "id, conversation_id, target_department_id, target_user_id, priority, required_skills, reason, status, entered_at, assigned_to, assigned_at",
      )
      .eq("workspace_id", data.workspaceId)
      .in("status", ["waiting", "assigned"])
      .order("entered_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const claimFromQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({ workspaceId: z.string().uuid(), queueId: z.string().uuid() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    // Conditional update to prevent double-claim; RLS already scopes to workspace.
    const { data: updated, error } = await context.supabase
      .from("handoff_queue")
      .update({
        status: "assigned",
        assigned_to: context.userId,
        assigned_at: new Date().toISOString(),
      } as never)
      .eq("id", data.queueId)
      .eq("workspace_id", data.workspaceId)
      .eq("status", "waiting")
      .select("id, conversation_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Already claimed");

    // Persist assignment on the conversation.
    const row = updated as { id: string; conversation_id: string };
    await context.supabase
      .from("conversation_assignments")
      .update({ is_current: false, unassigned_at: new Date().toISOString() } as never)
      .eq("conversation_id", row.conversation_id)
      .eq("is_current", true);
    await sbAny(context.supabase).from("conversation_assignments").insert({
      workspace_id: data.workspaceId,
      conversation_id: row.conversation_id,
      assigned_to: context.userId,
      assigned_by: context.userId,
      reason: "claimed_from_queue",
      is_current: true,
    } as never);
    return { conversationId: row.conversation_id };
  });

const TransferInput = z.object({
  workspaceId: z.string().uuid(),
  conversationId: z.string().uuid(),
  toUserId: z.string().uuid().nullable().optional(),
  toDepartmentId: z.string().uuid().nullable().optional(),
  note: z.string().max(500).optional(),
  reason: z.string().max(140).optional(),
});

export const transferConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => TransferInput.parse(v))
  .handler(async ({ data, context }) => {
    if (!data.toUserId && !data.toDepartmentId) {
      throw new Error("Provide a target agent or department");
    }
    // Read current assignee for audit.
    const { data: current } = await context.supabase
      .from("conversation_assignments")
      .select("assigned_to")
      .eq("conversation_id", data.conversationId)
      .eq("is_current", true)
      .maybeSingle();
    const fromUserId = (current as { assigned_to?: string | null } | null)?.assigned_to ?? null;

    // Close current and create new assignment (if agent target).
    await context.supabase
      .from("conversation_assignments")
      .update({ is_current: false, unassigned_at: new Date().toISOString() } as never)
      .eq("conversation_id", data.conversationId)
      .eq("is_current", true);

    if (data.toUserId) {
      const { error } = await sbAny(context.supabase).from("conversation_assignments").insert({
        workspace_id: data.workspaceId,
        conversation_id: data.conversationId,
        assigned_to: data.toUserId,
        assigned_by: context.userId,
        assigned_team_id: data.toDepartmentId ?? null,
        reason: data.reason ?? "transfer",
        is_current: true,
      } as never);
      if (error) throw new Error(error.message);
    } else if (data.toDepartmentId) {
      // Department transfer without a specific agent → back into the queue.
      await sbAny(context.supabase).from("handoff_queue").insert({
        workspace_id: data.workspaceId,
        conversation_id: data.conversationId,
        target_department_id: data.toDepartmentId,
        requested_by: context.userId,
        reason: data.reason ?? "department_transfer",
        status: "waiting",
      } as never);
    }

    const { error: tErr } = await sbAny(context.supabase).from("conversation_transfers").insert({
      workspace_id: data.workspaceId,
      conversation_id: data.conversationId,
      from_user_id: fromUserId,
      to_user_id: data.toUserId ?? null,
      to_department_id: data.toDepartmentId ?? null,
      transfer_type: "transfer",
      reason: data.reason ?? null,
      note: data.note ?? null,
      performed_by: context.userId,
    } as never);
    if (tErr) throw new Error(tErr.message);

    return { ok: true };
  });

export const supervisorOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => TransferInput.parse(v))
  .handler(async ({ data, context }) => {
    // Verify caller is an owner/admin/manager in this workspace.
    const { data: isAdmin } = await sbAny(context.supabase).rpc("has_workspace_role", {
      _user_id: context.userId,
      _workspace_id: data.workspaceId,
      _roles: ["owner", "admin", "manager"],
    });
    if (!isAdmin) throw new Error("Forbidden — admin only");
    if (!data.toUserId) throw new Error("Supervisor override requires target agent");

    await context.supabase
      .from("conversation_assignments")
      .update({ is_current: false, unassigned_at: new Date().toISOString() } as never)
      .eq("conversation_id", data.conversationId)
      .eq("is_current", true);

    const { error } = await sbAny(context.supabase).from("conversation_assignments").insert({
      workspace_id: data.workspaceId,
      conversation_id: data.conversationId,
      assigned_to: data.toUserId,
      assigned_by: context.userId,
      reason: data.reason ?? "supervisor_override",
      is_current: true,
    } as never);
    if (error) throw new Error(error.message);

    await sbAny(context.supabase).from("conversation_transfers").insert({
      workspace_id: data.workspaceId,
      conversation_id: data.conversationId,
      to_user_id: data.toUserId,
      transfer_type: "supervisor_override",
      reason: data.reason ?? "supervisor_override",
      note: data.note ?? null,
      performed_by: context.userId,
    } as never);
    return { ok: true };
  });

const PreviewInput = z.object({
  workspaceId: z.string().uuid(),
  page: z.string().optional(),
  message: z.string().optional(),
  country: z.string().optional(),
  language: z.string().optional(),
  isVip: z.boolean().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
});

export const previewRouting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => PreviewInput.parse(v))
  .handler(async ({ data, context }) => {
    const { decideRouting } = await import("./routing-engine.server");
    const decision = await decideRouting({
      workspaceId: data.workspaceId,
      page: data.page ?? null,
      message: data.message ?? null,
      country: data.country ?? null,
      language: data.language ?? null,
      visitorIsVip: data.isVip ?? false,
      visitorPriority: data.priority ?? "normal",
    });

    // Resolve human-readable labels so the simulator never shows raw UUIDs.
    const [rule, agent, department] = await Promise.all([
      decision.ruleId
        ? context.supabase
            .from("livechat_routing_rules")
            .select("name")
            .eq("id", decision.ruleId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      decision.agentId
        ? context.supabase
            .from("profiles")
            .select("full_name, email")
            .eq("id", decision.agentId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      decision.departmentId
        ? context.supabase
            .from("departments")
            .select("name")
            .eq("id", decision.departmentId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const r = (rule as { data: { name?: string | null } | null }).data;
    const a = (agent as { data: { full_name?: string | null; email?: string | null } | null }).data;
    const d = (department as { data: { name?: string | null } | null }).data;

    return {
      ...decision,
      ruleName: r?.name ?? null,
      agentName: a?.full_name ?? a?.email ?? null,
      departmentName: d?.name ?? null,
      simulatedAt: new Date().toISOString(),
    };
  });
