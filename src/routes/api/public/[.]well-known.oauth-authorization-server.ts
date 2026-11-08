/**
 * RFC 8414 discovery document for WACRM's OAuth 2.0 server.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/.well-known/oauth-authorization-server")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        return Response.json({
          issuer: origin,
          authorization_endpoint: `${origin}/api/public/oauth/authorize`,
          token_endpoint: `${origin}/api/public/oauth/token`,
          revocation_endpoint: `${origin}/api/public/oauth/revoke`,
          introspection_endpoint: `${origin}/api/public/oauth/introspect`,
          userinfo_endpoint: `${origin}/api/public/oauth/userinfo`,
          response_types_supported: ["code"],
          grant_types_supported: [
            "authorization_code",
            "refresh_token",
            "client_credentials",
          ],
          token_endpoint_auth_methods_supported: [
            "client_secret_basic",
            "client_secret_post",
            "none",
          ],
          code_challenge_methods_supported: ["S256", "plain"],
          scopes_supported: [
            "openid",
            "profile",
            "email",
            "contacts:read",
            "contacts:write",
            "conversations:read",
            "conversations:write",
            "messages:read",
            "messages:write",
            "deals:read",
            "deals:write",
            "offline_access",
          ],
        });
      },
    },
  },
});
