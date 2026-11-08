import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { sbAny } from "@/lib/supabase/untyped";
import { usePmProjects, usePmTasks } from "@/lib/project-management/client";
import { buildProjectUpdate } from "@/lib/inbox/project-update";

type Rule = {
  id: string;
  workspace_id: string;
  conversation_id: string;
  project_id: string;
  enabled: boolean;
  cadence: "weekly";
  day_of_week: number;
  hour_utc: number;
  include_tasks: boolean;
  last_sent_at: string | null;
  last_error: string | null;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ruleKey = (workspaceId: string, conversationId: string) =>
  ["pm", "client-update-rule", workspaceId, conversationId] as const;

export function useProjectAutoUpdateRule(workspaceId: string, conversationId: string, enabled = true) {
  return useQuery({
    queryKey: ruleKey(workspaceId, conversationId),
    enabled: enabled && !!workspaceId && !!conversationId,
    queryFn: async (): Promise<Rule | null> => {
      const { data, error } = await sbAny(supabase).from("pm_client_update_rules")
        .select("*").eq("workspace_id", workspaceId).eq("conversation_id", conversationId).maybeSingle();
      if (error) throw error;
      return data as Rule | null;
    },
  });
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  conversationId: string;
  recipient: string;
};

export function ProjectAutoUpdateDialog({ open, onOpenChange, workspaceId, conversationId, recipient }: Props) {
  const queryClient = useQueryClient();
  const rule = useProjectAutoUpdateRule(workspaceId, conversationId, open);
  const projects = usePmProjects(open ? workspaceId : null);
  const [projectId, setProjectId] = useState("");
  const [day, setDay] = useState("1");
  const [hour, setHour] = useState("9");
  const [includeTasks, setIncludeTasks] = useState(false);
  const project = (projects.data ?? []).find((item) => item.workspace_id === workspaceId && item.id === projectId);
  const tasks = usePmTasks(open && includeTasks && projectId ? workspaceId : null, projectId);
  const openTasks = (tasks.data ?? []).filter((item) => item.workspace_id === workspaceId && item.project_id === projectId && item.status !== "done")
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))
    .slice(0, 20);
  const preview = project ? buildProjectUpdate(project, includeTasks ? openTasks : []) : "Choose a project to preview the client update.";

  useEffect(() => {
    if (!open || rule.isLoading) return;
    setProjectId(rule.data?.project_id ?? "");
    setDay(String(rule.data?.day_of_week ?? 1));
    setHour(String(rule.data?.hour_utc ?? 9));
    setIncludeTasks(rule.data?.include_tasks ?? false);
  }, [open, rule.data, rule.isLoading, conversationId]);

  const save = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!project || project.workspace_id !== workspaceId || project.status === "archived") {
        throw new Error("Choose an active project in this workspace.");
      }
      const values = {
        workspace_id: workspaceId,
        conversation_id: conversationId,
        project_id: project.id,
        enabled,
        cadence: "weekly" as const,
        day_of_week: Number(day),
        hour_utc: Number(hour),
        include_tasks: includeTasks,
      };
      const { data, error } = await sbAny(supabase).from("pm_client_update_rules")
        .upsert(values, { onConflict: "workspace_id,conversation_id" }).select("id").single();
      if (error) throw error;
      if (!data) throw new Error("Update was not saved. Check your project access and try again.");
    },
    onSuccess: async (_, enabled) => {
      await queryClient.invalidateQueries({ queryKey: ruleKey(workspaceId, conversationId) });
      toast.success(enabled ? "Weekly client update enabled" : "Client update saved and paused");
      onOpenChange(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save client update"),
  });

  return <Dialog open={open} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
    <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary" />Automatic client update</DialogTitle>
        <DialogDescription>Send a project summary to this email conversation once a week. Nothing is sent until you enable the schedule.</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="rounded-control border border-border bg-muted/30 px-3 py-2 text-sm">
          <p className="flex items-center gap-2 font-medium"><Mail className="h-4 w-4 text-primary" />Recipient conversation</p>
          <p className="mt-1 break-all text-muted-foreground">{recipient}</p>
        </div>
        {rule.isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading schedule…</p>}
        {rule.isError && <p role="alert" className="text-sm text-destructive">Could not load this conversation’s schedule. Apply the client update migration or try again.</p>}
        {projects.isError && <p role="alert" className="text-sm text-destructive">Could not load workspace projects.</p>}
        {!rule.isLoading && !rule.isError && <>
          <div className="space-y-1.5">
            <Label htmlFor="auto-update-project">Project to share</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id="auto-update-project"><SelectValue placeholder={projects.isLoading ? "Loading projects…" : "Choose a project"} /></SelectTrigger>
              <SelectContent>
                {(projects.data ?? []).filter((item) => item.workspace_id === workspaceId && item.status !== "archived").map((item) =>
                  <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {!projects.isLoading && !projects.isError && !(projects.data ?? []).some((item) => item.workspace_id === workspaceId && item.status !== "archived") &&
              <p className="text-xs text-muted-foreground">Create an active project in this workspace first.</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="auto-update-day">Day (UTC)</Label>
              <Select value={day} onValueChange={setDay}><SelectTrigger id="auto-update-day"><SelectValue /></SelectTrigger><SelectContent>{DAYS.map((label, index) => <SelectItem key={label} value={String(index)}>{label}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="auto-update-hour">Time (UTC)</Label>
              <Select value={hour} onValueChange={setHour}><SelectTrigger id="auto-update-hour"><SelectValue /></SelectTrigger><SelectContent>{Array.from({ length: 24 }, (_, index) => <SelectItem key={index} value={String(index)}>{String(index).padStart(2, "0")}:00 UTC</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-control border border-border px-3 py-2 text-sm">
            <Checkbox checked={includeTasks} onCheckedChange={(checked) => setIncludeTasks(checked === true)} aria-label="Include open task details" />
            <span><span className="block font-medium">Include open tasks</span><span className="block text-xs text-muted-foreground">Includes up to 20 open tasks and their deadlines. Leave off if task details are private.</span></span>
          </label>
          <div className="space-y-1.5"><p className="text-xs font-medium text-muted-foreground">Message preview</p>
            {tasks.isLoading && includeTasks && <p className="text-xs text-muted-foreground">Loading task details…</p>}
            {tasks.isError && includeTasks && <p role="alert" className="text-xs text-destructive">Could not load tasks. Turn off task details or try again before enabling.</p>}
            <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words rounded-control border border-border bg-muted/30 p-3 font-sans text-xs">{preview}</pre>
          </div>
          {rule.data?.last_sent_at && <p className="text-xs text-muted-foreground">Last sent: {new Date(rule.data.last_sent_at).toLocaleString()}</p>}
          {rule.data?.last_error && <p role="alert" className="text-xs text-destructive">Last delivery failed: {rule.data.last_error}</p>}
        </>}
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
        <Button type="button" variant="secondary" onClick={() => save.mutate(false)} disabled={!project || rule.isLoading || rule.isError || projects.isError || tasks.isError || tasks.isLoading || save.isPending}>Save paused</Button>
        <Button type="button" onClick={() => save.mutate(true)} disabled={!project || rule.isLoading || rule.isError || projects.isError || tasks.isError || tasks.isLoading || save.isPending}>
          {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{rule.data?.enabled ? "Save enabled" : "Enable weekly send"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
