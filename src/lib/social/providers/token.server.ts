/**
 * Shared access-token resolution for social providers.
 *
 * Channel tokens are stored encrypted; older rows may still hold plaintext.
 * Tokens are decrypted in memory only — never logged or persisted back.
 */
import { decryptToken } from "@/lib/instagram/token-crypto.server";

function isEncrypted(token: string): boolean {
  try {
    return Buffer.from(token, "base64").length >= 28;
  } catch {
    return false;
  }
}

export function resolveToken(cipher: string): string {
  if (isEncrypted(cipher)) {
    try {
      return decryptToken(cipher);
    } catch {
      return cipher;
    }
  }
  return cipher;
}

export interface ProviderPublishResult {
  externalId?: string;
  permalink?: string;
  providerResponse?: Record<string, unknown>;
}
