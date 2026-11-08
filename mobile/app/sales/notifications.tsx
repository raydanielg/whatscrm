import { View, Text, Pressable, FlatList, RefreshControl, Linking } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthProvider';
import { useRealtimeTable } from '@/realtime/useRealtimeTable';
import { queryClient } from '@/api/queryClient';
import { listNotifications, markNotificationRead, type Notification } from '@/api/sales';

export default function NotificationsScreen() {
  const t = useTheme();
  const { user } = useAuth();

  useRealtimeTable('notifications', ['sales', 'notif-list'], user?.id ? `user_id=eq.${user.id}` : undefined);
  const q = useQuery({
    queryKey: ['sales', 'notif-list'],
    queryFn: () => (user?.id ? listNotifications(user.id) : Promise.resolve([] as Notification[])),
    enabled: !!user?.id,
  });

  return (
    <Screen style={{ padding: 0 }}>
      <FlatList<Notification>
        data={q.data ?? []}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => queryClient.invalidateQueries({ queryKey: ['sales', 'notif-list'] })} />}
        ListEmptyComponent={<Text style={{ color: t.colors.mutedFg, textAlign: 'center', marginTop: 40 }}>No notifications.</Text>}
        renderItem={({ item }) => (
          <Pressable
            onPress={async () => {
              if (item.status === 'unread') {
                await markNotificationRead(item.id);
                queryClient.invalidateQueries({ queryKey: ['sales', 'notif-list'] });
              }
              if (item.action_url) Linking.openURL(item.action_url).catch(() => {});
            }}
            style={{
              backgroundColor: t.colors.card,
              borderColor: item.status === 'unread' ? t.colors.primary : t.colors.border,
              borderWidth: 1,
              borderRadius: t.radius.md,
              padding: 12,
            }}
          >
            <View style={{ flexDirection: 'row' }}>
              <Text style={{ color: t.colors.foreground, fontWeight: item.status === 'unread' ? '700' : '500', flex: 1 }}>{item.title}</Text>
              {item.category ? (
                <Text style={{ color: t.colors.mutedFg, fontSize: 11, textTransform: 'capitalize' }}>{item.category}</Text>
              ) : null}
            </View>
            {item.body ? <Text style={{ color: t.colors.mutedFg, fontSize: 13, marginTop: 4 }}>{item.body}</Text> : null}
            <Text style={{ color: t.colors.mutedFg, fontSize: 11, marginTop: 6 }}>{new Date(item.created_at).toLocaleString()}</Text>
          </Pressable>
        )}
      />
    </Screen>
  );
}
