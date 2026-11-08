import { ReactNode } from "react";
import { usePermissions, type PermissionKey } from "@/hooks/use-permissions";

type Props = {
  /** Any of these permission keys grants access. */
  anyOf?: PermissionKey[];
  /** All of these permission keys are required. */
  allOf?: PermissionKey[];
  /** Single permission shortcut. */
  permission?: PermissionKey;
  fallback?: ReactNode;
  children: ReactNode;
};

/**
 * Conditionally renders `children` when the current user has the required
 * permission(s). Super admins always pass. During load, renders nothing to
 * avoid flashing gated UI.
 */
export function PermissionGate({ anyOf, allOf, permission, fallback = null, children }: Props) {
  const { can, canAny, canAll, isSuperAdmin, loading } = usePermissions();
  if (loading) return null;
  if (isSuperAdmin) return <>{children}</>;

  const keys = [
    ...(permission ? [permission] : []),
    ...(anyOf ?? []),
  ];
  const okAny = keys.length === 0 ? true : canAny(keys);
  const okAll = allOf && allOf.length > 0 ? canAll(allOf) : true;
  return okAny && okAll ? <>{children}</> : <>{fallback}</>;
}
