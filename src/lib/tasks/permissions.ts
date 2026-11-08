/** Mirrors the CRM tasks update policy for a row visible in the active workspace. */
export function canModifyCrmTask(
  task: { created_by: string | null; assigned_to: string | null },
  userId: string | null | undefined,
  workspaceRole: string | null | undefined,
): boolean {
  return (
    !!userId &&
    (task.created_by === userId ||
      task.assigned_to === userId ||
      workspaceRole === "owner" ||
      workspaceRole === "admin")
  );
}
