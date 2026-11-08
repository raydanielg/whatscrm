import { ScrollView, View, Text } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { KpiTile, SectionCard } from '@/components/DashboardKit';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthProvider';
import { useAppStore } from '@/stores/appStore';
import { useRole } from '@/hooks/useRole';
import { CAN } from '@/lib/roles';
import { fetchPerformance } from '@/api/dashboard';

export default function Performance() {
  const t = useTheme();
  const { user } = useAuth();
  const wid = useAppStore((s) => s.activeWorkspace);
  const { role } = useRole();

  const q = useQuery({
    queryKey: ['dashboard', 'perf', wid, user?.id],
    queryFn: () => fetchPerformance(wid!, user!.id),
    enabled: Boolean(wid && user && CAN.viewPerformance(role)),
  });

  if (!CAN.viewPerformance(role)) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Performance' }} />
        <Text style={{ color: t.colors.mutedFg }}>You don't have access to performance metrics.</Text>
      </Screen>
    );
  }

  const d = q.data;
  return (
    <Screen style={{ padding: 0 }}>
      <Stack.Screen options={{ title: 'Performance' }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
        <Text style={{ color: t.colors.mutedFg }}>Last 30 days</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
          <KpiTile label="Messages sent" value={d?.messagesSent ?? '—'} />
          <KpiTile label="Tasks completed" value={d?.tasksDone ?? '—'} tone="success" />
          <KpiTile label="Deals closed" value={d?.dealsClosed ?? '—'} />
          <KpiTile label="CSAT avg" value={d?.csatAvg != null ? d.csatAvg.toFixed(2) : '—'} hint={d?.csatCount ? `${d.csatCount} responses` : undefined} tone="success" />
        </View>
        <SectionCard title="Insights">
          <Text style={{ color: t.colors.mutedFg }}>
            Personal productivity roll-up, RLS-scoped so admins/owners see the same view for their own actions and workspace totals via analytics tabs.
          </Text>
        </SectionCard>
      </ScrollView>
    </Screen>
  );
}
