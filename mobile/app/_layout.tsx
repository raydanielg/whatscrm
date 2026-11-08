import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import { queryClient } from '@/api/queryClient';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { NetworkGate } from '@/offline/NetworkGate';
import { registerForPush } from '@/notifications/push';
import { useNotificationListeners } from '@/notifications/listeners';
import { LockGate } from '@/auth/LockGate';
import { useDeepLinks } from '@/native/links';
import { registerBackgroundSync } from '@/native/background';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { keepSplashUntilReady, hideSplash } from '@/lib/perf';
import '@/i18n';

keepSplashUntilReady();

function PushRegistrar() {
  const { session } = useAuth();
  useNotificationListeners();
  useEffect(() => {
    if (session) registerForPush().catch(() => {});
  }, [session]);
  return null;
}

function NativeBridges() {
  useDeepLinks();
  useEffect(() => {
    registerBackgroundSync().catch(() => {});
  }, []);
  return null;
}

export default function RootLayout() {
  useEffect(() => {
    // Release native splash on first paint of the root — subtrees hydrate underneath.
    const t = setTimeout(() => {
      hideSplash();
    }, 50);
    return () => clearTimeout(t);
  }, []);
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemeProvider>
            <QueryClientProvider client={queryClient}>
              <AuthProvider>
                <NetworkGate>
                  <PushRegistrar />
                  <NativeBridges />
                  <LockGate>
                    <Stack screenOptions={{ headerShown: false }}>
                      <Stack.Screen name="(auth)" />
                      <Stack.Screen name="(tabs)" />
                      <Stack.Screen name="scanner" options={{ presentation: 'modal', headerShown: false }} />
                      <Stack.Screen name="device" options={{ presentation: 'card' }} />
                      <Stack.Screen name="readiness" options={{ headerShown: true, title: 'Readiness' }} />
                      <Stack.Screen name="notifications" options={{ presentation: 'card', headerShown: true }} />
                      <Stack.Screen name="notification-preferences" options={{ presentation: 'card', headerShown: true }} />
                      <Stack.Screen name="dashboard/performance" options={{ headerShown: true }} />
                      <Stack.Screen name="dashboard/tasks" options={{ headerShown: true }} />
                      <Stack.Screen name="dashboard/appointments" options={{ headerShown: true }} />
                      <Stack.Screen name="dashboard/conversation-analytics" options={{ headerShown: true }} />
                      <Stack.Screen name="dashboard/sales-analytics" options={{ headerShown: true }} />
                      <Stack.Screen name="dashboard/quick-reports" options={{ headerShown: true }} />
                      <Stack.Screen name="settings/profile" options={{ headerShown: true }} />
                      <Stack.Screen name="settings/workspace" options={{ headerShown: true }} />
                      <Stack.Screen name="settings/appearance" options={{ headerShown: true }} />
                      <Stack.Screen name="settings/language" options={{ headerShown: true }} />
                    </Stack>
                  </LockGate>
                </NetworkGate>
              </AuthProvider>
            </QueryClientProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
