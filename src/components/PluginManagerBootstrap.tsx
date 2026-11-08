/**
 * PluginManagerBootstrap — mount once inside the authenticated shell.
 * Loads all workspace-scoped plugins on session hydration.
 */
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { pluginManager } from '@/lib/plugins/manager';

async function fetchActiveWorkspace(): Promise<string | null> {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session?.user?.id;
  if (!uid) return null;
  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', uid)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.workspace_id ?? null;
}

export function PluginManagerBootstrap() {
  const { data: workspaceId } = useQuery({
    queryKey: ['plugin-workspace'],
    queryFn: fetchActiveWorkspace,
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    if (!workspaceId) return;
    pluginManager.bootstrap(workspaceId).catch((err) => {
      console.error('[plugin-manager] bootstrap failed', err);
    });
  }, [workspaceId]);
  return null;
}
