/**
 * Symmetric encryption for Instagram/Meta access tokens.
 * Uses APP_USER_CONNECTION_KEY_SECRET (auto-provisioned) if present, else
 * falls back to META_TOKEN_ENCRYPTION_KEY. Never store plaintext tokens.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

function key(): Buffer {
  const raw =
    process.env.APP_USER_CONNECTION_KEY_SECRET ||
    process.env.META_TOKEN_ENCRYPTION_KEY ||
    process.env.SESSION_SECRET;
  if (!raw) throw new Error("Missing encryption key (APP_USER_CONNECTION_KEY_SECRET or META_TOKEN_ENCRYPTION_KEY)");
  // Accept base64 or arbitrary string; derive 32 bytes.
  try {
    const b = Buffer.from(raw, "base64");
    if (b.length === 32) return b;
  } catch { /* ignore */ }
  return createHash("sha256").update(raw).digest();
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptToken(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
