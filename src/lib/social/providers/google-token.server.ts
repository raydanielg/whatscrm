/**
 * Long-lived YouTube connections: Google access tokens last ~1 hour, so a
 * channel connected through Google OAuth (access_type=offline) keeps a
 * refresh token and this helper renews the access token on use.
 */
import { encryptToken } from "@/lib/instagram/token-crypto.server";
import { resolveToken } from "./token.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any };

export interface GoogleChannelTokens {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
}

export function googleOAuthCreds(): { clientId: string; clientSecret: string } | null {
  const clientId = (process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID)?.trim();
  const clientSecret = (process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET)?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** A usable access token (plaintext), refreshed and persisted when it is about to expire. */
export async function freshGoogleAccessToken(
  admin: Admin,
  row: GoogleChannelTokens,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const current = row.access_token ? resolveToken(row.access_token) : "";
  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  if (current && expiresAt > Date.now() + 5 * 60 * 1000) return current;
  if (!row.refresh_token) {
    if (current) return current;
    throw new Error("YouTube connection has no token. Reconnect the channel.");
  }

  const creds = googleOAuthCreds();
  if (!creds) throw new Error("YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET are not set on the server.");
  const res = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: resolveToken(row.refresh_token),
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    const reason =
      json.error === "invalid_grant"
        ? "Google revoked or expired this YouTube connection. Reconnect the channel."
        : `Google token refresh failed: ${json.error_description ?? json.error ?? res.status}`;
    await admin.from("social_channels").update({ token_refresh_error: reason }).eq("id", row.id);
    throw new Error(reason);
  }
  await admin
    .from("social_channels")
    .update({
      access_token: encryptToken(json.access_token),
      token_expires_at: new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString(),
      token_refresh_error: null,
    })
    .eq("id", row.id);
  return json.access_token;
}
