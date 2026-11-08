/**
 * Shared helpers for the Meta (Facebook/Instagram) connect flow.
 *
 * The OAuth state is a signed, short-lived envelope so the public callback
 * route can trust which workspace and user started the flow without a session.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { oauthOrigin, safeOAuthReturnTo } from "./oauth-origin.server";

export const META_GRAPH = "https://graph.facebook.com/v21.0";

export const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "business_management",
  "instagram_basic",
  "instagram_content_publish",
  // Needed to read per-post insights (impressions/shares) in the Performance tab.
  "instagram_manage_insights",
].join(",");

export interface MetaOAuthState {
  workspaceId: string;
  userId: string;
  /** Same-origin path to return to. */
  returnTo: string;
  /** Which channel the user set out to connect; drives the callback messaging. */
  target?: "facebook" | "instagram";
  redirectUri?: string;
  exp: number;
}

function stateSecret(): string {
  const raw = process.env["META_APP_SECRET"];
  if (!raw) throw new Error("META_APP_SECRET is not configured");
  return raw;
}

function sign(payload: string): string {
  return createHmac("sha256", stateSecret()).update(payload).digest("base64url");
}

export function encodeState(state: MetaOAuthState): string {
  const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeState(raw: string): MetaOAuthState | null {
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as MetaOAuthState;
    if (!parsed.workspaceId || !parsed.userId || !Number.isFinite(parsed.exp) || parsed.exp < Date.now()) return null;
    parsed.returnTo = safeOAuthReturnTo(parsed.returnTo);
    return parsed;
  } catch {
    return null;
  }
}

export function metaRedirectUri(origin: string): string {
  return `${oauthOrigin(origin)}/api/public/social/meta-callback`;
}
