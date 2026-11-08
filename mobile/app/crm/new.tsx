import { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { useTheme } from '@/theme/ThemeProvider';
import { createContact, createCompany, createLead } from '@/api/crm';

type Kind = 'contact' | 'company' | 'lead';

export default function CRMNew() {
  const t = useTheme();
  const [kind, setKind] = useState<Kind>('contact');
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const set = (k: string) => (v: string) => setValues((cur) => ({ ...cur, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      let res;
      if (kind === 'contact') {
        res = await createContact({
          display_name: values.name || `${values.first_name ?? ''} ${values.last_name ?? ''}`.trim() || null,
          first_name: values.first_name || null,
          last_name: values.last_name || null,
          email: values.email || null,
          phone: values.phone || null,
        });
      } else if (kind === 'company') {
        res = await createCompany({ name: values.name, industry: values.industry || null, website: values.website || null });
      } else {
        res = await createLead({ name: values.name, email: values.email || null, phone: values.phone || null, source: values.source || null });
      }
      if (res.queued) Alert.alert('Saved offline', 'This change will sync when you reconnect.');
      router.back();
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={{ fontSize: 22, color: t.colors.foreground }}>‹</Text>
        </Pressable>
        <Text style={[t.typography.h2, { color: t.colors.foreground, marginLeft: 8 }]}>New {kind}</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 6, marginTop: t.spacing.md }}>
        {(['contact', 'company', 'lead'] as Kind[]).map((k) => (
          <Pressable
            key={k}
            onPress={() => setKind(k)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: kind === k ? t.colors.foreground : t.colors.muted,
            }}
          >
            <Text style={{ color: kind === k ? t.colors.background : t.colors.mutedFg, fontWeight: '600', fontSize: 12 }}>
              {k}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ gap: t.spacing.md, paddingTop: t.spacing.lg }}>
        {kind === 'contact' ? (
          <>
            <Input label="First name" value={values.first_name ?? ''} onChangeText={set('first_name')} />
            <Input label="Last name" value={values.last_name ?? ''} onChangeText={set('last_name')} />
            <Input label="Email" value={values.email ?? ''} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
            <Input label="Phone" value={values.phone ?? ''} onChangeText={set('phone')} keyboardType="phone-pad" />
          </>
        ) : kind === 'company' ? (
          <>
            <Input label="Company name" value={values.name ?? ''} onChangeText={set('name')} />
            <Input label="Industry" value={values.industry ?? ''} onChangeText={set('industry')} />
            <Input label="Website" value={values.website ?? ''} onChangeText={set('website')} autoCapitalize="none" />
          </>
        ) : (
          <>
            <Input label="Lead name" value={values.name ?? ''} onChangeText={set('name')} />
            <Input label="Email" value={values.email ?? ''} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" />
            <Input label="Phone" value={values.phone ?? ''} onChangeText={set('phone')} keyboardType="phone-pad" />
            <Input label="Source" value={values.source ?? ''} onChangeText={set('source')} />
          </>
        )}

        <Button title="Save" onPress={save} loading={saving} />
      </ScrollView>
    </Screen>
  );
}
