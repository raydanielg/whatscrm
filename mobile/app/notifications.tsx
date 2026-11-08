import { useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Alert } from 'react-native';
import { Stack, router } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/api/supabase';
import { queryClient } from '@/api/queryClient';
import { palette, radius, spacing, typography } from '@/theme/tokens';
import { CATEGORY_META, type NotificationCategory } from '@/notifications/push';

type Notification = {
  id: string;
  title: string | null;
  body: string | null;
  category: string | null;
  action_url: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

async function fetchNotifications(): Promise<Notification[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from('notifications')
    .select('id, title, body, category, action_url, data, read_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200);
  return (data ?? []) as Notification[];
}

export default function NotificationCenter() {
  const q = useQuery({ queryKey: ['notifications'], queryFn: fetchNotifications });

  const markAll = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('read_at', null);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  useEffect(() => {
    let sub: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      sub = supabase
        .channel(`notif-center-${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, () =>
          queryClient.invalidateQueries({ queryKey: ['notifications'] }),
        )
        .subscribe();
    })();
    return () => {
      if (sub) supabase.removeChannel(sub);
    };
  }, []);

  const onPress = (n: Notification) => {
    if (!n.read_at) markRead.mutate(n.id);
    if (n.action_url) router.push(n.action_url as never);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Notifications',
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 12, paddingRight: 12 }}>
              <TouchableOpacity onPress={() => router.push('/notification-preferences')}>
                <Text style={styles.headerAction}>Settings</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => markAll.mutate()}>
                <Text style={styles.headerAction}>Mark all</Text>
              </TouchableOpacity>
            </View>
          ),
        }}
      />
      <FlatList
        style={styles.screen}
        contentContainerStyle={{ paddingBottom: 40 }}
        data={q.data ?? []}
        keyExtractor={(n) => n.id}
        refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} />}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ color: palette.mutedFg }}>You're all caught up.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const cat = (item.category ?? 'general') as NotificationCategory;
          const meta = CATEGORY_META[cat] ?? CATEGORY_META.general;
          const unread = !item.read_at;
          return (
            <TouchableOpacity style={[styles.row, unread && styles.rowUnread]} onPress={() => onPress(item)} activeOpacity={0.7}>
              <View style={[styles.dot, { backgroundColor: unread ? palette.primary : palette.border }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.title ?? meta.name}
                </Text>
                {item.body ? (
                  <Text style={styles.body} numberOfLines={2}>
                    {item.body}
                  </Text>
                ) : null}
                <Text style={styles.meta}>
                  {meta.name} · {new Date(item.created_at).toLocaleString()}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
        onEndReachedThreshold={0.4}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, backgroundColor: palette.background },
  rowUnread: { backgroundColor: palette.muted },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 8 },
  title: { ...typography.body, fontWeight: '600', color: palette.foreground },
  body: { ...typography.small, color: palette.foreground, marginTop: 2 },
  meta: { ...typography.caption, color: palette.mutedFg, marginTop: 6, textTransform: 'uppercase' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: palette.border, marginLeft: spacing.md + 16 },
  empty: { alignItems: 'center', padding: 40 },
  headerAction: { color: palette.primary, fontWeight: '600' },
});
