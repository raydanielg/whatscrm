import { ScrollView, View, Text } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { KpiTile, SectionCard, ListRow } from '@/components/DashboardKit';
import { useTheme } from '@/theme/ThemeProvider';
import { useAppStore } from '@/stores/appStore';
import { useRole } from '@/hooks/useRole';
import { CAN } from '@/lib/roles';
import { fetchConversationAnalytics } from '@/api/dashboard';

export default function ConversationAnalytics() {
  const t = useTheme();
  const wid = useAppStore((s) => s.activeWorkspace);
  const { role } = useRole();
  const enabled = Boolean(wid && CAN.viewConversationAnalytics(role));
  const q = useQuery({
    queryKey: ['dashboard', 'convo-analytics', wid],
    queryFn: () => fetchConversationAnalytics(wid!),
    enabled,
  });

  if (!CAN.viewConversationAnalytics(role)) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Conversations' }} />
        <Text style={{ color: t.colors.mutedFg }}>You don't have access to conversation analytics.</Text>
      </Screen>
    );
  }

  const d = q.data;
  return (
    <Screen style={{ padding: 0 }}>
      <Stack.Screen options={{ title: 'Conversations' }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.lg }}>
        <Text style={{ color: t.colors.mutedFg }}>Last 7 days</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
          <KpiTile label="Total" value={d?.total ?? '—'} />
          <KpiTile label="Unread" value={d?.unread ?? '—'} tone={(d?.unread ?? 0) > 0 ? 'warning' : 'default'} />
        </View>
        <SectionCard title="By status">
          {Object.entries(d?.byStatus ?? {}).map(([k, v]) => (
            <ListRow key={k} title={k} right={<Text style={{ color: t.colors.foreground, fontWeight: '700' }}>{v as number}</Text>} />
          ))}
          {Object.keys(d?.byStatus ?? {}).length === 0 && <Text style={{ color: t.colors.mutedFg }}>No data.</Text>}
        </SectionCard>
        <SectionCard title="By channel">
          {Object.entries(d?.byChannel ?? {}).map(([k, v]) => (
            <ListRow key={k} title={k} right={<Text style={{ color: t.colors.foreground, fontWeight: '700' }}>{v as number}</Text>} />
          ))}
          {Object.keys(d?.byChannel ?? {}).length === 0 && <Text style={{ color: t.colors.mutedFg }}>No data.</Text>}
        </SectionCard>
      </ScrollView>
    </Screen>
  );
}
