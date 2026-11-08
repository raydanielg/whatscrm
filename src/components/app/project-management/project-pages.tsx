import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  Plus,
  Search,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { stripFormatting } from "@/lib/inbox/rich-text";
import { AppTopbar } from "@/components/app/app-topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentWorkspace, useWorkspaceRole } from "@/hooks/use-workspace";
import {
  usePmProjects,
  usePmTasks,
  usePmWorkspaceProjectMembers,
  usePmWorkspaceUsers,
  useUpdatePmTask,
  type PmProject,
  type PmTask,
} from "@/lib/project-management/client";
import { ProjectFormDialog } from "./project-form-dialog";
import { TaskFormDialog } from "./task-form-dialog";
import { TaskDetailDialog } from "./task-detail-dialog";
import { TaskBoard, TaskList } from "./task-views";
import { PROJECT_STATUS_LABELS, TASK_STATUS_LABELS, errorMessage, shortDate } from "./labels";

const EMPTY_PROJECTS: PmProject[] = [];
const EMPTY_TASKS: PmTask[] = [];

function ProjectTaskStats({ project, tasks }: { project: PmProject; tasks: PmTask[] }) {
  const projectTasks = tasks.filter((task) => task.project_id === project.id);
  const completed = projectTasks.filter((task) => task.status === "done").length;
  const percent = projectTasks.length ? Math.round((completed / projectTasks.length) * 100) : 0;
  return (
    <>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {completed} of {projectTasks.length} tasks complete
        </span>
        <span className="tabular-nums">{percent}%</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={`${project.name} progress`}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </>
  );
}

function EmptyOrError({
  error,
  retry,
  title,
  action,
}: {
  error?: unknown;
  retry?: () => void;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-control border border-dashed bg-card px-6 py-14 text-center">
      <FolderKanban
        className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40"
        aria-hidden="true"
      />
      <p className="font-medium">{error ? "Could not load projects" : title}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {error
          ? errorMessage(error)
          : "Create a project to organize tasks, deadlines, and your team."}
      </p>
      <div className="mt-4 flex justify-center">
        {error ? (
          <Button type="button" variant="outline" onClick={retry}>
            Retry
          </Button>
        ) : (
          action
        )}
      </div>
    </div>
  );
}

export function ProjectsOverviewPage() {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id ?? null;
  const { data: workspaceRole } = useWorkspaceRole(workspaceId ?? undefined);
  const canCreateProject =
    workspaceRole === "owner" ||
    workspaceRole === "admin" ||
    workspaceRole === "agent" ||
    (workspaceRole as string | null) === "manager";
  const projectsQuery = usePmProjects(workspaceId);
  const tasksQuery = usePmTasks(workspaceId);
  const projects = projectsQuery.data ?? EMPTY_PROJECTS;
  const tasks = tasksQuery.data ?? EMPTY_TASKS;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("current");
  const [createOpen, setCreateOpen] = useState(false);
  const shown = useMemo(
    () =>
      projects.filter((project) => {
        if (status === "current" && project.status === "archived") return false;
        if (status !== "all" && status !== "current" && project.status !== status) return false;
        const query = search.trim().toLowerCase();
        return (
          !query || `${project.name} ${project.description ?? ""}`.toLowerCase().includes(query)
        );
      }),
    [projects, search, status],
  );
  const activeCount = projects.filter((project) => project.status === "active").length;
  const openCount = tasks.filter((task) => task.status !== "done").length;

  return (
    <>
      <AppTopbar
        title="Projects"
        subtitle="Plan work and keep every task moving"
        actions={
          canCreateProject && (
            <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!workspaceId}>
              <Plus className="h-4 w-4" /> New project
            </Button>
          )
        }
      />
      <main className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
        <section className="grid gap-3 sm:grid-cols-3" aria-label="Project overview">
          <Card className="flex items-center gap-3 p-4">
            <span className="rounded-control bg-primary/10 p-2.5 text-primary">
              <FolderKanban className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-semibold tabular-nums">{projects.length}</p>
              <p className="text-xs text-muted-foreground">Total projects</p>
            </div>
          </Card>
          <Card className="flex items-center gap-3 p-4">
            <span className="rounded-control bg-sky-500/10 p-2.5 text-sky-600">
              <LayoutDashboard className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-semibold tabular-nums">{activeCount}</p>
              <p className="text-xs text-muted-foreground">Active projects</p>
            </div>
          </Card>
          <Card className="flex items-center gap-3 p-4">
            <span className="rounded-control bg-amber-500/10 p-2.5 text-amber-600">
              <ListTodo className="h-5 w-5" />
            </span>
            <div>
              <p className="text-2xl font-semibold tabular-nums">{openCount}</p>
              <p className="text-xs text-muted-foreground">Tasks to finish</p>
            </div>
          </Card>
        </section>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
            <Search
              className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              className="pl-9"
              placeholder="Search projects"
              aria-label="Search projects"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[165px]" aria-label="Filter project status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="current">Current projects</SelectItem>
              <SelectItem value="all">All projects</SelectItem>
              {(Object.keys(PROJECT_STATUS_LABELS) as PmProject["status"][]).map((value) => (
                <SelectItem key={value} value={value}>
                  {PROJECT_STATUS_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" asChild>
            <Link to="/projects/board">
              <LayoutDashboard className="h-4 w-4" /> Kanban board
            </Link>
          </Button>
        </div>
        {projectsQuery.isLoading || tasksQuery.isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading projects</div>
        ) : projectsQuery.isError || tasksQuery.isError ? (
          <EmptyOrError
            title=""
            error={projectsQuery.error ?? tasksQuery.error}
            retry={() => {
              void projectsQuery.refetch();
              void tasksQuery.refetch();
            }}
          />
        ) : projects.length === 0 ? (
          <EmptyOrError
            title="No projects yet"
            action={
              canCreateProject && (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" /> Create project
                </Button>
              )
            }
          />
        ) : shown.length === 0 ? (
          <div className="rounded-control border border-dashed p-10 text-center text-sm text-muted-foreground">
            No projects match your filters.
          </div>
        ) : (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Projects">
            {shown.map((project) => (
              <Card
                key={project.id}
                className="flex min-h-[222px] flex-col gap-4 p-5 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-control text-white"
                    style={{ backgroundColor: project.color || "var(--primary)" }}
                  >
                    {project.logo_url ? (
                      <img src={project.logo_url} alt={`${project.name} logo`} className="h-full w-full object-contain" />
                    ) : (
                      <FolderKanban className="h-5 w-5" />
                    )}
                  </span>
                  <Badge variant="secondary">{PROJECT_STATUS_LABELS[project.status]}</Badge>
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="line-clamp-1 text-base font-semibold">
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: project.id }}
                      className="hover:text-primary focus-visible:rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {project.name}
                    </Link>
                  </h2>
                  <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted-foreground">
                    {project.description ? stripFormatting(project.description).replace(/\s+/g, " ") : "No description yet."}
                  </p>
                </div>
                <ProjectTaskStats project={project} tasks={tasks} />
                <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {shortDate(project.due_date)}
                  </span>
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: project.id }}
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    Open project <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </Card>
            ))}
          </section>
        )}
      </main>
      <ProjectFormDialog open={createOpen} onOpenChange={setCreateOpen} workspaceId={workspaceId} />
    </>
  );
}

export function ProjectTasksPage({ view }: { view: "board" | "list" }) {
  const { active } = useCurrentWorkspace();
  const { user } = useAuth();
  const workspaceId = active?.id ?? null;
  const { data: workspaceRole } = useWorkspaceRole(workspaceId ?? undefined);
  const projectsQuery = usePmProjects(workspaceId);
  const tasksQuery = usePmTasks(workspaceId);
  const membershipsQuery = usePmWorkspaceProjectMembers(workspaceId);
  const usersQuery = usePmWorkspaceUsers(workspaceId);
  const projects = projectsQuery.data ?? EMPTY_PROJECTS;
  const tasks = tasksQuery.data ?? EMPTY_TASKS;
  const users = usersQuery.data ?? [];
  const memberships = membershipsQuery.data ?? [];
  const loadError =
    tasksQuery.error ?? projectsQuery.error ?? usersQuery.error ?? membershipsQuery.error;
  const move = useUpdatePmTask();
  const [search, setSearch] = useState("");
  const [projectId, setProjectId] = useState("all");
  const [status, setStatus] = useState("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId ? (tasks.find((task) => task.id === editingId) ?? null) : null;
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewing = viewingId ? (tasks.find((task) => task.id === viewingId) ?? null) : null;
  const elevatedWorkspaceRole =
    workspaceRole === "owner" ||
    workspaceRole === "admin" ||
    (workspaceRole as string | null) === "manager";
  const canEditProject = (project: PmProject): boolean =>
    project.status !== "archived" &&
    (elevatedWorkspaceRole ||
      project.owner_id === user?.id ||
      memberships.some(
        (member) =>
          member.project_id === project.id &&
          member.user_id === user?.id &&
          member.role !== "viewer",
      ));
  const canEditTask = (task: PmTask): boolean => {
    const project = projects.find((item) => item.id === task.project_id);
    return !!project && canEditProject(project);
  };
  const canCreateTask =
    projectId === "all"
      ? projects.some(canEditProject)
      : !!projects.find((project) => project.id === projectId && canEditProject(project));

  const visible = useMemo(
    () =>
      tasks.filter((task) => {
        if (projectId !== "all" && task.project_id !== projectId) return false;
        if (status !== "all" && task.status !== status) return false;
        if (mineOnly && task.assignee_id !== user?.id) return false;
        return (
          !search.trim() ||
          `${task.title} ${task.description ?? ""}`
            .toLowerCase()
            .includes(search.trim().toLowerCase())
        );
      }),
    [tasks, projectId, status, mineOnly, user?.id, search],
  );

  function onMove(task: PmTask, nextStatus: PmTask["status"]) {
    if (!workspaceId || !canEditTask(task) || move.isPending || task.status === nextStatus) return;
    move.mutate(
      { id: task.id, workspace_id: workspaceId, project_id: task.project_id, status: nextStatus },
      {
        onSuccess: () => toast.success(`Moved to ${TASK_STATUS_LABELS[nextStatus]}`),
        onError: (error) => toast.error(`Could not move task. ${errorMessage(error)}`),
      },
    );
  }

  return (
    <>
      <AppTopbar
        title={view === "board" ? "Kanban board" : "Project tasks"}
        subtitle="Work across every project in this workspace"
        actions={
          canCreateTask && (
            <Button
              size="sm"
              onClick={() => {
                setEditingId(null);
                setDialogOpen(true);
              }}
              disabled={membershipsQuery.isLoading}
            >
              <Plus className="h-4 w-4" /> New task
            </Button>
          )
        }
      />
      <main className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
            <Search
              className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              className="pl-9"
              placeholder="Search tasks"
              aria-label="Search tasks"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="w-[180px]" aria-label="Filter by project">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {view === "list" && (
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[150px]" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {(Object.keys(TASK_STATUS_LABELS) as PmTask["status"][]).map((value) => (
                  <SelectItem key={value} value={value}>
                    {TASK_STATUS_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant={mineOnly ? "default" : "outline"}
            onClick={() => setMineOnly((value) => !value)}
            aria-pressed={mineOnly}
          >
            Assigned to me
          </Button>
          <div className="flex rounded-control border p-0.5 h-9">
            <Button variant={view === "list" ? "secondary" : "ghost"} size="sm" className="h-7.5" asChild>
              <Link to="/projects/tasks">
                <ListTodo className="h-4 w-4" /> List
              </Link>
            </Button>
            <Button variant={view === "board" ? "secondary" : "ghost"} size="sm" className="h-7.5" asChild>
              <Link to="/projects/board">
                <LayoutDashboard className="h-4 w-4" /> Board
              </Link>
            </Button>
          </div>
        </div>
        {tasksQuery.isLoading ||
        projectsQuery.isLoading ||
        usersQuery.isLoading ||
        membershipsQuery.isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading tasks</div>
        ) : tasksQuery.isError ||
          projectsQuery.isError ||
          usersQuery.isError ||
          membershipsQuery.isError ? (
          <div className="rounded-control border p-8 text-sm text-destructive" role="alert">
            <p className="font-medium">Could not load tasks.</p>
            <p className="mt-1">{errorMessage(loadError)}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                void tasksQuery.refetch();
                void projectsQuery.refetch();
                void usersQuery.refetch();
                void membershipsQuery.refetch();
              }}
            >
              Retry
            </Button>
          </div>
        ) : projects.length === 0 ? (
          <EmptyOrError
            title="No projects yet"
            action={
              workspaceRole !== "viewer" && (
                <Button asChild>
                  <Link to="/projects">Create a project</Link>
                </Button>
              )
            }
          />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {visible.length} task{visible.length === 1 ? "" : "s"} in view
            </p>
            {view === "board" ? (
              <TaskBoard
                tasks={visible}
                projects={projects}
                users={users}
                onView={(task) => {
                  setViewingId(task.id);
                  setViewDialogOpen(true);
                }}
                onEdit={(task) => {
                  setEditingId(task.id);
                  setDialogOpen(true);
                }}
                onMove={onMove}
                showProject
                canEditTask={canEditTask}
              />
            ) : (
              <TaskList
                tasks={visible}
                projects={projects}
                users={users}
                onView={(task) => {
                  setViewingId(task.id);
                  setViewDialogOpen(true);
                }}
                onEdit={(task) => {
                  setEditingId(task.id);
                  setDialogOpen(true);
                }}
                onMove={onMove}
                showProject
                canEditTask={canEditTask}
              />
            )}
          </>
        )}
      </main>
      <TaskFormDialog
        open={dialogOpen}
        onOpenChange={(next) => {
          setDialogOpen(next);
          if (!next) setEditingId(null);
        }}
        workspaceId={workspaceId}
        projectId={projectId === "all" ? "" : projectId}
        task={editing}
        projects={projects}
        users={users}
        readOnly={!!editing && !canEditTask(editing)}
        canCreateInProject={canEditProject}
      />
      <TaskDetailDialog
        open={viewDialogOpen}
        onOpenChange={(next) => {
          setViewDialogOpen(next);
          if (!next) setViewingId(null);
        }}
        task={viewing}
        projects={projects}
        users={users}
        canEdit={!!viewing && canEditTask(viewing)}
        onEdit={(task) => {
          setEditingId(task.id);
          setDialogOpen(true);
        }}
      />
    </>
  );
}
