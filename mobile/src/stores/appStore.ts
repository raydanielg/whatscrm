import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { kv } from '@/lib/storage';

type WorkspaceId = string;
export type ThemeMode = 'system' | 'light' | 'dark';

interface AppState {
  activeWorkspace: WorkspaceId | null;
  unreadInbox: number;
  networkOnline: boolean;
  themeMode: ThemeMode;
  language: string;
  setActiveWorkspace: (id: WorkspaceId | null) => void;
  setUnreadInbox: (n: number) => void;
  setNetworkOnline: (b: boolean) => void;
  setThemeMode: (m: ThemeMode) => void;
  setLanguage: (l: string) => void;
}

const mmkvStorage = {
  getItem: (name: string) => kv.getString(name) ?? null,
  setItem: (name: string, value: string) => kv.set(name, value),
  removeItem: (name: string) => kv.delete(name),
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeWorkspace: null,
      unreadInbox: 0,
      networkOnline: true,
      themeMode: 'system',
      language: 'en',
      setActiveWorkspace: (id) => set({ activeWorkspace: id }),
      setUnreadInbox: (n) => set({ unreadInbox: n }),
      setNetworkOnline: (b) => set({ networkOnline: b }),
      setThemeMode: (m) => set({ themeMode: m }),
      setLanguage: (l) => set({ language: l }),
    }),
    { name: 'wacrm-app', storage: createJSONStorage(() => mmkvStorage) },
  ),
);
