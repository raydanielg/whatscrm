import { ScrollView, View, Text } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { KpiTile, SectionCard } from '@/components/DashboardKit';
import { useTheme } from '@/theme/ThemeProvider';
import { useAppStore } from '@/stores/appStore';
import { useRole } from '@/hooks/useRole';
import { CAN } from '@/lib/roles';
import { fetchSalesAnalytics } from '@/api/dashboard';

export default function SalesAnalytics() {
  const t = useTheme();
  const wid = useAppStore((s) => s.activeWorkspace);
  const { role } = useRole();
  const enabled = Boolean(wid && CAN.viewSalesAnalytics(role));
  const q = useQuery({
    queryKey: ['dashboard', 'sales-analytics', wid],
    queryFn: () => fetchSalesAnalytics(wid!),
    enabled,
  });

  if (!CAN.viewSalesAnalytics(role)) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Sales' }} />
        <Text style={{ color: t.colors.mutedFg }}>You don't have access to sales analytics.</Text>
      </Screen>
    );
  }

  const d = q.data;
  const cur = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return (
    <Screen style={{ padding: 0 }}>
      <Stack.Screen options={{ title: 'Sales' }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
        <Text style={{ color: t.colors.mutedFg }}>Month-to-date</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
          <KpiTile label="Pipeline" value={cur(d?.pipelineValue ?? 0)} hint={`${d?.pipelineCount ?? 0} open`} />
          <KpiTile label="Won" value={cur(d?.wonAmount ?? 0)} hint={`${d?.wonCount ?? 0} deals`} tone="success" />
          <KpiTile label="Lost" value={cur(d?.lostAmount ?? 0)} hint={`${d?.lostCount ?? 0} deals`} tone="destructive" />
          <KpiTile label="Win rate" value={`${(d?.winRate ?? 0).toFixed(0)}%`} />
        </View>
        <SectionCard title="Notes">
          <Text style={{ color: t.colors.mutedFg }}>
            Numbers respect RLS. Owners/admins see workspace-wide totals; agents see deals they own.
          </Text>
        </SectionCard>
      </ScrollView>
    </Screen>
  );
}
