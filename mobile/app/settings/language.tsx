import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { Screen } from '@/components/Screen';
import { SectionCard, ListRow, StatusPill } from '@/components/DashboardKit';
import { useTheme } from '@/theme/ThemeProvider';
import { useAppStore } from '@/stores/appStore';
import { SUPPORTED_LANGUAGES, setLanguage } from '@/i18n';

export default function Language() {
  const t = useTheme();
  const current = useAppStore((s) => s.language);

  return (
    <Screen style={{ padding: 0 }}>
      <Stack.Screen options={{ title: 'Language' }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }}>
        <SectionCard title="Display language">
          {SUPPORTED_LANGUAGES.map((l) => (
            <ListRow
              key={l.code}
              title={l.label}
              subtitle={l.code.toUpperCase()}
              right={current === l.code ? <StatusPill label="Selected" tone="success" /> : undefined}
              onPress={() => setLanguage(l.code)}
            />
          ))}
        </SectionCard>
      </ScrollView>
    </Screen>
  );
}
