/**
 * OAuth 2.0 / OIDC server primitives. Import ONLY from server code
 * (server routes, server-fn handlers loaded via dynamic import).
 */
import { sbAny } from "@/lib/supabase/untyped";

const ACCESS_TTL_S = 3600;              // 1h
const REFRESH_TTL_S = 60 * 60 * 24 * 30; // 30d
const CODE_TTL_S = 300;                  // 5m

export const OAUTH_TTL = { ACCESS_TTL_S, REFRESH_TTL_S, CODE_TTL_S };

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken(len = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(len)));
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256B64Url(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return b64url(new Uint8Array(digest));
}

export async function verifyPKCE(
  verifier: string,
  challenge: string,
  method: string | null,
): Promise<boolean> {
  if (!verifier || !challenge) return false;
  if (method === "plain") return verifier === challenge;
  // Default to S256.
  const computed = await sha256B64Url(verifier);
  return computed === challenge;
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function generateClientCredentials() {
  const client_id = "oa_" + randomToken(16);
  const client_secret = "oas_" + randomToken(32);
  return { client_id, client_secret };
}

/**
 * Client authentication (Basic header or body). Returns the DB client row or null.
 */
export async function authenticateClient(
  admin: any,
  request: Request,
  body: URLSearchParams,
): Promise<{ client: any; authed: boolean; publicOk: boolean } | null> {
  let clientId = body.get("client_id") ?? "";
  let clientSecret = body.get("client_secret") ?? "";
  const auth = request.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("basic ")) {
    try {
      const decoded = atob(auth.slice(6));
      const idx = decoded.indexOf(":");
      if (idx > 0) {
        clientId = decodeURIComponent(decoded.slice(0, idx));
        clientSecret = decodeURIComponent(decoded.slice(idx + 1));
      }
    } catch { /* ignore */ }
  }
  if (!clientId) return null;
  const { data: client } = await admin
    .from("oauth_clients")
    .select("*")
    .eq("client_id", clientId)
    .maybeSingle();
  if (!client || client.revoked_at) return null;

  if (client.client_type === "public") {
    // No secret required. Public clients are considered "authed" only for PKCE flows.
    return { client, authed: !clientSecret, publicOk: true };
  }
  if (!clientSecret) return { client, authed: false, publicOk: false };
  const hash = await sha256Hex(clientSecret);
  const ok = timingSafeEqual(hash, client.client_secret_hash ?? "");
  return { client, authed: ok, publicOk: false };
}

export function oauthError(
  error: string,
  description?: string,
  status = 400,
): Response {
  return new Response(
    JSON.stringify({ error, error_description: description }),
    {
      status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        pragma: "no-cache",
      },
    },
  );
}

export type MintedTokens = {
  access_token: string;
  refresh_token?: string;
  token_type: "Bearer";
  expires_in: number;
  scope: string;
  id_token?: string;
};

/**
 * Mint access + optional refresh token pair. Persists hashed values.
 */
export async function mintTokenPair(
  admin: any,
  args: {
    clientId: string;
    userId: string | null;
    organizationId: string;
    scopes: string[];
    withRefresh: boolean;
  },
): Promise<MintedTokens> {
  const access = "oat_" + randomToken(32);
  const refresh = args.withRefresh ? "ort_" + randomToken(48) : null;
  const accessHash = await sha256Hex(access);
  const refreshHash = refresh ? await sha256Hex(refresh) : null;
  const now = Date.now();

  const { data: at, error: atErr } = await admin
    .from("oauth_access_tokens")
    .insert({
      token_hash: accessHash,
      client_id: args.clientId,
      user_id: args.userId,
      organization_id: args.organizationId,
      scopes: args.scopes,
      expires_at: new Date(now + ACCESS_TTL_S * 1000).toISOString(),
    })
    .select("id")
    .single();
  if (atErr) throw atErr;

  if (refreshHash) {
    const { error: rtErr } = await sbAny(admin).from("oauth_refresh_tokens").insert({
      token_hash: refreshHash,
      access_token_id: at.id,
      client_id: args.clientId,
      user_id: args.userId,
      organization_id: args.organizationId,
      scopes: args.scopes,
      expires_at: new Date(now + REFRESH_TTL_S * 1000).toISOString(),
    });
    if (rtErr) throw rtErr;
  }

  return {
    access_token: access,
    refresh_token: refresh ?? undefined,
    token_type: "Bearer",
    expires_in: ACCESS_TTL_S,
    scope: args.scopes.join(" "),
  };
}

/**
 * Validate a bearer access token. Returns the token row or null.
 */
export async function validateAccessToken(admin: any, token: string) {
  if (!token) return null;
  const hash = await sha256Hex(token);
  const { data } = await admin
    .from("oauth_access_tokens")
    .select("*")
    .eq("token_hash", hash)
    .maybeSingle();
  if (!data) return null;
  if (data.revoked_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  admin
    .from("oauth_access_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {}, () => {});
  return data;
}
