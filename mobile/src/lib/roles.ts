/**
 * Role model shared with the web app. Roles are stored on `workspace_members`
 * and cross-checked via `has_role` RLS on every server query. The mobile UI
 * mirrors the same hierarchy for feature gating.
 */
export type WorkspaceRole = 'owner' | 'admin' | 'agent' | 'user' | 'superadmin';

export const ROLE_RANK: Record<WorkspaceRole, number> = {
  user: 1,
  agent: 2,
  admin: 3,
  owner: 4,
  superadmin: 5,
};

export function hasRole(role: WorkspaceRole | null | undefined, min: WorkspaceRole): boolean {
  if (!role) return false;
  return (ROLE_RANK[role] ?? 0) >= ROLE_RANK[min];
}

/** Feature gates for dashboard tiles + settings surfaces. */
export const CAN = {
  viewSalesAnalytics: (r: WorkspaceRole | null) => hasRole(r, 'agent'),
  viewConversationAnalytics: (r: WorkspaceRole | null) => hasRole(r, 'agent'),
  viewPerformance: (r: WorkspaceRole | null) => hasRole(r, 'agent'),
  viewQuickReports: (r: WorkspaceRole | null) => hasRole(r, 'admin'),
  manageWorkspace: (r: WorkspaceRole | null) => hasRole(r, 'admin'),
  viewOwnTasks: (_r: WorkspaceRole | null) => true,
  viewOwnAppointments: (_r: WorkspaceRole | null) => true,
} as const;
