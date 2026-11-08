import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, Link2, Plus, Search, User } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { canModifyCrmTask } from "@/lib/tasks/permissions";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentWorkspace, useWorkspaceRole } from "@/hooks/use-workspace";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import {
  useTaskBoard,
  useMoveTask,
  type TaskBoardRow,
  type TaskBoardStatus,
  type TaskBoardPriority,
} from "@/hooks/use-task-board";
import { TaskEditDialog } from "./task-edit-dialog";

const COLUMNS: { status: TaskBoardStatus; label: string; dot: string }[] = [
  { status: "open", label: "Open", dot: "bg-sky-500" },
  { status: "in_progress", label: "In progress", dot: "bg-amber-500" },
  { status: "completed", label: "Completed", dot: "bg-emerald-500" },
  { status: "cancelled", label: "Cancelled", dot: "bg-muted-foreground" },
];

const PRIORITY_DOT: Record<TaskBoardPriority, string> = {
  low: "bg-muted-foreground/50",
  normal: "bg-sky-500",
  high: "bg-amber-500",
  urgent: "bg-destructive",
};

export function TaskKanban() {
  const location = useLocation();
  const { active } = useCurrentWorkspace();
  const { user } = useAuth();
  const workspaceId = active?.id ?? null;
  const { data: workspaceRole } = useWorkspaceRole(workspaceId ?? undefined);
  const { data: tasks = [], isLoading, isError, error } = useTaskBoard(workspaceId);
  const move = useMoveTask(workspaceId);

  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverStatus, setHoverStatus] = useState<TaskBoardStatus | null>(null);
  const [query, setQuery] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  // Store the id, not a snapshot, so the dialog always shows the latest row.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const editingTask = editingId ? (tasks.find((t) => t.id === editingId) ?? null) : null;
  useEffect(() => {
    if (isLoading || isError) return;
    const id = new URLSearchParams(window.location.search).get("taskId");
    if (id && tasks.some((task) => task.id === id)) {
      setEditingId(id);
      setCreating(false);
      setDialogOpen(true);
    }
  }, [location.href, tasks, isLoading, isError]);
  const canManageTask = (task: TaskBoardRow) =>
    canModifyCrmTask(task, user?.id, workspaceRole);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => {
      if (mineOnly && t.assigned_to !== user?.id) return false;
      if (q && !t.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tasks, query, mineOnly, user?.id]);

  const byStatus = useMemo(() => {
    const m = new Map<TaskBoardStatus, TaskBoardRow[]>(COLUMNS.map((c) => [c.status, []]));
    for (const t of visible) m.get(t.status)?.push(t);
    return m;
  }, [visible]);

  const openNew = () => {
    setEditingId(null);
    setCreating(true);
    setDialogOpen(true);
  };

  const openEdit = (t: TaskBoardRow) => {
    setCreating(false);
    setEditingId(t.id);
    setDialogOpen(true);
  };

  const handleDrop = (status: TaskBoardStatus, id: string) => {
    setHoverStatus(null);
    setDragId(null);
    const task = tasks.find((t) => t.id === id);
    if (!task || !canManageTask(task) || task.status === status) return;
    move.mutate(
      { id, status },
      { onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to move task") },
    );
  };

  if (!workspaceId || isLoading) {
    return <div className="text-sm text-muted-foreground py-8">Loading tasks...</div>;
  }

  if (isError) {
    return (
      <div className="text-sm text-destructive py-8">
        Could not load tasks{error instanceof Error ? `: ${error.message}` : "."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks"
            className="pl-8"
            aria-label="Search tasks"
          />
        </div>
        <Button
          type="button"
          variant={mineOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setMineOnly((v) => !v)}
          aria-pressed={mineOnly}
        >
          Assigned to me
        </Button>
        <div className="ml-auto">
          <Button type="button" size="sm" onClick={openNew}>
            <Plus className="h-4 w-4" /> New task
          </Button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-control border border-dashed p-10 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            No tasks yet. Create one, or add a task from an inbox conversation.
          </p>
          <Button type="button" size="sm" onClick={openNew}>
            <Plus className="h-4 w-4" /> New task
          </Button>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4 snap-x">
          {COLUMNS.map((col) => {
            const list = byStatus.get(col.status) ?? [];
            const isHover = hoverStatus === col.status;
            return (
              <div
                key={col.status}
                className={cn(
                  "flex-shrink-0 w-[280px] snap-start rounded-control border transition-colors",
                  isHover ? "border-primary/60 bg-primary/5" : "border-transparent bg-muted/40",
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (hoverStatus !== col.status) setHoverStatus(col.status);
                }}
                onDragLeave={() => setHoverStatus((h) => (h === col.status ? null : h))}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain");
                  if (id) handleDrop(col.status, id);
                }}
              >
                <div className="flex items-center justify-between gap-2 p-3 border-b border-border/40">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn("w-2.5 h-2.5 rounded-full flex-shrink-0", col.dot)} />
                    <span className="text-sm font-semibold truncate">{col.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground ">{list.length}</span>
                </div>

                <div className="p-2 space-y-2 min-h-[160px]">
                  {list.length === 0 ? (
                    <p className="text-xs text-muted-foreground/70 text-center py-6">No tasks</p>
                  ) : (
                    list.map((t) => (
                      <TaskCard
                        key={t.id}
                        task={t}
                        canEdit={canManageTask(t)}
                        dragging={dragId === t.id}
                        onOpen={() => openEdit(t)}
                        onDragStart={() => setDragId(t.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setHoverStatus(null);
                        }}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TaskEditDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setEditingId(null);
        }}
        workspaceId={workspaceId}
        task={creating ? null : editingTask}
        canEdit={!editingTask || canManageTask(editingTask)}
        canDelete={!!editingTask && canManageTask(editingTask)}
      />
    </div>
  );
}

function TaskCard({
  task,
  canEdit,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  task: TaskBoardRow;
  canEdit: boolean;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const fmtZoned = useZonedDateFormatter();
  const overdue =
    !!task.due_at &&
    new Date(task.due_at) < new Date() &&
    (task.status === "open" || task.status === "in_progress");

  return (
    <Card
      draggable={canEdit}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      onDragStart={(e) => {
        if (!canEdit) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "p-3 shadow-sm cursor-pointer hover:shadow-md transition-all",
        canEdit && "active:cursor-grabbing",
        dragging && "opacity-40",
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "mt-1.5 w-2 h-2 rounded-full flex-shrink-0",
            PRIORITY_DOT[task.priority] ?? PRIORITY_DOT.normal,
          )}
          title={`Priority: ${task.priority}`}
          aria-label={`Priority: ${task.priority}`}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium leading-snug line-clamp-2">{task.title}</div>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {task.due_at && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-[11px]",
                  overdue ? "text-destructive" : "text-muted-foreground",
                )}
              >
                <Calendar className="w-2.5 h-2.5" />
                {fmtZoned(new Date(task.due_at), {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
            {task.entity_type === "conversation" && task.entity_id ? (
              <Link
                to="/inbox"
                search={{ conversationId: task.entity_id } as never}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex"
              >
                <Badge variant="outline" className="h-4 text-[11px] gap-0.5 px-1.5 hover:bg-muted">
                  <Link2 className="w-2.5 h-2.5" />
                  Conversation
                </Badge>
              </Link>
            ) : task.entity_type ? (
              <Badge variant="outline" className="h-4 text-[11px] gap-0.5 px-1.5">
                <User className="w-2.5 h-2.5" />
                Customer
              </Badge>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}
