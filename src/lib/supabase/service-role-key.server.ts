// Server-only shape validation for SUPABASE_SERVICE_ROLE_KEY.
//
// SECURITY: nothing here ever returns, logs or embeds the key value. Every message
// describes only the *classification* of the value, never the value itself.
//
// Two formats are accepted, because the project still supports both:
//   - new-style secret keys: `sb_secret_...` (opaque, sent as `apikey`)
//   - legacy service-role JWTs: three base64url segments whose payload has
//     `"role": "service_role"` (sent as a bearer token)
// Publishable keys (`sb_publishable_...`) and anon/authenticated JWTs are rejected:
// they carry no RLS-bypassing privilege, so accepting one degrades every admin
// operation to anon access silently instead of failing at boot.

export type ServiceRoleKeyFormat = 'secret' | 'legacy-service-role-jwt';

export type ServiceRoleKeyVerdict =
  | { ok: true; format: ServiceRoleKeyFormat }
  | { ok: false; reason: string };

const SECRET_PREFIX = 'sb_secret_';
const PUBLISHABLE_PREFIX = 'sb_publishable_';

/** Reads `role` out of a JWT payload without verifying the signature. */
function jwtRole(value: string): string | null {
  const segments = value.split('.');
  if (segments.length !== 3) return null;
  try {
    const payload: unknown = JSON.parse(
      Buffer.from(segments[1]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    );
    if (typeof payload !== 'object' || payload === null) return null;
    const role = (payload as { role?: unknown }).role;
    return typeof role === 'string' ? role : null;
  } catch {
    return null;
  }
}

/**
 * Classifies a candidate key. Never throws, never echoes the value — safe to call
 * from readiness checks and diagnostics.
 */
export function inspectServiceRoleKey(
  value: string | undefined | null,
  varName = 'SUPABASE_SERVICE_ROLE_KEY',
): ServiceRoleKeyVerdict {
  if (value === undefined || value === null || value.trim() === '') {
    return { ok: false, reason: `${varName} is not set in the server environment.` };
  }

  const key = value.trim();

  if (key.startsWith(SECRET_PREFIX)) return { ok: true, format: 'secret' };

  if (key.startsWith(PUBLISHABLE_PREFIX)) {
    return {
      ok: false,
      reason:
        `${varName} holds a publishable key (sb_publishable_), which cannot bypass RLS. ` +
        `Set it to the project's secret key (sb_secret_) from Supabase → Project Settings → API keys. ` +
        `Keep it server-only; never ship it to the browser.`,
    };
  }

  const role = jwtRole(key);
  if (role === 'service_role') return { ok: true, format: 'legacy-service-role-jwt' };
  if (role !== null) {
    return {
      ok: false,
      reason:
        `${varName} holds a legacy JWT for the "${role}" role, not "service_role", so it cannot bypass RLS. ` +
        `Set it to the project's secret key (sb_secret_) or the legacy service_role key.`,
    };
  }

  return {
    ok: false,
    reason:
      `${varName} is not in a recognised privileged-key format. Expected a secret key (sb_secret_) ` +
      `or a legacy service_role JWT. Do not use a publishable or anon key here.`,
  };
}

/** Throws with an actionable, value-free message unless the key is privileged. */
export function assertServiceRoleKey(
  value: string | undefined | null,
  varName = 'SUPABASE_SERVICE_ROLE_KEY',
): ServiceRoleKeyFormat {
  const verdict = inspectServiceRoleKey(value, varName);
  if (!verdict.ok) throw new Error(verdict.reason);
  return verdict.format;
}
