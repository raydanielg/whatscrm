import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, CalendarIcon, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { sbAny } from "@/lib/supabase/untyped";
import { useAuth } from "@/hooks/use-auth";
import {
  usePmProjects,
  useCreatePmTask,
  type PmTaskPriority,
} from "@/lib/project-management/client";
import type { ConversationRow } from "@/hooks/use-conversations";

type Priority = "low" | "normal" | "high" | "urgent";
type Status = "open" | "in_progress" | "completed" | "cancelled";
type Target = "crm" | "project";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversation: ConversationRow;
};

type Draft = {
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  due: string;
};

const EMPTY: Draft = {
  title: "",
  description: "",
  priority: "normal",
  status: "open",
  due: "",
};

const pmPriority: Record<Priority, PmTaskPriority> = {
  low: "low",
  normal: "medium",
  high: "high",
  urgent: "urgent",
};

export function CreateTaskDialog({ open, onOpenChange, conversation }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [target, setTarget] = useState<Target>("crm");
  const [projectId, setProjectId] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const projects = usePmProjects(open ? conversation.workspace_id : null);

  const createCrmTask = useMutation({
    mutationFn: async (input: Draft) => {
      if (!user?.id) throw new Error("Not signed in");
      const { error } = await (sbAny(supabase).from("tasks") as any).insert({
        workspace_id: conversation.workspace_id,
        created_by: user.id,
        owner_id: user.id,
        assigned_to: user.id,
        entity_type: "conversation",
        entity_id: conversation.id,
        title: input.title.trim(),
        description: input.description.trim() || null,
        priority: input.priority,
        status: input.status,
        due_at: input.due ? new Date(`${input.due}T09:00:00`).toISOString() : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Task created");
      // Refresh everything that shows this task: the conversation's task list,
      // the inbox row badge, and the Tasks board.
      qc.invalidateQueries({ queryKey: ["conversation-tasks", conversation.id] });
      qc.invalidateQueries({ queryKey: ["conversation-open-task-counts"] });
      qc.invalidateQueries({ queryKey: ["task-board"] });
      qc.invalidateQueries({ queryKey: ["dash", "task-summary", conversation.workspace_id] });
      setDraft(EMPTY);
      onOpenChange(false);
    },
    // Supabase errors are plain objects, not Error instances, so read .message directly.
    onError: (e) => {
      const msg = (e as { message?: string } | null)?.message;
      toast.error(msg ? `Failed to create task: ${msg}` : "Failed to create task");
    },
  });

  const createPmTask = useCreatePmTask();

  const create = {
    isPending: createCrmTask.isPending || createPmTask.isPending,
    mutate: (input: Draft) => {
      if (target === "crm") {
        createCrmTask.mutate(input);
        return;
      }
      if (!projectId) return;
      createPmTask.mutate(
        {
          workspace_id: conversation.workspace_id,
          project_id: projectId,
          title: input.title.trim(),
          description: input.description.trim() || null,
          priority: pmPriority[input.priority],
          status: input.status === "completed" ? "done" : "todo",
          due_date: input.due || null,
          contact_id: conversation.contact_id ?? null,
          conversation_id: conversation.id,
        },
        {
          onSuccess: () => {
            toast.success("Project task created");
            qc.invalidateQueries({ queryKey: ["contact-tasks"] });
            setDraft(EMPTY);
            onOpenChange(false);
          },
          onError: (e) => {
            const msg = (e as { message?: string } | null)?.message;
            toast.error(msg ? `Failed to create task: ${msg}` : "Failed to create task");
          },
        },
      );
    },
  };

  const canSubmit =
    draft.title.trim().length > 0 && !create.isPending && (target === "crm" || !!projectId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md min-w-0 w-[calc(100vw-2rem)] sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4" />
            Create task
          </DialogTitle>
          <DialogDescription>Link a task to this conversation.</DialogDescription>
        </DialogHeader>

        <form
          className="min-w-0 w-full space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) create.mutate(draft);
          }}
        >
          <div className="space-y-1.5">
            <Label>Assign to</Label>
            <Tabs value={target} onValueChange={(v) => setTarget(v as Target)}>
              <TabsList className="grid w-full min-w-0 grid-cols-2">
                <TabsTrigger value="crm">CRM task</TabsTrigger>
                <TabsTrigger value="project">Project task</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {target === "project" && (
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="task-project">Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger id="task-project" className="min-w-0 max-w-full overflow-hidden [&>span]:min-w-0 [&>span]:truncate">
                  <SelectValue placeholder="Choose a project" />
                </SelectTrigger>
                <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]">
                  {(projects.data ?? []).map((p) => (
                    <SelectItem
                      key={p.id}
                      value={p.id}
                      title={p.name}
                      className="min-w-0 [&>span:last-child]:min-w-0 [&>span:last-child]:flex-1 [&>span:last-child]:truncate"
                    >
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!projects.isLoading && (projects.data ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">No projects yet in this workspace.</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              autoFocus
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-description">Description</Label>
            <RichTextarea
              id="task-description"
              className="min-w-0 w-full"
              value={draft.description}
              onChange={(v) => setDraft({ ...draft, description: v })}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="task-priority">Priority</Label>
              <select
                id="task-priority"
                className="h-9 w-full rounded-control border border-input bg-background px-2 text-sm"
                value={draft.priority}
                onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="task-status">Status</Label>
              <select
                id="task-status"
                className="h-9 w-full rounded-control border border-input bg-background px-2 text-sm"
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as Status })}
              >
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-due">Due date (optional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="task-due"
                  type="button"
                  variant="outline"
                  className="w-full justify-start font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {draft.due ? format(parseISO(draft.due), "PPP") : "Pick a date"}
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
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={() => setDraft({ ...draft, due: "" })}
                    >
                      Clear date
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {create.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Create task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
