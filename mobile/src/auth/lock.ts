/**
 * Idle-lock: after N minutes in background, require biometric or PIN unlock
 * before showing app content again. The Supabase session stays valid so we
 * don't force a full re-login, matching the Slack/1Password model.
 */
import { create } from 'zustand';
import { AppState, type AppStateStatus } from 'react-native';

const IDLE_MS = 2 * 60 * 1000; // 2 minutes background → lock

type LockState = {
  locked: boolean;
  backgroundedAt: number | null;
  setLocked: (v: boolean) => void;
  markBackground: () => void;
  evaluate: () => void;
};

export const useLockStore = create<LockState>((set, get) => ({
  locked: false,
  backgroundedAt: null,
  setLocked: (v) => set({ locked: v, backgroundedAt: v ? null : get().backgroundedAt }),
  markBackground: () => set({ backgroundedAt: Date.now() }),
  evaluate: () => {
    const { backgroundedAt } = get();
    if (backgroundedAt && Date.now() - backgroundedAt > IDLE_MS) set({ locked: true });
  },
}));

let bound = false;
export function bindAppLock() {
  if (bound) return;
  bound = true;
  AppState.addEventListener('change', (state: AppStateStatus) => {
    const s = useLockStore.getState();
    if (state === 'background' || state === 'inactive') s.markBackground();
    if (state === 'active') s.evaluate();
  });
}

export function lockNow() {
  useLockStore.getState().setLocked(true);
}
