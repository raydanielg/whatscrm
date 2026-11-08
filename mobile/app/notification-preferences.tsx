import { View, Text, Switch, ScrollView, StyleSheet, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/api/supabase';
import { CATEGORY_META, type NotificationCategory } from '@/notifications/push';
import { palette, radius, spacing, typography } from '@/theme/tokens';

type Prefs = Record<string, { push: boolean; email: boolean; in_app: boolean }>;

const CATEGORIES = Object.keys(CATEGORY_META) as NotificationCategory[];

export default function NotificationPreferences() {
  const [prefs, setPrefs] = useState<Prefs>({});
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data } = await supabase
        .from('notification_preferences')
        .select('category, push_enabled, email_enabled, in_app_enabled')
        .eq('user_id', user.id);
      const map: Prefs = {};
      for (const cat of CATEGORIES) {
        map[cat] = { push: true, email: true, in_app: true };
      }
      for (const row of data ?? []) {
        map[row.category] = { push: !!row.push_enabled, email: !!row.email_enabled, in_app: !!row.in_app_enabled };
      }
      setPrefs(map);
    })();
  }, []);

  const toggle = async (cat: NotificationCategory, key: 'push' | 'email' | 'in_app', value: boolean) => {
    if (!userId) return;
    const next = { ...prefs, [cat]: { ...prefs[cat], [key]: value } };
    setPrefs(next);
    const payload = {
      user_id: userId,
      category: cat,
      push_enabled: next[cat].push,
      email_enabled: next[cat].email,
      in_app_enabled: next[cat].in_app,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('notification_preferences').upsert(payload, { onConflict: 'user_id,category' });
    if (error) Alert.alert('Could not save', error.message);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Notification settings' }} />
      <ScrollView style={styles.screen} contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        {CATEGORIES.map((cat) => {
          const p = prefs[cat] ?? { push: true, email: true, in_app: true };
          return (
            <View key={cat} style={styles.card}>
              <Text style={styles.cardTitle}>{CATEGORY_META[cat].name}</Text>
              <Row label="Push" value={p.push} onChange={(v) => toggle(cat, 'push', v)} />
              <Row label="Email" value={p.email} onChange={(v) => toggle(cat, 'email', v)} />
              <Row label="In-app" value={p.in_app} onChange={(v) => toggle(cat, 'in_app', v)} />
            </View>
          );
        })}
      </ScrollView>
    </>
  );
}

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: palette.primary }} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  card: { backgroundColor: palette.card, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  cardTitle: { ...typography.h3, color: palette.foreground, marginBottom: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  rowLabel: { ...typography.body, color: palette.foreground },
});
