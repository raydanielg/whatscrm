/**
 * Workspace management — mirrors the web app's `workspaces` +
 * `workspace_members` tables. `has_role` continues to enforce access via RLS.
 */
import { supabase } from '@/api/supabase';
import { loadPrefs, savePrefs } from './prefs';

export type Workspace = {
  id: string;
  name: string;
  slug: string | null;
  role: string | null;
};

export async function listWorkspaces(userId: string): Promise<Workspace[]> {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('role, workspaces:workspace_id (id, name, slug)')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).flatMap((row: any) =>
    row.workspaces
      ? [{ id: row.workspaces.id, name: row.workspaces.name, slug: row.workspaces.slug, role: row.role }]
      : [],
  );
}

export function getActiveWorkspaceId(userId: string): string | null {
  return loadPrefs(userId).activeWorkspaceId;
}

export function setActiveWorkspace(userId: string, workspaceId: string | null) {
  savePrefs(userId, { activeWorkspaceId: workspaceId });
}
