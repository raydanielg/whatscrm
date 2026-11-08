import { useEffect, useState } from 'react';
import { View, Text, Switch, Alert, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthProvider';
import { getBiometricCapability, promptBiometric, type BiometricCapability } from '@/auth/biometrics';
import { hasPin, setPin, clearPin } from '@/auth/pin';
import { loadPrefs } from '@/auth/prefs';
import { lockNow } from '@/auth/lock';

export default function Security() {
  const t = useTheme();
  const { user, prefs, updatePrefs, signOut } = useAuth();
  const [cap, setCap] = useState<BiometricCapability | null>(null);
  const [pinSet, setPinSet] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const current = user ? loadPrefs(user.id) : prefs;

  useEffect(() => {
    getBiometricCapability().then(setCap);
    hasPin().then(setPinSet);
  }, []);

  async function toggleBiometric(v: boolean) {
    if (v) {
      if (!cap?.hasHardware) return Alert.alert('Unavailable', 'No biometric hardware on this device.');
      if (!cap.isEnrolled) return Alert.alert('Set up biometrics', 'Enroll Face ID / fingerprint in system settings first.');
      const r = await promptBiometric('Confirm to enable biometric unlock');
      if (!r.ok) return;
    }
    updatePrefs({ biometricEnabled: v });
  }

  async function savePin() {
    if (newPin !== confirmPin) return Alert.alert('PINs do not match');
    try {
      await setPin(newPin);
      setPinSet(true);
      setNewPin('');
      setConfirmPin('');
      updatePrefs({ pinEnabled: true });
      Alert.alert('PIN saved');
    } catch (e: any) {
      Alert.alert('Invalid PIN', e?.message ?? 'PIN must be 4–8 digits');
    }
  }

  async function removePin() {
    await clearPin();
    setPinSet(false);
    updatePrefs({ pinEnabled: false });
  }

  return (
    <Screen>
      <Text style={[t.typography.h1, { color: t.colors.foreground, marginBottom: t.spacing.md }]}>Security</Text>

      <Row label="Biometric unlock" hint={cap ? (cap.hasHardware ? (cap.isEnrolled ? 'Ready' : 'Not enrolled') : 'No hardware') : ''}>
        <Switch value={!!current?.biometricEnabled} onValueChange={toggleBiometric} />
      </Row>

      <View style={{ height: 1, backgroundColor: t.colors.border, marginVertical: t.spacing.md }} />

      <Text style={{ color: t.colors.foreground, fontWeight: '600', marginBottom: t.spacing.sm }}>App PIN</Text>
      {pinSet ? (
        <Button title="Remove PIN" variant="secondary" onPress={removePin} />
      ) : (
        <View style={{ gap: t.spacing.sm }}>
          <Input label="New PIN (4–8 digits)" value={newPin} onChangeText={setNewPin} keyboardType="number-pad" secureTextEntry maxLength={8} />
          <Input label="Confirm PIN" value={confirmPin} onChangeText={setConfirmPin} keyboardType="number-pad" secureTextEntry maxLength={8} />
          <Button title="Save PIN" onPress={savePin} disabled={newPin.length < 4} />
        </View>
      )}

      <View style={{ height: 1, backgroundColor: t.colors.border, marginVertical: t.spacing.md }} />

      <Row label="Remember this device" hint="Uses a device-trust record on the server">
        <Switch
          value={!!current?.rememberDevice}
          onValueChange={(v) => updatePrefs({ rememberDevice: v })}
        />
      </Row>

      <View style={{ height: 1, backgroundColor: t.colors.border, marginVertical: t.spacing.md }} />

      <Button title="Lock now" variant="secondary" onPress={lockNow} />
      <View style={{ height: t.spacing.sm }} />
      <Button
        title="Sign out and forget this device"
        variant="destructive"
        onPress={async () => {
          await signOut({ forgetDevice: true });
          router.replace('/(auth)/sign-in');
        }}
      />
    </Screen>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.colors.foreground, fontSize: 15, fontWeight: '600' }}>{label}</Text>
        {hint ? <Text style={{ color: t.colors.mutedFg, fontSize: 12 }}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}
