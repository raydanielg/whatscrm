import { useMemo, useState } from "react";
import { CalendarDays, GripVertical, MoreHorizontal, Pencil, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { PmProject, PmTask, PmWorkspaceUser } from "@/lib/project-management/client";
import { TASK_PRIORITY_LABELS, TASK_PRIORITY_TONE, TASK_STATUS_LABELS, TASK_STATUS_ORDER, TASK_STATUS_TONE, shortDate } from "./labels";

type TaskViewProps = {
  tasks: PmTask[];
  projects: PmProject[];
  users: PmWorkspaceUser[];
  /** Opens the read-only detail view — the default action for clicking a task. */
  onView: (task: PmTask) => void;
  /** Opens the edit form — reached from the task's "…" menu, not a plain click. */
  onEdit: (task: PmTask) => void;
  onMove: (task: PmTask, status: PmTask["status"]) => void;
  showProject?: boolean;
  canEdit?: boolean;
  canEditTask?: (task: PmTask) => boolean;
};

function TaskPriorityBadge({ priority }: { priority: PmTask["priority"] }) {
  return (
    <Badge variant="outline" className={cn("font-medium", TASK_PRIORITY_TONE[priority])}>
      {TASK_PRIORITY_LABELS[priority]}
    </Badge>
  );
}

function assigneeName(task: PmTask, users: PmWorkspaceUser[]): string {
  if (!task.assignee_id) return "Unassigned";
  const user = users.find((item) => item.user_id === task.assignee_id);
  return user?.display_name || user?.email || "Team member";
}

function isOverdue(task: PmTask): boolean {
  if (!task.due_date || task.status === "done") return false;
  const today = new Date();
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return task.due_date.slice(0, 10) < localToday;
}

function StatusMenu({
  task,
  onMove,
  onEdit,
}: {
  task: PmTask;
  onMove: TaskViewProps["onMove"];
  onEdit: TaskViewProps["onEdit"];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          aria-label={`Actions for ${task.title}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onEdit(task)}>
          <Pencil className="h-3.5 w-3.5" /> Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {TASK_STATUS_ORDER.filter((status) => status !== task.status).map((status) => (
          <DropdownMenuItem key={status} onSelect={() => onMove(task, status)}>
            Move to {TASK_STATUS_LABELS[status]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TaskBoard({
  tasks,
  projects,
  users,
  onView,
  onEdit,
  onMove,
  showProject = false,
  canEdit = true,
  canEditTask,
}: TaskViewProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverStatus, setHoverStatus] = useState<PmTask["status"] | null>(null);
  const groups = useMemo(() => {
    const result = new Map<PmTask["status"], PmTask[]>(
      TASK_STATUS_ORDER.map((status) => [status, []]),
    );
    for (const task of tasks) result.get(task.status)?.push(task);
    for (const group of result.values())
      group.sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
    return result;
  }, [tasks]);

  function drop(status: PmTask["status"], id: string) {
    setDragId(null);
    setHoverStatus(null);
    const task = tasks.find((item) => item.id === id);
    if (task && canEdit && (!canEditTask || canEditTask(task)) && task.status !== status)
      onMove(task, status);
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 snap-x" aria-label="Project task Kanban board">
      {TASK_STATUS_ORDER.map((status) => {
        const list = groups.get(status) ?? [];
        return (
          <section
            key={status}
            aria-label={`${TASK_STATUS_LABELS[status]} tasks`}
            className={cn(
              "w-[280px] min-w-[280px] flex-shrink-0 snap-start rounded-control border bg-muted/30 transition-colors",
              hoverStatus === status ? "border-primary bg-primary/5" : "border-border/60",
            )}
            onDragOver={
              canEdit
                ? (event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setHoverStatus(status);
                  }
                : undefined
            }
            onDragLeave={
              canEdit
                ? () => setHoverStatus((current) => (current === status ? null : current))
                : undefined
            }
            onDrop={
              canEdit
                ? (event) => {
                    event.preventDefault();
                    drop(status, event.dataTransfer.getData("application/x-pm-task-id"));
                  }
                : undefined
            }
          >
            <header className="flex items-center justify-between border-b border-border/60 px-3 py-3">
              <div className="flex items-center gap-2">
                <span
                  className={cn("h-2.5 w-2.5 rounded-full", TASK_STATUS_TONE[status])}
                  aria-hidden="true"
                />
                <h3 className="text-sm font-semibold">{TASK_STATUS_LABELS[status]}</h3>
              </div>
              <Badge variant="secondary" className="tabular-nums">
                {list.length}
              </Badge>
            </header>
            <div className="min-h-[170px] space-y-2 p-2">
              {list.length === 0 && (
                <p className="py-8 text-center text-xs text-muted-foreground">No tasks</p>
              )}
              {list.map((task) => (
                <Card
                  key={task.id}
                  draggable={canEdit && (!canEditTask || canEditTask(task))}
                  onDragStart={
                    canEdit && (!canEditTask || canEditTask(task))
                      ? (event) => {
                          event.dataTransfer.setData("application/x-pm-task-id", task.id);
                          event.dataTransfer.effectAllowed = "move";
                          setDragId(task.id);
                        }
                      : undefined
                  }
                  onDragEnd={() => {
                    setDragId(null);
                    setHoverStatus(null);
                  }}
                  className={cn("space-y-3 p-3 shadow-sm", dragId === task.id && "opacity-50")}
                >
                  <div className="flex items-start gap-1">
                    {canEdit && (!canEditTask || canEditTask(task)) && (
                      <GripVertical
                        className="mt-1 h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left text-sm font-semibold leading-snug hover:text-primary focus-visible:rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring cursor-pointer transition-colors"
                      onClick={() => onView(task)}
                    >
                      {task.title}
                    </button>
                    {canEdit && (!canEditTask || canEditTask(task)) && (
                      <StatusMenu task={task} onMove={onMove} onEdit={onEdit} />
                    )}
                  </div>
                  {showProject && (
                    <p className="truncate pl-5 text-xs text-muted-foreground">
                      {projects.find((project) => project.id === task.project_id)?.name ??
                        "Project"}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <TaskPriorityBadge priority={task.priority} />
                    <span className="inline-flex min-w-0 items-center gap-1 truncate">
                      <UserRound className="h-3 w-3 shrink-0" />
                      {assigneeName(task, users)}
                    </span>
                    {task.due_date && (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1",
                          isOverdue(task) && "font-semibold text-destructive",
                        )}
                      >
                        <CalendarDays className="h-3 w-3" />
                        {shortDate(task.due_date)}
                      </span>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function TaskList({
  tasks,
  projects,
  users,
  onView,
  onEdit,
  onMove,
  showProject = false,
  canEdit = true,
  canEditTask,
}: TaskViewProps) {
  const ordered = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        const aDone = a.status === "done" ? 1 : 0;
        const bDone = b.status === "done" ? 1 : 0;
        return (
          aDone - bDone ||
          (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
          a.title.localeCompare(b.title)
        );
      }),
    [tasks],
  );

  if (ordered.length === 0)
    return (
      <div className="rounded-control border border-dashed p-10 text-center text-sm text-muted-foreground">
        No tasks match these filters.
      </div>
    );
  return (
    <div className="overflow-x-auto rounded-control border">
      <table className="w-full min-w-[690px] text-left text-sm" aria-label="Project tasks">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium text-nowrap">
              Task
            </th>
            {showProject && (
              <th scope="col" className="px-4 py-3 font-medium text-nowrap">
                Project
              </th>
            )}
            <th scope="col" className="px-4 py-3 font-medium text-nowrap">
              Status
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-nowrap">
              Priority
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-nowrap">
              Assignee
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-nowrap">
              Due
            </th>
            {canEdit && (
              <th scope="col" className="px-4 py-3 font-medium text-nowrap">
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {ordered.map((task) => (
            <tr key={task.id} className="hover:bg-muted/20">
              <td className="px-4 py-3 text-nowrap">
                <button
                  type="button"
                  className="max-w-[300px] text-left font-medium hover:text-primary focus-visible:rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => onView(task)}
                >
                  {task.title}
                </button>
              </td>
              {showProject && (
                <td className="px-4 py-3 text-muted-foreground">
                  {projects.find((project) => project.id === task.project_id)?.name ?? "Project"}
                </td>
              )}
              <td className="px-4 py-3 text-nowrap">
                <Badge variant="secondary" className="inline-flex items-center gap-1.5 px-1.5">
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TASK_STATUS_TONE[task.status])} aria-hidden="true" />
                  {TASK_STATUS_LABELS[task.status]}
                </Badge>
              </td>
              <td className="px-4 py-3 text-nowrap">
                <TaskPriorityBadge priority={task.priority} />
              </td>
              <td className="px-4 py-3 text-muted-foreground text-nowrap">{assigneeName(task, users)}</td>
              <td
                className={cn(
                  "px-4 py-3 text-nowrap",
                  isOverdue(task) ? "font-medium text-destructive" : "text-muted-foreground",
                )}
              >
                {shortDate(task.due_date)}
              </td>
              {canEdit && (!canEditTask || canEditTask(task)) && (
                <td className="px-4 py-3 text-nowrap">
                  <StatusMenu task={task} onMove={onMove} onEdit={onEdit} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
