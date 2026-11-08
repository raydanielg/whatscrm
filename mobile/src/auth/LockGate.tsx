import { useEffect, useState, type ReactNode } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Screen } from '@/components/Screen';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from './AuthProvider';
import { useLockStore } from './lock';
import { promptBiometric, getBiometricCapability, type BiometricCapability } from './biometrics';
import { hasPin, verifyPin } from './pin';

/**
 * Full-screen overlay shown when the app is locked. Order of preference:
 *   1. Biometric (Face ID / Touch ID / fingerprint) if enabled + enrolled
 *   2. App PIN if set
 *   3. Sign out escape hatch
 * The Supabase session is preserved — this only gates UI, not the token.
 */
export function LockGate({ children }: { children: ReactNode }) {
  const locked = useLockStore((s) => s.locked);
  const setLocked = useLockStore((s) => s.setLocked);
  const { prefs, signOut } = useAuth();
  const t = useTheme();

  const [cap, setCap] = useState<BiometricCapability | null>(null);
  const [pinConfigured, setPinConfigured] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!locked) return;
    getBiometricCapability().then(setCap);
    hasPin().then(setPinConfigured);
  }, [locked]);

  useEffect(() => {
    // Auto-prompt biometric when we open the lock screen.
    if (!locked) return;
    if (!prefs?.biometricEnabled) return;
    if (!cap?.hasHardware || !cap.isEnrolled) return;
    promptBiometric('Unlock WACRM').then((r) => {
      if (r.ok) setLocked(false);
      else if (r.reason && r.reason !== 'cancelled') setError(r.reason.replace('_', ' '));
    });
  }, [locked, prefs?.biometricEnabled, cap, setLocked]);

  if (!locked) return <>{children}</>;

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: t.spacing.lg }}>
        <View>
          <Text style={[t.typography.h1, { color: t.colors.foreground }]}>App locked</Text>
          <Text style={{ color: t.colors.mutedFg, marginTop: 4 }}>
            Verify it's you to continue
          </Text>
        </View>

        {prefs?.biometricEnabled && cap?.hasHardware && cap.isEnrolled ? (
          <Button
            title={`Unlock with ${cap.kind === 'faceId' ? 'Face ID' : cap.kind === 'touchId' ? 'Touch ID' : 'biometrics'}`}
            onPress={async () => {
              const r = await promptBiometric('Unlock WACRM');
              if (r.ok) setLocked(false);
              else if (r.reason !== 'cancelled') setError(r.reason.replace('_', ' '));
            }}
          />
        ) : null}

        {pinConfigured ? (
          <View style={{ gap: t.spacing.sm }}>
            <Input
              label="Enter PIN"
              value={pin}
              onChangeText={setPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
            />
            <Button
              title="Unlock with PIN"
              variant="secondary"
              onPress={async () => {
                const r = await verifyPin(pin);
                if (r.ok) {
                  setLocked(false);
                  setPin('');
                  setError(undefined);
                } else if (r.reason === 'locked') {
                  setError(`Locked. Try again in ${Math.ceil((r.remainingMs ?? 0) / 60000)} min.`);
                } else if (r.reason === 'invalid') {
                  setError(`Wrong PIN. ${r.attemptsLeft ?? 0} attempts left.`);
                } else {
                  setError('PIN not set up');
                }
              }}
            />
          </View>
        ) : null}

        {error ? <Text style={{ color: t.colors.destructive }}>{error}</Text> : null}

        <Pressable onPress={() => signOut()} accessibilityRole="button">
          <Text style={{ color: t.colors.mutedFg, textAlign: 'center', marginTop: t.spacing.lg }}>
            Sign out instead
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
