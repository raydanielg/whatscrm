import { ScrollView, View, Text } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { ListRow, SectionCard, StatusPill } from '@/components/DashboardKit';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthProvider';
import { useAppStore } from '@/stores/appStore';
import { fetchMyTasks } from '@/api/dashboard';

export default function TasksDashboard() {
  const t = useTheme();
  const { user } = useAuth();
  const wid = useAppStore((s) => s.activeWorkspace);
  const q = useQuery({
    queryKey: ['dashboard', 'tasks', wid, user?.id],
    queryFn: () => fetchMyTasks(wid!, user!.id),
    enabled: Boolean(wid && user),
  });

  return (
    <Screen style={{ padding: 0 }}>
      <Stack.Screen options={{ title: 'My tasks' }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }}>
        <SectionCard title={`Open tasks (${q.data?.length ?? 0})`}>
          {(q.data ?? []).length === 0 ? (
            <Text style={{ color: t.colors.mutedFg }}>Nothing due — enjoy the calm.</Text>
          ) : (
            (q.data ?? []).map((task: any) => {
              const due = task.due_date ? new Date(task.due_date) : null;
              const overdue = due && due.getTime() < Date.now();
              return (
                <ListRow
                  key={task.id}
                  title={task.title}
                  subtitle={due ? `Due ${due.toLocaleDateString()}` : 'No due date'}
                  right={
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {task.priority ? <StatusPill label={task.priority} tone="muted" /> : null}
                      {overdue ? <StatusPill label="Overdue" tone="destructive" /> : null}
                    </View>
                  }
                />
              );
            })
          )}
        </SectionCard>
      </ScrollView>
    </Screen>
  );
}
