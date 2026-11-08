import { useEffect, useState } from 'react';
import { supabase } from '@/api/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { useAppStore } from '@/stores/appStore';
import type { WorkspaceRole } from '@/lib/roles';

/** Resolves the caller's role in the active workspace. */
export function useRole(): { role: WorkspaceRole | null; loading: boolean } {
  const { user } = useAuth();
  const workspaceId = useAppStore((s) => s.activeWorkspace);
  const [role, setRole] = useState<WorkspaceRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    if (!user || !workspaceId) {
      setRole(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from('workspace_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('workspace_id', workspaceId)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        setRole(((data?.role as WorkspaceRole) ?? null) as WorkspaceRole | null);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [user?.id, workspaceId]);

  return { role, loading };
}
