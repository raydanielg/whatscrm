import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveOrganization } from "@/hooks/use-organization";
import { usePlatformRole } from "@/shared/hooks/use-platform-role";
import { sbAny } from "@/lib/supabase/untyped";

export type PermissionKey = string;

export type RoleRow = {
  id: string;
  organization_id: string | null;
  scope: "platform" | "organization" | "workspace";
  key: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
};

export type PermissionRow = {
  id: string;
  key: string;
  resource: string;
  action: string;
  description: string | null;
};

export type UserRoleAssignmentRow = {
  id: string;
  user_id: string;
  role_id: string;
  organization_id: string | null;
  workspace_id: string | null;
  granted_by: string | null;
  created_at: string;
};

/** Effective permission keys for current user in the active org. */
export function usePermissions(orgId?: string | null) {
  const { role: platformRole, loading: platLoading } = usePlatformRole();
  const { data: orgRoleData, isLoading: orgRoleLoading } = useOrgRole(orgId);

  const { active } = useActiveOrganization();
  const _orgId = orgId ?? active?.id ?? null;

  const query = useQuery({
    queryKey: ["permissions", "mine", _orgId],
    queryFn: async (): Promise<Set<PermissionKey>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("my_permissions", {
        _organization_id: _orgId,
        _workspace_id: null,
      });
      if (error) throw error;
      const rows = (data ?? []) as Array<string | { my_permissions: string }>;
      const keys = rows.map((r) => (typeof r === "string" ? r : r.my_permissions));
      return new Set(keys);
    },
  });

  const superAdmin = useIsSuperAdmin();

  const can = useMemo(() => {
    return (key: PermissionKey) => {
      if (superAdmin.data) return true;
      return query.data?.has(key) ?? false;
    };
  }, [query.data, superAdmin.data]);

  const canAny = useMemo(() => (keys: PermissionKey[]) => keys.some(can), [can]);
  const canAll = useMemo(() => (keys: PermissionKey[]) => keys.every(can), [can]);

  return {
    permissions: query.data ?? new Set<PermissionKey>(),
    can,
    canAny,
    canAll,
    isSuperAdmin: !!superAdmin.data,
    orgRole: orgRoleData?.role ?? null,
    platformRole: platformRole ?? null,
    loading: query.isLoading || superAdmin.isLoading || platLoading || orgRoleLoading,
  };
}

/**
 * Permission check for destructive / outbound actions.
 *
 * `usePermissions()` resolves to an EMPTY key set while it is still loading
 * and while no organization has been resolved yet, so a bare `can(key)` is
 * `false` for perfectly legitimate users mid-load. This helper therefore
 * returns `true` until the permission set is genuinely resolved — only a
 * RESOLVED negative blocks an action.
 */
export function useCanAct(key: PermissionKey): boolean {
  const { can, loading } = usePermissions();
  const { active, isLoading: orgLoading } = useActiveOrganization();
  if (loading || orgLoading || !active) return true;
  return can(key);
}

export function useOrgRole(orgId?: string | null) {
  const { active } = useActiveOrganization();
  const _orgId = orgId ?? active?.id ?? null;

  return useQuery({
    queryKey: ["auth", "org-role", _orgId],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || !_orgId) return { role: null };
      const { data } = await supabase
        .from("organization_members")
        .select("role")
        .eq("organization_id", _orgId)
        .eq("user_id", u.user.id)
        .maybeSingle();
      return { role: (data?.role as any) ?? null };
    },
    enabled: !!_orgId,
  });
}

export function useIsSuperAdmin() {
  return useQuery({
    queryKey: ["auth", "is-super-admin"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (sbAny(supabase).from("user_roles" as any) as any)
        .select("role")
        .eq("user_id", u.user.id)
        .eq("role", "superadmin")
        .maybeSingle();
      return !!data;
    },
  });
}

export function useAllPermissions() {
  return useQuery({
    queryKey: ["permissions", "catalog"],
    queryFn: async (): Promise<PermissionRow[]> => {
      const { data, error } = await supabase
        .from("permissions")
        .select("*")
        .order("resource")
        .order("action");
      if (error) throw error;
      return (data ?? []) as PermissionRow[];
    },
  });
}

/** All roles visible to the user — system roles + custom org roles. */
export function useRoles(orgId?: string | null) {
  const { active } = useActiveOrganization();
  const _orgId = orgId ?? active?.id ?? null;
  return useQuery({
    queryKey: ["roles", _orgId],
    queryFn: async (): Promise<RoleRow[]> => {
      const { data, error } = await supabase
        .from("roles")
        .select("*")
        .or(
          _orgId
            ? `organization_id.is.null,organization_id.eq.${_orgId}`
            : "organization_id.is.null",
        )
        .order("is_system", { ascending: false })
        .order("name");
      if (error) throw error;
      return (data ?? []) as RoleRow[];
    },
  });
}

export function useRolePermissions(roleId: string | undefined) {
  return useQuery({
    queryKey: ["role_permissions", roleId],
    enabled: !!roleId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("permission_id")
        .eq("role_id", roleId!);
      if (error) throw error;
      return (data ?? []).map((r) => r.permission_id);
    },
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      organization_id: string;
      key: string;
      name: string;
      description?: string;
    }) => {
      const { data, error } = await supabase
        .from("roles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({ ...input, scope: "organization", is_system: false } as any)
        .select()
        .single();
      if (error) throw error;
      return data as RoleRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles"] }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; description?: string }) => {
      const { error } = await sbAny(supabase).from("roles").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles"] }),
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sbAny(supabase).from("roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles"] }),
  });
}

export function useSetRolePermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ roleId, permissionIds }: { roleId: string; permissionIds: string[] }) => {
      const { error: delErr } = await sbAny(supabase)
        .from("role_permissions")
        .delete()
        .eq("role_id", roleId);
      if (delErr) throw delErr;
      if (permissionIds.length > 0) {
        const rows = permissionIds.map((pid) => ({ role_id: roleId, permission_id: pid }));
        const { error } = await sbAny(supabase).from("role_permissions").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["role_permissions", vars.roleId] });
      qc.invalidateQueries({ queryKey: ["permissions", "mine"] });
    },
  });
}

export function useAssignRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      user_id: string;
      role_id: string;
      organization_id?: string | null;
      workspace_id?: string | null;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await sbAny(supabase)
        .from("user_role_assignments")
        .insert({
          user_id: input.user_id,
          role_id: input.role_id,
          organization_id: input.organization_id ?? null,
          workspace_id: input.workspace_id ?? null,
          granted_by: u.user?.id ?? null,
        });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user_role_assignments"] }),
  });
}

export function useRevokeRoleAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sbAny(supabase).from("user_role_assignments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user_role_assignments"] }),
  });
}

export function useOrgRoleAssignments(orgId: string | undefined) {
  return useQuery({
    queryKey: ["user_role_assignments", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_role_assignments")
        .select("*")
        .eq("organization_id", orgId!);
      if (error) throw error;
      return (data ?? []) as UserRoleAssignmentRow[];
    },
  });
}
