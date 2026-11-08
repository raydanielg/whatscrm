import { savedOAuthRedirect } from '@/lib/social/oauth-origin.server';
/**
 * Meta OAuth callback: exchanges the code for a long-lived user token, reads
 * the Pages (and linked Instagram accounts) the user granted, and stores each
 * one as a social channel with an encrypted token.
 *
 * Public route by necessity (Meta redirects here without a session); trust
 * comes from the HMAC-signed `state` produced by startMetaConnect.
 */
import { createFileRoute } from "@tanstack/react-router";
import { decodeState, metaRedirectUri, META_GRAPH } from "@/lib/social/meta-oauth.server";
import { encryptToken } from "@/lib/instagram/token-crypto.server";
import { sbAny } from "@/lib/supabase/untyped";

interface PageRow {
  id: string;
  name: string;
  access_token: string;
  username?: string;
  instagram_business_account?: { id: string; username?: string; profile_picture_url?: string };
}

function back(origin: string, path: string, params: Record<string, string>) {
  const url = new URL(path, origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return Response.redirect(url.toString(), 302);
}

export const Route = createFileRoute("/api/public/social/meta-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const origin = url.origin;
        const stateRaw = url.searchParams.get("state") ?? "";
        const state = decodeState(stateRaw);
        if (!state) return back(origin, "/social", { meta_error: "This connect link expired. Please try again." });

        const err = url.searchParams.get("error_description") || url.searchParams.get("error");
        if (err) return back(origin, state.returnTo, { meta_error: err });

        const code = url.searchParams.get("code");
        if (!code) return back(origin, state.returnTo, { meta_error: "Meta did not return an authorization code." });

        const appId = process.env["META_APP_ID"];
        const appSecret = process.env["META_APP_SECRET"];
        if (!appId || !appSecret) return back(origin, state.returnTo, { meta_error: "Meta app credentials are not configured." });

        try {
          const tokenUrl = new URL(`${META_GRAPH}/oauth/access_token`);
          tokenUrl.searchParams.set("client_id", appId);
          tokenUrl.searchParams.set("client_secret", appSecret);
          tokenUrl.searchParams.set("redirect_uri", savedOAuthRedirect(state.redirectUri, metaRedirectUri(origin)));
          tokenUrl.searchParams.set("code", code);
          const tokenRes = await fetch(tokenUrl.toString());
          const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: { message: string } };
          if (!tokenRes.ok || !tokenJson.access_token) {
            return back(origin, state.returnTo, { meta_error: tokenJson.error?.message ?? "Token exchange failed." });
          }

          // Upgrade to a long-lived (≈60 day) user token before reading pages.
          const llUrl = new URL(`${META_GRAPH}/oauth/access_token`);
          llUrl.searchParams.set("grant_type", "fb_exchange_token");
          llUrl.searchParams.set("client_id", appId);
          llUrl.searchParams.set("client_secret", appSecret);
          llUrl.searchParams.set("fb_exchange_token", tokenJson.access_token);
          const llRes = await fetch(llUrl.toString());
          const llJson = (await llRes.json()) as { access_token?: string; expires_in?: number };
          const userToken = llJson.access_token ?? tokenJson.access_token;

          const pagesUrl = new URL(`${META_GRAPH}/me/accounts`);
          pagesUrl.searchParams.set(
            "fields",
            "id,name,username,access_token,instagram_business_account{id,username,profile_picture_url}",
          );
          pagesUrl.searchParams.set("limit", "100");
          pagesUrl.searchParams.set("access_token", userToken);
          const pagesRes = await fetch(pagesUrl.toString());
          const pagesJson = (await pagesRes.json()) as { data?: PageRow[]; error?: { message: string } };
          if (!pagesRes.ok) {
            return back(origin, state.returnTo, { meta_error: pagesJson.error?.message ?? "Could not read your Pages." });
          }
          const pages = pagesJson.data ?? [];
          if (!pages.length) {
            return back(origin, state.returnTo, {
              meta_error: "No Facebook Pages were granted. Re-run the connect flow and tick at least one Page.",
            });
          }
          if (state.target === "instagram" && !pages.some((p) => p.instagram_business_account?.id)) {
            return back(origin, state.returnTo, {
              meta_error:
                "None of the granted Pages has an Instagram Business account linked. In Instagram, switch to a Business/Creator account and link it to a Facebook Page, then try again.",
            });
          }

          const { supabaseAdmin: _admin } = await import("@/lib/demo/admin-write-guard.server");
          const supabaseAdmin = sbAny(_admin);
          const expiresAt = llJson.expires_in
            ? new Date(Date.now() + llJson.expires_in * 1000).toISOString()
            : null;

          type ChannelUpsert = {
            workspace_id: string;
            platform: string;
            name: string;
            external_id: string;
            username: string | null;
            avatar_url: string | null;
            access_token: string;
            token_expires_at: string | null;
            status: string;
            created_by: string;
          };
          const rows: ChannelUpsert[] = [];
          for (const page of pages) {
            rows.push({
              workspace_id: state.workspaceId,
              platform: "facebook",
              name: page.name,
              external_id: page.id,
              username: page.username ?? null,
              avatar_url: null,
              access_token: encryptToken(page.access_token),
              token_expires_at: null, // Page tokens from a long-lived user token do not expire
              status: "connected",
              created_by: state.userId,
            });
            const ig = page.instagram_business_account;
            if (ig?.id) {
              rows.push({
                workspace_id: state.workspaceId,
                platform: "instagram",
                name: ig.username ? `@${ig.username}` : `${page.name} (Instagram)`,
                external_id: ig.id,
                username: ig.username ?? null,
                avatar_url: ig.profile_picture_url ?? null,
                access_token: encryptToken(page.access_token),
                token_expires_at: expiresAt,
                status: "connected",
                created_by: state.userId,
              });
            }
          }

          let saved = 0;
          for (const row of rows) {
            const { data: existing } = await supabaseAdmin
              .from("social_channels")
              .select("id")
              .eq("workspace_id", row.workspace_id)
              .eq("platform", row.platform)
              .eq("external_id", row.external_id)
              .maybeSingle();
            const { error } = existing?.id
              ? await sbAny(supabaseAdmin).from("social_channels").update(row).eq("id", existing.id)
              : await sbAny(supabaseAdmin).from("social_channels").insert(row);
            if (!error) saved += 1;
          }

          const igSaved = rows.filter((r) => r.platform === "instagram").length;
          return back(origin, state.returnTo, {
            meta_connected: String(saved),
            meta_ig: String(igSaved),
            meta_target: state.target ?? "facebook",
          });
        } catch (e) {
          return back(origin, state.returnTo, {
            meta_error: e instanceof Error ? e.message : "Meta connect failed.",
          });
        }
      },
    },
  },
});
