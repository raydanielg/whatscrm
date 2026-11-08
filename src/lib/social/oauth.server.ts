/**
 * Shared OAuth plumbing for the non-Meta social channels (X, Threads, TikTok).
 *
 * Like the Meta flow, the callback routes are public (the provider redirects
 * without a session), so trust comes from an HMAC-signed, short-lived state
 * envelope created while the user was authenticated.
 */
import { createHmac, timingSafeEqual, randomBytes, createHash } from "node:crypto";
import { oauthOrigin, safeOAuthReturnTo } from "./oauth-origin.server";

export type OAuthPlatform = "x" | "threads" | "tiktok" | "linkedin" | "youtube";

export interface SocialOAuthState {
  platform: OAuthPlatform;
  workspaceId: string;
  userId: string;
  /** Same-origin path to return to. */
  returnTo: string;
  /** PKCE verifier (X only). */
  verifier?: string;
  redirectUri?: string;
  exp: number;
}

function stateSecret(): string {
  const raw =
    process.env["SOCIAL_OAUTH_STATE_SECRET"] ??
    process.env["META_APP_SECRET"] ??
    process.env["WIDGET_SIGNING_SECRET"];
  if (!raw) throw new Error("No signing secret configured for social OAuth state");
  return raw;
}

function sign(payload: string): string {
  return createHmac("sha256", stateSecret()).update(payload).digest("base64url");
}

export function encodeState(state: SocialOAuthState): string {
  const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeState(raw: string): SocialOAuthState | null {
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SocialOAuthState;
    if (!parsed.workspaceId || !parsed.userId || !Number.isFinite(parsed.exp) || parsed.exp < Date.now()) return null;
    parsed.returnTo = safeOAuthReturnTo(parsed.returnTo);
    return parsed;
  } catch {
    return null;
  }
}

export function callbackUri(origin: string, platform: OAuthPlatform): string {
  return `${oauthOrigin(origin)}/api/public/social/${platform}-callback`;
}

/** PKCE pair for X's OAuth 2.0 authorization-code flow. */
export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export const X_SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"];
// threads_manage_insights is required to read per-post metrics in the
// Performance tab; channels connected before it was added must reconnect.
export const THREADS_SCOPES = ["threads_basic", "threads_content_publish", "threads_manage_insights"];
// Requested at authorize time. TikTok may grant a subset — see parseTikTokScopes.
export const TIKTOK_SCOPES = ["user.info.basic", "video.publish"];
// OpenID Connect identity (matches what verify.functions.ts already requests
// to check a pasted LinkedIn token, GET /v2/userinfo) plus w_member_social so
// the publish path can post as the authenticated member. Organization
// posting (w_organization_social, Community Management API, partner-gated)
// is intentionally out of scope for this member-login OAuth flow.
export const LINKEDIN_SCOPES = ["openid", "profile", "email", "w_member_social"];

// youtube.force-ssl covers reading/replying to comments and uploading videos.
export const YOUTUBE_SCOPES = ["https://www.googleapis.com/auth/youtube.force-ssl"];

export interface OAuthAppCreds {
  clientId: string;
  clientSecret: string;
}

export function oauthCreds(platform: OAuthPlatform): OAuthAppCreds {
  if (platform === "x") {
    const clientId = process.env["X_CLIENT_ID"];
    const clientSecret = process.env["X_CLIENT_SECRET"];
    if (!clientId || !clientSecret)
      throw new Error("X login is not configured yet (missing X_CLIENT_ID / X_CLIENT_SECRET).");
    return { clientId, clientSecret };
  }
  if (platform === "tiktok") {
    const clientId = process.env["TIKTOK_CLIENT_KEY"];
    const clientSecret = process.env["TIKTOK_CLIENT_SECRET"];
    if (!clientId || !clientSecret)
      throw new Error("TikTok login is not configured yet (missing TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET).");
    return { clientId, clientSecret };
  }
  if (platform === "youtube") {
    const clientId = process.env["YOUTUBE_CLIENT_ID"] ?? process.env["GOOGLE_CLIENT_ID"];
    const clientSecret = process.env["YOUTUBE_CLIENT_SECRET"] ?? process.env["GOOGLE_CLIENT_SECRET"];
    if (!clientId || !clientSecret)
      throw new Error("YouTube login is not configured yet (missing YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET).");
    return { clientId, clientSecret };
  }
  if (platform === "linkedin") {
    const clientId = process.env["LINKEDIN_CLIENT_ID"];
    const clientSecret = process.env["LINKEDIN_CLIENT_SECRET"];
    if (!clientId || !clientSecret)
      throw new Error("LinkedIn login is not configured yet (missing LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET).");
    return { clientId, clientSecret };
  }
  const clientId = process.env["THREADS_APP_ID"];
  const clientSecret = process.env["THREADS_APP_SECRET"];
  if (!clientId || !clientSecret)
    throw new Error("Threads login is not configured yet (missing THREADS_APP_ID / THREADS_APP_SECRET).");
  return { clientId, clientSecret };
}

/**
 * TikTok's authorize URL uses `client_key`, not `client_id` — a naive copy of
 * the X/Threads builders sends the wrong param name and TikTok rejects it.
 */
export function buildTikTokAuthorizeUrl(args: {
  clientKey: string;
  redirectUri: string;
  state: string;
  scopes: readonly string[];
}): string {
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.searchParams.set("client_key", args.clientKey);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("scope", args.scopes.join(","));
  url.searchParams.set("state", args.state);
  return url.toString();
}

/**
 * TikTok's token endpoint takes `client_key`/`client_secret` as form fields,
 * not HTTP Basic auth (which is what X's token endpoint expects).
 */
export function tiktokTokenExchangeBody(args: {
  clientKey: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): URLSearchParams {
  return new URLSearchParams({
    client_key: args.clientKey,
    client_secret: args.clientSecret,
    code: args.code,
    grant_type: "authorization_code",
    redirect_uri: args.redirectUri,
  });
}

export function tiktokRefreshBody(args: {
  clientKey: string;
  clientSecret: string;
  refreshToken: string;
}): URLSearchParams {
  return new URLSearchParams({
    client_key: args.clientKey,
    client_secret: args.clientSecret,
    refresh_token: args.refreshToken,
    grant_type: "refresh_token",
  });
}

/** TikTok's token response returns granted scopes as a comma-separated string. */
export function parseTikTokScopes(scope: string | null | undefined): string[] {
  if (!scope) return [];
  return scope
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function hasScope(granted: readonly string[], required: string): boolean {
  return granted.includes(required);
}

export interface TikTokTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  open_id?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export interface TikTokUserInfoResponse {
  data?: { user?: { open_id?: string; display_name?: string; avatar_url?: string } };
  error?: { code?: string; message?: string };
}

/** Everything the callback needs to persist, still holding plaintext tokens for the route to encrypt. */
export interface TikTokConnectRow {
  workspace_id: string;
  platform: "tiktok";
  name: string;
  external_id: string;
  username: string | null;
  avatar_url: string | null;
  access_token_plain: string;
  refresh_token_plain: string | null;
  token_expires_at: string | null;
  refresh_token_expires_at: string | null;
  status: "connected";
  created_by: string;
  metadata: { granted_scopes: string[]; can_publish: boolean };
}

export type TikTokConnectOutcome =
  | { ok: true; row: TikTokConnectRow; redirectParams: Record<string, string> }
  | { ok: false; redirectParams: Record<string, string> };

/**
 * Decide what a TikTok token exchange + identity lookup means for the stored
 * channel, without doing any I/O. `tokenOk` mirrors `Response.ok` for the
 * token call, since a non-2xx with a body TikTok still considers "handled"
 * needs the same error-shaped result as a 2xx carrying `error`.
 *
 * Two failure paths return `ok: false` with a safe, user-facing message
 * (never surfacing token values). Success records the granted scopes and
 * whether `video.publish` was actually granted — requested-but-not-granted
 * connects successfully for identity, and callers must check
 * `row.metadata.can_publish` before treating the channel as publish-ready.
 */
export function resolveTikTokConnect(args: {
  state: Pick<SocialOAuthState, "workspaceId" | "userId">;
  tokenOk: boolean;
  token: TikTokTokenResponse;
  userInfo: TikTokUserInfoResponse;
  now?: number;
}): TikTokConnectOutcome {
  const { state, tokenOk, token, userInfo } = args;
  const now = args.now ?? Date.now();

  if (!tokenOk || !token.access_token) {
    return {
      ok: false,
      redirectParams: {
        social_error: token.error_description ?? token.error ?? "TikTok token exchange failed.",
      },
    };
  }

  const grantedScopes = parseTikTokScopes(token.scope);
  const canPublish = hasScope(grantedScopes, "video.publish");
  const openId = userInfo.data?.user?.open_id ?? token.open_id;
  if (!openId) {
    return {
      ok: false,
      redirectParams: { social_error: userInfo.error?.message ?? "Could not read your TikTok account." },
    };
  }

  const row: TikTokConnectRow = {
    workspace_id: state.workspaceId,
    platform: "tiktok",
    name: userInfo.data?.user?.display_name ?? "TikTok account",
    external_id: openId,
    username: userInfo.data?.user?.display_name ?? null,
    avatar_url: userInfo.data?.user?.avatar_url ?? null,
    access_token_plain: token.access_token,
    refresh_token_plain: token.refresh_token ?? null,
    token_expires_at: token.expires_in ? new Date(now + token.expires_in * 1000).toISOString() : null,
    refresh_token_expires_at: token.refresh_expires_in
      ? new Date(now + token.refresh_expires_in * 1000).toISOString()
      : null,
    status: "connected",
    created_by: state.userId,
    metadata: { granted_scopes: grantedScopes, can_publish: canPublish },
  };

  const redirectParams: Record<string, string> = { social_connected: "1", social_platform: "TikTok" };
  if (!canPublish) {
    redirectParams.social_warning =
      "Connected, but TikTok did not grant video publishing. Reconnect and approve video.publish to enable posting.";
  }
  return { ok: true, row, redirectParams };
}

/**
 * LinkedIn's token endpoint takes standard OAuth2 form fields (no client_key
 * quirk like TikTok) at https://www.linkedin.com/oauth/v2/accessToken.
 */
export function linkedinTokenExchangeBody(args: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): URLSearchParams {
  return new URLSearchParams({
    client_id: args.clientId,
    client_secret: args.clientSecret,
    code: args.code,
    grant_type: "authorization_code",
    redirect_uri: args.redirectUri,
  });
}

export interface LinkedInTokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

/** OpenID Connect userinfo response — https://api.linkedin.com/v2/userinfo. */
export interface LinkedInUserInfoResponse {
  sub?: string;
  name?: string;
  picture?: string;
  email?: string;
  error?: string;
  error_description?: string;
}

/** Everything the callback needs to persist, still holding the plaintext token for the route to encrypt. */
export interface LinkedInConnectRow {
  workspace_id: string;
  platform: "linkedin";
  name: string;
  external_id: string;
  username: string | null;
  avatar_url: string | null;
  access_token_plain: string;
  refresh_token_plain: string | null;
  token_expires_at: string | null;
  refresh_token_expires_at: string | null;
  status: "connected";
  created_by: string;
  metadata: { granted_scopes: string[]; can_publish: boolean };
}

export type LinkedInConnectOutcome =
  | { ok: true; row: LinkedInConnectRow; redirectParams: Record<string, string> }
  | { ok: false; redirectParams: Record<string, string> };

/**
 * Decide what a LinkedIn token exchange + userinfo lookup means for the
 * stored channel, without doing any I/O — mirrors resolveTikTokConnect.
 * LinkedIn's OIDC `sub` claim is used as `external_id`, matching the
 * identity check verify.functions.ts already performs against the same
 * /v2/userinfo endpoint for the manual-paste flow this replaces.
 */
export function resolveLinkedInConnect(args: {
  state: Pick<SocialOAuthState, "workspaceId" | "userId">;
  tokenOk: boolean;
  token: LinkedInTokenResponse;
  userInfo: LinkedInUserInfoResponse;
  now?: number;
}): LinkedInConnectOutcome {
  const { state, tokenOk, token, userInfo } = args;
  const now = args.now ?? Date.now();

  if (!tokenOk || !token.access_token) {
    return {
      ok: false,
      redirectParams: {
        social_error: token.error_description ?? token.error ?? "LinkedIn token exchange failed.",
      },
    };
  }

  const grantedScopes = (token.scope ?? "").split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  const sub = userInfo.sub;
  if (!sub) {
    return {
      ok: false,
      redirectParams: {
        social_error: userInfo.error_description ?? userInfo.error ?? "Could not read your LinkedIn account.",
      },
    };
  }

  const canPublish = hasScope(grantedScopes, "w_member_social");
  const row: LinkedInConnectRow = {
    workspace_id: state.workspaceId,
    platform: "linkedin",
    name: userInfo.name ?? "LinkedIn account",
    external_id: sub,
    username: userInfo.name ?? null,
    avatar_url: userInfo.picture ?? null,
    access_token_plain: token.access_token,
    refresh_token_plain: null,
    token_expires_at: token.expires_in ? new Date(now + token.expires_in * 1000).toISOString() : null,
    refresh_token_expires_at: null,
    status: "connected",
    created_by: state.userId,
    metadata: { granted_scopes: grantedScopes, can_publish: canPublish },
  };

  const redirectParams: Record<string, string> = { social_connected: "1", social_platform: "LinkedIn" };
  if (!canPublish) {
    redirectParams.social_warning =
      "Connected, but LinkedIn did not grant post publishing. Reconnect and approve w_member_social to enable posting.";
  }
  return { ok: true, row, redirectParams };
}
