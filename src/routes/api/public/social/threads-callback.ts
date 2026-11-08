import { savedOAuthRedirect } from '@/lib/social/oauth-origin.server';
/**
 * Threads OAuth callback. Exchanges the code for a short-lived token, upgrades
 * it to a 60-day long-lived token, and stores the Threads account as a channel.
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

export const Route = createFileRoute("/api/public/social/threads-callback")({
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
        const code = (url.searchParams.get("code") ?? "").replace(/#_$/, "");
        if (!code) return back(origin, state.returnTo, { social_error: "Threads did not return an authorization code." });

        try {
          const creds = mod.oauthCreds("threads");
          const tokenRes = await fetch("https://graph.threads.net/oauth/access_token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: creds.clientId,
              client_secret: creds.clientSecret,
              grant_type: "authorization_code",
              redirect_uri: savedOAuthRedirect(state.redirectUri, mod.callbackUri(origin, "threads")),
              code,
            }),
          });
          const tokenJson = (await tokenRes.json()) as {
            access_token?: string;
            user_id?: string | number;
            error_message?: string;
            error?: { message?: string };
          };
          if (!tokenRes.ok || !tokenJson.access_token) {
            return back(origin, state.returnTo, {
              social_error: tokenJson.error_message ?? tokenJson.error?.message ?? "Threads token exchange failed.",
            });
          }

          // Upgrade to a long-lived (60 day) token.
          const llUrl = new URL("https://graph.threads.net/access_token");
          llUrl.searchParams.set("grant_type", "th_exchange_token");
          llUrl.searchParams.set("client_secret", creds.clientSecret);
          llUrl.searchParams.set("access_token", tokenJson.access_token);
          const llRes = await fetch(llUrl.toString());
          const llJson = (await llRes.json()) as { access_token?: string; expires_in?: number };
          const token = llJson.access_token ?? tokenJson.access_token;

          const meRes = await fetch(
            `https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url&access_token=${encodeURIComponent(token)}`,
          );
          const meJson = (await meRes.json()) as {
            id?: string;
            username?: string;
            threads_profile_picture_url?: string;
            error?: { message?: string };
          };
          const externalId = meJson.id ?? (tokenJson.user_id ? String(tokenJson.user_id) : null);
          if (!externalId)
            return back(origin, state.returnTo, {
              social_error: meJson.error?.message ?? "Could not read your Threads account.",
            });

          const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
          const db = sbAny(supabaseAdmin);
          const row = {
            workspace_id: state.workspaceId,
            platform: "threads",
            name: meJson.username ? `@${meJson.username}` : "Threads account",
            external_id: externalId,
            username: meJson.username ?? null,
            avatar_url: meJson.threads_profile_picture_url ?? null,
            access_token: encryptToken(token),
            token_expires_at: llJson.expires_in
              ? new Date(Date.now() + llJson.expires_in * 1000).toISOString()
              : null,
            status: "connected",
            created_by: state.userId,
          };
          const { data: existing } = await db
            .from("social_channels")
            .select("id")
            .eq("workspace_id", state.workspaceId)
            .eq("platform", "threads")
            .eq("external_id", externalId)
            .maybeSingle();
          const { error } = existing?.id
            ? await sbAny(db).from("social_channels").update(row).eq("id", existing.id)
            : await sbAny(db).from("social_channels").insert(row);
          if (error) return back(origin, state.returnTo, { social_error: error.message });

          return back(origin, state.returnTo, { social_connected: "1", social_platform: "Threads" });
        } catch (e) {
          return back(origin, state.returnTo, {
            social_error: e instanceof Error ? e.message : "Threads connect failed.",
          });
        }
      },
    },
  },
});
