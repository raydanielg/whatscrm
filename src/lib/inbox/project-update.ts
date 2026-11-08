import type { PmProject, PmTask } from "@/lib/project-management/client";

const projectStatus: Record<PmProject["status"], string> = {
  planning: "Planning",
  active: "In progress",
  on_hold: "On hold",
  completed: "Completed",
  archived: "Archived",
};

const taskStatus: Record<PmTask["status"], string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  review: "In review",
  done: "Done",
};

function dateLabel(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.valueOf())
    ? null
    : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

/** Client-facing text includes only the project and task titles explicitly chosen by an agent. */
export function buildProjectUpdate(project: PmProject, selectedTasks: PmTask[]): string {
  const lines = [`Project update: ${project.name}`, `Status: ${projectStatus[project.status]}`];
  const deadline = dateLabel(project.due_date);
  if (deadline) lines.push(`Project target date: ${deadline}`);
  const visibleTasks = selectedTasks.filter(
    (task) => task.project_id === project.id && task.workspace_id === project.workspace_id,
  );
  if (visibleTasks.length) {
    lines.push("", "Tasks:");
    for (const task of visibleTasks) {
      const taskDeadline = dateLabel(task.due_date);
      lines.push(
        `• ${task.title} — ${taskStatus[task.status]}${taskDeadline ? ` (due ${taskDeadline})` : ""}`,
      );
    }
  }
  return lines.join("\n");
}
