import { ScrollView, View, Text, Pressable, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { KpiTile, SectionCard, ListRow } from '@/components/DashboardKit';
import { SyncStatusBar } from '@/components/SyncStatusBar';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthProvider';
import { useAppStore } from '@/stores/appStore';
import { useRole } from '@/hooks/useRole';
import { CAN } from '@/lib/roles';
import { fetchPersonalKpis } from '@/api/dashboard';

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: t.radius.full,
        borderWidth: 1,
        borderColor: t.colors.border,
        backgroundColor: t.colors.card,
      }}
    >
      <Text style={{ color: t.colors.foreground, fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export default function Dashboard() {
  const t = useTheme();
  const { user } = useAuth();
  const workspaceId = useAppStore((s) => s.activeWorkspace);
  const { role } = useRole();

  const kpi = useQuery({
    queryKey: ['dashboard', 'kpis', workspaceId, user?.id],
    queryFn: () => fetchPersonalKpis(workspaceId!, user!.id),
    enabled: Boolean(workspaceId && user),
  });

  const currency = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <Screen style={{ padding: 0 }}>
      <ScrollView
        contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.lg, paddingBottom: 96 }}
        refreshControl={<RefreshControl refreshing={kpi.isFetching} onRefresh={() => kpi.refetch()} tintColor={t.colors.primary} />}
      >
        <View>
          <Text style={[t.typography.h1, { color: t.colors.foreground }]}>Dashboard</Text>
          <Text style={{ color: t.colors.mutedFg, marginTop: 2 }}>
            Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}
          </Text>
          <View style={{ marginTop: 10, flexDirection: 'row', gap: 8 }}>
            <SyncStatusBar />
          </View>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
          <KpiTile label="Open tasks" value={kpi.data?.tasksOpen ?? '—'} hint={`${kpi.data?.tasksOverdue ?? 0} overdue`} tone={(kpi.data?.tasksOverdue ?? 0) > 0 ? 'warning' : 'default'} onPress={() => router.push('/dashboard/tasks')} />
          <KpiTile label="Today's appts" value={kpi.data?.appointmentsToday ?? '—'} onPress={() => router.push('/dashboard/appointments')} />
          <KpiTile label="Unread convos" value={kpi.data?.unreadConversations ?? '—'} tone={(kpi.data?.unreadConversations ?? 0) > 0 ? 'warning' : 'default'} onPress={() => router.push('/(tabs)/inbox')} />
          {CAN.viewSalesAnalytics(role) && (
            <KpiTile label="Deals won (mo)" value={kpi.data?.dealsWonThisMonth ?? '—'} hint={currency(kpi.data?.dealsWonAmount ?? 0)} tone="success" onPress={() => router.push('/dashboard/sales-analytics')} />
          )}
        </View>

        <SectionCard title="Quick actions">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CAN.viewPerformance(role) && <Chip label="Performance" onPress={() => router.push('/dashboard/performance')} />}
            <Chip label="Tasks" onPress={() => router.push('/dashboard/tasks')} />
            <Chip label="Appointments" onPress={() => router.push('/dashboard/appointments')} />
            {CAN.viewConversationAnalytics(role) && <Chip label="Conversations" onPress={() => router.push('/dashboard/conversation-analytics')} />}
            {CAN.viewSalesAnalytics(role) && <Chip label="Sales" onPress={() => router.push('/dashboard/sales-analytics')} />}
            {CAN.viewQuickReports(role) && <Chip label="Reports" onPress={() => router.push('/dashboard/quick-reports')} />}
          </View>
        </SectionCard>

        <SectionCard title="Settings">
          <ListRow title="Profile" subtitle={user?.email ?? ''} onPress={() => router.push('/settings/profile')} />
          <ListRow title="Workspace" subtitle={role ? `Role: ${role}` : 'Manage workspace'} onPress={() => router.push('/settings/workspace')} />
          <ListRow title="Appearance" subtitle="Dark mode & theme" onPress={() => router.push('/settings/appearance')} />
          <ListRow title="Language" subtitle="Change display language" onPress={() => router.push('/settings/language')} />
          <ListRow title="Notifications" subtitle="Push, email, in-app" onPress={() => router.push('/notification-preferences')} />
        </SectionCard>
      </ScrollView>
    </Screen>
  );
}
