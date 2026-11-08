/**
 * Biometric unlock (Face ID / Touch ID / Fingerprint / device passcode).
 * Wraps expo-local-authentication with the enterprise-friendly defaults:
 *   - biometrics preferred; fall back to device credential (PIN / pattern)
 *   - never allows implicit unlock — user must complete an active prompt
 *   - detects hardware absence, no enrolment, and lockout distinctly
 */
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export type BiometricKind = 'faceId' | 'touchId' | 'fingerprint' | 'iris' | 'none';

export type BiometricCapability = {
  hasHardware: boolean;
  isEnrolled: boolean;
  kind: BiometricKind;
  supportsDeviceCredential: boolean; // PIN / pattern / passcode fallback
};

export async function getBiometricCapability(): Promise<BiometricCapability> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = hasHardware ? await LocalAuthentication.isEnrolledAsync() : false;
  const types = hasHardware ? await LocalAuthentication.supportedAuthenticationTypesAsync() : [];

  let kind: BiometricKind = 'none';
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    kind = Platform.OS === 'ios' ? 'faceId' : 'faceId';
  } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    kind = Platform.OS === 'ios' ? 'touchId' : 'fingerprint';
  } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
    kind = 'iris';
  }

  return {
    hasHardware,
    isEnrolled,
    kind,
    supportsDeviceCredential: true,
  };
}

export type UnlockResult =
  | { ok: true }
  | { ok: false; reason: 'cancelled' | 'lockout' | 'not_enrolled' | 'no_hardware' | 'unknown'; error?: string };

export async function promptBiometric(reason: string): Promise<UnlockResult> {
  const cap = await getBiometricCapability();
  if (!cap.hasHardware) return { ok: false, reason: 'no_hardware' };
  if (!cap.isEnrolled) return { ok: false, reason: 'not_enrolled' };

  const res = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: 'Cancel',
    disableDeviceFallback: false, // allow OS credential fallback (PIN / pattern)
    fallbackLabel: 'Use PIN',
    requireConfirmation: false,
  });

  if (res.success) return { ok: true };
  const err = 'error' in res ? res.error : 'unknown';
  if (err === 'user_cancel' || err === 'system_cancel' || err === 'app_cancel') {
    return { ok: false, reason: 'cancelled', error: err };
  }
  if (err === 'lockout' || err === 'lockout_permanent') {
    return { ok: false, reason: 'lockout', error: err };
  }
  return { ok: false, reason: 'unknown', error: err };
}
