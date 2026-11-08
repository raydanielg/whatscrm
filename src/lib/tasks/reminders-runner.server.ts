/**
 * Task due-date reminder runner. For every open task with a due_at, checks
 * each recipient's (assignee + creator) `task_reminder_settings.lead_minutes`
 * plus their overdue flag, and creates in-app notifications guarded by a
 * unique log row so each (task, user, kind, offset, due) fires exactly once.
 *
 * Server-only.
 */
import { sbAny } from "@/lib/supabase/untyped";
import { runProjectTaskReminders, runProjectDeadlineReminders } from "./project-reminders.server";
import { createTaskReminderEmailDelivery } from "./reminder-email.server";

export type RunResult = {
  tasks_scanned: number;
  project_tasks_scanned: number;
  notifications_created: number;
  emails_sent: number;
  emails_skipped: number;
  errors: string[];
};

const DEFAULT_LEAD = [1440, 60, 0];
const OVERDUE_SLOTS = [15, 60, 240, 1440]; // 15m, 1h, 4h, 1d after due

export async function runTaskReminders(opts: { now?: Date } = {}): Promise<RunResult> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const admin = supabaseAdmin as any;
  const now = opts.now ?? new Date();
  const result: RunResult = { tasks_scanned: 0, project_tasks_scanned: 0, notifications_created: 0, emails_sent: 0, emails_skipped: 0, errors: [] };
  const projectResult = await runProjectTaskReminders(admin, now);
  result.project_tasks_scanned = projectResult.tasks_scanned;
  result.notifications_created += projectResult.notifications_created;
  result.emails_sent += projectResult.emails_sent;
  result.emails_skipped += projectResult.emails_skipped;
  result.errors.push(...projectResult.errors);
  const projectDeadlines = await runProjectDeadlineReminders(admin, now);
  result.notifications_created += projectDeadlines.notifications_created;
  result.errors.push(...projectDeadlines.errors);

  // Settings allow reminders up to 14 days before due.
  const horizonAhead = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000 + 5 * 60 * 1000);
  const horizonBehind = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const { data: tasks, error: tErr } = await admin
    .from("tasks")
    .select("id, title, workspace_id, assigned_to, created_by, due_at, status")
    .not("due_at", "is", null)
    .is("deleted_at", null)
    .in("status", ["open", "in_progress"])
    .gte("due_at", horizonBehind.toISOString())
    .lte("due_at", horizonAhead.toISOString())
    .limit(2000);
  if (tErr) {
    result.errors.push(`tasks: ${tErr.message}`);
    return result;
  }

  const list = (tasks ?? []) as Array<{
    id: string;
    title: string;
    workspace_id: string;
    assigned_to: string | null;
    created_by: string | null;
    due_at: string;
    status: string;
  }>;
  if (!list.length) return result;

  const workspaceIds = [...new Set(list.map((task) => task.workspace_id))];
  const { data: workspaces, error: workspaceError } = await admin
    .from("workspaces").select("id, organization_id").in("id", workspaceIds);
  if (workspaceError) {
    result.errors.push(`workspaces: ${workspaceError.message}`);
    return result;
  }
  const organizationByWorkspace = new Map<string, string | null>(
    ((workspaces ?? []) as Array<{ id: string; organization_id: string | null }>).map((workspace) => [workspace.id, workspace.organization_id])
  );

  // Load all relevant users' settings in one shot
  const userIds = Array.from(
    new Set(list.flatMap((t) => [t.assigned_to, t.created_by]).filter((x): x is string => !!x))
  );
  if (!userIds.length) return result;
  const { data: members, error: membersError } = await admin.from("workspace_members")
    .select("workspace_id,user_id").in("workspace_id", workspaceIds).in("user_id", userIds).eq("status", "active");
  if (membersError) {
    result.errors.push(`task reminder members: ${membersError.message}`);
    return result;
  }
  const memberKeys = new Set(((members ?? []) as Array<{ workspace_id: string; user_id: string }>)
    .map((member) => `${member.workspace_id}/${member.user_id}`));
  const { data: settingsRows, error: settingsError } = await admin
    .from("task_reminder_settings")
    .select("*")
    .in("user_id", userIds);
  if (settingsError) {
    result.errors.push(`task reminder settings: ${settingsError.message}`);
    return result;
  }
  const settingsMap = new Map<string, {
    enabled: boolean; lead_minutes: number[]; notify_overdue: boolean;
    overdue_repeat_minutes: number; inapp_enabled: boolean; email_enabled: boolean;
  }>();
  for (const r of (settingsRows ?? []) as any[]) settingsMap.set(r.user_id, r);
  const emailDelivery = [...settingsMap.values()].some((setting) => setting.enabled && setting.email_enabled)
    ? await createTaskReminderEmailDelivery(admin, workspaceIds, userIds, result)
    : null;

  for (const t of list) {
    result.tasks_scanned++;
    const organizationId = organizationByWorkspace.get(t.workspace_id);
    if (!organizationId) {
      result.errors.push(`workspace ${t.workspace_id}: missing organization`);
      continue;
    }
    const dueMs = new Date(t.due_at).getTime();
    const deltaMin = Math.round((dueMs - now.getTime()) / 60000); // + = future, - = overdue
    const recipients = Array.from(new Set([t.assigned_to, t.created_by].filter((x): x is string => !!x)));

    for (const uid of recipients) {
      if (!memberKeys.has(`${t.workspace_id}/${uid}`)) continue;
      const s = settingsMap.get(uid) ?? {
        enabled: true,
        lead_minutes: DEFAULT_LEAD,
        notify_overdue: true,
        overdue_repeat_minutes: 0,
        inapp_enabled: true,
        email_enabled: false,
      };
      if (!s.enabled) continue;
      const fire = async (kind: "lead" | "due" | "overdue", offsetMinutes: number) => {
        if (s.inapp_enabled) await fireReminder(admin, t, organizationId, uid, kind, offsetMinutes, result);
        if (s.email_enabled && emailDelivery && kind !== "overdue") {
          await emailDelivery({ source: "crm", taskId: t.id, userId: uid, workspaceId: t.workspace_id,
            title: t.title, kind, offsetMinutes, dueKey: t.due_at });
        }
      };

      // Fire lead reminders: any lead offset whose window we've crossed
      // and haven't logged yet. Window = [offset - 5min, offset].
      if (deltaMin >= -5) {
        for (const off of s.lead_minutes) {
          if (!Number.isInteger(off) || off < 0 || off > 20160) continue;
          if (deltaMin <= off && deltaMin > off - 6) {
            await fire(off === 0 ? "due" : "lead", off);
          }
        }
      }

      // Overdue: fire once per configured slot (default 15/60/240/1440 min past due)
      if (s.notify_overdue && deltaMin < 0) {
        const overdueMin = -deltaMin;
        const slots = s.overdue_repeat_minutes > 0
          ? [s.overdue_repeat_minutes] // simple periodic bucket
          : OVERDUE_SLOTS;
        for (const slot of slots) {
          const bucket = s.overdue_repeat_minutes > 0
            ? Math.floor(overdueMin / slot) * slot
            : slot;
          if (overdueMin >= bucket && overdueMin < bucket + 6 && bucket > 0) {
            await fire("overdue", bucket);
          }
        }
      }
    }
  }

  return result;
}

async function fireReminder(
  admin: any,
  t: { id: string; title: string; due_at: string; workspace_id: string },
  organizationId: string,
  userId: string,
  kind: "lead" | "due" | "overdue",
  offsetMinutes: number,
  result: RunResult
) {
  const { error: logErr } = await sbAny(admin).from("task_reminder_log").insert({
    task_id: t.id,
    user_id: userId,
    kind,
    offset_minutes: offsetMinutes,
    due_at: t.due_at,
  });
  if (logErr) {
    if (logErr.code !== "23505") {
      result.errors.push(`log ${t.id}/${userId}/${kind}/${offsetMinutes}: ${logErr.message}`);
    }
    return; // already sent
  }

  const title =
    kind === "overdue"
      ? `Overdue: ${t.title}`
      : kind === "due"
      ? `Due now: ${t.title}`
      : `Upcoming task: ${t.title}`;
  const body =
    kind === "overdue"
      ? `This task is ${formatMinutes(offsetMinutes)} past its due date.`
      : kind === "due"
      ? `This task is due now.`
      : `Due in ${formatMinutes(offsetMinutes)}.`;

  const { error: nErr } = await sbAny(admin).from("notifications").insert({
    user_id: userId,
    organization_id: organizationId,
    channel: "in_app",
    status: "unread",
    title,
    body,
    action_url: `/tasks?taskId=${t.id}`,
    category: "task",
    data: { task_id: t.id, kind, offset_minutes: offsetMinutes, due_at: t.due_at },
  });
  if (nErr) {
    result.errors.push(`notify ${t.id}/${userId}: ${nErr.message}`);
    const { error: rollbackError } = await sbAny(admin).from("task_reminder_log").delete().match({
      task_id: t.id, user_id: userId, kind, offset_minutes: offsetMinutes, due_at: t.due_at,
    });
    if (rollbackError) result.errors.push(`log rollback ${t.id}/${userId}: ${rollbackError.message}`);
  } else {
    result.notifications_created++;
  }
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  if (m < 1440) {
    const h = Math.round(m / 60);
    return `${h} hour${h === 1 ? "" : "s"}`;
  }
  const d = Math.round(m / 1440);
  return `${d} day${d === 1 ? "" : "s"}`;
}
