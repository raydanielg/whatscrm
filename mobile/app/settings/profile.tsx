import { useEffect, useState } from 'react';
import { ScrollView, View, Text, TextInput, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Screen } from '@/components/Screen';
import { SectionCard, ListRow, StatusPill } from '@/components/DashboardKit';
import { Button } from '@/components/Button';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthProvider';
import { useRole } from '@/hooks/useRole';
import { supabase } from '@/api/supabase';

export default function Profile() {
  const t = useTheme();
  const { user } = useAuth();
  const { role } = useRole();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('full_name, phone')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setFullName((data as any)?.full_name ?? '');
        setPhone((data as any)?.phone ?? '');
      });
  }, [user?.id]);

  async function save() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ full_name: fullName, phone }).eq('id', user.id);
    setSaving(false);
    if (error) Alert.alert('Save failed', error.message);
    else Alert.alert('Saved', 'Your profile was updated.');
  }

  const inputStyle = {
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.card,
    color: t.colors.foreground,
    borderRadius: t.radius.md,
    padding: 12,
    fontSize: 15,
  } as const;

  return (
    <Screen style={{ padding: 0 }}>
      <Stack.Screen options={{ title: 'Profile' }} />
      <ScrollView contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.md }}>
        <SectionCard title="Account">
          <ListRow title="Email" subtitle={user?.email ?? ''} right={role ? <StatusPill label={role} tone="muted" /> : undefined} />
          <View style={{ gap: 6, paddingTop: 8 }}>
            <Text style={{ color: t.colors.mutedFg, fontSize: 12 }}>Full name</Text>
            <TextInput value={fullName} onChangeText={setFullName} style={inputStyle} placeholderTextColor={t.colors.mutedFg} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ color: t.colors.mutedFg, fontSize: 12 }}>Phone</Text>
            <TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" style={inputStyle} placeholderTextColor={t.colors.mutedFg} />
          </View>
          <Button title={saving ? 'Saving' : 'Save profile'} onPress={save} />
        </SectionCard>
      </ScrollView>
    </Screen>
  );
}
