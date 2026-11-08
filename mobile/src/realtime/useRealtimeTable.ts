import { useEffect } from 'react';
import { supabase } from '@/api/supabase';
import { queryClient } from '@/api/queryClient';

/**
 * Subscribe to Postgres CDC on a table and invalidate the given query key
 * whenever rows change. Enable Realtime for the table via migration:
 *   ALTER PUBLICATION supabase_realtime ADD TABLE public.<table>;
 */
export function useRealtimeTable(table: string, queryKey: unknown[], filter?: string) {
  useEffect(() => {
    const channel = supabase
      .channel(`rt:${table}:${filter ?? 'all'}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter },
        () => queryClient.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, filter, JSON.stringify(queryKey)]);
}
