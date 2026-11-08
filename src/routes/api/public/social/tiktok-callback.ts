import { savedOAuthRedirect } from '@/lib/social/oauth-origin.server';
/**
 * TikTok OAuth 2.0 callback (Login Kit + Content Posting API).
 *
 * Exchanges the code for an access + refresh token, reads the authenticated
 * account's open_id/display_name/avatar, and stores it as a social channel.
 * Granted scopes are recorded rather than assumed equal to what was
 * requested — video.publish can be withheld even after a successful login,
 * and publishing must fail with a clear message rather than a broken video
 * publish call the first time the channel is used.
 *
 * Public by necessity; trust comes from the HMAC-signed `state`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { encryptToken } from "@/lib/instagram/token-crypto.server";
import { sbAny } from "@/lib/supabase/untyped";
import type { TikTokTokenResponse, TikTokUserInfoResponse } from "@/lib/social/oauth.server";

function back(origin: string, path: string, params: Record<string, string>) {
  const url = new URL(path, origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return Response.redirect(url.toString(), 302);
}

export const Route = createFileRoute("/api/public/social/tiktok-callback")({
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
        if (!code)
          return back(origin, state.returnTo, { social_error: "TikTok did not return an authorization code." });

        try {
          const creds = mod.oauthCreds("tiktok");
          const redirectUri = savedOAuthRedirect(state.redirectUri, mod.callbackUri(origin, "tiktok"));
          const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Accept: "application/json",
            },
            body: mod.tiktokTokenExchangeBody({
              clientKey: creds.clientId,
              clientSecret: creds.clientSecret,
              code,
              redirectUri,
            }),
          });
          const tokenJson = (await tokenRes.json()) as TikTokTokenResponse;

          const meRes = tokenJson.access_token
            ? await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url", {
                headers: { Authorization: `Bearer ${tokenJson.access_token}` },
              })
            : null;
          const meJson = (meRes ? await meRes.json() : {}) as TikTokUserInfoResponse;

          const outcome = mod.resolveTikTokConnect({
            state,
            tokenOk: tokenRes.ok,
            token: tokenJson,
            userInfo: meJson,
          });
          if (!outcome.ok) return back(origin, state.returnTo, outcome.redirectParams);

          const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
          const db = sbAny(supabaseAdmin);
          const { access_token_plain, refresh_token_plain, ...rest } = outcome.row;
          const row = {
            ...rest,
            access_token: encryptToken(access_token_plain),
            refresh_token: refresh_token_plain ? encryptToken(refresh_token_plain) : null,
          };
          const { data: existing } = await db
            .from("social_channels")
            .select("id")
            .eq("workspace_id", state.workspaceId)
            .eq("platform", "tiktok")
            .eq("external_id", outcome.row.external_id)
            .maybeSingle();
          const { error } = existing?.id
            ? await sbAny(db).from("social_channels").update(row).eq("id", existing.id)
            : await sbAny(db).from("social_channels").insert(row);
          if (error) return back(origin, state.returnTo, { social_error: error.message });

          return back(origin, state.returnTo, outcome.redirectParams);
        } catch (e) {
          return back(origin, state.returnTo, {
            social_error: e instanceof Error ? e.message : "TikTok connect failed.",
          });
        }
      },
    },
  },
});
