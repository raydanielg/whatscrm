/** Send project task deadline notifications from the existing five-minute cron. */
import { sbAny, type UntypedClient } from "@/lib/supabase/untyped";
import { minutesUntilProjectDeadline, projectReminderEvents } from "./project-reminder-schedule";
import { createTaskReminderEmailDelivery } from "./reminder-email.server";

type Admin = UntypedClient;
type ProjectTask = { id: string; title: string; workspace_id: string; project_id: string; assignee_id: string | null; created_by: string | null; due_date: string; status: string };
type Project = { id: string; workspace_id: string; name: string; status: string; owner_id: string | null };
type Settings = { enabled: boolean; lead_minutes: number[]; notify_overdue: boolean; overdue_repeat_minutes: number; inapp_enabled: boolean; email_enabled: boolean };
export type ProjectReminderResult = { tasks_scanned: number; notifications_created: number; emails_sent: number; emails_skipped: number; errors: string[] };

const DEFAULTS: Settings = { enabled: true, lead_minutes: [1440, 60, 0], notify_overdue: true, overdue_repeat_minutes: 0, inapp_enabled: true, email_enabled: false };

export async function runProjectTaskReminders(admin: Admin, now: Date): Promise<ProjectReminderResult> {
  const result: ProjectReminderResult = { tasks_scanned: 0, notifications_created: 0, emails_sent: 0, emails_skipped: 0, errors: [] };
  const from = new Date(now.getTime() - 3 * 86_400_000).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 15 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await admin.from("pm_tasks")
    .select("id, title, workspace_id, project_id, assignee_id, created_by, due_date, status")
    .not("due_date", "is", null).neq("status", "done")
    .gte("due_date", from).lte("due_date", to).limit(2000);
  // The CRM cron must continue while the project-management migration is pending.
  if (error?.code === "42P01" || error?.code === "PGRST205") return result;
  if (error) { result.errors.push(`pm_tasks: ${error.message}`); return result; }
  const tasks = (data ?? []) as ProjectTask[];
  if (!tasks.length) return result;

  const projectIds = [...new Set(tasks.map((task) => task.project_id))];
  const workspaceIds = [...new Set(tasks.map((task) => task.workspace_id))];
  const userIds = [...new Set(tasks.flatMap((task) => [task.assignee_id, task.created_by]).filter((id): id is string => !!id))];
  if (!userIds.length) return result;
  const [projectsRes, membersRes, activeMembersRes, workspacesRes, settingsRes] = await Promise.all([
    admin.from("pm_projects").select("id, workspace_id, name, status, owner_id").in("id", projectIds),
    admin.from("pm_project_members").select("workspace_id, project_id, user_id").in("project_id", projectIds),
    admin.from("workspace_members").select("workspace_id,user_id").in("workspace_id", workspaceIds).in("user_id", userIds).eq("status", "active"),
    admin.from("workspaces").select("id, organization_id").in("id", workspaceIds),
    admin.from("task_reminder_settings").select("*").in("user_id", userIds),
  ]);
  for (const [name, response] of [["pm_projects", projectsRes], ["pm_project_members", membersRes], ["workspace_members", activeMembersRes], ["workspaces", workspacesRes], ["task_reminder_settings", settingsRes]] as const) {
    if (response.error) result.errors.push(`${name}: ${response.error.message}`);
  }
  if (result.errors.length) return result;

  const projects = new Map<string, Project>(((projectsRes.data ?? []) as Project[]).map((project) => [project.id, project]));
  const memberKeys = new Set<string>(((membersRes.data ?? []) as Array<{ workspace_id: string; project_id: string; user_id: string }>).map((member) => `${member.workspace_id}/${member.project_id}/${member.user_id}`));
  const activeMemberKeys = new Set<string>(((activeMembersRes.data ?? []) as Array<{ workspace_id: string; user_id: string }>).map((member) => `${member.workspace_id}/${member.user_id}`));
  const workspaceMap = new Map<string, string | null>(((workspacesRes.data ?? []) as Array<{ id: string; organization_id: string | null }>).map((workspace) => [workspace.id, workspace.organization_id]));
  const settings = new Map<string, Settings>(((settingsRes.data ?? []) as Array<Settings & { user_id: string }>).map((row) => [row.user_id, row]));
  const emailDelivery = [...settings.values()].some((setting) => setting.enabled && setting.email_enabled)
    ? await createTaskReminderEmailDelivery(admin, workspaceIds, userIds, result)
    : null;
  const orgIds = [...new Set([...workspaceMap.values()].filter((id): id is string => !!id))];
  const { data: orgs, error: orgError } = orgIds.length
    ? await admin.from("organizations").select("id, timezone").in("id", orgIds)
    : { data: [], error: null };
  if (orgError) { result.errors.push(`organizations: ${orgError.message}`); return result; }
  const timezones = new Map<string, string>(((orgs ?? []) as Array<{ id: string; timezone: string | null }>).map((org) => [org.id, org.timezone || "UTC"]));

  for (const task of tasks) {
    const project = projects.get(task.project_id);
    if (!project || project.workspace_id !== task.workspace_id || project.status === "archived" || project.status === "completed") continue;
    result.tasks_scanned++;
    const organizationId = workspaceMap.get(task.workspace_id);
    if (!organizationId) { result.errors.push(`workspace ${task.workspace_id}: missing organization`); continue; }
    const delta = minutesUntilProjectDeadline(now, task.due_date, timezones.get(organizationId) ?? "UTC");
    const recipients = [...new Set([task.assignee_id, task.created_by].filter((id): id is string => !!id))];
    for (const userId of recipients) {
      // A former project member must never receive the project's details.
      if (!memberKeys.has(`${task.workspace_id}/${task.project_id}/${userId}`) || !activeMemberKeys.has(`${task.workspace_id}/${userId}`)) continue;
      const preference = settings.get(userId) ?? DEFAULTS;
      if (!preference.enabled) continue;
      for (const event of projectReminderEvents(delta, preference)) {
        if (preference.inapp_enabled) {
          await fireProjectReminder(admin, task, project, organizationId, userId, event.kind, event.offsetMinutes, result);
        }
        if (preference.email_enabled && emailDelivery && event.kind !== "overdue") {
          await emailDelivery({ source: "project", taskId: task.id, userId, workspaceId: task.workspace_id,
            title: task.title, kind: event.kind, offsetMinutes: event.offsetMinutes, dueKey: task.due_date });
        }
      }
    }
  }
  return result;
}

async function fireProjectReminder(admin: Admin, task: ProjectTask, project: Project, organizationId: string, userId: string, kind: "lead" | "due" | "overdue", offsetMinutes: number, result: ProjectReminderResult) {
  const key = { pm_task_id: task.id, user_id: userId, kind, offset_minutes: offsetMinutes, due_date: task.due_date };
  const { error: logError } = await sbAny(admin).from("pm_task_reminder_log").insert(key);
  if (logError) {
    if (logError.code !== "23505") result.errors.push(`project log ${task.id}/${userId}: ${logError.message}`);
    return;
  }
  const { error } = await sbAny(admin).from("notifications").insert({
    user_id: userId, organization_id: organizationId, channel: "in_app", status: "unread",
    title: kind === "overdue" ? `Overdue project task: ${task.title}` : kind === "due" ? `Project task due today: ${task.title}` : `Upcoming project task: ${task.title}`,
    body: `${project.name} · Due ${task.due_date}`,
    action_url: `/projects/${project.id}?taskId=${task.id}`,
    category: "task",
    data: { project_id: project.id, pm_task_id: task.id, kind, offset_minutes: offsetMinutes, due_date: task.due_date },
  });
  if (error) {
    result.errors.push(`project notify ${task.id}/${userId}: ${error.message}`);
    // Restore retry eligibility if notification delivery failed.
    const { error: rollbackError } = await sbAny(admin).from("pm_task_reminder_log")
      .delete().match(key);
    if (rollbackError) result.errors.push(`project log rollback ${task.id}/${userId}: ${rollbackError.message}`);
  } else {
    result.notifications_created++;
  }
}

/** Project deadlines are separate from individual project-task deadlines. */
export async function runProjectDeadlineReminders(admin: Admin, now: Date): Promise<{ notifications_created: number; errors: string[] }> {
  const result = { notifications_created: 0, errors: [] as string[] };
  const from = new Date(now.getTime() - 2 * 86_400_000).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 8 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await admin.from("pm_projects")
    .select("id, workspace_id, name, due_date, status")
    .not("due_date", "is", null).in("status", ["planning", "active", "on_hold"])
    .gte("due_date", from).lte("due_date", to).limit(2000);
  if (error) { result.errors.push(`project deadlines: ${error.message}`); return result; }
  const projects = (data ?? []) as Array<{ id: string; workspace_id: string; name: string; due_date: string; status: string }>;
  if (!projects.length) return result;
  const projectIds = projects.map((project) => project.id);
  const workspaceIds = [...new Set(projects.map((project) => project.workspace_id))];
  const [membersRes, workspacesRes] = await Promise.all([
    admin.from("pm_project_members").select("project_id, workspace_id, user_id").in("project_id", projectIds),
    admin.from("workspaces").select("id, organization_id").in("id", workspaceIds),
  ]);
  if (membersRes.error || workspacesRes.error) {
    result.errors.push(membersRes.error?.message ?? workspacesRes.error!.message);
    return result;
  }
  const members = (membersRes.data ?? []) as Array<{ project_id: string; workspace_id: string; user_id: string }>;
  if (!members.length) return result;
  const userIds = [...new Set(members.map((member) => member.user_id))];
  const [activeRes, settingsRes] = await Promise.all([
    admin.from("workspace_members").select("workspace_id,user_id").in("workspace_id", workspaceIds).in("user_id", userIds).eq("status", "active"),
    admin.from("task_reminder_settings").select("user_id,enabled,inapp_enabled").in("user_id", userIds),
  ]);
  if (activeRes.error || settingsRes.error) {
    result.errors.push(activeRes.error?.message ?? settingsRes.error!.message);
    return result;
  }
  const active = new Set(((activeRes.data ?? []) as Array<{ workspace_id: string; user_id: string }>).map((row) => `${row.workspace_id}/${row.user_id}`));
  const settings = new Map(((settingsRes.data ?? []) as Array<{ user_id: string; enabled: boolean; inapp_enabled: boolean }>).map((row) => [row.user_id, row]));
  const orgByWorkspace = new Map(((workspacesRes.data ?? []) as Array<{ id: string; organization_id: string | null }>).map((row) => [row.id, row.organization_id]));
  const orgIds = [...new Set([...orgByWorkspace.values()].filter((id): id is string => !!id))];
  const { data: organizations, error: orgError } = orgIds.length
    ? await admin.from("organizations").select("id,timezone").in("id", orgIds)
    : { data: [], error: null };
  if (orgError) { result.errors.push(orgError.message); return result; }
  const timezoneByOrg = new Map(((organizations ?? []) as Array<{ id: string; timezone: string | null }>).map((row) => [row.id, row.timezone || "UTC"]));

  for (const project of projects) {
    const orgId = orgByWorkspace.get(project.workspace_id);
    if (!orgId) continue;
    const delta = minutesUntilProjectDeadline(now, project.due_date, timezoneByOrg.get(orgId) ?? "UTC");
    const slot = ([
      { kind: "week", offset: 10080 },
      { kind: "day", offset: 1440 },
      { kind: "due", offset: 0 },
      { kind: "overdue", offset: -1440 },
    ] as const).find(({ offset }) => delta <= offset && delta > offset - 6);
    if (!slot) continue;
    for (const member of members.filter((row) => row.project_id === project.id)) {
      if (!active.has(`${project.workspace_id}/${member.user_id}`)) continue;
      const setting = settings.get(member.user_id);
      if (setting && (!setting.enabled || !setting.inapp_enabled)) continue;
      const key = { project_id: project.id, user_id: member.user_id, kind: slot.kind, due_date: project.due_date };
      const { error: logError } = await sbAny(admin).from("pm_project_reminder_log").insert(key);
      if (logError) {
        if (logError.code !== "23505") result.errors.push(`project deadline log ${project.id}: ${logError.message}`);
        continue;
      }
      const { error: notifyError } = await sbAny(admin).from("notifications").insert({
        user_id: member.user_id, organization_id: orgId, channel: "in_app", status: "unread",
        title: slot.kind === "overdue" ? `Project overdue: ${project.name}` : `Project deadline: ${project.name}`,
        body: slot.kind === "week" ? "Due in one week." : slot.kind === "day" ? "Due tomorrow." : slot.kind === "due" ? "Due today." : "Overdue by one day.",
        category: "workspace", action_url: `/projects/${project.id}`,
        data: { project_id: project.id, workspace_id: project.workspace_id, kind: slot.kind, due_date: project.due_date },
      });
      if (notifyError) {
        result.errors.push(`project deadline notify ${project.id}: ${notifyError.message}`);
        await sbAny(admin).from("pm_project_reminder_log").delete().match(key);
      } else result.notifications_created++;
    }
  }
  return result;
}
