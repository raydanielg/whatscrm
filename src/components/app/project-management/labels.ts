import type { PmProject, PmTask } from "@/lib/project-management/client";

export const PROJECT_STATUS_LABELS: Record<PmProject["status"], string> = {
  planning: "Planning",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  archived: "Archived",
};

export const TASK_STATUS_LABELS: Record<PmTask["status"], string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  review: "Review",
  done: "Done",
};

export const TASK_STATUS_ORDER: PmTask["status"][] = [
  "backlog",
  "todo",
  "in_progress",
  "review",
  "done",
];

export const TASK_PRIORITY_LABELS: Record<PmTask["priority"], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const TASK_STATUS_TONE: Record<PmTask["status"], string> = {
  backlog: "bg-slate-400",
  todo: "bg-sky-500",
  in_progress: "bg-amber-500",
  review: "bg-violet-500",
  done: "bg-emerald-500",
};

export const TASK_PRIORITY_TONE: Record<PmTask["priority"], string> = {
  low: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  medium: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  high: "border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  urgent: "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300",
};

export function shortDate(value: string | null | undefined): string {
  if (!value) return "No due date";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "No due date";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

export function errorMessage(error: unknown): string {
  const detail =
    error && typeof error === "object" ? (error as { code?: unknown; message?: unknown }) : null;
  const code = typeof detail?.code === "string" ? detail.code : "";
  const message = typeof detail?.message === "string" ? detail.message : "";

  if (
    code === "PGRST205" ||
    (code === "42P01" && /pm_(projects|tasks|project_members)/i.test(message))
  ) {
    return "Project Management database setup is pending. Apply the project management migration, then try again.";
  }
  if (/invalid api key/i.test(message)) {
    return "The Supabase publishable key is invalid. Update the app configuration and restart the app.";
  }
  return message || (error instanceof Error ? error.message : "Please try again.");
}
