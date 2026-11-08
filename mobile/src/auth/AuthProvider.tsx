import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/api/supabase';
import { getDeviceId, getDeviceProfile } from './device';
import { loadPrefs, savePrefs, clearPrefs } from './prefs';
import { bindAppLock, useLockStore } from './lock';
import { queryClient } from '@/api/queryClient';

type AuthCtx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  prefs: ReturnType<typeof loadPrefs> | null;
  signInWithPassword: (email: string, password: string) => Promise<{ error?: string }>;
  signInWithOtp: (email: string) => Promise<{ error?: string }>;
  verifyOtp: (email: string, token: string) => Promise<{ error?: string }>;
  signOut: (opts?: { forgetDevice?: boolean }) => Promise<void>;
  updatePrefs: (patch: Parameters<typeof savePrefs>[1]) => void;
  registerDeviceTrust: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    bindAppLock();
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      // If a session hydrated from SecureStore, gate the UI behind unlock.
      if (data.session) useLockStore.getState().setLocked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_OUT') useLockStore.getState().setLocked(false);
      if (event === 'SIGNED_IN') useLockStore.getState().setLocked(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const user = session?.user ?? null;
  const prefs = useMemo(() => (user ? loadPrefs(user.id) : null), [user]);

  const value: AuthCtx = {
    session,
    user,
    loading,
    prefs,
    signInWithPassword: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      return { error: error?.message };
    },
    signInWithOtp: async (email) => {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      });
      return { error: error?.message };
    },
    verifyOtp: async (email, token) => {
      const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'email' });
      return { error: error?.message };
    },
    signOut: async (opts) => {
      const uid = user?.id;
      await queryClient.cancelQueries();
      queryClient.clear();
      if (uid) {
        if (opts?.forgetDevice) {
          try {
            const deviceId = await getDeviceId();
            await supabase.from('trusted_devices').delete().match({ user_id: uid, device_id: deviceId });
          } catch {
            /* offline: outbox will retry if wired */
          }
          clearPrefs(uid);
        } else {
          savePrefs(uid, { lastUnlockAt: null });
        }
      }
      await supabase.auth.signOut();
    },
    updatePrefs: (patch) => {
      if (user) savePrefs(user.id, patch);
    },
    registerDeviceTrust: async () => {
      if (!user) return;
      const deviceId = await getDeviceId();
      const profile = getDeviceProfile();
      await supabase
        .from('trusted_devices')
        .upsert(
          {
            user_id: user.id,
            device_id: deviceId,
            platform: profile.platform,
            model: profile.model,
            os: profile.os,
            app_version: profile.appVersion,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,device_id' },
        );
      savePrefs(user.id, { rememberDevice: true });
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}
