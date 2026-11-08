import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/components/Screen';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthProvider';
import { useRealtimeTable } from '@/realtime/useRealtimeTable';
import {
  fetchSalesDashboard,
  listAppointments,
  listNotifications,
  markNotificationRead,
  formatCurrency,
  type Notification,
} from '@/api/sales';
import { queryClient } from '@/api/queryClient';

export default function SalesTab() {
  const t = useTheme();
  const { user } = useAuth();

  // Realtime — refresh dashboard on any mutation to core tables.
  useRealtimeTable('deals', ['sales', 'dashboard']);
  useRealtimeTable('quotes', ['sales', 'dashboard']);
  useRealtimeTable('invoices', ['sales', 'dashboard']);
  useRealtimeTable('booking_appointments', ['sales', 'dashboard']);
  useRealtimeTable('booking_appointments', ['sales', 'upcoming']);
  useRealtimeTable('notifications', ['sales', 'notifications']);

  const stats = useQuery({ queryKey: ['sales', 'dashboard'], queryFn: () => fetchSalesDashboard(user?.id) });
  const upcoming = useQuery({
    queryKey: ['sales', 'upcoming'],
    queryFn: () => listAppointments({ from: new Date().toISOString(), to: new Date(Date.now() + 7 * 864e5).toISOString() }),
  });
  const notifs = useQuery({
    queryKey: ['sales', 'notifications'],
    queryFn: () => (user?.id ? listNotifications(user.id) : Promise.resolve([] as Notification[])),
    enabled: !!user?.id,
  });

  const unreadNotifs = useMemo(() => (notifs.data ?? []).filter((n) => n.status === 'unread').length, [notifs.data]);
  const refreshing = stats.isFetching || upcoming.isFetching;

  const KPIS: { label: string; value: string; sub?: string; color?: string }[] = [
    { label: 'Open deals', value: String(stats.data?.openDeals ?? '—'), sub: formatCurrency(stats.data?.openValue, 'USD'), color: t.colors.primary },
    { label: 'Won this month', value: String(stats.data?.wonThisMonth ?? '—'), sub: formatCurrency(stats.data?.wonValue, 'USD') },
    { label: 'Open quotes', value: String(stats.data?.quotesOpen ?? '—') },
    { label: 'Unpaid invoices', value: String(stats.data?.invoicesUnpaid ?? '—'), sub: stats.data?.invoicesOverdue ? `${stats.data.invoicesOverdue} overdue` : undefined, color: stats.data?.invoicesOverdue ? '#c0392b' : undefined },
    { label: 'Today’s meetings', value: String(stats.data?.apptsToday ?? '—') },
    { label: 'Tasks due', value: String(stats.data?.tasksDue ?? '—') },
  ];

  const QUICK_LINKS: { label: string; to: any; badge?: number }[] = [
    { label: 'Kanban Pipeline', to: '/sales/kanban' },
    { label: 'Quotes', to: '/sales/quotes' },
    { label: 'Invoices', to: '/sales/invoices' },
    { label: 'Appointments', to: '/sales/appointments' },
    { label: 'Calendar', to: '/sales/calendar' },
    { label: 'Notifications', to: '/sales/notifications', badge: unreadNotifs },
  ];

  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => queryClient.invalidateQueries({ queryKey: ['sales'] })} tintColor={t.colors.primary} />}
      >
        <Text style={[t.typography.h1, { color: t.colors.foreground }]}>Sales</Text>
        <Text style={{ color: t.colors.mutedFg, marginTop: 4 }}>Live pipeline, quotes, invoices & meetings.</Text>

        {/* KPI grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: t.spacing.lg }}>
          {KPIS.map((k) => (
            <View
              key={k.label}
              style={{
                flexBasis: '48%',
                flexGrow: 1,
                backgroundColor: t.colors.card,
                borderColor: t.colors.border,
                borderWidth: 1,
                borderRadius: t.radius.md,
                padding: 14,
              }}
            >
              <Text style={{ color: t.colors.mutedFg, fontSize: 12 }}>{k.label}</Text>
              <Text style={{ color: k.color ?? t.colors.foreground, fontSize: 22, fontWeight: '700', marginTop: 4 }}>
                {stats.isLoading ? '' : k.value}
              </Text>
              {k.sub ? <Text style={{ color: t.colors.mutedFg, fontSize: 12, marginTop: 2 }}>{k.sub}</Text> : null}
            </View>
          ))}
        </View>

        {/* Quick links */}
        <View style={{ marginTop: t.spacing.lg, gap: 8 }}>
          {QUICK_LINKS.map((q) => (
            <Pressable
              key={q.label}
              onPress={() => {
                Haptics.selectionAsync();
                router.push(q.to);
              }}
              style={({ pressed }) => ({
                backgroundColor: t.colors.card,
                borderColor: t.colors.border,
                borderWidth: 1,
                borderRadius: t.radius.md,
                paddingVertical: 14,
                paddingHorizontal: 16,
                flexDirection: 'row',
                alignItems: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ color: t.colors.foreground, fontWeight: '600', flex: 1 }}>{q.label}</Text>
              {q.badge ? (
                <View style={{ backgroundColor: t.colors.primary, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2, marginRight: 8 }}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{q.badge}</Text>
                </View>
              ) : null}
              <Text style={{ color: t.colors.mutedFg }}>›</Text>
            </Pressable>
          ))}
        </View>

        {/* Upcoming meetings */}
        <Text style={[t.typography.h2, { color: t.colors.foreground, marginTop: t.spacing.xl }]}>Upcoming meetings</Text>
        {upcoming.isLoading ? (
          <ActivityIndicator style={{ marginTop: 16 }} color={t.colors.primary} />
        ) : (upcoming.data ?? []).length === 0 ? (
          <Text style={{ color: t.colors.mutedFg, marginTop: 8 }}>Nothing scheduled in the next 7 days.</Text>
        ) : (
          (upcoming.data ?? []).slice(0, 5).map((a) => (
            <Pressable
              key={a.id}
              onPress={() => router.push(`/sales/appointments`)}
              style={{ backgroundColor: t.colors.card, borderColor: t.colors.border, borderWidth: 1, borderRadius: t.radius.md, padding: 12, marginTop: 8 }}
            >
              <Text style={{ color: t.colors.foreground, fontWeight: '600' }}>{a.customer_name}</Text>
              <Text style={{ color: t.colors.mutedFg, fontSize: 12, marginTop: 2 }}>
                {new Date(a.start_at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · {a.status}
              </Text>
            </Pressable>
          ))
        )}

        {/* Recent notifications */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: t.spacing.xl }}>
          <Text style={[t.typography.h2, { color: t.colors.foreground, flex: 1 }]}>Notifications</Text>
          {unreadNotifs ? <Text style={{ color: t.colors.primary, fontWeight: '600' }}>{unreadNotifs} new</Text> : null}
        </View>
        {(notifs.data ?? []).slice(0, 5).map((n) => (
          <Pressable
            key={n.id}
            onPress={async () => {
              if (n.status === 'unread') {
                await markNotificationRead(n.id);
                queryClient.invalidateQueries({ queryKey: ['sales', 'notifications'] });
              }
            }}
            style={{
              backgroundColor: n.status === 'unread' ? t.colors.card : 'transparent',
              borderColor: t.colors.border,
              borderWidth: 1,
              borderRadius: t.radius.md,
              padding: 12,
              marginTop: 8,
            }}
          >
            <Text style={{ color: t.colors.foreground, fontWeight: n.status === 'unread' ? '700' : '500' }}>{n.title}</Text>
            {n.body ? <Text style={{ color: t.colors.mutedFg, fontSize: 12, marginTop: 2 }}>{n.body}</Text> : null}
            <Text style={{ color: t.colors.mutedFg, fontSize: 11, marginTop: 4 }}>{new Date(n.created_at).toLocaleString()}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}
