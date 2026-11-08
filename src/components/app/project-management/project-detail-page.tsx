import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  LayoutDashboard,
  ListTodo,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { FormattedText } from "@/components/app/inbox/formatted-text";
import { AppTopbar } from "@/components/app/app-topbar";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentWorkspace, useWorkspaceRole } from "@/hooks/use-workspace";
import {
  useAddPmProjectMember,
  useDeletePmProject,
  usePmProjectMembers,
  usePmProjects,
  usePmTasks,
  usePmWorkspaceUsers,
  useRemovePmProjectMember,
  useUpdatePmProjectMember,
  useUpdatePmTask,
  type PmProjectMember,
  type PmTask,
} from "@/lib/project-management/client";
import { ProjectFormDialog } from "./project-form-dialog";
import { TaskFormDialog } from "./task-form-dialog";
import { TaskDetailDialog } from "./task-detail-dialog";
import { TaskBoard, TaskList } from "./task-views";
import { PROJECT_STATUS_LABELS, TASK_STATUS_LABELS, errorMessage, shortDate } from "./labels";

const MEMBER_ROLE_LABELS: Record<PmProjectMember["role"], string> = {
  manager: "Manager",
  member: "Member",
  viewer: "Viewer",
};
const EMPTY_TASKS: PmTask[] = [];

export function ProjectDetailPage({ projectId }: { projectId: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { active } = useCurrentWorkspace();
  const { user } = useAuth();
  const workspaceId = active?.id ?? null;
  const { data: workspaceRole } = useWorkspaceRole(workspaceId ?? undefined);
  const projectsQuery = usePmProjects(workspaceId);
  const tasksQuery = usePmTasks(workspaceId, projectId);
  const membersQuery = usePmProjectMembers(projectId);
  const usersQuery = usePmWorkspaceUsers(workspaceId);
  const projects = projectsQuery.data ?? [];
  const project = projects.find((item) => item.id === projectId);
  const tasks = tasksQuery.data ?? EMPTY_TASKS;
  const members = membersQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const ownMembership = members.find((member) => member.user_id === user?.id);
  const elevatedWorkspaceRole =
    workspaceRole === "owner" ||
    workspaceRole === "admin" ||
    (workspaceRole as string | null) === "manager";
  const canManageProject =
    elevatedWorkspaceRole || project?.owner_id === user?.id || ownMembership?.role === "manager";
  const canDeleteProject = elevatedWorkspaceRole || project?.owner_id === user?.id;
  const canEditTasks =
    project?.status !== "archived" && (canManageProject || ownMembership?.role === "member");
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [newMemberId, setNewMemberId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<PmProjectMember["role"]>("member");
  const [memberError, setMemberError] = useState("");
  const editingTask = editingTaskId
    ? (tasks.find((task) => task.id === editingTaskId) ?? null)
    : null;
  const [taskViewOpen, setTaskViewOpen] = useState(false);
  const [viewingTaskId, setViewingTaskId] = useState<string | null>(null);
  const viewingTask = viewingTaskId
    ? (tasks.find((task) => task.id === viewingTaskId) ?? null)
    : null;
  useEffect(() => {
    if (tasksQuery.isLoading || tasksQuery.isError) return;
    const id = new URLSearchParams(window.location.search).get("taskId");
    if (id && tasks.some((task) => task.id === id)) {
      setViewingTaskId(id);
      setTaskViewOpen(true);
    }
  }, [location.href, tasks, tasksQuery.isLoading, tasksQuery.isError]);
  const move = useUpdatePmTask();
  const removeProject = useDeletePmProject();
  const addMember = useAddPmProjectMember();
  const updateMember = useUpdatePmProjectMember();
  const removeMember = useRemovePmProjectMember();

  const progress = useMemo(() => {
    const done = tasks.filter((task) => task.status === "done").length;
    return {
      done,
      open: tasks.length - done,
      percent: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
    };
  }, [tasks]);
  const availableUsers = users.filter(
    (candidate) => !members.some((member) => member.user_id === candidate.user_id),
  );

  function onMove(task: PmTask, status: PmTask["status"]) {
    if (!workspaceId || !canEditTasks || move.isPending || task.status === status) return;
    move.mutate(
      { id: task.id, workspace_id: workspaceId, project_id: projectId, status },
      {
        onSuccess: () => toast.success(`Moved to ${TASK_STATUS_LABELS[status]}`),
        onError: (error) => toast.error(`Could not move task. ${errorMessage(error)}`),
      },
    );
  }

  async function deleteProject() {
    if (!workspaceId || !project || removeProject.isPending) return;
    try {
      await removeProject.mutateAsync({ id: projectId, workspace_id: workspaceId });
      toast.success("Project deleted");
      setDeleteProjectOpen(false);
      await navigate({ to: "/projects" });
    } catch (error) {
      toast.error(`Could not delete project. ${errorMessage(error)}`);
    }
  }

  async function addTeamMember() {
    if (!workspaceId || !newMemberId || addMember.isPending) return;
    setMemberError("");
    try {
      await addMember.mutateAsync({
        workspace_id: workspaceId,
        project_id: projectId,
        user_id: newMemberId,
        role: newMemberRole,
      });
      setNewMemberId("");
      toast.success("Person added to project");
    } catch (error) {
      setMemberError(`Could not add person. ${errorMessage(error)}`);
    }
  }

  async function setMemberRole(member: PmProjectMember, role: PmProjectMember["role"]) {
    if (!workspaceId || updateMember.isPending) return;
    try {
      await updateMember.mutateAsync({
        id: member.id,
        workspace_id: workspaceId,
        project_id: projectId,
        role,
      });
      toast.success("Project role updated");
    } catch (error) {
      toast.error(`Could not update role. ${errorMessage(error)}`);
    }
  }

  async function removeTeamMember(member: PmProjectMember) {
    if (!workspaceId || removeMember.isPending) return;
    try {
      await removeMember.mutateAsync({
        id: member.id,
        workspace_id: workspaceId,
        project_id: projectId,
      });
      toast.success("Person removed from project");
    } catch (error) {
      toast.error(`Could not remove person. ${errorMessage(error)}`);
    }
  }

  if (projectsQuery.isLoading)
    return (
      <>
        <AppTopbar title="Loading project" />
        <main className="p-6 text-sm text-muted-foreground">Loading project</main>
      </>
    );
  if (projectsQuery.isError)
    return (
      <>
        <AppTopbar title="Project" />
        <main className="p-6 text-sm text-destructive">
          Could not load project. {errorMessage(projectsQuery.error)}{" "}
          <Button variant="outline" size="sm" onClick={() => void projectsQuery.refetch()}>
            Retry
          </Button>
        </main>
      </>
    );
  if (!project)
    return (
      <>
        <AppTopbar title="Project not found" />
        <main className="p-6 text-sm text-muted-foreground">
          This project is unavailable.{" "}
          <Link to="/projects" className="font-medium text-primary underline">
            Back to projects
          </Link>
        </main>
      </>
    );

  return (
    <>
      <AppTopbar
        title={project.name}
        subtitle={PROJECT_STATUS_LABELS[project.status]}
        actions={
          <div className="flex flex-wrap gap-2">
            {canManageProject && (
              <Button variant="outline" size="sm" onClick={() => setEditProjectOpen(true)}>
                <Pencil className="h-4 w-4" /> Edit project
              </Button>
            )}
            {canEditTasks && (
              <Button
                size="sm"
                onClick={() => {
                  setEditingTaskId(null);
                  setTaskDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> New task
              </Button>
            )}
          </div>
        }
      />
      <main className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
        <Link
          to="/projects"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All projects
        </Link>
        <Card className="overflow-hidden">
          <div className="h-1.5" style={{ backgroundColor: project.color || "var(--primary)" }} />
          <div className="grid gap-5 p-5 lg:grid-cols-[1fr_auto] lg:items-start">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {project.logo_url && (
                  <img src={project.logo_url} alt={`${project.name} logo`} className="h-10 w-10 rounded-control object-contain" />
                )}
                <h1 className="text-xl font-semibold">{project.name}</h1>
                <Badge variant="secondary">{PROJECT_STATUS_LABELS[project.status]}</Badge>
              </div>
              {project.description ? (
                <FormattedText text={project.description} className="max-w-3xl text-sm text-muted-foreground" />
              ) : (
                <p className="text-sm text-muted-foreground">No project description yet.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Progress</p>
                <p className="font-semibold tabular-nums">{progress.percent}%</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Open tasks</p>
                <p className="font-semibold tabular-nums">{progress.open}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Due date</p>
                <p className="font-semibold">{shortDate(project.due_date)}</p>
              </div>
            </div>
          </div>
          <div
            className="h-1.5 bg-muted"
            role="progressbar"
            aria-label="Project completion"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
          >
            <div
              className="h-full bg-primary transition-[width]"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </Card>

        <Tabs defaultValue="board" className="space-y-4">
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="board" className="gap-1.5">
              <LayoutDashboard className="h-4 w-4" /> Kanban
            </TabsTrigger>
            <TabsTrigger value="list" className="gap-1.5">
              <ListTodo className="h-4 w-4" /> Tasks
            </TabsTrigger>
            <TabsTrigger value="team" className="gap-1.5">
              <UsersRound className="h-4 w-4" /> Project team{" "}
              <span className="ml-1 text-xs text-muted-foreground">{members.length}</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="board" className="space-y-3">
            {tasksQuery.isLoading || usersQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading tasks</p>
            ) : tasksQuery.isError || usersQuery.isError ? (
              <p role="alert" className="text-sm text-destructive">
                Could not load tasks. {errorMessage(tasksQuery.error ?? usersQuery.error)}{" "}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void tasksQuery.refetch();
                    void usersQuery.refetch();
                  }}
                >
                  Retry
                </Button>
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {progress.done} of {tasks.length} tasks complete
                </p>
                <TaskBoard
                  tasks={tasks}
                  projects={projects}
                  users={users}
                  onView={(task) => {
                    setViewingTaskId(task.id);
                    setTaskViewOpen(true);
                  }}
                  onEdit={(task) => {
                    setEditingTaskId(task.id);
                    setTaskDialogOpen(true);
                  }}
                  onMove={onMove}
                  canEdit={canEditTasks}
                />
              </>
            )}
          </TabsContent>
          <TabsContent value="list" className="space-y-3">
            {tasksQuery.isLoading || usersQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading tasks</p>
            ) : tasksQuery.isError || usersQuery.isError ? (
              <p role="alert" className="text-sm text-destructive">
                Could not load tasks. {errorMessage(tasksQuery.error ?? usersQuery.error)}{" "}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void tasksQuery.refetch();
                    void usersQuery.refetch();
                  }}
                >
                  Retry
                </Button>
              </p>
            ) : (
              <TaskList
                tasks={tasks}
                projects={projects}
                users={users}
                onView={(task) => {
                  setViewingTaskId(task.id);
                  setTaskViewOpen(true);
                }}
                onEdit={(task) => {
                  setEditingTaskId(task.id);
                  setTaskDialogOpen(true);
                }}
                onMove={onMove}
                canEdit={canEditTasks}
              />
            )}
          </TabsContent>
          <TabsContent value="team" className="space-y-4">
            <Card className="p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold">People on this project</h2>
                  <p className="text-sm text-muted-foreground">
                    Members can be assigned work. Viewers can follow progress.
                  </p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/projects/team">
                    <UsersRound className="h-4 w-4" /> Manage project team
                  </Link>
                </Button>
              </div>
              {membersQuery.isLoading || usersQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading people</p>
              ) : membersQuery.isError || usersQuery.isError ? (
                <p role="alert" className="text-sm text-destructive">
                  Could not load project team.{" "}
                  {errorMessage(membersQuery.error ?? usersQuery.error)}{" "}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void membersQuery.refetch();
                      void usersQuery.refetch();
                    }}
                  >
                    Retry
                  </Button>
                </p>
              ) : (
                <>
                  {members.length === 0 ? (
                    <p className="rounded-control border border-dashed p-6 text-sm text-muted-foreground">
                      No one has been added to this project yet.
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {members.map((member) => {
                        const person = users.find((item) => item.user_id === member.user_id);
                        return (
                          <li key={member.id} className="flex flex-wrap items-center gap-3 py-3">
                            <span
                              className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                              aria-hidden="true"
                            >
                              {(person?.display_name || person?.email || "U")
                                .slice(0, 2)
                                .toUpperCase()}
                            </span>
                            <div className="min-w-[160px] flex-1">
                              <p className="text-sm font-medium">
                                {person?.display_name || person?.email || "Workspace user"}
                              </p>
                              <p className="text-xs text-muted-foreground">{person?.email}</p>
                            </div>
                            {canManageProject ? (
                              <>
                                <Select
                                  value={member.role}
                                  onValueChange={(value) =>
                                    void setMemberRole(member, value as PmProjectMember["role"])
                                  }
                                  disabled={
                                    updateMember.isPending || member.user_id === project.owner_id
                                  }
                                >
                                  <SelectTrigger
                                    className="w-[130px]"
                                    aria-label={`Role for ${person?.display_name || person?.email || "user"}`}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(
                                      Object.keys(MEMBER_ROLE_LABELS) as PmProjectMember["role"][]
                                    ).map((role) => (
                                      <SelectItem key={role} value={role}>
                                        {MEMBER_ROLE_LABELS[role]}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive"
                                  onClick={() => void removeTeamMember(member)}
                                  disabled={
                                    removeMember.isPending || member.user_id === project.owner_id
                                  }
                                  aria-label={`Remove ${person?.display_name || person?.email || "user"} from project`}
                                >
                                  Remove
                                </Button>
                              </>
                            ) : (
                              <Badge variant="outline">{MEMBER_ROLE_LABELS[member.role]}</Badge>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {canManageProject && (
                    <div className="mt-5 flex flex-wrap items-end gap-2 border-t pt-4">
                      <div className="min-w-[190px] flex-1 space-y-1">
                        <label htmlFor="pm-add-member" className="text-sm font-medium">
                          Add workspace user
                        </label>
                        <Select value={newMemberId || undefined} onValueChange={setNewMemberId}>
                          <SelectTrigger id="pm-add-member">
                            <SelectValue placeholder="Choose a person" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableUsers.map((person) => (
                              <SelectItem key={person.user_id} value={person.user_id}>
                                {person.display_name || person.email || "Workspace user"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="pm-member-role" className="text-sm font-medium">
                          Role
                        </label>
                        <Select
                          value={newMemberRole}
                          onValueChange={(value) =>
                            setNewMemberRole(value as PmProjectMember["role"])
                          }
                        >
                          <SelectTrigger id="pm-member-role" className="w-[130px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(MEMBER_ROLE_LABELS) as PmProjectMember["role"][]).map(
                              (role) => (
                                <SelectItem key={role} value={role}>
                                  {MEMBER_ROLE_LABELS[role]}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        onClick={() => void addTeamMember()}
                        disabled={!newMemberId || addMember.isPending}
                      >
                        <UserPlus className="h-4 w-4" />{" "}
                        {addMember.isPending ? "Adding" : "Add person"}
                      </Button>
                    </div>
                  )}
                  {memberError && (
                    <p role="alert" className="mt-2 text-sm text-destructive">
                      {memberError}
                    </p>
                  )}
                </>
              )}
            </Card>
          </TabsContent>
        </Tabs>
        {canDeleteProject && (
          <div className="border-t pt-5">
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleteProjectOpen(true)}
            >
              <Trash2 className="h-4 w-4" /> Delete project
            </Button>
          </div>
        )}
      </main>
      <ProjectFormDialog
        open={editProjectOpen}
        onOpenChange={setEditProjectOpen}
        workspaceId={workspaceId}
        project={project}
      />
      <TaskFormDialog
        open={taskDialogOpen}
        onOpenChange={(next) => {
          setTaskDialogOpen(next);
          if (!next) setEditingTaskId(null);
        }}
        workspaceId={workspaceId}
        projectId={projectId}
        task={editingTask}
        projects={projects}
        users={users}
        readOnly={!canEditTasks}
      />
      <TaskDetailDialog
        open={taskViewOpen}
        onOpenChange={(next) => {
          setTaskViewOpen(next);
          if (!next) setViewingTaskId(null);
        }}
        task={viewingTask}
        projects={projects}
        users={users}
        canEdit={canEditTasks}
        onEdit={(task) => {
          setEditingTaskId(task.id);
          setTaskDialogOpen(true);
        }}
      />
      <AlertDialog
        open={deleteProjectOpen}
        onOpenChange={(next) => {
          if (!removeProject.isPending) setDeleteProjectOpen(next);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{project.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the project, its {tasks.length} task
              {tasks.length === 1 ? "" : "s"}, and its team assignments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeProject.isPending}>Keep project</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void deleteProject();
              }}
              disabled={removeProject.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeProject.isPending ? "Deleting" : "Delete project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
