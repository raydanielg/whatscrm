import { ScrollView, Text } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '@/components/Screen';
import { ListRow, SectionCard, StatusPill } from '@/components/DashboardKit';
import { useTheme } from '@/theme/ThemeProvider';
import { useAppStore } from '@/stores/appStore';
import { fetchUpcomingAppointments } from '@/api/dashboard';

export default function AppointmentsDashboard() {
  const t = useTheme();
  const wid = useAppStore((s) => s.activeWorkspace);
  const q = useQuery({
    queryKey: ['dashboard', 'appointments', wid],
    queryFn: () => fetchUpcomingAppointments(wid!),
    enabled: Boolean(wid),
  });

  return (
    <Screen style={{ padding: 0 }}>
      <Stack.Screen options={{ title: 'Appointments' }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }}>
        <SectionCard title={`Next 7 days (${q.data?.length ?? 0})`}>
          {(q.data ?? []).length === 0 ? (
            <Text style={{ color: t.colors.mutedFg }}>No upcoming appointments.</Text>
          ) : (
            (q.data ?? []).map((appt: any) => {
              const start = new Date(appt.start_at);
              return (
                <ListRow
                  key={appt.id}
                  title={appt.title ?? appt.customer_name ?? 'Appointment'}
                  subtitle={`${start.toLocaleDateString()} · ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                  right={appt.status ? <StatusPill label={appt.status} tone={appt.status === 'confirmed' ? 'success' : 'muted'} /> : undefined}
                />
              );
            })
          )}
        </SectionCard>
      </ScrollView>
    </Screen>
  );
}
