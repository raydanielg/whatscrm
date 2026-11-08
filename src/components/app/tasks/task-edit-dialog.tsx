import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarIcon, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextarea } from "@/shared/components/rich-textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspaceMembers } from "@/hooks/use-workspace";
import { CustomFieldsSection } from "@/components/app/custom-fields/custom-fields-section";
import {
  useCreateTask, useUpdateTask, useDeleteTask,
  type TaskBoardPriority, type TaskBoardRow, type TaskBoardStatus, type TaskInput,
} from "@/hooks/use-task-board";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string | null;
  /** Omit to create a new task. */
  task?: TaskBoardRow | null;
  canEdit: boolean;
  canDelete: boolean;
};

type Draft = {
  title: string;
  description: string;
  status: TaskBoardStatus;
  priority: TaskBoardPriority;
  due: string;
  assignedTo: string;
  customFields: Record<string, unknown>;
};

const emptyDraft = (userId: string | undefined): Draft => ({
  title: "",
  description: "",
  status: "open",
  priority: "normal",
  due: "",
  assignedTo: userId ?? "",
  customFields: {},
});

const errorText = (e: unknown) => (e as { message?: string } | null)?.message;

export function TaskEditDialog({ open, onOpenChange, workspaceId, task, canEdit, canDelete }: Props) {
  const { user } = useAuth();
  const userId = user?.id;
  const members = useWorkspaceMembers(workspaceId ?? undefined);
  const create = useCreateTask(workspaceId, userId);
  const update = useUpdateTask(workspaceId);
  const remove = useDeleteTask(workspaceId);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(userId));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isEdit = !!task;
  const readOnly = isEdit && !canEdit;

  // Load the task into the form when the dialog opens or switches to another task.
  // Keyed on the id, not the object: background refetches (e.g. window focus) hand
  // back new objects, and that must not wipe what the user is typing.
  const taskId = task?.id;
  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    setDraft(
      task
        ? {
            title: task.title,
            description: task.description ?? "",
            status: task.status,
            priority: task.priority,
            due: task.due_at ? format(parseISO(task.due_at), "yyyy-MM-dd") : "",
            assignedTo: task.assigned_to ?? "",
            customFields: task.custom_fields ?? {},
          }
        : emptyDraft(userId),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, taskId, userId]);

  const busy = create.isPending || update.isPending || remove.isPending;
  const canSave = draft.title.trim().length > 0 && !busy && !readOnly;

  const save = async () => {
    if (readOnly) return;
    const input: TaskInput = {
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      status: draft.status,
      priority: draft.priority,
      due_at: draft.due ? new Date(`${draft.due}T09:00:00`).toISOString() : null,
      assigned_to: draft.assignedTo || null,
      custom_fields: draft.customFields,
    };
    try {
      if (task) await update.mutateAsync({ id: task.id, input });
      else await create.mutateAsync(input);
      toast.success(task ? "Task updated" : "Task created");
      onOpenChange(false);
    } catch (e) {
      const msg = errorText(e);
      toast.error(msg ? `Could not save task: ${msg}` : "Could not save task");
    }
  };

  const doDelete = async () => {
    if (!task || !canDelete) return;
    try {
      await remove.mutateAsync(task.id);
      toast.success("Task deleted");
      setConfirmDelete(false);
      onOpenChange(false);
    } catch (e) {
      const msg = errorText(e);
      toast.error(msg ? `Could not delete task: ${msg}` : "Could not delete task");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{readOnly ? "Task details" : isEdit ? "Edit task" : "New task"}</DialogTitle>
            <DialogDescription>
              {readOnly ? "You can view this task, but cannot change it." : isEdit ? "Change details, status, due date or assignee." : "Create a task for your team."}
            </DialogDescription>
          </DialogHeader>

          <fieldset disabled={readOnly} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tk-title">Title</Label>
              <Input id="tk-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus={!readOnly} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tk-desc">Description</Label>
              <RichTextarea id="tk-desc" rows={3} value={draft.description} onChange={(value) => setDraft({ ...draft, description: value })} disabled={readOnly} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tk-status">Status</Label>
                <select
                  id="tk-status"
                  className="h-9 w-full rounded-control border border-input bg-background px-2 text-sm"
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value as TaskBoardStatus })}
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tk-priority">Priority</Label>
                <select
                  id="tk-priority"
                  className="h-9 w-full rounded-control border border-input bg-background px-2 text-sm"
                  value={draft.priority}
                  onChange={(e) => setDraft({ ...draft, priority: e.target.value as TaskBoardPriority })}
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Due date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className="w-full justify-start font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {draft.due ? format(parseISO(draft.due), "PPP") : "No date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={draft.due ? parseISO(draft.due) : undefined}
                      onSelect={(d) => setDraft({ ...draft, due: d ? format(d, "yyyy-MM-dd") : "" })}
                      initialFocus
                    />
                    {draft.due && (
                      <div className="border-t p-2">
                        <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => setDraft({ ...draft, due: "" })}>
                          Clear date
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tk-assignee">Assignee</Label>
                <select
                  id="tk-assignee"
                  className="h-9 w-full rounded-control border border-input bg-background px-2 text-sm"
                  value={draft.assignedTo}
                  onChange={(e) => setDraft({ ...draft, assignedTo: e.target.value })}
                >
                  <option value="">Unassigned</option>
                  {(members.data ?? []).map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {(m.display_name || m.email || "Member") + (m.user_id === userId ? " (you)" : "")}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <CustomFieldsSection
              entity="task"
              values={draft.customFields}
              onChange={(customFields) => setDraft((current) => ({ ...current, customFields }))}
              columns={1}
            />
          </fieldset>

          <DialogFooter className="flex-row sm:justify-between gap-2">
            {isEdit && canDelete ? (
              <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)} disabled={busy}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                {readOnly ? "Close" : "Cancel"}
              </Button>
              {!readOnly && (
                <Button type="button" onClick={save} disabled={!canSave}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isEdit ? "Save" : "Create task"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete && canDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>The task will be removed from the board.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
