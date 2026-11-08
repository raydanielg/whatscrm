import { savedOAuthRedirect } from '@/lib/social/oauth-origin.server';
/**
 * LinkedIn OAuth 2.0 / OpenID Connect callback.
 *
 * Exchanges the code for an access token, reads the authenticated member's
 * identity from the OIDC userinfo endpoint (sub/name/picture), and stores it
 * as a social channel. Mirrors tiktok-callback.ts: state validation, code
 * exchange, identity fetch, encrypt-then-store, upsert by
 * workspace_id+platform+external_id.
 *
 * Public by necessity; trust comes from the HMAC-signed `state`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { encryptToken } from "@/lib/instagram/token-crypto.server";
import { sbAny } from "@/lib/supabase/untyped";
import type { LinkedInTokenResponse, LinkedInUserInfoResponse } from "@/lib/social/oauth.server";

function back(origin: string, path: string, params: Record<string, string>) {
  const url = new URL(path, origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return Response.redirect(url.toString(), 302);
}

export const Route = createFileRoute("/api/public/social/linkedin-callback")({
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
          return back(origin, state.returnTo, { social_error: "LinkedIn did not return an authorization code." });

        try {
          const creds = mod.oauthCreds("linkedin");
          const redirectUri = savedOAuthRedirect(state.redirectUri, mod.callbackUri(origin, "linkedin"));
          const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Accept: "application/json",
            },
            body: mod.linkedinTokenExchangeBody({
              clientId: creds.clientId,
              clientSecret: creds.clientSecret,
              code,
              redirectUri,
            }),
          });
          const tokenJson = (await tokenRes.json()) as LinkedInTokenResponse;

          const meRes = tokenJson.access_token
            ? await fetch("https://api.linkedin.com/v2/userinfo", {
                headers: { Authorization: `Bearer ${tokenJson.access_token}` },
              })
            : null;
          const meJson = (meRes ? await meRes.json() : {}) as LinkedInUserInfoResponse;

          const outcome = mod.resolveLinkedInConnect({
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
            .eq("platform", "linkedin")
            .eq("external_id", outcome.row.external_id)
            .maybeSingle();
          const { error } = existing?.id
            ? await sbAny(db).from("social_channels").update(row).eq("id", existing.id)
            : await sbAny(db).from("social_channels").insert(row);
          if (error) return back(origin, state.returnTo, { social_error: error.message });

          return back(origin, state.returnTo, outcome.redirectParams);
        } catch (e) {
          return back(origin, state.returnTo, {
            social_error: e instanceof Error ? e.message : "LinkedIn connect failed.",
          });
        }
      },
    },
  },
});
