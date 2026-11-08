import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarClock, CheckSquare2, KanbanSquare, Megaphone, Workflow, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConversationTasks } from "@/hooks/use-conversation-tasks";
import { useTenantTimezone } from "@/hooks/use-timezone";
import { formatInTimezone } from "@/lib/datetime/timezone";
import { usePmProjects, usePmTasks } from "@/lib/project-management/client";
import { collectInboxDeadlines } from "@/lib/inbox/work-deadlines";
import { ProjectAutoUpdateDialog, useProjectAutoUpdateRule } from "./project-auto-update-dialog";

type Props = { conversationId: string; workspaceId: string; channel: string; recipient: string; onClose?: () => void };

function todayInTimezone(timezone: string | null | undefined) {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric", month: "2-digit", day: "2-digit",
  };
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", { ...options, timeZone: timezone || "UTC" }).formatToParts(new Date());
  } catch {
    parts = new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).formatToParts(new Date());
  }
  const part = (kind: string) => parts.find((item) => item.type === kind)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function InboxWorkPanel({ conversationId, workspaceId, channel, recipient, onClose }: Props) {
  const [autoUpdateOpen, setAutoUpdateOpen] = useState(false);
  const autoUpdate = useProjectAutoUpdateRule(workspaceId, conversationId, channel === "email");
  const timezone = useTenantTimezone();
  const projects = usePmProjects(workspaceId);
  const projectTasks = usePmTasks(workspaceId);
  const crmTasks = useConversationTasks(conversationId);
  const deadlines = useMemo(
    () => collectInboxDeadlines(
      projectTasks.data ?? [], projects.data ?? [], crmTasks.data ?? [],
      todayInTimezone(timezone), new Date().toISOString(),
    ),
    [projectTasks.data, projects.data, crmTasks.data, timezone],
  );
  const overdue = deadlines.filter((item) => item.overdue);
  const upcoming = deadlines.filter((item) => !item.overdue);

  return (
    <aside className="flex min-h-0 w-full flex-col border-l border-border bg-surface" aria-label="Inbox work and reminders">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-primary" />Work & reminders</div>
        {onClose && <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onClose} aria-label="Close work panel"><X className="h-4 w-4" /></Button>}
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-5 p-4">
          <section aria-label="Task deadlines" className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Task deadlines</h3>
              <Badge variant="secondary">{deadlines.length}</Badge>
            </div>
            {(projects.isLoading || projectTasks.isLoading || crmTasks.isLoading) && <p className="text-xs text-muted-foreground">Loading work</p>}
            {(projects.isError || projectTasks.isError) && <p className="text-xs text-destructive">Project deadlines could not load. Check that the project management migration is applied.</p>}
            {crmTasks.isError && <p className="text-xs text-destructive">Conversation tasks could not load.</p>}
            {!projects.isLoading && !projectTasks.isLoading && !crmTasks.isLoading && deadlines.length === 0 &&
              <p className="rounded-control border border-dashed border-border p-3 text-xs text-muted-foreground">No open tasks with deadlines in this workspace or conversation.</p>}
            {overdue.length > 0 && <DeadlineGroup title="Overdue" items={overdue} timezone={timezone} />}
            {upcoming.length > 0 && <DeadlineGroup title="Upcoming" items={upcoming.slice(0, 12)} timezone={timezone} />}
          </section>

          <section className="space-y-2 border-t border-border pt-4" aria-label="Reminder settings">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reminders</h3>
            <p className="text-xs leading-5 text-muted-foreground">Set when you receive in-app alerts before and after task deadlines.</p>
            <Button asChild size="sm" variant="outline" className="w-full justify-start gap-2"><Link to="/settings/task-reminders"><CalendarClock className="h-4 w-4" />Configure reminders</Link></Button>
          </section>

          <section className="space-y-2 border-t border-border pt-4" aria-label="Client project updates">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client project updates</h3>
            {channel === "email" ? <>
              <p className="text-xs leading-5 text-muted-foreground">Send a project summary to this email conversation each week.</p>
              {autoUpdate.isLoading && <p className="text-xs text-muted-foreground">Loading schedule…</p>}
              {autoUpdate.isError && <p className="text-xs text-destructive">Schedule unavailable. Check the client update migration.</p>}
              {autoUpdate.data && <p className="text-xs font-medium">{autoUpdate.data.enabled ? "Enabled" : "Paused"} · {autoUpdate.data.project_id ? (projects.data ?? []).find((project) => project.id === autoUpdate.data?.project_id)?.name ?? "Project" : "Project"} · {autoUpdate.data.day_of_week === 0 ? "Sunday" : ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][autoUpdate.data.day_of_week]} {String(autoUpdate.data.hour_utc).padStart(2, "0")}:00 UTC</p>}
              <Button type="button" size="sm" variant="outline" className="w-full justify-start gap-2" onClick={() => setAutoUpdateOpen(true)}><CalendarClock className="h-4 w-4" />{autoUpdate.data ? "Manage weekly update" : "Set up weekly update"}</Button>
            </> : <p className="text-xs leading-5 text-muted-foreground">Automatic updates currently support email conversations. Use Share project update in the composer for this channel.</p>}
          </section>

          <section className="space-y-2 border-t border-border pt-4" aria-label="Connected tools">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Continue work</h3>
            <ToolLink to="/projects" icon={<KanbanSquare className="h-4 w-4" />} label="Projects" />
            <ToolLink to="/projects/tasks" icon={<CheckSquare2 className="h-4 w-4" />} label="Project tasks" />
            <ToolLink to="/tasks" icon={<CheckSquare2 className="h-4 w-4" />} label="CRM tasks" />
            <ToolLink to="/campaigns" icon={<Megaphone className="h-4 w-4" />} label="Marketing campaigns" />
            <ToolLink to="/automations" icon={<Workflow className="h-4 w-4" />} label="Automations" />
          </section>
        </div>
      </ScrollArea>
      {channel === "email" && <ProjectAutoUpdateDialog open={autoUpdateOpen} onOpenChange={setAutoUpdateOpen} workspaceId={workspaceId} conversationId={conversationId} recipient={recipient} />}
    </aside>
  );
}

function DeadlineGroup({ title, items, timezone }: { title: string; items: ReturnType<typeof collectInboxDeadlines>; timezone: string | null | undefined }) {
  return <div className="space-y-1.5">
    <h4 className="text-xs font-medium">{title}</h4>
    {items.map((item) => <Link
      key={`${item.kind}-${item.id}`}
      to={item.kind === "project" ? "/projects/$projectId" : "/tasks"}
      params={item.kind === "project" ? { projectId: item.projectId! } : undefined}
      className="block rounded-control border border-border px-3 py-2 text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="block truncate font-medium text-foreground">{item.title}</span>
      <span className="mt-0.5 block truncate text-muted-foreground">{item.projectName ?? "CRM follow-up"} · {item.kind === "project" ? item.due : formatInTimezone(item.due, timezone, { dateStyle: "medium", timeStyle: "short" })}</span>
    </Link>)}
  </div>;
}

function ToolLink({ to, icon, label }: { to: "/projects" | "/projects/tasks" | "/tasks" | "/campaigns" | "/automations"; icon: ReactNode; label: string }) {
  return <Button asChild variant="ghost" size="sm" className="w-full justify-start gap-2 text-xs"><Link to={to}>{icon}{label}</Link></Button>;
}
