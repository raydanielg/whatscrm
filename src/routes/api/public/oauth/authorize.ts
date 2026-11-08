/**
 * OAuth 2.0 Authorization Endpoint (RFC 6749 §3.1).
 *
 * Validates required params + client + redirect_uri, then 302 redirects to
 * the app's consent screen at /oauth/consent (auth-gated). If the user is
 * not signed in, the _authenticated gate sends them to /auth first and
 * returns to /oauth/consent afterward.
 *
 * Invalid client/redirect_uri return a JSON error (per RFC we must NOT
 * redirect to an unverified URI). Other errors redirect back to redirect_uri
 * with ?error=... so the RP can handle them.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/oauth/authorize")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const p = url.searchParams;
        const clientId = p.get("client_id") ?? "";
        const redirectUri = p.get("redirect_uri") ?? "";
        const responseType = p.get("response_type") ?? "";
        const scope = p.get("scope") ?? "openid profile email";
        const state = p.get("state") ?? "";
        const codeChallenge = p.get("code_challenge") ?? "";
        const codeChallengeMethod = p.get("code_challenge_method") ?? "";
        const nonce = p.get("nonce") ?? "";

        if (!clientId || !redirectUri) {
          return Response.json(
            { error: "invalid_request", error_description: "client_id and redirect_uri required" },
            { status: 400 },
          );
        }

        const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
        const { data: client } = await supabaseAdmin
          .from("oauth_clients")
          .select("id, client_id, redirect_uris, allowed_grant_types, revoked_at, require_pkce")
          .eq("client_id", clientId)
          .maybeSingle();

        if (!client || client.revoked_at)
          return Response.json({ error: "invalid_client" }, { status: 400 });
        if (!(client.redirect_uris as string[]).includes(redirectUri))
          return Response.json({ error: "invalid_redirect_uri" }, { status: 400 });

        // From here we may safely redirect errors back to the RP.
        const redirectErr = (error: string, description?: string) => {
          const u = new URL(redirectUri);
          u.searchParams.set("error", error);
          if (description) u.searchParams.set("error_description", description);
          if (state) u.searchParams.set("state", state);
          return Response.redirect(u.toString(), 302);
        };

        if (responseType !== "code")
          return redirectErr("unsupported_response_type");
        if (!(client.allowed_grant_types as string[]).includes("authorization_code"))
          return redirectErr("unauthorized_client");
        if (client.require_pkce && !codeChallenge)
          return redirectErr("invalid_request", "PKCE required");

        // Forward to consent (auth-gated). Preserve all params.
        const consent = new URL("/oauth/consent", url.origin);
        consent.searchParams.set("client_id", clientId);
        consent.searchParams.set("redirect_uri", redirectUri);
        consent.searchParams.set("response_type", "code");
        consent.searchParams.set("scope", scope);
        if (state) consent.searchParams.set("state", state);
        if (codeChallenge) consent.searchParams.set("code_challenge", codeChallenge);
        if (codeChallengeMethod)
          consent.searchParams.set("code_challenge_method", codeChallengeMethod);
        if (nonce) consent.searchParams.set("nonce", nonce);
        return Response.redirect(consent.toString(), 302);
      },
    },
  },
});
