/**
 * Symmetric encryption for App User Connector connection keys.
 * Server-only — never import from client bundles.
 *
 * Uses APP_USER_CONNECTION_KEY_SECRET (base64, 32 bytes) if present.
 * Falls back to base64 encoding (dev only) so calendar UI stays testable
 * before the connector client is provisioned.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(): Buffer | null {
  const raw = process.env.APP_USER_CONNECTION_KEY_SECRET;
  if (!raw) return null;
  try {
    const buf = Buffer.from(raw, "base64");
    return buf.length === 32 ? buf : null;
  } catch {
    return null;
  }
}

export function encryptConnectionKey(plaintext: string): string {
  const k = key();
  if (!k) return `dev:${Buffer.from(plaintext, "utf8").toString("base64")}`;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return "v1:" + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptConnectionKey(stored: string): string {
  if (stored.startsWith("dev:")) {
    return Buffer.from(stored.slice(4), "base64").toString("utf8");
  }
  if (!stored.startsWith("v1:")) throw new Error("Unrecognized ciphertext");
  const k = key();
  if (!k) throw new Error("APP_USER_CONNECTION_KEY_SECRET not set");
  const buf = Buffer.from(stored.slice(3), "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", k, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
