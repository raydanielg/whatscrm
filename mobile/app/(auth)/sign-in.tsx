import { useState } from 'react';
import { View, Text, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/components/Screen';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { useAuth } from '@/auth/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';

type Mode = 'password' | 'magic';

export default function SignIn() {
  const t = useTheme();
  const { signInWithPassword, signInWithOtp, verifyOtp, registerDeviceTrust, updatePrefs } = useAuth();
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function complete() {
    if (remember) {
      try {
        await registerDeviceTrust();
      } catch {
        /* silent — server side may not have trusted_devices table yet */
      }
    } else {
      updatePrefs({ rememberDevice: false });
    }
    router.replace('/(tabs)/inbox');
  }

  async function submitPassword() {
    setError(undefined);
    setLoading(true);
    const { error: err } = await signInWithPassword(email, password);
    setLoading(false);
    if (err) return setError(err);
    await complete();
  }

  async function requestMagicLink() {
    setError(undefined);
    setLoading(true);
    const { error: err } = await signInWithOtp(email);
    setLoading(false);
    if (err) return setError(err);
    setOtpSent(true);
  }

  async function submitOtp() {
    setError(undefined);
    setLoading(true);
    const { error: err } = await verifyOtp(email, otp);
    setLoading(false);
    if (err) return setError(err);
    await complete();
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'center', gap: t.spacing.lg }}>
          <View>
            <Text style={[t.typography.h1, { color: t.colors.foreground }]}>Welcome back</Text>
            <Text style={{ color: t.colors.mutedFg, marginTop: 4 }}>Sign in to your WACRM workspace</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
            {(['password', 'magic'] as Mode[]).map((m) => (
              <Pressable
                key={m}
                onPress={() => {
                  setMode(m);
                  setOtpSent(false);
                  setError(undefined);
                }}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: t.radius.md,
                  backgroundColor: mode === m ? t.colors.foreground : t.colors.muted,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: mode === m ? t.colors.background : t.colors.mutedFg, fontWeight: '600' }}>
                  {m === 'password' ? 'Password' : 'Magic link'}
                </Text>
              </Pressable>
            ))}
          </View>

          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />

          {mode === 'password' ? (
            <>
              <Input
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password"
              />
              <Button title="Sign in" onPress={submitPassword} loading={loading} />
            </>
          ) : otpSent ? (
            <>
              <Input
                label="6-digit code"
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={6}
              />
              <Button title="Verify code" onPress={submitOtp} loading={loading} />
              <Pressable onPress={requestMagicLink}>
                <Text style={{ color: t.colors.mutedFg, textAlign: 'center' }}>Resend code</Text>
              </Pressable>
            </>
          ) : (
            <Button title="Send magic link" onPress={requestMagicLink} loading={loading} />
          )}

          <Pressable
            onPress={() => setRemember((v) => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: t.colors.border,
                backgroundColor: remember ? t.colors.primary : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {remember ? <Text style={{ color: t.colors.primaryFg, fontSize: 12, fontWeight: '700' }}>✓</Text> : null}
            </View>
            <Text style={{ color: t.colors.foreground }}>Remember this device</Text>
          </Pressable>

          {error ? <Text style={{ color: t.colors.destructive }}>{error}</Text> : null}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
