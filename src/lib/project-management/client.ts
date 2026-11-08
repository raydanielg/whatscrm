import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sbAny } from "@/lib/supabase/untyped";

export type PmProjectStatus = "planning" | "active" | "on_hold" | "completed" | "archived";
export type PmTaskStatus = "backlog" | "todo" | "in_progress" | "review" | "done";
export type PmTaskPriority = "low" | "medium" | "high" | "urgent";
export type PmProjectMemberRole = "manager" | "member" | "viewer";

export interface PmProject {
  id: string;
  workspace_id: string;
  owner_id: string | null;
  name: string;
  description: string | null;
  status: PmProjectStatus;
  color: string;
  logo_url: string | null;
  start_date: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}
export interface PmTask {
  id: string;
  workspace_id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: PmTaskStatus;
  priority: PmTaskPriority;
  assignee_id: string | null;
  position: number;
  due_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** Set when the task was assigned from an inbox conversation/contact. */
  contact_id?: string | null;
  conversation_id?: string | null;
}
export interface PmProjectMember {
  id: string;
  workspace_id: string;
  project_id: string;
  user_id: string;
  role: PmProjectMemberRole;
  created_at: string;
}
export interface PmWorkspaceUser {
  user_id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  workspace_role: "owner" | "admin" | "manager" | "agent" | "viewer";
}

export interface CreatePmProjectInput {
  workspace_id: string;
  name: string;
  description?: string | null;
  status?: PmProjectStatus;
  color?: string;
  logo_url?: string | null;
  start_date?: string | null;
  due_date?: string | null;
}
export type UpdatePmProjectInput = { id: string; workspace_id: string } & Partial<
  Pick<PmProject, "name" | "description" | "status" | "color" | "logo_url" | "start_date" | "due_date">
>;
export interface CreatePmTaskInput {
  workspace_id: string;
  project_id: string;
  title: string;
  description?: string | null;
  status?: PmTaskStatus;
  priority?: PmTaskPriority;
  assignee_id?: string | null;
  position?: number;
  due_date?: string | null;
  contact_id?: string | null;
  conversation_id?: string | null;
}
export type UpdatePmTaskInput = { id: string; workspace_id: string; project_id: string } & Partial<
  Pick<
    PmTask,
    "title" | "description" | "status" | "priority" | "assignee_id" | "position" | "due_date"
  >
>;
type ScopedProjectId = { id: string; workspace_id: string };
type ScopedTaskId = { id: string; workspace_id: string; project_id: string };

// Generated Database types predate this migration. Mirror existing new-module adapter.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const from = (name: string) => sbAny(supabase).from(name as any) as any;
const need = (value: string | null | undefined) => {
  if (!value) throw new Error("Select a workspace or project first");
  return value;
};
const label = (value: string, field: string) => {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} is required`);
  return trimmed;
};
const rowOrError = <T>(value: T | null, name: string): T => {
  if (!value) throw new Error(`${name} was not found or access was denied`);
  return value;
};

export function usePmProjects(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: ["pm", "projects", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<PmProject[]> => {
      const { data, error } = await from("pm_projects")
        .select("*")
        .eq("workspace_id", need(workspaceId))
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PmProject[];
    },
  });
}

export function usePmTasks(workspaceId: string | null | undefined, projectId?: string | null) {
  return useQuery({
    queryKey: ["pm", "tasks", workspaceId, projectId ?? "all"],
    enabled: !!workspaceId,
    queryFn: async (): Promise<PmTask[]> => {
      let q = from("pm_tasks").select("*").eq("workspace_id", need(workspaceId));
      if (projectId) q = q.eq("project_id", projectId);
      const { data, error } = await q
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PmTask[];
    },
  });
}

export function usePmProjectMembers(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ["pm", "members", projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<PmProjectMember[]> => {
      const { data, error } = await from("pm_project_members")
        .select("*")
        .eq("project_id", need(projectId))
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PmProjectMember[];
    },
  });
}

export function usePmWorkspaceProjectMembers(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: ["pm", "workspace-members", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<PmProjectMember[]> => {
      const { data, error } = await from("pm_project_members")
        .select("*")
        .eq("workspace_id", need(workspaceId));
      if (error) throw error;
      return (data ?? []) as PmProjectMember[];
    },
  });
}

export function usePmWorkspaceUsers(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: ["pm", "workspace-users", workspaceId],
    enabled: !!workspaceId,
    queryFn: async (): Promise<PmWorkspaceUser[]> => {
      const { data: members, error } = await from("workspace_members")
        .select("user_id, role")
        .eq("workspace_id", need(workspaceId))
        .eq("status", "active");
      if (error) throw error;
      const typed = (members ?? []) as {
        user_id: string;
        role: PmWorkspaceUser["workspace_role"];
      }[];
      if (typed.length === 0) return [];
      const { data: profiles, error: profileError } = await from("profiles")
        .select("id, display_name, email, avatar_url")
        .in(
          "id",
          typed.map((m) => m.user_id),
        );
      if (profileError) throw profileError;
      const byId = new Map<
        string,
        { display_name: string | null; email: string | null; avatar_url: string | null }
      >(
        (
          (profiles ?? []) as {
            id: string;
            display_name: string | null;
            email: string | null;
            avatar_url: string | null;
          }[]
        ).map(({ id, ...profile }) => [id, profile]),
      );
      return typed.map((m) => ({
        user_id: m.user_id,
        workspace_role: m.role,
        display_name: byId.get(m.user_id)?.display_name ?? null,
        email: byId.get(m.user_id)?.email ?? null,
        avatar_url: byId.get(m.user_id)?.avatar_url ?? null,
      }));
    },
  });
}

export function useCreatePmProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePmProjectInput): Promise<PmProject> => {
      const { data, error } = await from("pm_projects")
        .insert({ ...input, name: label(input.name, "Project name") })
        .select("*")
        .single();
      if (error) throw error;
      return rowOrError(data as PmProject | null, "Project");
    },
    onSuccess: (_row, input) =>
      qc.invalidateQueries({ queryKey: ["pm", "projects", input.workspace_id] }),
  });
}

export function useUpdatePmProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      workspace_id,
      ...changes
    }: UpdatePmProjectInput): Promise<PmProject> => {
      if (changes.name !== undefined) changes.name = label(changes.name, "Project name");
      const { data, error } = await from("pm_projects")
        .update(changes)
        .eq("id", id)
        .eq("workspace_id", workspace_id)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return rowOrError(data as PmProject | null, "Project");
    },
    onSuccess: (_row, input) =>
      qc.invalidateQueries({ queryKey: ["pm", "projects", input.workspace_id] }),
  });
}

export function useDeletePmProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, workspace_id }: ScopedProjectId): Promise<void> => {
      const { data, error } = await from("pm_projects")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspace_id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      rowOrError(data, "Project");
    },
    onSuccess: (_row, input) => {
      qc.invalidateQueries({ queryKey: ["pm", "projects", input.workspace_id] });
      qc.invalidateQueries({ queryKey: ["pm", "tasks", input.workspace_id] });
      qc.invalidateQueries({ queryKey: ["dash", "task-summary", input.workspace_id] });
      qc.invalidateQueries({ queryKey: ["pm", "members", input.id] });
      qc.invalidateQueries({ queryKey: ["pm", "workspace-members", input.workspace_id] });
    },
  });
}

export function useCreatePmTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePmTaskInput): Promise<PmTask> => {
      const { data, error } = await from("pm_tasks")
        .insert({ ...input, title: label(input.title, "Task title") })
        .select("*")
        .single();
      if (error) throw error;
      return rowOrError(data as PmTask | null, "Task");
    },
    onSuccess: (_row, input) => {
      qc.invalidateQueries({ queryKey: ["pm", "tasks", input.workspace_id] });
      qc.invalidateQueries({ queryKey: ["dash", "task-summary", input.workspace_id] });
      if (input.contact_id) qc.invalidateQueries({ queryKey: ["contact-tasks", input.contact_id] });
    },
  });
}

export function useUpdatePmTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      workspace_id,
      project_id,
      ...changes
    }: UpdatePmTaskInput): Promise<PmTask> => {
      if (changes.title !== undefined) changes.title = label(changes.title, "Task title");
      const { data, error } = await from("pm_tasks")
        .update(changes)
        .eq("id", id)
        .eq("workspace_id", workspace_id)
        .eq("project_id", project_id)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return rowOrError(data as PmTask | null, "Task");
    },
    onSuccess: (_row, input) => {
      qc.invalidateQueries({ queryKey: ["pm", "tasks", input.workspace_id] });
      qc.invalidateQueries({ queryKey: ["dash", "task-summary", input.workspace_id] });
    },
  });
}

export function useDeletePmTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, workspace_id, project_id }: ScopedTaskId): Promise<void> => {
      const { data, error } = await from("pm_tasks")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspace_id)
        .eq("project_id", project_id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      rowOrError(data, "Task");
    },
    onSuccess: (_row, input) => {
      qc.invalidateQueries({ queryKey: ["pm", "tasks", input.workspace_id] });
      qc.invalidateQueries({ queryKey: ["dash", "task-summary", input.workspace_id] });
    },
  });
}

export function useAddPmProjectMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      workspace_id: string;
      project_id: string;
      user_id: string;
      role?: PmProjectMemberRole;
    }): Promise<PmProjectMember> => {
      const { data, error } = await from("pm_project_members").insert(input).select("*").single();
      if (error) throw error;
      return rowOrError(data as PmProjectMember | null, "Project member");
    },
    onSuccess: (_row, input) => {
      qc.invalidateQueries({ queryKey: ["pm", "members", input.project_id] });
      qc.invalidateQueries({ queryKey: ["pm", "workspace-members", input.workspace_id] });
    },
  });
}

export function useUpdatePmProjectMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      workspace_id,
      project_id,
      role,
    }: ScopedTaskId & { role: PmProjectMemberRole }): Promise<PmProjectMember> => {
      const { data, error } = await from("pm_project_members")
        .update({ role })
        .eq("id", id)
        .eq("workspace_id", workspace_id)
        .eq("project_id", project_id)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return rowOrError(data as PmProjectMember | null, "Project member");
    },
    onSuccess: (_row, input) => {
      qc.invalidateQueries({ queryKey: ["pm", "members", input.project_id] });
      qc.invalidateQueries({ queryKey: ["pm", "workspace-members", input.workspace_id] });
      qc.invalidateQueries({ queryKey: ["pm", "tasks", input.workspace_id] });
    },
  });
}

export function useRemovePmProjectMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, workspace_id, project_id }: ScopedTaskId): Promise<void> => {
      const { data, error } = await from("pm_project_members")
        .delete()
        .eq("id", id)
        .eq("workspace_id", workspace_id)
        .eq("project_id", project_id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      rowOrError(data, "Project member");
    },
    onSuccess: (_row, input) => {
      qc.invalidateQueries({ queryKey: ["pm", "members", input.project_id] });
      qc.invalidateQueries({ queryKey: ["pm", "workspace-members", input.workspace_id] });
      qc.invalidateQueries({ queryKey: ["pm", "tasks", input.workspace_id] });
    },
  });
}
