/**
 * Strict server-side provider validation for connected-account endpoints.
 *
 * Any endpoint that creates or updates a `channel_accounts` row must refuse
 * provider values the app cannot route (and the database enum cannot store).
 * Accepting them writes rows that silently vanish from the inbox, so the
 * write is rejected with a clear 4xx error instead of a 500 or a bad row.
 */

import { KNOWN_PROVIDERS, isKnownProvider } from "@/lib/inbox/channel-capabilities";

/**
 * Providers accepted by a write: the intersection of the database
 * `messaging_provider` enum and the values the inbox knows how to route.
 * (`custom` is in the enum but has no routing, so it is not writable.)
 */
export const WRITABLE_PROVIDERS = ["whatsapp_cloud", "twilio", "dialog360"] as const;
export type WritableProvider = (typeof WRITABLE_PROVIDERS)[number];

export type ProviderValidation =
  | { ok: true; provider: WritableProvider }
  | { ok: false; status: 400 | 422; code: string; message: string };

/** Pure validation — no throwing, so it is unit-testable and reusable. */
export function validateWritableProvider(
  value: unknown,
  field = "provider",
): ProviderValidation {
  if (typeof value !== "string" || value.trim() === "") {
    return {
      ok: false,
      status: 400,
      code: "provider_required",
      message: `${field} is required and must be a non-empty string.`,
    };
  }
  const normalized = value.trim().toLowerCase();
  if ((WRITABLE_PROVIDERS as readonly string[]).includes(normalized)) {
    return { ok: true, provider: normalized as WritableProvider };
  }
  const known = isKnownProvider(normalized);
  return {
    ok: false,
    status: 422,
    code: known ? "provider_not_writable" : "unknown_provider",
    message: known
      ? `"${value}" is a recognized channel type but cannot be stored on an account. Use one of: ${WRITABLE_PROVIDERS.join(", ")}.`
      : `Unknown provider "${value}". Supported values: ${WRITABLE_PROVIDERS.join(", ")}.`,
  };
}

/** JSON 4xx response for a failed provider validation. */
export function providerErrorResponse(
  result: Extract<ProviderValidation, { ok: false }>,
): Response {
  return new Response(
    JSON.stringify({ error: result.code, message: result.message }),
    {
      status: result.status,
      statusText: result.message.slice(0, 120),
      headers: { "Content-Type": "application/json" },
    },
  );
}

/**
 * Validate a provider on a create/update endpoint. Throws a 4xx `Response`
 * (never a 500) when the value is unknown or not writable.
 */
export function assertWritableProvider(value: unknown, field = "provider"): WritableProvider {
  const result = validateWritableProvider(value, field);
  if (!result.ok) throw providerErrorResponse(result);
  return result.provider;
}

/** All provider strings the app can route — exported for error messages/tests. */
export const ROUTABLE_PROVIDERS = KNOWN_PROVIDERS;
