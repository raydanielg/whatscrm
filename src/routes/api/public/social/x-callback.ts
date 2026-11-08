import { savedOAuthRedirect } from '@/lib/social/oauth-origin.server';
/**
 * X (Twitter) OAuth 2.0 PKCE callback. Exchanges the code for an access token,
 * reads the authenticated account, and stores it as a social channel.
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

export const Route = createFileRoute("/api/public/social/x-callback")({
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
        if (!code || !state.verifier)
          return back(origin, state.returnTo, { social_error: "X did not return an authorization code." });

        try {
          const creds = mod.oauthCreds("x");
          const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
          const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: `Basic ${basic}`,
            },
            body: new URLSearchParams({
              grant_type: "authorization_code",
              code,
              redirect_uri: savedOAuthRedirect(state.redirectUri, mod.callbackUri(origin, "x")),
              code_verifier: state.verifier,
            }),
          });
          const tokenJson = (await tokenRes.json()) as {
            access_token?: string;
            refresh_token?: string;
            expires_in?: number;
            error_description?: string;
            error?: string;
          };
          if (!tokenRes.ok || !tokenJson.access_token) {
            return back(origin, state.returnTo, {
              social_error: tokenJson.error_description ?? tokenJson.error ?? "X token exchange failed.",
            });
          }

          const meRes = await fetch("https://api.twitter.com/2/users/me?user.fields=username,profile_image_url", {
            headers: { Authorization: `Bearer ${tokenJson.access_token}` },
          });
          const meJson = (await meRes.json()) as {
            data?: { id: string; name?: string; username?: string; profile_image_url?: string };
            detail?: string;
          };
          const me = meJson.data;
          if (!me?.id) return back(origin, state.returnTo, { social_error: meJson.detail ?? "Could not read your X account." });

          const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
          const db = sbAny(supabaseAdmin);
          const row = {
            workspace_id: state.workspaceId,
            platform: "x",
            name: me.name ?? (me.username ? `@${me.username}` : "X account"),
            external_id: me.id,
            username: me.username ?? null,
            avatar_url: me.profile_image_url ?? null,
            access_token: encryptToken(tokenJson.access_token),
            token_expires_at: tokenJson.expires_in
              ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString()
              : null,
            status: "connected",
            created_by: state.userId,
          };
          const { data: existing } = await db
            .from("social_channels")
            .select("id")
            .eq("workspace_id", state.workspaceId)
            .eq("platform", "x")
            .eq("external_id", me.id)
            .maybeSingle();
          const { error } = existing?.id
            ? await sbAny(db).from("social_channels").update(row).eq("id", existing.id)
            : await sbAny(db).from("social_channels").insert(row);
          if (error) return back(origin, state.returnTo, { social_error: error.message });

          return back(origin, state.returnTo, { social_connected: "1", social_platform: "X" });
        } catch (e) {
          return back(origin, state.returnTo, {
            social_error: e instanceof Error ? e.message : "X connect failed.",
          });
        }
      },
    },
  },
});
