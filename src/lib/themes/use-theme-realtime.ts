/**
 * Live theme sync.
 *
 * Subscribes to branding/theme rows for the active workspace and refetches the
 * cached theme queries whenever another session (or another admin) saves a
 * change, so accent colours, white-label branding and the active theme apply
 * across every open tab immediately — no refresh required.
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useThemeRealtime(workspaceId: string | null | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!workspaceId) return;

    const invalidate = () => {
      void qc.invalidateQueries({ queryKey: ['white-label'] });
      void qc.invalidateQueries({ queryKey: ['active-theme'] });
    };

    const channel = supabase
      .channel(`theme-sync:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'white_label_configs',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        invalidate,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'theme_installations',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        invalidate,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, qc]);
}
