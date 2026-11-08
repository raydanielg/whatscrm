/**
 * OIDC UserInfo Endpoint. Requires a Bearer access token with `openid` scope.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/oauth/userinfo")({
  server: {
    handlers: {
      GET: handler,
      POST: handler,
    },
  },
});

async function handler({ request }: { request: Request }) {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return new Response(JSON.stringify({ error: "invalid_token" }), {
      status: 401,
      headers: { "www-authenticate": 'Bearer error="invalid_token"' },
    });
  }
  const token = auth.slice(7).trim();
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { validateAccessToken } = await import("@/lib/oauth/oauth.server");
  const t = await validateAccessToken(supabaseAdmin, token);
  if (!t || !t.user_id)
    return new Response(JSON.stringify({ error: "invalid_token" }), { status: 401 });
  const scopes = t.scopes as string[];
  if (!scopes.includes("openid"))
    return new Response(JSON.stringify({ error: "insufficient_scope" }), { status: 403 });

  const claims: Record<string, unknown> = { sub: t.user_id };
  if (scopes.includes("email") || scopes.includes("profile")) {
    const { data: p } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, avatar_url, email")
      .eq("id", t.user_id)
      .maybeSingle();
    if (scopes.includes("profile") && p) {
      claims.name = p.display_name;
      claims.picture = p.avatar_url;
    }
    if (scopes.includes("email") && p?.email) {
      claims.email = p.email;
      claims.email_verified = true;
    }
  }
  return Response.json(claims);
}
