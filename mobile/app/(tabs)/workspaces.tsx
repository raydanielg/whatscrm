import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthProvider';
import { listWorkspaces, getActiveWorkspaceId, setActiveWorkspace, type Workspace } from '@/auth/workspaces';
import { useAppStore } from '@/stores/appStore';

export default function WorkspaceSwitcher() {
  const t = useTheme();
  const { user } = useAuth();
  const qc = useQueryClient();
  const setActive = useAppStore((s) => s.setActiveWorkspace);
  const [selected, setSelected] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['workspaces', user?.id],
    queryFn: () => (user ? listWorkspaces(user.id) : Promise.resolve<Workspace[]>([])),
    enabled: !!user,
  });

  useEffect(() => {
    if (user) setSelected(getActiveWorkspaceId(user.id));
  }, [user]);

  function pick(id: string) {
    if (!user) return;
    setSelected(id);
    setActiveWorkspace(user.id, id);
    setActive(id);
    // Invalidate everything workspace-scoped.
    qc.invalidateQueries();
  }

  return (
    <Screen>
      <Text style={[t.typography.h1, { color: t.colors.foreground, marginBottom: t.spacing.md }]}>Workspaces</Text>
      <ScrollView contentContainerStyle={{ gap: t.spacing.sm }}>
        {(q.data ?? []).map((w) => (
          <Pressable
            key={w.id}
            onPress={() => pick(w.id)}
            style={{
              padding: t.spacing.md,
              borderRadius: t.radius.md,
              borderWidth: 1,
              borderColor: selected === w.id ? t.colors.primary : t.colors.border,
              backgroundColor: t.colors.card,
            }}
          >
            <Text style={{ color: t.colors.foreground, fontSize: 16, fontWeight: '600' }}>{w.name}</Text>
            <Text style={{ color: t.colors.mutedFg, fontSize: 12, marginTop: 2 }}>
              {w.slug ?? w.id} · {w.role ?? 'member'}
            </Text>
          </Pressable>
        ))}
        {!q.isLoading && (q.data ?? []).length === 0 ? (
          <Text style={{ color: t.colors.mutedFg, textAlign: 'center', marginTop: 40 }}>
            No workspaces yet. Ask an admin for an invite.
          </Text>
        ) : null}
      </ScrollView>
      <View style={{ marginTop: t.spacing.lg }}>
        <Button title="Continue" onPress={() => router.replace('/(tabs)/inbox')} disabled={!selected} />
      </View>
    </Screen>
  );
}
