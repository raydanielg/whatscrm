import { useEffect, useState } from 'react';
import { ScrollView, Text, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Screen } from '@/components/Screen';
import { SectionCard, ListRow, StatusPill } from '@/components/DashboardKit';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthProvider';
import { useAppStore } from '@/stores/appStore';
import { useRole } from '@/hooks/useRole';
import { CAN } from '@/lib/roles';
import { listWorkspaces, setActiveWorkspace, type Workspace } from '@/auth/workspaces';

export default function WorkspaceSettings() {
  const t = useTheme();
  const { user } = useAuth();
  const activeId = useAppStore((s) => s.activeWorkspace);
  const { role } = useRole();
  const [items, setItems] = useState<Workspace[]>([]);

  useEffect(() => {
    if (!user) return;
    listWorkspaces(user.id).then(setItems).catch((e) => Alert.alert('Failed to load workspaces', e.message));
  }, [user?.id]);

  return (
    <Screen style={{ padding: 0 }}>
      <Stack.Screen options={{ title: 'Workspace' }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }}>
        <SectionCard title="Active workspace">
          {items.length === 0 && <Text style={{ color: t.colors.mutedFg }}>No workspaces yet.</Text>}
          {items.map((w) => (
            <ListRow
              key={w.id}
              title={w.name}
              subtitle={w.role ?? ''}
              right={w.id === activeId ? <StatusPill label="Active" tone="success" /> : <StatusPill label="Switch" tone="muted" />}
              onPress={() => {
                if (!user) return;
                setActiveWorkspace(user.id, w.id);
                useAppStore.getState().setActiveWorkspace(w.id);
              }}
            />
          ))}
        </SectionCard>

        {CAN.manageWorkspace(role) ? (
          <SectionCard title="Admin">
            <Text style={{ color: t.colors.mutedFg }}>
              As {role}, you can manage members, roles, and workspace settings from the web console. Advanced admin controls will land in mobile in a
              future release.
            </Text>
          </SectionCard>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
