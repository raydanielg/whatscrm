/**
 * Messenger Page access token health helpers.
 *
 * Server-only. Handles:
 *  - verifying a stored Page token against Meta Graph (`/debug_token` + a
 *    lightweight page-scoped fetch),
 *  - marking a `messenger_accounts` row as expired when Meta reports an
 *    OAuth failure (invalid/expired token, user revoked, page removed),
 *  - re-stamping `last_verified_at` and `token_expires_at` after a
 *    successful check.
 *
 * Page access tokens minted from a long-lived user token generally don't
 * expire, but they DO get invalidated when the admin changes their
 * password, revokes app permissions, removes the Page, or when Meta
 * rotates for security. We treat any of those as "expired" and surface
 * an actionable reconnect prompt.
 */
import { decryptToken } from "@/lib/instagram/token-crypto.server";
import { isMetaAuthError } from "./send.server";
import { sbAny } from "@/lib/supabase/untyped";

const GRAPH = "https://graph.facebook.com/v21.0";

export interface VerifyResult {
  ok: boolean;
  expired: boolean;
  reason: string | null;
  expiresAt: string | null; // ISO or null when "never"
  scopes: string[] | null;
}

/**
 * Ping Meta with the stored Page token. When the token is still valid we
 * also read `/debug_token` to refresh scopes and expiry metadata.
 */
export async function verifyMessengerPageToken(
  pageId: string,
  accessTokenCipher: string,
): Promise<VerifyResult> {
  let token: string;
  try {
    token = decryptToken(accessTokenCipher);
  } catch {
    return { ok: false, expired: true, reason: "Stored token could not be decrypted", expiresAt: null, scopes: null };
  }

  // 1) Cheap page-scoped ping — catches revoked/removed tokens fast.
  const pingRes = await fetch(
    `${GRAPH}/${encodeURIComponent(pageId)}?fields=id&access_token=${encodeURIComponent(token)}`,
  );
  const pingJson: {
    id?: string;
    error?: { message?: string; code?: number; error_subcode?: number };
  } = await pingRes.json().catch(() => ({}));

  if (!pingRes.ok || pingJson.error) {
    const err = pingJson.error ?? {};
    const authFailure = isMetaAuthError(err.code, err.error_subcode);
    return {
      ok: false,
      expired: authFailure,
      reason: err.message ?? `Meta returned HTTP ${pingRes.status}`,
      expiresAt: null,
      scopes: null,
    };
  }

  // 2) Introspect via /debug_token for scopes + expiry metadata.
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  let expiresAt: string | null = null;
  let scopes: string[] | null = null;
  if (appId && appSecret) {
    const debugRes = await fetch(
      `${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`,
    );
    const debugJson: {
      data?: {
        is_valid?: boolean;
        expires_at?: number; // unix seconds, 0 = never
        scopes?: string[];
        error?: { message?: string; code?: number; subcode?: number };
      };
    } = await debugRes.json().catch(() => ({}));
    const info = debugJson.data;
    if (info) {
      if (info.is_valid === false) {
        const authFailure = isMetaAuthError(info.error?.code, info.error?.subcode);
        return {
          ok: false,
          expired: authFailure,
          reason: info.error?.message ?? "Meta reports token is no longer valid",
          expiresAt: null,
          scopes: info.scopes ?? null,
        };
      }
      if (typeof info.expires_at === "number" && info.expires_at > 0) {
        expiresAt = new Date(info.expires_at * 1000).toISOString();
      }
      if (Array.isArray(info.scopes)) scopes = info.scopes;
    }
  }

  return { ok: true, expired: false, reason: null, expiresAt, scopes };
}

/**
 * Persist a "token expired / auth revoked" state on the account row so the
 * UI can surface a Reconnect action.
 */
export async function markMessengerAccountExpired(
  accountId: string,
  reason: string,
): Promise<void> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sbAny(supabaseAdmin).from("messenger_accounts" as any) as any)
    .update({
      status: "expired",
      status_reason: reason.slice(0, 500),
      last_verified_at: new Date().toISOString(),
    })
    .eq("id", accountId);
}

export async function markMessengerAccountConnected(
  accountId: string,
  patch: { expiresAt: string | null; scopes: string[] | null },
): Promise<void> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const update: Record<string, unknown> = {
    status: "connected",
    status_reason: null,
    last_verified_at: new Date().toISOString(),
  };
  if (patch.expiresAt !== null) update.token_expires_at = patch.expiresAt;
  if (patch.scopes) update.scopes = patch.scopes;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (sbAny(supabaseAdmin).from("messenger_accounts" as any) as any)
    .update(update)
    .eq("id", accountId);
}

/**
 * Inspect an error thrown from `sendMessengerMessage` and, if it's an
 * OAuth/auth failure, flip the account row to `expired`. Callers should
 * still re-throw so the send path fails loudly.
 */
export async function handleMessengerSendError(
  accountId: string,
  err: unknown,
): Promise<void> {
  const e = err as { isAuthError?: boolean; metaCode?: number; message?: string };
  if (!e?.isAuthError) return;
  await markMessengerAccountExpired(
    accountId,
    e.message ?? "Meta rejected the Page access token (reconnect required)",
  );
}
