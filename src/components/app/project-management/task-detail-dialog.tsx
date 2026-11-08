import { CalendarDays, Pencil, UserRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FormattedText } from "@/components/app/inbox/formatted-text";
import type { PmProject, PmTask, PmWorkspaceUser } from "@/lib/project-management/client";
import { TASK_PRIORITY_LABELS, TASK_PRIORITY_TONE, TASK_STATUS_LABELS, TASK_STATUS_TONE, shortDate } from "./labels";

type Props = {
  task: PmTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: PmProject[];
  users: PmWorkspaceUser[];
  onEdit?: (task: PmTask) => void;
  canEdit?: boolean;
};

/** Read-only task details, opened by clicking a task card/row. Editing lives
 * behind its own "Edit" action (the task's "…" menu, or the button here) so a
 * plain click never drops the viewer straight into a form. */
export function TaskDetailDialog({
  task,
  open,
  onOpenChange,
  projects,
  users,
  onEdit,
  canEdit = true,
}: Props) {
  if (!task) return null;
  const project = projects.find((p) => p.id === task.project_id);
  const assignee = task.assignee_id ? users.find((u) => u.user_id === task.assignee_id) : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg min-w-0 w-[calc(100vw-2rem)] sm:w-full">
        <DialogHeader>
          <DialogTitle className="pr-6">{task.title}</DialogTitle>
          {project && <DialogDescription>{project.name}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="inline-flex items-center gap-1.5 px-1.5">
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TASK_STATUS_TONE[task.status])} aria-hidden="true" />
              {TASK_STATUS_LABELS[task.status]}
            </Badge>
            <Badge variant="outline" className={TASK_PRIORITY_TONE[task.priority]}>
              {TASK_PRIORITY_LABELS[task.priority]}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-start gap-2">
              <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div>
                <div className="text-[11px] uppercase text-muted-foreground">Assignee</div>
                <div>{assignee?.display_name || assignee?.email || "Unassigned"}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div>
                <div className="text-[11px] uppercase text-muted-foreground">Due date</div>
                <div>{shortDate(task.due_date)}</div>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[11px] font-medium uppercase text-muted-foreground">
              Description
            </div>
            {task.description?.trim() ? (
              <div className="rounded-control border border-border bg-muted/30 p-3 text-sm">
                <FormattedText text={task.description} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">No description yet.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {canEdit && onEdit && (
            <Button
              onClick={() => {
                onOpenChange(false);
                onEdit(task);
              }}
            >
              <Pencil className="h-3.5 w-3.5" /> Edit task
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
