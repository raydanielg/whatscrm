import { savedOAuthRedirect } from "@/lib/social/oauth-origin.server";
/**
 * YouTube (Google OAuth 2.0) callback.
 *
 * Requested with access_type=offline, so Google returns a refresh token next
 * to the ~1h access token. Both are stored encrypted on the social channel and
 * freshGoogleAccessToken renews the access token on use: the channel stays
 * connected until the owner revokes access.
 *
 * Public by necessity; trust comes from the HMAC-signed `state`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { encryptToken } from "@/lib/instagram/token-crypto.server";
import { sbAny } from "@/lib/supabase/untyped";

function back(origin: string, path: string, params: Record<string, string>) {
  const url = new URL(path, origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return Response.redirect(url.toString(), 302);
}

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

export const Route = createFileRoute("/api/public/social/youtube-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;
        const mod = await import("@/lib/social/oauth.server");
        const state = mod.decodeState(url.searchParams.get("state") ?? "");
        if (!state) return back(origin, "/social", { social_error: "This connect link expired. Please try again." });

        const err = url.searchParams.get("error_description") || url.searchParams.get("error");
        if (err) return back(origin, state.returnTo, { social_error: err });
        const code = url.searchParams.get("code");
        if (!code) return back(origin, state.returnTo, { social_error: "Google did not return an authorization code." });

        try {
          const creds = mod.oauthCreds("youtube");
          const redirectUri = savedOAuthRedirect(state.redirectUri, mod.callbackUri(origin, "youtube"));
          const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              code,
              client_id: creds.clientId,
              client_secret: creds.clientSecret,
              redirect_uri: redirectUri,
              grant_type: "authorization_code",
            }),
          });
          const token = (await tokenRes.json()) as GoogleTokenResponse;
          if (!tokenRes.ok || !token.access_token) {
            return back(origin, state.returnTo, {
              social_error: token.error_description ?? token.error ?? "Google token exchange failed.",
            });
          }

          const meRes = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
            headers: { Authorization: `Bearer ${token.access_token}` },
          });
          const me = (await meRes.json()) as {
            items?: Array<{
              id?: string;
              snippet?: { title?: string; customUrl?: string; thumbnails?: { default?: { url?: string } } };
            }>;
          };
          const channel = me.items?.[0];
          if (!channel?.id) {
            return back(origin, state.returnTo, {
              social_error: "This Google account has no YouTube channel. Create one or pick another account.",
            });
          }

          const granted = (token.scope ?? "").split(/\s+/).filter(Boolean);
          const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
          const db = sbAny(supabaseAdmin);
          const { data: existing } = await db
            .from("social_channels")
            .select("id")
            .eq("workspace_id", state.workspaceId)
            .eq("platform", "youtube")
            .eq("external_id", channel.id)
            .maybeSingle();
          const row: Record<string, unknown> = {
            workspace_id: state.workspaceId,
            platform: "youtube",
            name: channel.snippet?.title ?? "YouTube channel",
            external_id: channel.id,
            username: channel.snippet?.customUrl?.replace(/^@/, "") ?? null,
            avatar_url: channel.snippet?.thumbnails?.default?.url ?? null,
            access_token: encryptToken(token.access_token),
            token_expires_at: new Date(Date.now() + (token.expires_in ?? 3600) * 1000).toISOString(),
            token_refresh_error: null,
            status: "connected",
            metadata: {
              granted_scopes: granted,
              can_publish: granted.some((s) => s.endsWith("/youtube.force-ssl") || s.endsWith("/youtube.upload")),
              auto_refresh: !!token.refresh_token,
            },
          };
          // Google sends a refresh token on consent; keep the stored one if it is absent.
          if (token.refresh_token) row.refresh_token = encryptToken(token.refresh_token);
          if (!existing?.id) row.created_by = state.userId;
          const { error } = existing?.id
            ? await db.from("social_channels").update(row).eq("id", existing.id)
            : await db.from("social_channels").insert(row);
          if (error) return back(origin, state.returnTo, { social_error: error.message });

          const params: Record<string, string> = { social_connected: "1", social_platform: "YouTube" };
          if (!token.refresh_token && !existing?.id) {
            params.social_warning =
              "Connected, but Google did not return a refresh token, so the connection will expire in about an hour. Remove WACRM from your Google account permissions and connect again.";
          }
          return back(origin, state.returnTo, params);
        } catch (e) {
          return back(origin, state.returnTo, {
            social_error: e instanceof Error ? e.message : "YouTube connect failed.",
          });
        }
      },
    },
  },
});
