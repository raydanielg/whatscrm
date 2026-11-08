/**
 * OAuth 2.0 Token Revocation (RFC 7009).
 * Accepts an access or refresh token and revokes it. Returns 200 even if
 * the token is unknown/expired (per spec) as long as client auth succeeds.
 */
import { createFileRoute } from "@tanstack/react-router";
import { sbAny } from "@/lib/supabase/untyped";

export const Route = createFileRoute("/api/public/oauth/revoke")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = new URLSearchParams(await request.text());
        const token = body.get("token") ?? "";
        const hint = body.get("token_type_hint") ?? "";
        if (!token) return new Response("", { status: 200 });

        const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
        const oauth = await import("@/lib/oauth/oauth.server");
        const auth = await oauth.authenticateClient(supabaseAdmin, request, body);
        if (!auth) return oauth.oauthError("invalid_client", undefined, 401);
        if (auth.client.client_type === "confidential" && !auth.authed)
          return oauth.oauthError("invalid_client", undefined, 401);

        const hash = await oauth.sha256Hex(token);
        const now = new Date().toISOString();
        const tables =
          hint === "refresh_token"
            ? ["oauth_refresh_tokens", "oauth_access_tokens"]
            : ["oauth_access_tokens", "oauth_refresh_tokens"];
        for (const t of tables) {
          const res = await (sbAny(supabaseAdmin).from(t as any) as any)
            .update({ revoked_at: now })
            .eq("token_hash", hash)
            .eq("client_id", auth.client.id)
            .is("revoked_at", null)
            .select("id");
          if (res.data && res.data.length) break;
        }
        return new Response("", { status: 200 });
      },
    },
  },
});
