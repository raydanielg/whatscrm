/**
 * License Manager — verifies plugin licenses at install/activation.
 *
 * Supports free, perpetual, subscription, and trial licenses. The offline
 * validator checks key format + local state; the online validator hits the
 * publisher endpoint for revocation and seat enforcement.
 */

export type LicenseType = 'free' | 'perpetual' | 'subscription' | 'trial';

export type LicenseStatus =
  | { state: 'valid'; type: LicenseType; expiresAt?: string; seats?: number; seatsUsed?: number }
  | { state: 'trial'; expiresAt: string; daysRemaining: number }
  | { state: 'expired'; expiresAt: string }
  | { state: 'revoked'; reason: string }
  | { state: 'invalid'; reason: string }
  | { state: 'not_required' };

const KEY_PATTERN = /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3,7}$/;

export function isWellFormedLicenseKey(key: string): boolean {
  return KEY_PATTERN.test(key.trim());
}

export function generateLicenseKey(segments = 5): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const out: string[] = [];
  for (let i = 0; i < segments; i++) {
    let seg = '';
    for (let j = 0; j < 4; j++) seg += alphabet[Math.floor(Math.random() * alphabet.length)];
    out.push(seg);
  }
  return out.join('-');
}

export function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.ceil((b.getTime() - a.getTime()) / 86_400_000));
}

/** Validate a license against a publisher-provided endpoint. */
export async function validateLicense(params: {
  licenseKey: string;
  pluginSlug: string;
  workspaceId: string;
  licenseServerUrl?: string | null;
  signal?: AbortSignal;
}): Promise<LicenseStatus> {
  const key = params.licenseKey.trim();
  if (!isWellFormedLicenseKey(key)) return { state: 'invalid', reason: 'Malformed license key' };
  if (!params.licenseServerUrl) return { state: 'valid', type: 'perpetual' };

  try {
    const res = await fetch(params.licenseServerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: key, plugin_slug: params.pluginSlug, workspace_id: params.workspaceId }),
      signal: params.signal,
    });
    if (!res.ok) return { state: 'invalid', reason: `License server returned ${res.status}` };
    const body = (await res.json()) as {
      valid?: boolean; revoked?: boolean; type?: LicenseType;
      expires_at?: string; seats?: number; seats_used?: number; reason?: string;
    };
    if (body.revoked) return { state: 'revoked', reason: body.reason ?? 'License revoked' };
    if (!body.valid) return { state: 'invalid', reason: body.reason ?? 'License rejected' };
    if (body.expires_at && new Date(body.expires_at).getTime() < Date.now()) {
      return { state: 'expired', expiresAt: body.expires_at };
    }
    if (body.type === 'trial' && body.expires_at) {
      return { state: 'trial', expiresAt: body.expires_at, daysRemaining: daysBetween(new Date(), new Date(body.expires_at)) };
    }
    return { state: 'valid', type: body.type ?? 'perpetual', expiresAt: body.expires_at, seats: body.seats, seatsUsed: body.seats_used };
  } catch (err) {
    return { state: 'invalid', reason: err instanceof Error ? err.message : 'License check failed' };
  }
}

/** Default platform revenue split: 70% publisher / 30% marketplace. */
export const DEFAULT_PUBLISHER_SHARE_BPS = 7000;

export function splitRevenue(grossCents: number, shareBps = DEFAULT_PUBLISHER_SHARE_BPS) {
  const publisher = Math.floor((grossCents * shareBps) / 10_000);
  return { publisherShareCents: publisher, platformFeeCents: grossCents - publisher };
}
