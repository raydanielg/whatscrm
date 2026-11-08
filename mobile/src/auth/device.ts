/**
 * Device identity — a stable, per-install device ID used for "Remember Device"
 * and device-trust records. Persisted in SecureStore (Keychain / Keystore) so
 * it survives app kills but is wiped on uninstall.
 */
import * as SecureStore from 'expo-secure-store';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

const KEY = 'device.id.v1';

export async function getDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY);
  if (existing) return existing;

  const seed =
    Platform.OS === 'ios'
      ? (await Application.getIosIdForVendorAsync()) ?? Crypto.randomUUID()
      : Application.getAndroidId() ?? Crypto.randomUUID();

  const id = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, seed);
  await SecureStore.setItemAsync(KEY, id, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
  return id;
}

export function getDeviceProfile() {
  return {
    brand: Device.brand,
    model: Device.modelName,
    os: `${Device.osName} ${Device.osVersion}`,
    platform: Platform.OS,
    appVersion: Application.nativeApplicationVersion ?? 'dev',
  };
}
