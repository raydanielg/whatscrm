import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { handleNotificationResponse, setBadgeCount } from './push';
import { supabase } from '@/api/supabase';
import { queryClient } from '@/api/queryClient';
import { useAppStore } from '@/stores/appStore';

/**
 * Foreground + interaction listeners. Mount once from the root layout.
 */
export function useNotificationListeners() {
  const setUnread = useAppStore((s) => s.setUnreadInbox);

  useEffect(() => {
    const rec = Notifications.addNotificationReceivedListener(() => {
      // Nudge Notification Center refresh and refresh inbox unread count.
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    });
    const resp = Notifications.addNotificationResponseReceivedListener((r) => {
      handleNotificationResponse(r).catch(() => {});
    });

    // Realtime badge from `notifications` unread count.
    let sub: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const refresh = async () => {
        const { count } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .is('read_at', null);
        const n = count ?? 0;
        setUnread(n);
        setBadgeCount(n).catch(() => {});
      };
      refresh();
      sub = supabase
        .channel(`notif-badge-${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, refresh)
        .subscribe();
    })();

    return () => {
      rec.remove();
      resp.remove();
      if (sub) supabase.removeChannel(sub);
    };
  }, [setUnread]);
}
