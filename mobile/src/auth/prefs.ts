/**
 * Per-user auth preferences (biometrics enabled, remembered device, active
 * workspace). Stored in MMKV so switching users works.
 */
import { kv } from '@/lib/storage';

type Prefs = {
  biometricEnabled: boolean;
  pinEnabled: boolean;
  rememberDevice: boolean;
  activeWorkspaceId: string | null;
  lastUnlockAt: number | null;
};

const DEFAULTS: Prefs = {
  biometricEnabled: false,
  pinEnabled: false,
  rememberDevice: false,
  activeWorkspaceId: null,
  lastUnlockAt: null,
};

function keyFor(userId: string) {
  return `auth.prefs.${userId}`;
}

export function loadPrefs(userId: string): Prefs {
  const raw = kv.getString(keyFor(userId));
  if (!raw) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(userId: string, prefs: Partial<Prefs>): Prefs {
  const merged = { ...loadPrefs(userId), ...prefs };
  kv.set(keyFor(userId), JSON.stringify(merged));
  return merged;
}

export function clearPrefs(userId: string) {
  kv.delete(keyFor(userId));
}
