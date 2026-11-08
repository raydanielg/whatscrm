/**
 * OAuth 2.0 Token Introspection (RFC 7662).
 * Requires client authentication.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/oauth/introspect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = new URLSearchParams(await request.text());
        const token = body.get("token") ?? "";
        const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
        const oauth = await import("@/lib/oauth/oauth.server");

        const auth = await oauth.authenticateClient(supabaseAdmin, request, body);
        if (!auth || (auth.client.client_type === "confidential" && !auth.authed))
          return oauth.oauthError("invalid_client", undefined, 401);
        if (!token) return Response.json({ active: false });

        const hash = await oauth.sha256Hex(token);
        const { data: at } = await supabaseAdmin
          .from("oauth_access_tokens")
          .select("*")
          .eq("token_hash", hash)
          .maybeSingle();
        const row = at
          ? { row: at, kind: "access" as const }
          : await (async () => {
              const { data: rt } = await supabaseAdmin
                .from("oauth_refresh_tokens")
                .select("*")
                .eq("token_hash", hash)
                .maybeSingle();
              return rt ? { row: rt, kind: "refresh" as const } : null;
            })();
        if (!row) return Response.json({ active: false });
        if (row.row.revoked_at) return Response.json({ active: false });
        if (new Date(row.row.expires_at).getTime() < Date.now())
          return Response.json({ active: false });

        return Response.json({
          active: true,
          scope: (row.row.scopes as string[]).join(" "),
          client_id: auth.client.client_id,
          token_type: row.kind === "access" ? "Bearer" : "refresh_token",
          exp: Math.floor(new Date(row.row.expires_at).getTime() / 1000),
          iat: Math.floor(new Date(row.row.created_at).getTime() / 1000),
          sub: row.row.user_id ?? undefined,
        });
      },
    },
  },
});
