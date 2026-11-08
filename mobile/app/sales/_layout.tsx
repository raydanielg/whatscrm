import { Stack } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';

export default function SalesLayout() {
  const t = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: t.colors.background },
        headerTintColor: t.colors.foreground,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: t.colors.background },
      }}
    >
      <Stack.Screen name="kanban" options={{ title: 'Pipeline' }} />
      <Stack.Screen name="deal/[id]" options={{ title: 'Deal' }} />
      <Stack.Screen name="quotes" options={{ title: 'Quotes' }} />
      <Stack.Screen name="invoices" options={{ title: 'Invoices' }} />
      <Stack.Screen name="appointments" options={{ title: 'Appointments' }} />
      <Stack.Screen name="calendar" options={{ title: 'Calendar' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
    </Stack>
  );
}
