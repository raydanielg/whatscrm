import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FolderKanban, Plus, Search, UserRoundX, UsersRound } from "lucide-react";
import { toast } from "sonner";

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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  useAddPmProjectMember,
  usePmProjectMembers,
  usePmProjects,
  usePmWorkspaceUsers,
  useRemovePmProjectMember,
  useUpdatePmProjectMember,
  type PmProjectMember,
  type PmWorkspaceUser,
} from "@/lib/project-management/client";
import { errorMessage } from "@/components/app/project-management/labels";

export const Route = createFileRoute("/_authenticated/projects/team")({
  component: ProjectTeamPage,
  staticData: { breadcrumb: "Project team" },
  head: () => ({ meta: [{ title: "Project team" }] }),
});

type ProjectRole = PmProjectMember["role"];
const PROJECT_ROLES: { value: ProjectRole; label: string; description: string }[] = [
  { value: "manager", label: "Manager", description: "Manage members and project work" },
  { value: "member", label: "Member", description: "Create and update project tasks" },
  { value: "viewer", label: "Viewer", description: "Read project work" },
];

function displayName(user: PmWorkspaceUser | undefined) {
  return user?.display_name?.trim() || user?.email || "Workspace member";
}

function ProjectTeamPage() {
  const { active: workspace, isLoading: workspaceLoading } = useCurrentWorkspace();
  const { data: workspaceRole } = useWorkspaceRole(workspace?.id);
  const { user: currentUser } = useAuth();
  const projects = usePmProjects(workspace?.id);
  const workspaceUsers = usePmWorkspaceUsers(workspace?.id);
  const [projectId, setProjectId] = useState<string | null>(null);
  const project = projects.data?.find((item) => item.id === projectId) ?? projects.data?.[0];
  const members = usePmProjectMembers(project?.id);
  const addMember = useAddPmProjectMember();
  const updateMember = useUpdatePmProjectMember();
  const removeMember = useRemovePmProjectMember();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newRole, setNewRole] = useState<ProjectRole>("member");
  const [removeTarget, setRemoveTarget] = useState<PmProjectMember | null>(null);

  const byUserId = useMemo(
    () => new Map((workspaceUsers.data ?? []).map((item) => [item.user_id, item])),
    [workspaceUsers.data],
  );
  const projectMembers = members.data ?? [];
  const memberIds = new Set(projectMembers.map((item) => item.user_id));
  const availableUsers = (workspaceUsers.data ?? []).filter(
    (item) => !memberIds.has(item.user_id) && item.user_id !== project?.owner_id,
  );
  const myProjectRole = projectMembers.find((item) => item.user_id === currentUser?.id)?.role;
  const canManage =
    ["owner", "admin", "manager"].includes(workspaceRole ?? "") ||
    project?.owner_id === currentUser?.id ||
    myProjectRole === "manager";
  const ownerUser = project?.owner_id ? byUserId.get(project.owner_id) : undefined;
  const ownerIsMember = !!project?.owner_id && memberIds.has(project.owner_id);
  const visibleMembers = projectMembers.filter((member) => {
    const needle = search.trim().toLowerCase();
    if (!needle) return true;
    const user = byUserId.get(member.user_id);
    return `${displayName(user)} ${user?.email ?? ""} ${member.role}`
      .toLowerCase()
      .includes(needle);
  });
  const ownerVisible =
    ownerUser &&
    !ownerIsMember &&
    (!search.trim() ||
      `${displayName(ownerUser)} ${ownerUser.email ?? ""} owner`
        .toLowerCase()
        .includes(search.trim().toLowerCase()));

  async function addSelectedMember() {
    if (!workspace || !project || !newUserId) return;
    try {
      await addMember.mutateAsync({
        workspace_id: workspace.id,
        project_id: project.id,
        user_id: newUserId,
        role: newRole,
      });
      toast.success("Project member added");
      setNewUserId("");
      setNewRole("member");
      setAddOpen(false);
    } catch (error) {
      toast.error(`Could not add project member. ${errorMessage(error)}`);
    }
  }

  async function changeRole(member: PmProjectMember, role: ProjectRole) {
    if (!workspace || !project || role === member.role) return;
    try {
      await updateMember.mutateAsync({
        id: member.id,
        workspace_id: workspace.id,
        project_id: project.id,
        role,
      });
      toast.success("Project role updated");
    } catch (error) {
      toast.error(`Could not update project role. ${errorMessage(error)}`);
    }
  }

  async function confirmRemove() {
    if (!workspace || !project || !removeTarget) return;
    try {
      await removeMember.mutateAsync({
        id: removeTarget.id,
        workspace_id: workspace.id,
        project_id: project.id,
      });
      toast.success("Project member removed");
      setRemoveTarget(null);
    } catch (error) {
      toast.error(`Could not remove project member. ${errorMessage(error)}`);
    }
  }

  return (
    <>
      <AppTopbar
        title="Project team"
        subtitle="Assign workspace members and set their project access"
        actions={
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/team">Workspace users</Link>
            </Button>
            {canManage && project && (
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="mr-1.5 size-4" /> Add member
              </Button>
            )}
          </div>
        }
      />
      <main className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
        {!workspace && !workspaceLoading ? (
          <StatePanel
            title="Choose a workspace"
            description="Select a workspace to manage its projects and people."
          />
        ) : projects.isLoading ? (
          <StatePanel
            title="Loading projects"
            description="Fetching the projects in this workspace."
          />
        ) : projects.error ? (
          <StatePanel title="Projects could not load" description={errorMessage(projects.error)} />
        ) : !project ? (
          <StatePanel
            title="No projects yet"
            description="Create a project first, then add workspace members to it."
            action={
              <Button asChild>
                <Link to="/projects">Open projects</Link>
              </Button>
            }
          />
        ) : (
          <>
            <section className="flex flex-wrap items-end justify-between gap-4 rounded-surface border border-border bg-surface p-4 shadow-sm md:p-5">
              <div className="min-w-0 space-y-2">
                <Label htmlFor="project-team-project">Project</Label>
                <Select
                  value={project.id}
                  onValueChange={(value) => {
                    setProjectId(value);
                    setSearch("");
                  }}
                >
                  <SelectTrigger id="project-team-project" className="min-w-52 max-w-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(projects.data ?? []).map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <UsersRound className="size-4" aria-hidden="true" />
                <span>{projectMembers.length + (ownerUser && !ownerIsMember ? 1 : 0)} people</span>
                <Button asChild size="sm" variant="ghost">
                  <Link to="/projects/$projectId" params={{ projectId: project.id }}>
                    Open project
                  </Link>
                </Button>
              </div>
            </section>

            <section
              className="overflow-hidden rounded-surface border border-border bg-surface shadow-sm"
              aria-label="Project members"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 md:px-5">
                <div>
                  <h2 className="font-display text-base font-semibold">People on this project</h2>
                  <p className="text-sm text-muted-foreground">
                    Project roles control who can manage work and membership.
                  </p>
                </div>
                <div className="relative w-full sm:w-60">
                  <Search
                    className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    aria-label="Search project members"
                    placeholder="Search people"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              {members.isLoading || workspaceUsers.isLoading ? (
                <p className="p-6 text-sm text-muted-foreground">Loading members</p>
              ) : members.error || workspaceUsers.error ? (
                <p className="p-6 text-sm text-destructive" role="alert">
                  {errorMessage(members.error ?? workspaceUsers.error)}
                </p>
              ) : visibleMembers.length === 0 && !ownerVisible ? (
                <div className="flex flex-col items-center gap-2 p-10 text-center">
                  <UsersRound className="size-7 text-muted-foreground" aria-hidden="true" />
                  <p className="font-medium">
                    {search ? "No matching people" : "No project members yet"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {search
                      ? "Try another name or email."
                      : "Add a workspace user to start collaborating."}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {ownerVisible && (
                    <li>
                      <PersonRow
                        user={ownerUser}
                        role="Owner"
                        workspaceRole={ownerUser.workspace_role}
                      />
                    </li>
                  )}
                  {visibleMembers.map((member) => {
                    const person = byUserId.get(member.user_id);
                    const isOwner = member.user_id === project.owner_id;
                    return (
                      <li
                        key={member.id}
                        className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-5"
                      >
                        <PersonIdentity user={person} />
                        <span className="hidden w-24 text-xs capitalize text-muted-foreground sm:block">
                          {person?.workspace_role ?? "—"}
                        </span>
                        {isOwner ? (
                          <Badge variant="secondary">Owner</Badge>
                        ) : canManage ? (
                          <Select
                            value={member.role}
                            disabled={updateMember.isPending}
                            onValueChange={(value) => void changeRole(member, value as ProjectRole)}
                          >
                            <SelectTrigger
                              aria-label={`Project role for ${displayName(person)}`}
                              className="w-32"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PROJECT_ROLES.map((role) => (
                                <SelectItem key={role.value} value={role.value}>
                                  {role.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="secondary" className="capitalize">
                            {member.role}
                          </Badge>
                        )}
                        {canManage && !isOwner && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="ml-auto text-muted-foreground hover:text-destructive"
                            aria-label={`Remove ${displayName(person)} from project`}
                            onClick={() => setRemoveTarget(member)}
                          >
                            <UserRoundX className="size-4" />
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <p className="text-sm text-muted-foreground">
              Need someone who is not in this workspace? Workspace owners and admins can{" "}
              <Link
                to="/team"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                invite users
              </Link>{" "}
              before you add them to a project.
            </p>
          </>
        )}
      </main>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) setNewUserId("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add project member</DialogTitle>
            <DialogDescription>
              Choose a current workspace user and their access to this project.
            </DialogDescription>
          </DialogHeader>
          {workspaceUsers.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading workspace users</p>
          ) : workspaceUsers.error ? (
            <p className="text-sm text-destructive" role="alert">
              {workspaceUsers.error.message}
            </p>
          ) : availableUsers.length === 0 ? (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>No more active workspace users are available for this project.</p>
              <Button asChild variant="outline">
                <Link to="/team">View workspace users</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="project-new-member">Workspace user</Label>
                <Select value={newUserId || undefined} onValueChange={setNewUserId}>
                  <SelectTrigger id="project-new-member">
                    <SelectValue placeholder="Choose a person" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableUsers.map((person) => (
                      <SelectItem key={person.user_id} value={person.user_id}>
                        {displayName(person)}
                        {person.email && person.email !== displayName(person)
                          ? ` · ${person.email}`
                          : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-new-role">Project role</Label>
                <Select value={newRole} onValueChange={(value) => setNewRole(value as ProjectRole)}>
                  <SelectTrigger id="project-new-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_ROLES.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {PROJECT_ROLES.find((role) => role.value === newRole)?.description}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            {!workspaceUsers.isLoading && !workspaceUsers.error && availableUsers.length > 0 && (
              <Button
                disabled={!newUserId || addMember.isPending}
                onClick={() => void addSelectedMember()}
              >
                {addMember.isPending ? "Adding" : "Add member"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from project?</AlertDialogTitle>
            <AlertDialogDescription>
              {displayName(removeTarget ? byUserId.get(removeTarget.user_id) : undefined)} will no
              longer be a member of this project. Their assigned project tasks will become
              unassigned; their workspace access stays active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMember.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeMember.isPending}
              onClick={(event) => {
                event.preventDefault();
                void confirmRemove();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function PersonIdentity({ user }: { user: PmWorkspaceUser | undefined }) {
  const name = displayName(user);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <Avatar className="size-9">
        <AvatarImage src={user?.avatar_url ?? undefined} alt="" />
        <AvatarFallback>{name.slice(0, 1).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {user?.email ?? "Former workspace member"}
        </div>
      </div>
    </div>
  );
}

function PersonRow({
  user,
  role,
  workspaceRole,
}: {
  user: PmWorkspaceUser;
  role: string;
  workspaceRole: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-5">
      <PersonIdentity user={user} />
      <span className="hidden w-24 text-xs capitalize text-muted-foreground sm:block">
        {workspaceRole}
      </span>
      <Badge variant="secondary">{role}</Badge>
    </div>
  );
}

function StatePanel({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-surface border border-dashed border-border bg-surface p-6 text-center">
      <FolderKanban className="size-9 text-muted-foreground" aria-hidden="true" />
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      {action}
    </section>
  );
}
