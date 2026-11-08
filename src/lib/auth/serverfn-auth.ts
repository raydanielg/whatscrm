/**
 * Client-side server-function auth middleware.
 *
 * Supersedes the generated `attachSupabaseAuth` (kept out of `start.ts` on
 * purpose) because that one only reads the cached session. Two production
 * failures came from that:
 *
 *   1. A session whose access token expired seconds ago is still returned by
 *      `getSession()`, so the RPC went out with a stale bearer and the edge
 *      auth gate answered "This endpoint requires a valid Bearer token".
 *   2. When no token is attached at all, the thrown error bubbled into the
 *      React error boundary and blanked the whole page instead of sending the
 *      user back to sign-in.
 *
 * This middleware refreshes near-expiry tokens before the call, and converts
 * auth denials into a redirect to /auth.
 */
import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { readActiveOrgId, readActiveWorkspaceId } from "@/lib/tenant/active-tenant";

/** Refresh when the token expires within this window (seconds). */
const REFRESH_SKEW_SECONDS = 60;

async function getFreshAccessToken(): Promise<string | undefined> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return undefined;

  const expiresAt = session.expires_at ?? 0;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (expiresAt && expiresAt - nowSeconds > REFRESH_SKEW_SECONDS) {
    return session.access_token;
  }

  const { data: refreshed } = await supabase.auth.refreshSession();
  return refreshed.session?.access_token ?? session.access_token;
}

const AUTH_DENIAL_PATTERNS = [
  "requires a valid bearer token",
  "unauthorized",
  "invalid token",
  "no authorization header",
  "jwt expired",
];

/** True when a server-function failure means "you are not authenticated". */
export function isAuthDenial(error: unknown): boolean {
  if (error instanceof Response) return error.status === 401;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const normalized = message.toLowerCase();
  return AUTH_DENIAL_PATTERNS.some((p) => normalized.includes(p));
}

function redirectToSignIn(): void {
  if (typeof window === "undefined") return;
  const { pathname, search, hash } = window.location;
  if (pathname.startsWith("/auth")) return;

  // Verify there's truly no session before abandoning the page.
  void supabase.auth.getSession().then(({ data }) => {
    if (data.session) return;
    const next = `${pathname}${search}${hash}`;
    window.location.assign(`/auth?next=${encodeURIComponent(next)}`);
  });
}

export const attachSupabaseAuthFresh = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    let token: string | undefined;
    try {
      token = await getFreshAccessToken();
    } catch {
      token = undefined;
    }

    try {
      const orgId = readActiveOrgId();
      const wsId = readActiveWorkspaceId();
      
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      if (orgId) headers["x-wacrm-org-id"] = orgId;
      if (wsId) headers["x-wacrm-workspace-id"] = wsId;

      return await next({
        headers,
      });
    } catch (error) {
      if (isAuthDenial(error)) {
        // One retry with a forcibly refreshed token before giving up: covers
        // the case where the cached token was revoked or rotated elsewhere.
        let retryToken: string | undefined;
        try {
          const { data } = await supabase.auth.refreshSession();
          retryToken = data.session?.access_token;
        } catch {
          retryToken = undefined;
        }
        if (retryToken && retryToken !== token) {
          const orgId = readActiveOrgId();
          const wsId = readActiveWorkspaceId();
          const retryHeaders: Record<string, string> = { Authorization: `Bearer ${retryToken}` };
          if (orgId) retryHeaders["x-wacrm-org-id"] = orgId;
          if (wsId) retryHeaders["x-wacrm-workspace-id"] = wsId;
          
          return await next({ headers: retryHeaders });
        }
        redirectToSignIn();
      }
      throw error;
    }
  },
);
