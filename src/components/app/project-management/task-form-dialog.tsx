import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { DatePicker, fromDateString, toDateString } from "@/shared/components";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextarea } from "@/shared/components/rich-textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreatePmTask,
  useDeletePmTask,
  usePmProjectMembers,
  useUpdatePmTask,
  type PmProject,
  type PmTask,
  type PmWorkspaceUser,
} from "@/lib/project-management/client";
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, errorMessage } from "./labels";

type Draft = {
  projectId: string;
  title: string;
  description: string;
  status: PmTask["status"];
  priority: PmTask["priority"];
  dueDate: string;
  assigneeId: string;
};

function initialDraft(task: PmTask | null, projectId: string): Draft {
  return {
    projectId: task?.project_id ?? projectId,
    title: task?.title ?? "",
    description: task?.description ?? "",
    status: task?.status ?? "todo",
    priority: task?.priority ?? "medium",
    dueDate: task?.due_date ?? "",
    assigneeId: task?.assignee_id ?? "",
  };
}

export function TaskFormDialog({
  open,
  onOpenChange,
  workspaceId,
  projectId = "",
  task,
  projects,
  users,
  readOnly = false,
  canCreateInProject,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string | null;
  projectId?: string;
  task?: PmTask | null;
  projects: PmProject[];
  users: PmWorkspaceUser[];
  readOnly?: boolean;
  canCreateInProject?: (project: PmProject) => boolean;
}) {
  const current = task ?? null;
  const [draft, setDraft] = useState<Draft>(() => initialDraft(current, projectId));
  const [formError, setFormError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: members = [] } = usePmProjectMembers(draft.projectId || null);
  const create = useCreatePmTask();
  const update = useUpdatePmTask();
  const remove = useDeletePmTask();
  const pending = create.isPending || update.isPending || remove.isPending;

  useEffect(() => {
    if (!open) return;
    setDraft(initialDraft(current, projectId));
    setFormError("");
    setConfirmDelete(false);
    // Preserve unsaved input through background refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, current?.id, projectId]);

  const assignableUsers = users.filter((user) =>
    members.some((member) => member.user_id === user.user_id && member.role !== "viewer"),
  );

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || readOnly || !workspaceId) return;
    if (!draft.title.trim()) {
      setFormError("Enter a task title.");
      return;
    }
    if (!draft.projectId) {
      setFormError("Choose a project.");
      return;
    }
    setFormError("");
    try {
      const input = {
        workspace_id: workspaceId,
        project_id: draft.projectId,
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        status: draft.status,
        priority: draft.priority,
        due_date: draft.dueDate || null,
        assignee_id: draft.assigneeId || null,
      };
      if (current) await update.mutateAsync({ ...input, id: current.id });
      else await create.mutateAsync(input);
      toast.success(current ? "Task updated" : "Task created");
      onOpenChange(false);
    } catch (error) {
      setFormError(`Could not save task. ${errorMessage(error)}`);
    }
  }

  async function deleteTask() {
    if (!current || !workspaceId || pending || readOnly) return;
    try {
      await remove.mutateAsync({
        id: current.id,
        workspace_id: workspaceId,
        project_id: current.project_id,
      });
      toast.success("Task deleted");
      setConfirmDelete(false);
      onOpenChange(false);
    } catch (error) {
      setFormError(`Could not delete task. ${errorMessage(error)}`);
      setConfirmDelete(false);
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) onOpenChange(next);
        }}
      >
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] min-w-0 overflow-x-hidden overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {readOnly ? "Task details" : current ? "Edit task" : "New task"}
            </DialogTitle>
            <DialogDescription>
              {readOnly
                ? "Read the task details and current owner."
                : "Define the next action, owner, and deadline."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} noValidate className="min-w-0 space-y-4">
            <fieldset disabled={readOnly} className="min-w-0 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="pm-task-title">Task title</Label>
                <Input
                  id="pm-task-title"
                  autoFocus
                  maxLength={200}
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                  placeholder="What needs to be done?"
                />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="pm-task-project">Project</Label>
                <Select
                  value={draft.projectId || undefined}
                  onValueChange={(value) =>
                    setDraft((d) => ({ ...d, projectId: value, assigneeId: "" }))
                  }
                  disabled={!!current || !!projectId}
                >
                  <SelectTrigger id="pm-task-project" className="min-w-0 max-w-full overflow-hidden [&>span]:min-w-0 [&>span]:truncate">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]">
                    {projects
                      .filter(
                        (project) =>
                          (project.id === current?.project_id && !!current) ||
                          (project.status !== "archived" &&
                            (!canCreateInProject || canCreateInProject(project))),
                      )
                      .map((project) => (
                        <SelectItem
                          key={project.id}
                          value={project.id}
                          title={project.name}
                          className="min-w-0 [&>span:last-child]:min-w-0 [&>span:last-child]:flex-1 [&>span:last-child]:truncate"
                        >
                          {project.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pm-task-description">Description</Label>
                <RichTextarea
                  id="pm-task-description"
                  rows={3}
                  value={draft.description}
                  onChange={(value) => setDraft((d) => ({ ...d, description: value }))}
                  placeholder="Add context or acceptance criteria"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pm-task-status">Status</Label>
                  <Select
                    value={draft.status}
                    onValueChange={(value) =>
                      setDraft((d) => ({ ...d, status: value as PmTask["status"] }))
                    }
                  >
                    <SelectTrigger id="pm-task-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TASK_STATUS_LABELS) as PmTask["status"][]).map((value) => (
                        <SelectItem key={value} value={value}>
                          {TASK_STATUS_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pm-task-priority">Priority</Label>
                  <Select
                    value={draft.priority}
                    onValueChange={(value) =>
                      setDraft((d) => ({ ...d, priority: value as PmTask["priority"] }))
                    }
                  >
                    <SelectTrigger id="pm-task-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TASK_PRIORITY_LABELS) as PmTask["priority"][]).map((value) => (
                        <SelectItem key={value} value={value}>
                          {TASK_PRIORITY_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pm-task-assignee">Assignee</Label>
                  <Select
                    value={draft.assigneeId || "unassigned"}
                    onValueChange={(value) =>
                      setDraft((d) => ({ ...d, assigneeId: value === "unassigned" ? "" : value }))
                    }
                  >
                    <SelectTrigger id="pm-task-assignee">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {assignableUsers.map((user) => (
                        <SelectItem key={user.user_id} value={user.user_id}>
                          {user.display_name || user.email || "Team member"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Add people in Project team before assigning work.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Due date</Label>
                  <DatePicker
                    value={fromDateString(draft.dueDate)}
                    onChange={(value) => setDraft((d) => ({ ...d, dueDate: toDateString(value) }))}
                    placeholder="Select due date"
                  />
                </div>
              </div>
            </fieldset>
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
            <DialogFooter className="gap-2 sm:justify-between">
              {current && !readOnly && (
                <Button
                  type="button"
                  variant="destructive"
                  className="sm:mr-auto"
                  onClick={() => setConfirmDelete(true)}
                  disabled={pending}
                >
                  Delete task
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                {readOnly ? "Close" : "Cancel"}
              </Button>
              {!readOnly && (
                <Button type="submit" disabled={pending || !workspaceId}>
                  {pending ? "Saving" : current ? "Save changes" : "Create task"}
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>
              “{current?.title}” will be removed from this project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep task</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void deleteTask();
              }}
              disabled={pending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pending ? "Deleting" : "Delete task"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
