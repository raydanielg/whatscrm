/**
 * SLA Engine — policies, escalation rules, business hours, holidays,
 * breach detection, countdown timers, dashboard & reports.
 * Emits sla_events which the Workflow Automation trigger listens to.
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

/* ------------------------- POLICIES ------------------------- */
export const listSlaPolicies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const wsId = await getWorkspaceId(sbAny(context.supabase), context.userId);
    const { data } = await sbAny(context.supabase)
      .from("sla_policies")
      .select("*, escalation_rules:sla_escalation_rules(*)")
      .eq("workspace_id", wsId)
      .order("priority_rank", { ascending: false });
    return data ?? [];
  });

export const upsertSlaPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1),
        description: z.string().optional().nullable(),
        inbox_ids: z.array(z.string().uuid()).optional(),
        priorities: z.array(z.string()).optional(),
        first_response_minutes: z.number().int().min(0),
        response_minutes: z.number().int().min(0).optional(),
        resolution_minutes: z.number().int().min(0),
        business_hours_only: z.boolean().optional(),
        priority_rank: z.number().int().optional(),
        is_active: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const wsId = await getWorkspaceId(sbAny(context.supabase), context.userId);
    const { data: row, error } = await (sbAny(context.supabase) as any)
      .from("sla_policies")
      .upsert({ ...data, workspace_id: wsId, created_by: context.userId })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteSlaPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase).from("sla_policies").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ------------------------- ESCALATION RULES ------------------------- */
export const upsertEscalationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        sla_policy_id: z.string().uuid(),
        level: z.number().int().min(1),
        name: z.string().min(1),
        trigger_type: z.enum([
          "response_warning",
          "response_breach",
          "resolution_warning",
          "resolution_breach",
        ]),
        minutes_offset: z.number().int(),
        notify_supervisor: z.boolean().optional(),
        supervisor_user_ids: z.array(z.string().uuid()).optional(),
        reassign_to_user_id: z.string().uuid().nullable().optional(),
        reassign_to_department_id: z.string().uuid().nullable().optional(),
        raise_priority: z.boolean().optional(),
        workflow_event: z.string().optional().nullable(),
        is_active: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const wsId = await getWorkspaceId(sbAny(context.supabase), context.userId);
    const { data: row, error } = await (sbAny(context.supabase) as any)
      .from("sla_escalation_rules")
      .upsert({ ...data, workspace_id: wsId })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteEscalationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase)
      .from("sla_escalation_rules")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ------------------------- BUSINESS HOURS + HOLIDAYS ------------------------- */
export const getBusinessHours = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const wsId = await getWorkspaceId(sbAny(context.supabase), context.userId);
    const { data } = await sbAny(context.supabase)
      .from("business_hours")
      .select("*")
      .eq("workspace_id", wsId)
      .maybeSingle();
    return (
      data ?? {
        workspace_id: wsId,
        timezone: "UTC",
        weekly_schedule: {
          mon: { open: "09:00", close: "17:00", enabled: true },
          tue: { open: "09:00", close: "17:00", enabled: true },
          wed: { open: "09:00", close: "17:00", enabled: true },
          thu: { open: "09:00", close: "17:00", enabled: true },
          fri: { open: "09:00", close: "17:00", enabled: true },
          sat: { open: "09:00", close: "17:00", enabled: false },
          sun: { open: "09:00", close: "17:00", enabled: false },
        },
        holidays: [],
        offline_message: "",
      }
    );
  });

export const saveBusinessHours = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        timezone: z.string(),
        weekly_schedule: z.record(z.string(), z.any()),
        offline_message: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const wsId = await getWorkspaceId(sbAny(context.supabase), context.userId);
    const { error } = await (sbAny(context.supabase) as any)
      .from("business_hours")
      .upsert({ ...data, workspace_id: wsId, updated_by: context.userId });
    if (error) throw error;
    return { ok: true };
  });

export const listHolidays = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const wsId = await getWorkspaceId(sbAny(context.supabase), context.userId);
    const { data } = await sbAny(context.supabase)
      .from("sla_holidays")
      .select("*")
      .eq("workspace_id", wsId)
      .order("holiday_date", { ascending: true });
    return data ?? [];
  });

export const addHoliday = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        name: z.string().min(1),
        holiday_date: z.string(),
        recurring_yearly: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const wsId = await getWorkspaceId(sbAny(context.supabase), context.userId);
    const { error } = await (sbAny(context.supabase) as any)
      .from("sla_holidays")
      .insert({ ...data, workspace_id: wsId });
    if (error) throw error;
    return { ok: true };
  });

export const removeHoliday = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase).from("sla_holidays").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ------------------------- DASHBOARD & REPORTS ------------------------- */
export const slaDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const wsId = await getWorkspaceId(sbAny(context.supabase), context.userId);
    const { data: rows } = await sbAny(context.supabase)
      .from("ticket_sla_tracking")
      .select(
        "*, ticket:conversations(id, ticket_number, subject, priority, status, assigned_to)",
      )
      .eq("workspace_id", wsId);
    const now = Date.now();
    const list = (rows ?? []) as any[];
    let onTrack = 0, atRisk = 0, breached = 0, resolved = 0;
    for (const r of list) {
      if (r.ticket?.status === "resolved" || r.ticket?.status === "closed") {
        resolved++;
        continue;
      }
      const due = r.resolution_due_at ? new Date(r.resolution_due_at).getTime() : null;
      if (r.resolution_breached) breached++;
      else if (due && due - now < 30 * 60_000) atRisk++;
      else onTrack++;
    }
    const complianceRate = list.length > 0 ? ((list.length - breached) / list.length) * 100 : 100;
    return {
      total: list.length,
      onTrack,
      atRisk,
      breached,
      resolved,
      complianceRate,
      rows: list.slice(0, 200),
    };
  });

export const slaEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const wsId = await getWorkspaceId(sbAny(context.supabase), context.userId);
    const { data } = await sbAny(context.supabase)
      .from("sla_events")
      .select("*, ticket:conversations(ticket_number, subject)")
      .eq("workspace_id", wsId)
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });

export const slaReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ days: z.number().int().default(30) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const wsId = await getWorkspaceId(sbAny(context.supabase), context.userId);
    const since = new Date(Date.now() - data.days * 86400_000).toISOString();
    const { data: events } = await sbAny(context.supabase)
      .from("sla_events")
      .select("event_type, created_at, level")
      .eq("workspace_id", wsId)
      .gte("created_at", since);
    const buckets = new Map<string, { day: string; breach: number; warning: number; escalated: number }>();
    for (const ev of (events ?? []) as any[]) {
      const day = ev.created_at.slice(0, 10);
      const b = buckets.get(day) ?? { day, breach: 0, warning: 0, escalated: 0 };
      if (ev.event_type === "breach") b.breach++;
      else if (ev.event_type === "warning") b.warning++;
      else if (ev.event_type === "escalated") b.escalated++;
      buckets.set(day, b);
    }
    return Array.from(buckets.values()).sort((a, b) => a.day.localeCompare(b.day));
  });

/* ------------------------- SCANNER (called by pg_cron) ------------------------- */
type Rule = {
  id: string;
  level: number;
  name: string;
  trigger_type: string;
  minutes_offset: number;
  notify_supervisor?: boolean;
  supervisor_user_ids?: string[];
  reassign_to_user_id?: string | null;
  reassign_to_department_id?: string | null;
  raise_priority?: boolean;
  workflow_event?: string | null;
  is_active?: boolean;
  workspace_id: string;
  sla_policy_id: string;
};

export async function scanBreaches(admin: any): Promise<{ scanned: number; events: number }> {
  const now = Date.now();
  const WARN_MS = 30 * 60_000;
  let events = 0;

  const { data: tracks } = await admin
    .from("ticket_sla_tracking")
    .select("*, ticket:conversations(id, workspace_id, assigned_to, priority, status, department_id)")
    .eq("paused", false);
  const list = (tracks ?? []) as any[];
  const active = list.filter((t) => t.ticket && t.ticket.status !== "resolved" && t.ticket.status !== "closed");
  if (active.length === 0) return { scanned: 0, events: 0 };

  const policyIds = Array.from(new Set(active.map((t) => t.sla_policy_id).filter(Boolean)));
  const { data: rulesData } = await admin
    .from("sla_escalation_rules")
    .select("*")
    .in("sla_policy_id", policyIds.length ? policyIds : ["00000000-0000-0000-0000-000000000000"])
    .eq("is_active", true);
  const rulesByPolicy = new Map<string, Rule[]>();
  for (const r of (rulesData ?? []) as Rule[]) {
    const arr = rulesByPolicy.get(r.sla_policy_id) ?? [];
    arr.push(r);
    rulesByPolicy.set(r.sla_policy_id, arr);
  }

  for (const t of active) {
    const wsId = t.workspace_id;
    const ticketId = t.ticket_id;
    const patch: Record<string, any> = {};

    // First-response warning/breach
    if (t.first_response_due_at && !t.first_response_breached) {
      const due = new Date(t.first_response_due_at).getTime();
      if (now >= due) {
        patch.first_response_breached = true;
        await sbAny(admin).from("sla_events").insert({
          workspace_id: wsId, ticket_id: ticketId, sla_policy_id: t.sla_policy_id,
          event_type: "breach", target: "response",
        });
        events++;
      } else if (!t.response_warning_sent && due - now <= WARN_MS) {
        patch.response_warning_sent = true;
        await sbAny(admin).from("sla_events").insert({
          workspace_id: wsId, ticket_id: ticketId, sla_policy_id: t.sla_policy_id,
          event_type: "warning", target: "response",
        });
        events++;
      }
    }

    // Resolution warning/breach
    if (t.resolution_due_at && !t.resolution_breached) {
      const due = new Date(t.resolution_due_at).getTime();
      if (now >= due) {
        patch.resolution_breached = true;
        await sbAny(admin).from("sla_events").insert({
          workspace_id: wsId, ticket_id: ticketId, sla_policy_id: t.sla_policy_id,
          event_type: "breach", target: "resolution",
        });
        events++;
      } else if (!t.resolution_warning_sent && due - now <= WARN_MS) {
        patch.resolution_warning_sent = true;
        await sbAny(admin).from("sla_events").insert({
          workspace_id: wsId, ticket_id: ticketId, sla_policy_id: t.sla_policy_id,
          event_type: "warning", target: "resolution",
        });
        events++;
      }
    }

    // Escalation rules
    const rules = rulesByPolicy.get(t.sla_policy_id ?? "") ?? [];
    for (const rule of rules) {
      if ((t.last_escalation_level ?? 0) >= rule.level) continue;
      const isResp = rule.trigger_type.startsWith("response");
      const isWarn = rule.trigger_type.endsWith("warning");
      const base = isResp ? t.first_response_due_at : t.resolution_due_at;
      if (!base) continue;
      const trigger = new Date(base).getTime() + rule.minutes_offset * 60_000;
      if (now < trigger) continue;
      // For warning rules only when no breach yet
      if (isWarn && (isResp ? t.first_response_breached : t.resolution_breached)) continue;

      patch.last_escalation_level = rule.level;
      const meta: any = { level: rule.level };

      // Insert escalation row
      await sbAny(admin).from("ticket_escalations").insert({
        workspace_id: wsId, ticket_id: ticketId, level: rule.level,
        reason: rule.trigger_type, escalated_from: t.ticket?.assigned_to ?? null,
        escalated_to: rule.reassign_to_user_id ?? null, auto: true,
      });

      // Reassign
      if (rule.reassign_to_user_id) {
        await sbAny(admin).from("conversations").update({ assigned_to: rule.reassign_to_user_id, escalation_level: rule.level })
          .eq("id", ticketId);
        meta.reassigned_to = rule.reassign_to_user_id;
      } else if (rule.reassign_to_department_id) {
        await sbAny(admin).from("conversations").update({ department_id: rule.reassign_to_department_id, escalation_level: rule.level })
          .eq("id", ticketId);
        meta.reassigned_dept = rule.reassign_to_department_id;
      } else {
        await sbAny(admin).from("conversations").update({ escalation_level: rule.level }).eq("id", ticketId);
      }

      // Supervisor notifications
      if (rule.notify_supervisor && (rule.supervisor_user_ids ?? []).length > 0) {
        const [{ data: workspace }, { data: supervisors }] = await Promise.all([
          admin.from("workspaces").select("organization_id").eq("id", wsId).maybeSingle(),
          admin.from("workspace_members").select("user_id").eq("workspace_id", wsId)
            .eq("status", "active").in("user_id", rule.supervisor_user_ids),
        ]);
        if (workspace?.organization_id && supervisors?.length) {
          const rows = supervisors.map((member: { user_id: string }) => ({
            user_id: member.user_id,
            organization_id: workspace.organization_id,
            channel: "in_app",
            status: "unread",
            category: "communication",
            title: `SLA escalation L${rule.level}`,
            body: rule.name,
            action_url: `/helpdesk/${ticketId}`,
            data: { ticket_id: ticketId, workspace_id: wsId, level: rule.level },
          }));
          const { error: notificationError } = await sbAny(admin).from("notifications").insert(rows);
          if (notificationError) console.warn("[helpdesk] SLA notification failed:", notificationError);
        }
      }

      await sbAny(admin).from("sla_events").insert({
        workspace_id: wsId, ticket_id: ticketId, sla_policy_id: t.sla_policy_id,
        escalation_rule_id: rule.id, event_type: "escalated", level: rule.level, meta,
      });
      events++;

      // Workflow event bridge — insert a workflow_queue row when configured
      if (rule.workflow_event) {
        await sbAny(admin).from("workflow_queue").insert({
          workspace_id: wsId, trigger_type: "sla_event",
          trigger_data: { event: rule.workflow_event, ticket_id: ticketId, level: rule.level },
          status: "pending",
        }).then(() => {}, () => {});
      }
    }

    if (Object.keys(patch).length > 0) {
      await sbAny(admin).from("ticket_sla_tracking").update(patch).eq("id", t.id);
    }
  }
  return { scanned: active.length, events };
}
