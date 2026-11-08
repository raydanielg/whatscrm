/**
 * App-level PIN lock.
 *
 * The PIN is NEVER stored in plaintext. We store:
 *   - a random per-device salt (SecureStore)
 *   - SHA-256(salt || pin) as the verifier (SecureStore)
 *   - failed attempt counter + cooldown timestamp (SecureStore)
 *
 * On correct PIN, biometrics can be re-armed. After 5 failed attempts,
 * we escalate to a 5 minute cooldown and require full re-authentication.
 */
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const SALT_KEY = 'pin.salt.v1';
const HASH_KEY = 'pin.hash.v1';
const ATTEMPTS_KEY = 'pin.attempts.v1';
const LOCKED_UNTIL_KEY = 'pin.locked_until.v1';

const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60 * 1000;

async function derive(salt: string, pin: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}::${pin}`);
}

async function randomSalt() {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hasPin(): Promise<boolean> {
  const [salt, hash] = await Promise.all([
    SecureStore.getItemAsync(SALT_KEY),
    SecureStore.getItemAsync(HASH_KEY),
  ]);
  return !!salt && !!hash;
}

export async function setPin(pin: string): Promise<void> {
  if (!/^\d{4,8}$/.test(pin)) throw new Error('PIN must be 4–8 digits');
  const salt = await randomSalt();
  const hash = await derive(salt, pin);
  await SecureStore.setItemAsync(SALT_KEY, salt, { keychainAccessible: SecureStore.WHEN_UNLOCKED });
  await SecureStore.setItemAsync(HASH_KEY, hash, { keychainAccessible: SecureStore.WHEN_UNLOCKED });
  await SecureStore.deleteItemAsync(ATTEMPTS_KEY);
  await SecureStore.deleteItemAsync(LOCKED_UNTIL_KEY);
}

export async function clearPin(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(SALT_KEY),
    SecureStore.deleteItemAsync(HASH_KEY),
    SecureStore.deleteItemAsync(ATTEMPTS_KEY),
    SecureStore.deleteItemAsync(LOCKED_UNTIL_KEY),
  ]);
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'not_set' | 'locked'; remainingMs?: number; attemptsLeft?: number };

export async function verifyPin(pin: string): Promise<VerifyResult> {
  const [salt, hash, lockedUntilRaw, attemptsRaw] = await Promise.all([
    SecureStore.getItemAsync(SALT_KEY),
    SecureStore.getItemAsync(HASH_KEY),
    SecureStore.getItemAsync(LOCKED_UNTIL_KEY),
    SecureStore.getItemAsync(ATTEMPTS_KEY),
  ]);
  if (!salt || !hash) return { ok: false, reason: 'not_set' };

  const lockedUntil = lockedUntilRaw ? Number(lockedUntilRaw) : 0;
  if (lockedUntil > Date.now()) {
    return { ok: false, reason: 'locked', remainingMs: lockedUntil - Date.now() };
  }

  const candidate = await derive(salt, pin);
  if (candidate === hash) {
    await SecureStore.deleteItemAsync(ATTEMPTS_KEY);
    await SecureStore.deleteItemAsync(LOCKED_UNTIL_KEY);
    return { ok: true };
  }
  const attempts = (attemptsRaw ? Number(attemptsRaw) : 0) + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await SecureStore.setItemAsync(LOCKED_UNTIL_KEY, String(Date.now() + LOCK_MS));
    await SecureStore.deleteItemAsync(ATTEMPTS_KEY);
    return { ok: false, reason: 'locked', remainingMs: LOCK_MS };
  }
  await SecureStore.setItemAsync(ATTEMPTS_KEY, String(attempts));
  return { ok: false, reason: 'invalid', attemptsLeft: MAX_ATTEMPTS - attempts };
}
