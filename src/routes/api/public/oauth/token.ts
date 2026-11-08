/**
 * OAuth 2.0 Token Endpoint (RFC 6749 §3.2).
 *
 * Grants:
 *  - authorization_code (single-use, PKCE-aware)
 *  - refresh_token (rotating; old token revoked; scope-narrow allowed)
 *  - client_credentials (confidential clients only)
 *
 * Client auth via HTTP Basic or body (client_secret_post). Public clients
 * authenticate via PKCE only.
 */
import { createFileRoute } from "@tanstack/react-router";

const noStore = {
  "content-type": "application/json",
  "cache-control": "no-store",
  pragma: "no-cache",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: noStore });
}

export const Route = createFileRoute("/api/public/oauth/token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ct = request.headers.get("content-type") ?? "";
        if (!ct.includes("application/x-www-form-urlencoded"))
          return json(400, { error: "invalid_request", error_description: "content-type must be application/x-www-form-urlencoded" });

        const body = new URLSearchParams(await request.text());
        const grant = body.get("grant_type") ?? "";

        const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
        const oauth = await import("@/lib/oauth/oauth.server");

        const auth = await oauth.authenticateClient(supabaseAdmin, request, body);
        if (!auth) return json(401, { error: "invalid_client" });
        const { client, authed, publicOk } = auth;

        if (!(client.allowed_grant_types as string[]).includes(grant))
          return json(400, { error: "unauthorized_client" });

        // --- authorization_code ---
        if (grant === "authorization_code") {
          const code = body.get("code") ?? "";
          const redirectUri = body.get("redirect_uri") ?? "";
          const verifier = body.get("code_verifier") ?? "";
          if (!code || !redirectUri) return json(400, { error: "invalid_request" });

          // Confidential clients must present secret. Public clients OK via PKCE.
          if (client.client_type === "confidential" && !authed)
            return json(401, { error: "invalid_client" });
          if (client.client_type === "public" && !publicOk)
            return json(401, { error: "invalid_client" });

          const codeHash = await oauth.sha256Hex(code);
          const { data: row } = await supabaseAdmin
            .from("oauth_authorization_codes")
            .select("*")
            .eq("code_hash", codeHash)
            .maybeSingle();
          if (!row) return json(400, { error: "invalid_grant" });
          if (row.consumed_at) {
            // Reuse detected — revoke any tokens minted from this code lineage.
            await supabaseAdmin
              .from("oauth_access_tokens")
              .update({ revoked_at: new Date().toISOString() })
              .eq("client_id", row.client_id)
              .eq("user_id", row.user_id)
              .is("revoked_at", null);
            return json(400, { error: "invalid_grant", error_description: "code already used" });
          }
          if (new Date(row.expires_at).getTime() < Date.now())
            return json(400, { error: "invalid_grant", error_description: "code expired" });
          if (row.client_id !== client.id) return json(400, { error: "invalid_grant" });
          if (row.redirect_uri !== redirectUri) return json(400, { error: "invalid_grant" });

          if (row.code_challenge) {
            const ok = await oauth.verifyPKCE(verifier, row.code_challenge, row.code_challenge_method);
            if (!ok) return json(400, { error: "invalid_grant", error_description: "PKCE failed" });
          } else if (client.require_pkce) {
            return json(400, { error: "invalid_grant" });
          }

          // Consume code.
          await supabaseAdmin
            .from("oauth_authorization_codes")
            .update({ consumed_at: new Date().toISOString() })
            .eq("code_hash", codeHash);

          const tokens = await oauth.mintTokenPair(supabaseAdmin, {
            clientId: client.id,
            userId: row.user_id,
            organizationId: row.organization_id,
            scopes: row.scopes as string[],
            withRefresh: (client.allowed_grant_types as string[]).includes("refresh_token"),
          });
          return json(200, tokens);
        }

        // --- refresh_token ---
        if (grant === "refresh_token") {
          if (client.client_type === "confidential" && !authed)
            return json(401, { error: "invalid_client" });
          const rt = body.get("refresh_token") ?? "";
          if (!rt) return json(400, { error: "invalid_request" });
          const hash = await oauth.sha256Hex(rt);
          const { data: row } = await supabaseAdmin
            .from("oauth_refresh_tokens")
            .select("*")
            .eq("token_hash", hash)
            .maybeSingle();
          if (!row) return json(400, { error: "invalid_grant" });
          if (row.revoked_at) {
            // Reuse of a revoked refresh token — revoke the whole chain.
            await supabaseAdmin
              .from("oauth_refresh_tokens")
              .update({ revoked_at: new Date().toISOString() })
              .eq("client_id", row.client_id)
              .eq("user_id", row.user_id)
              .is("revoked_at", null);
            return json(400, { error: "invalid_grant", error_description: "refresh token revoked" });
          }
          if (new Date(row.expires_at).getTime() < Date.now())
            return json(400, { error: "invalid_grant" });
          if (row.client_id !== client.id) return json(400, { error: "invalid_grant" });

          const requestedScope = body.get("scope");
          let scopes = row.scopes as string[];
          if (requestedScope) {
            const req = requestedScope.split(/\s+/).filter(Boolean);
            if (req.some((s) => !scopes.includes(s)))
              return json(400, { error: "invalid_scope" });
            scopes = req;
          }

          // Rotate.
          const now = new Date().toISOString();
          const tokens = await oauth.mintTokenPair(supabaseAdmin, {
            clientId: client.id,
            userId: row.user_id,
            organizationId: row.organization_id,
            scopes,
            withRefresh: true,
          });
          const newHash = await oauth.sha256Hex(tokens.refresh_token!);
          const { data: newRt } = await supabaseAdmin
            .from("oauth_refresh_tokens")
            .select("id")
            .eq("token_hash", newHash)
            .maybeSingle();
          await supabaseAdmin
            .from("oauth_refresh_tokens")
            .update({ revoked_at: now, replaced_by: newRt?.id ?? null })
            .eq("id", row.id);
          return json(200, tokens);
        }

        // --- client_credentials ---
        if (grant === "client_credentials") {
          if (client.client_type !== "confidential" || !authed)
            return json(401, { error: "invalid_client" });
          const requestedScope = body.get("scope") ?? "";
          const scopes = requestedScope
            ? requestedScope.split(/\s+/).filter(Boolean)
            : (client.allowed_scopes as string[]);
          if (scopes.some((s) => !(client.allowed_scopes as string[]).includes(s)))
            return json(400, { error: "invalid_scope" });
          const tokens = await oauth.mintTokenPair(supabaseAdmin, {
            clientId: client.id,
            userId: null,
            organizationId: client.organization_id,
            scopes,
            withRefresh: false,
          });
          return json(200, tokens);
        }

        return json(400, { error: "unsupported_grant_type" });
      },
    },
  },
});
