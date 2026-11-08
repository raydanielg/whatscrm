/**
 * TikTok API for Business OAuth callback (Business Messaging).
 *
 * Exchanges the auth code for a business token, reads the account profile and
 * stores it in `tiktok_business_accounts`. Public by necessity; trust comes
 * from the HMAC-signed `state` created while the admin was signed in.
 */
import { createFileRoute } from "@tanstack/react-router";
import { savedOAuthRedirect } from "@/lib/social/oauth-origin.server";
import { sbAny } from "@/lib/supabase/untyped";

function back(origin: string, path: string, params: Record<string, string>) {
  const url = new URL(path, origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return Response.redirect(url.toString(), 302);
}

export const Route = createFileRoute("/api/public/tiktok-dm/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;
        const { decodeState } = await import("@/lib/social/oauth.server");
        const state = decodeState(url.searchParams.get("state") ?? "");
        const returnTo = "/api-config/tiktok-dm";
        if (!state) return back(origin, returnTo, { tiktok_error: "This connect link expired. Please try again." });

        const err = url.searchParams.get("error_description") || url.searchParams.get("error");
        if (err) return back(origin, returnTo, { tiktok_error: err });
        const code = url.searchParams.get("code") || url.searchParams.get("auth_code");
        if (!code) return back(origin, returnTo, { tiktok_error: "TikTok did not return an authorization code." });

        try {
          const { tiktokDmCallbackUri } = await import("@/lib/tiktok-dm/protocol");
          const mod = await import("@/lib/tiktok-dm/client.server");
          const redirectUri = savedOAuthRedirect(state.redirectUri, tiktokDmCallbackUri(origin));
          const token = await mod.exchangeTikTokDmCode(code, redirectUri);
          const granted = (token.scope ?? "").split(/[,\s]+/).filter(Boolean);
          const missing = ["message.list.read", "message.list.send"].filter((s) => !granted.includes(s));
          if (granted.length && missing.length) {
            return back(origin, returnTo, {
              tiktok_error: `TikTok did not grant ${missing.join(", ")}. Approve the messaging permissions and connect again.`,
            });
          }

          const profile = await mod
            .fetchTikTokBusinessProfile(token.open_id, token.access_token)
            .catch(() => ({}) as { username?: string; display_name?: string; profile_image?: string });

          const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
          const db = sbAny(supabaseAdmin);
          const row = {
            workspace_id: state.workspaceId,
            business_id: token.open_id,
            username: profile.username ?? null,
            display_name: profile.display_name ?? null,
            avatar_url: profile.profile_image ?? null,
            scope: token.scope ?? null,
            status: "active",
            last_error: null,
            connected_by: state.userId,
            updated_at: new Date().toISOString(),
            ...mod.tokenColumns(token),
          };
          const { error } = await db
            .from("tiktok_business_accounts")
            .upsert(row, { onConflict: "workspace_id,business_id" });
          if (error) return back(origin, returnTo, { tiktok_error: error.message });
          return back(origin, returnTo, { tiktok_connected: profile.username ?? token.open_id });
        } catch (e) {
          return back(origin, returnTo, {
            tiktok_error: e instanceof Error ? e.message : "TikTok connect failed.",
          });
        }
      },
    },
  },
});
