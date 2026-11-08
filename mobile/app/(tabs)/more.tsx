import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthProvider';
import { pending } from '@/offline/outbox';

export default function More() {
  const t = useTheme();
  const { signOut, user } = useAuth();
  const outboxCount = pending().length;

  return (
    <Screen>
      <Text style={[t.typography.h1, { color: t.colors.foreground }]}>More</Text>
      <View style={{ marginTop: t.spacing.lg, gap: t.spacing.md }}>
        <View style={{ padding: t.spacing.md, borderRadius: t.radius.md, backgroundColor: t.colors.muted }}>
          <Text style={{ color: t.colors.mutedFg, fontSize: 12 }}>Signed in as</Text>
          <Text style={{ color: t.colors.foreground, fontSize: 15, fontWeight: '600' }}>{user?.email}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Offline outbox, ${outboxCount} pending`}
          style={{ padding: t.spacing.md, borderRadius: t.radius.md, borderWidth: 1, borderColor: t.colors.border, minHeight: 44 }}
        >
          <Text style={{ color: t.colors.foreground, fontWeight: '600' }}>Offline outbox</Text>
          <Text style={{ color: t.colors.mutedFg, fontSize: 12, marginTop: 2 }}>{outboxCount} pending mutation(s)</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open production readiness"
          onPress={() => router.push('/readiness')}
          style={{ padding: t.spacing.md, borderRadius: t.radius.md, borderWidth: 1, borderColor: t.colors.border, minHeight: 44 }}
        >
          <Text style={{ color: t.colors.foreground, fontWeight: '600' }}>Production readiness</Text>
          <Text style={{ color: t.colors.mutedFg, fontSize: 12, marginTop: 2 }}>Live health of auth, sync, push & native</Text>
        </Pressable>
        <Button
          title="Sign out"
          variant="destructive"
          onPress={async () => {
            await signOut();
            router.replace('/(auth)/sign-in');
          }}
        />
      </View>
    </Screen>
  );
}
