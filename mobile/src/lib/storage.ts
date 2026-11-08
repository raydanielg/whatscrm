/**
 * Storage adapters:
 *  - SecureStore: session tokens, encryption keys (Keychain / Keystore).
 *  - MMKV: fast key/value cache for offline data, feature flags, preferences.
 */
import * as SecureStore from 'expo-secure-store';
import { MMKV } from 'react-native-mmkv';

export const kv = new MMKV({ id: 'wacrm-cache' });

export const secureStorage = {
  async getItem(key: string) {
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string) {
    await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
  },
  async removeItem(key: string) {
    await SecureStore.deleteItemAsync(key);
  },
};

// Adapter for @supabase/supabase-js
export const supabaseAuthStorage = {
  getItem: (k: string) => secureStorage.getItem(k),
  setItem: (k: string, v: string) => secureStorage.setItem(k, v),
  removeItem: (k: string) => secureStorage.removeItem(k),
};
