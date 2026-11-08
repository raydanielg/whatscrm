import { ScrollView, Text } from 'react-native';
import { Stack } from 'expo-router';
import { Screen } from '@/components/Screen';
import { ListRow, SectionCard } from '@/components/DashboardKit';
import { useTheme } from '@/theme/ThemeProvider';
import { useRole } from '@/hooks/useRole';
import { CAN } from '@/lib/roles';
import { router } from 'expo-router';

const REPORTS = [
  { id: 'sales-mtd', title: 'Sales this month', subtitle: 'Won amount, pipeline, win rate', to: '/dashboard/sales-analytics' },
  { id: 'convo-week', title: 'Conversation volume (7d)', subtitle: 'By status & channel', to: '/dashboard/conversation-analytics' },
  { id: 'perf-30', title: 'Personal performance (30d)', subtitle: 'Messages, tasks, CSAT', to: '/dashboard/performance' },
  { id: 'tasks', title: 'Open task backlog', subtitle: 'Overdue items first', to: '/dashboard/tasks' },
  { id: 'appointments', title: 'Upcoming appointments', subtitle: 'Next 7 days', to: '/dashboard/appointments' },
] as const;

export default function QuickReports() {
  const t = useTheme();
  const { role } = useRole();

  if (!CAN.viewQuickReports(role)) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Reports' }} />
        <Text style={{ color: t.colors.mutedFg }}>Quick reports are available to admins and owners.</Text>
      </Screen>
    );
  }

  return (
    <Screen style={{ padding: 0 }}>
      <Stack.Screen options={{ title: 'Quick reports' }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }}>
        <SectionCard title="Snapshots">
          {REPORTS.map((r) => (
            <ListRow key={r.id} title={r.title} subtitle={r.subtitle} onPress={() => router.push(r.to as any)} />
          ))}
        </SectionCard>
      </ScrollView>
    </Screen>
  );
}
