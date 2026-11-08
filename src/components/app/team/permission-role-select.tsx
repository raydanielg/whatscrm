import { useMemo } from "react";
import { useRoles, type RoleRow } from "@/hooks/use-permissions";
import type { WorkspaceRole } from "@/hooks/use-workspace";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type AssignableRole = RoleRow & { workspaceRole: WorkspaceRole };

export function workspaceRoleForPermissionRole(key: string): WorkspaceRole {
  if (key === "admin") return "admin";
  if (key === "manager") return "manager";
  if (key === "viewer") return "viewer";
  return "agent";
}

export function useAssignableRoles() {
  const query = useRoles();
  const roles = useMemo(
    () =>
      (query.data ?? [])
        .filter((role) => role.key !== "owner")
        .map((role) => ({ ...role, workspaceRole: workspaceRoleForPermissionRole(role.key) })),
    [query.data],
  );
  return { ...query, roles };
}

export function defaultAssignableRole(roles: AssignableRole[]) {
  return (
    roles.find((role) => role.key === "support_agent") ??
    roles.find((role) => role.key === "viewer") ??
    roles[0]
  );
}

export function PermissionRoleSelect({
  value,
  onChange,
  disabled,
  className,
}: {
  value?: string;
  onChange: (role: AssignableRole) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { roles, isLoading } = useAssignableRoles();
  return (
    <Select
      value={value}
      disabled={disabled || isLoading || roles.length === 0}
      onValueChange={(id) => {
        const role = roles.find((item) => item.id === id);
        if (role) onChange(role);
      }}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={isLoading ? "Loading roles…" : "Select role"} />
      </SelectTrigger>
      <SelectContent>
        {roles.map((role) => (
          <SelectItem key={role.id} value={role.id}>
            <span className="flex items-center gap-2">
              <span>{role.name}</span>
              <span className="text-xs text-muted-foreground">
                {role.is_system ? "System" : "Custom"}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
