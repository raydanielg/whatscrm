import { ScrollView, Text } from 'react-native';
import { Stack } from 'expo-router';
import { Screen } from '@/components/Screen';
import { SectionCard, ListRow, StatusPill } from '@/components/DashboardKit';
import { useTheme } from '@/theme/ThemeProvider';
import { useAppStore, type ThemeMode } from '@/stores/appStore';

const OPTIONS: Array<{ id: ThemeMode; title: string; subtitle: string }> = [
  { id: 'system', title: 'System', subtitle: 'Match device appearance' },
  { id: 'light', title: 'Light', subtitle: 'Always light' },
  { id: 'dark', title: 'Dark', subtitle: 'Always dark' },
];

export default function Appearance() {
  const t = useTheme();
  const mode = useAppStore((s) => s.themeMode);

  return (
    <Screen style={{ padding: 0 }}>
      <Stack.Screen options={{ title: 'Appearance' }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }}>
        <SectionCard title="Theme">
          {OPTIONS.map((o) => (
            <ListRow
              key={o.id}
              title={o.title}
              subtitle={o.subtitle}
              right={mode === o.id ? <StatusPill label="Selected" tone="success" /> : undefined}
              onPress={() => useAppStore.getState().setThemeMode(o.id)}
            />
          ))}
        </SectionCard>
        <Text style={{ color: t.colors.mutedFg, fontSize: 12 }}>Preference is stored on-device and applied instantly.</Text>
      </ScrollView>
    </Screen>
  );
}
