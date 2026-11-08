import type { PmProject, PmTask } from "@/lib/project-management/client";
import type { ConversationTask } from "@/hooks/use-conversation-tasks";

export type InboxDeadline = {
  id: string;
  kind: "project" | "crm";
  title: string;
  projectName?: string;
  projectId?: string;
  due: string;
  overdue: boolean;
};

/** Only actionable work with an actual deadline belongs in the inbox brief. */
export function collectInboxDeadlines(
  projectTasks: PmTask[],
  projects: PmProject[],
  conversationTasks: ConversationTask[],
  today: string,
  nowIso: string,
): InboxDeadline[] {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const projectItems: InboxDeadline[] = projectTasks
    .filter((task) => task.due_date && task.status !== "done")
    .filter((task) => {
      const project = projectById.get(task.project_id);
      return project && project.status !== "archived" && project.status !== "completed";
    })
    .map((task) => ({
      id: task.id,
      kind: "project" as const,
      title: task.title,
      projectName: projectById.get(task.project_id)?.name,
      projectId: task.project_id,
      due: task.due_date!,
      overdue: task.due_date! < today,
    }));
  const crmItems: InboxDeadline[] = conversationTasks
    .filter((task) => task.due_at && task.status !== "completed" && task.status !== "cancelled")
    .map((task) => ({
      id: task.id,
      kind: "crm" as const,
      title: task.title,
      due: task.due_at!,
      overdue: task.due_at! < nowIso,
    }));
  return [...projectItems, ...crmItems].sort((a, b) => a.due.localeCompare(b.due));
}
