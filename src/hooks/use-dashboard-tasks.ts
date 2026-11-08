import { useQuery } from "@tanstack/react-query";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useTenantTimezone } from "@/hooks/use-timezone";
import { supabase } from "@/integrations/supabase/client";
import { sbAny } from "@/lib/supabase/untyped";
import { compareDashboardTasks, dateKeyInTimezone } from "@/lib/tasks/dashboard-task-dates";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const from = (table: string) => sbAny(supabase).from(table as any) as any;

export type DashboardTaskItem = {
  id: string;
  title: string;
  status: string;
  priority: string;
  source: "CRM" | "Project";
  to: "/tasks" | "/projects/tasks";
  dueAt: string | null;
  dueDate: string | null;
  projectId: string | null;
};

export type DashboardTaskSummary = {
  upcomingCount: number;
  overdueCount: number;
  crmUpcomingCount: number;
  projectUpcomingCount: number;
  crmOverdueCount: number;
  projectOverdueCount: number;
  items: DashboardTaskItem[];
};

type CrmRow = Pick<DashboardTaskItem, "id" | "title" | "status" | "priority"> & { due_at: string };
type ProjectRow = Pick<DashboardTaskItem, "id" | "title" | "status" | "priority"> & {
  due_date: string;
  project_id: string;
};

/** Exact counts and eight nearest deadlines across both task systems. */
export function useDashboardTasks() {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  const timezone = useTenantTimezone();

  return useQuery<DashboardTaskSummary>({
    queryKey: ["dash", "task-summary", workspaceId, timezone],
    enabled: !!workspaceId,
    refetchInterval: 60_000, // Reclassify deadlines and catch cross-device PM edits (pm_tasks is not in Realtime).
    queryFn: async () => {
      const now = new Date();
      const today = dateKeyInTimezone(now, timezone);
      const nowIso = now.toISOString();
      const [crmUpcoming, projectUpcoming, crmOverdue, projectOverdue] = await Promise.all([
        from("tasks")
          .select("id,title,status,priority,due_at", { count: "exact" })
          .eq("workspace_id", workspaceId)
          .is("deleted_at", null)
          .in("status", ["open", "in_progress"])
          .gte("due_at", nowIso)
          .order("due_at", { ascending: true })
          .limit(8),
        from("pm_tasks")
          .select("id,title,status,priority,due_date,project_id", { count: "exact" })
          .eq("workspace_id", workspaceId)
          .in("status", ["backlog", "todo", "in_progress", "review"])
          .gte("due_date", today)
          .order("due_date", { ascending: true })
          .limit(8),
        from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .is("deleted_at", null)
          .in("status", ["open", "in_progress"])
          .lt("due_at", nowIso),
        from("pm_tasks")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .in("status", ["backlog", "todo", "in_progress", "review"])
          .lt("due_date", today),
      ]);

      if (crmUpcoming.error) throw crmUpcoming.error;
      if (projectUpcoming.error) throw projectUpcoming.error;
      if (crmOverdue.error) throw crmOverdue.error;
      if (projectOverdue.error) throw projectOverdue.error;

      const items: DashboardTaskItem[] = [
        ...((crmUpcoming.data ?? []) as CrmRow[]).map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          source: "CRM" as const,
          to: "/tasks" as const,
          dueAt: task.due_at,
          dueDate: null,
          projectId: null,
        })),
        ...((projectUpcoming.data ?? []) as ProjectRow[]).map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          source: "Project" as const,
          to: "/projects/tasks" as const,
          dueAt: null,
          dueDate: task.due_date,
          projectId: task.project_id,
        })),
      ]
        .sort((a, b) => compareDashboardTasks(a, b, timezone))
        .slice(0, 8);

      const crmUpcomingCount = crmUpcoming.count ?? 0;
      const projectUpcomingCount = projectUpcoming.count ?? 0;
      const crmOverdueCount = crmOverdue.count ?? 0;
      const projectOverdueCount = projectOverdue.count ?? 0;

      return {
        upcomingCount: crmUpcomingCount + projectUpcomingCount,
        overdueCount: crmOverdueCount + projectOverdueCount,
        crmUpcomingCount,
        projectUpcomingCount,
        crmOverdueCount,
        projectOverdueCount,
        items,
      };
    },
  });
}
