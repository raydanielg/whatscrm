import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Pin,
  PinOff,
  Trash2,
  Edit3,
  Loader2,
  StickyNote,
  ListTodo,
  Calendar as CalendarIcon,
  User as UserIcon,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspaceMembers } from "@/hooks/use-workspace";
import { useCustomerNotes, useCustomerTasks } from "@/hooks/use-dashboard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RichTextarea } from "@/shared/components/rich-textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DateTimePicker } from "@/shared/components/date-time-picker";
import { ConfirmDialog } from "@/shared/components/confirm-dialog";
import { cn } from "@/lib/utils";
import { sbAny } from "@/lib/supabase/untyped";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyFrom = (t: string) => sbAny(supabase).from(t as any) as any;

type Note = {
  id: string;
  body: string;
  is_pinned: boolean;
  created_at: string;
  author_id: string | null;
};

type Task = {
  id: string;
  title: string;
  description?: string | null;
  status: "open" | "in_progress" | "completed" | "cancelled";
  priority: "low" | "normal" | "high" | "urgent";
  due_at: string | null;
  assigned_to: string | null;
};

interface Props {
  customerId: string;
  workspaceId: string;
}

export function CustomerNotesTasksPanel({ customerId, workspaceId }: Props) {
  const { data: notes = [] } = useCustomerNotes(customerId);
  const { data: tasks = [] } = useCustomerTasks(customerId) as { data: Task[] };
  const [tab, setTab] = React.useState<"notes" | "tasks">("notes");

  const openTasks = tasks.filter(
    (t) => t.status !== "completed" && t.status !== "cancelled",
  ).length;

  return (
    <div className="rounded-control border border-border bg-surface">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <h3 className="font-display font-semibold text-sm">Notes & Tasks</h3>
        <div className="text-[11px] text-muted-foreground">
          {notes.length} notes · {openTasks} open tasks
        </div>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as "notes" | "tasks")}>
        <div className="px-3 pt-3">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="notes">
              <StickyNote className="w-3.5 h-3.5 mr-1.5" /> Notes ({notes.length})
            </TabsTrigger>
            <TabsTrigger value="tasks">
              <ListTodo className="w-3.5 h-3.5 mr-1.5" /> Tasks ({tasks.length})
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="notes" className="p-3 mt-0">
          <NotesSection customerId={customerId} workspaceId={workspaceId} notes={notes as Note[]} />
        </TabsContent>
        <TabsContent value="tasks" className="p-3 mt-0">
          <TasksSection customerId={customerId} workspaceId={workspaceId} tasks={tasks} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* -------------------------------- Notes ---------------------------------- */

function NotesSection({
  customerId,
  workspaceId,
  notes,
}: {
  customerId: string;
  workspaceId: string;
  notes: Note[];
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [body, setBody] = React.useState("");
  const [editing, setEditing] = React.useState<Note | null>(null);
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["customer-notes", customerId] });

  const create = useMutation({
    mutationFn: async (input: { body: string }) => {
      if (!user?.id) throw new Error("Not signed in");
      const { error } = await anyFrom("notes").insert({
        workspace_id: workspaceId,
        author_id: user.id,
        entity_type: "contact",
        entity_id: customerId,
        body: input.body,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      invalidate();
      toast.success("Note added");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add note"),
  });

  const patch = useMutation({
    mutationFn: async (input: { id: string; body?: string; is_pinned?: boolean }) => {
      const { id, ...rest } = input;
      const payload: Record<string, unknown> = { ...rest, updated_at: new Date().toISOString() };
      if (rest.is_pinned !== undefined)
        payload.pinned_at = rest.is_pinned ? new Date().toISOString() : null;
      const { error } = await anyFrom("notes").update(payload).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await anyFrom("notes")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      toast.success("Note deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <RichTextarea
          value={body}
          onChange={(v) => setBody(v)}
          placeholder="Add a note about this customer"
          rows={3}
          className="text-sm"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => body.trim() && create.mutate({ body: body.trim() })}
            disabled={!body.trim() || create.isPending}
          >
            {create.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5 mr-1.5" />
            )}
            Add note
          </Button>
        </div>
      </div>

      {notes.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">No notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li
              key={n.id}
              className={cn(
                "rounded-control border p-3 group",
                n.is_pinned ? "border-accent/40 bg-accent/5" : "border-border",
              )}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  {n.is_pinned && (
                    <Badge variant="outline" className="text-[11px] h-4">
                      <Pin className="w-2.5 h-2.5 " /> Pinned
                    </Badge>
                  )}
                  <span>{new Date(n.created_at).toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="w-7 h-7"
                    onClick={() => patch.mutate({ id: n.id, is_pinned: !n.is_pinned })}
                    title={n.is_pinned ? "Unpin" : "Pin"}
                  >
                    {n.is_pinned ? (
                      <PinOff className="w-3.5 h-3.5" />
                    ) : (
                      <Pin className="w-3.5 h-3.5" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="w-7 h-7"
                    onClick={() => setEditing(n)}
                    title="Edit"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="w-7 h-7 text-destructive hover:text-destructive"
                    onClick={() => setDeleting(n.id)}
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <p className="text-sm whitespace-pre-wrap">{n.body}</p>
            </li>
          ))}
        </ul>
      )}

      <EditNoteDialog
        note={editing}
        onClose={() => setEditing(null)}
        onSave={(body) => editing && patch.mutate({ id: editing.id, body })}
        saving={patch.isPending}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete note?"
        description="This will remove the note. This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleting) remove.mutate(deleting);
        }}
      />
    </div>
  );
}

function EditNoteDialog({
  note,
  onClose,
  onSave,
  saving,
}: {
  note: Note | null;
  onClose: () => void;
  onSave: (body: string) => void;
  saving: boolean;
}) {
  const [body, setBody] = React.useState("");
  React.useEffect(() => {
    setBody(note?.body ?? "");
  }, [note]);
  return (
    <Dialog open={!!note} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit note</DialogTitle>
        </DialogHeader>
        <RichTextarea value={body} onChange={setBody} rows={6} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(body.trim())} disabled={!body.trim() || saving}>
            {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------- Tasks ---------------------------------- */

type TaskDraft = {
  title: string;
  description: string;
  priority: Task["priority"];
  status: Task["status"];
  due_at: Date | undefined;
  assigned_to: string | null;
};

const EMPTY_DRAFT: TaskDraft = {
  title: "",
  description: "",
  priority: "normal",
  status: "open",
  due_at: undefined,
  assigned_to: null,
};

function TasksSection({
  customerId,
  workspaceId,
  tasks,
}: {
  customerId: string;
  workspaceId: string;
  tasks: Task[];
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: members = [] } = useWorkspaceMembers(workspaceId);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Task | null>(null);
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["customer-tasks", customerId] });

  const create = useMutation({
    mutationFn: async (input: TaskDraft) => {
      if (!user?.id) throw new Error("Not signed in");
      const { error } = await anyFrom("tasks").insert({
        workspace_id: workspaceId,
        created_by: user.id,
        owner_id: user.id,
        entity_type: "contact",
        entity_id: customerId,
        title: input.title,
        description: input.description || null,
        priority: input.priority,
        status: input.status,
        due_at: input.due_at ? input.due_at.toISOString() : null,
        assigned_to: input.assigned_to,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      toast.success("Task created");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create task"),
  });

  const patch = useMutation({
    mutationFn: async (input: {
      id: string;
      changes: Partial<TaskDraft & { completed_at: string | null }>;
    }) => {
      const payload: Record<string, unknown> = {
        ...input.changes,
        updated_at: new Date().toISOString(),
      };
      if (input.changes.due_at !== undefined) {
        payload.due_at = input.changes.due_at
          ? (input.changes.due_at as unknown as Date).toISOString()
          : null;
      }
      const { error } = await anyFrom("tasks").update(payload).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await anyFrom("tasks")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      toast.success("Task deleted");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  const toggleComplete = (t: Task) => {
    const done = t.status === "completed";
    patch.mutate({
      id: t.id,
      changes: {
        status: done ? "open" : "completed",
        completed_at: done ? null : new Date().toISOString(),
      },
    });
  };

  const memberMap = React.useMemo(() => {
    const m = new Map<string, { name: string; avatar: string | null }>();
    for (const mem of members) {
      m.set(mem.user_id, {
        name: mem.display_name || mem.email || "Member",
        avatar: mem.avatar_url,
      });
    }
    return m;
  }, [members]);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> New task
        </Button>
      </div>

      {tasks.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">No tasks yet.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => {
            const assignee = t.assigned_to ? memberMap.get(t.assigned_to) : null;
            const overdue =
              t.due_at &&
              new Date(t.due_at) < new Date() &&
              t.status !== "completed" &&
              t.status !== "cancelled";
            return (
              <li
                key={t.id}
                className="rounded-control border border-border p-3 group hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => toggleComplete(t)}
                    className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors"
                    aria-label={t.status === "completed" ? "Mark open" : "Mark complete"}
                  >
                    {t.status === "completed" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Circle className="w-4 h-4" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={cn(
                          "text-sm font-medium",
                          t.status === "completed" && "line-through text-muted-foreground",
                        )}
                      >
                        {t.title}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn("text-[11px] h-4 capitalize", priorityClass(t.priority))}
                      >
                        {t.priority}
                      </Badge>
                      {t.status !== "open" && t.status !== "completed" && (
                        <Badge variant="secondary" className="text-[11px] h-4 capitalize">
                          {t.status.replace("_", " ")}
                        </Badge>
                      )}
                    </div>
                    {t.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {t.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1",
                          overdue && "text-destructive",
                        )}
                      >
                        <CalendarIcon className="w-3 h-3" />
                        {t.due_at
                          ? new Date(t.due_at).toLocaleString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "No due date"}
                        {overdue && " · overdue"}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        {assignee ? (
                          <>
                            <Avatar className="w-4 h-4">
                              {assignee.avatar && <AvatarImage src={assignee.avatar} />}
                              <AvatarFallback className="text-[8px]">
                                {assignee.name.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="truncate max-w-[120px]">{assignee.name}</span>
                          </>
                        ) : (
                          <>
                            <UserIcon className="w-3 h-3" /> Unassigned
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-7 h-7"
                      onClick={() => setEditing(t)}
                      title="Edit"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-7 h-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleting(t.id)}
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="New task"
        members={members}
        initial={EMPTY_DRAFT}
        onSubmit={(d) => create.mutate(d)}
        saving={create.isPending}
      />

      <TaskDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Edit task"
        members={members}
        initial={
          editing
            ? {
                title: editing.title,
                description: editing.description ?? "",
                priority: editing.priority,
                status: editing.status,
                due_at: editing.due_at ? new Date(editing.due_at) : undefined,
                assigned_to: editing.assigned_to,
              }
            : EMPTY_DRAFT
        }
        onSubmit={(d) => editing && patch.mutate({ id: editing.id, changes: d })}
        saving={patch.isPending}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete task?"
        description="This will remove the task. This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleting) remove.mutate(deleting);
        }}
      />
    </div>
  );
}

function priorityClass(p: Task["priority"]) {
  switch (p) {
    case "urgent":
      return "border-rose-500/40 text-rose-600";
    case "high":
      return "border-amber-500/40 text-amber-600";
    case "low":
      return "border-muted-foreground/30 text-muted-foreground";
    default:
      return "border-border text-foreground";
  }
}

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  initial: TaskDraft;
  members: Array<{
    user_id: string;
    display_name: string | null;
    email: string | null;
    avatar_url: string | null;
  }>;
  onSubmit: (draft: TaskDraft) => void;
  saving: boolean;
}

function TaskDialog({
  open,
  onOpenChange,
  title,
  initial,
  members,
  onSubmit,
  saving,
}: TaskDialogProps) {
  const [draft, setDraft] = React.useState<TaskDraft>(initial);
  React.useEffect(() => {
    if (open) setDraft(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const canSubmit = draft.title.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Title</Label>
            <Input
              autoFocus
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="What needs to be done?"
            />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <RichTextarea
              value={draft.description}
              onChange={(v) => setDraft((d) => ({ ...d, description: v }))}
              rows={3}
              placeholder="Add context or details"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Priority</Label>
              <Select
                value={draft.priority}
                onValueChange={(v) => setDraft((d) => ({ ...d, priority: v as Task["priority"] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select
                value={draft.status}
                onValueChange={(v) => setDraft((d) => ({ ...d, status: v as Task["status"] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Due date & time</Label>
            <DateTimePicker
              value={draft.due_at}
              onChange={(v) => setDraft((d) => ({ ...d, due_at: v }))}
              placeholder="No due date"
            />
          </div>
          <div>
            <Label className="text-xs">Assign to</Label>
            <Select
              value={draft.assigned_to ?? "__unassigned"}
              onValueChange={(v) =>
                setDraft((d) => ({ ...d, assigned_to: v === "__unassigned" ? null : v }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__unassigned">Unassigned</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.display_name || m.email || m.user_id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => onSubmit({ ...draft, title: draft.title.trim() })}
            disabled={!canSubmit || saving}
          >
            {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
