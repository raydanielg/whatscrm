/**
 * Starts the X (Twitter) or Threads login flow so Connect channel can store
 * the provider's own token instead of the user pasting one.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";
import { getRequest } from "@tanstack/react-start/server";
import { oauthOrigin, safeOAuthReturnTo } from "./oauth-origin.server";

const input = z.object({
  platform: z.enum(["x", "threads", "tiktok", "linkedin", "youtube"]),
  workspaceId: z.string().uuid(),
  origin: z.string().url(),
  returnTo: z.string().startsWith("/").max(200).optional(),
});

export const startSocialConnect = createServerFn({ method: "POST" })
  .validator((v: unknown) => input.parse(v))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await sbAny(context.supabase).rpc("is_workspace_admin" as never, {
      _workspace_id: data.workspaceId,
      _user_id: context.userId,
    } as never);
    if (!isAdmin) throw new Error("Only workspace owners and admins can connect channels");

    const mod = await import("./oauth.server");
    const creds = mod.oauthCreds(data.platform);
    const redirectUri = mod.callbackUri(oauthOrigin(data.origin, new URL(getRequest().url).origin), data.platform);
    const base = {
      platform: data.platform,
      workspaceId: data.workspaceId,
      userId: context.userId,
      returnTo: safeOAuthReturnTo(data.returnTo),
      redirectUri,
      exp: Date.now() + 10 * 60 * 1000,
    };

    if (data.platform === "x") {
      const { verifier, challenge } = mod.pkce();
      const state = mod.encodeState({ ...base, verifier });
      const url = new URL("https://twitter.com/i/oauth2/authorize");
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", creds.clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("scope", mod.X_SCOPES.join(" "));
      url.searchParams.set("state", state);
      url.searchParams.set("code_challenge", challenge);
      url.searchParams.set("code_challenge_method", "S256");
      return { url: url.toString(), redirectUri };
    }

    if (data.platform === "tiktok") {
      const state = mod.encodeState(base);
      const url = mod.buildTikTokAuthorizeUrl({
        clientKey: creds.clientId,
        redirectUri,
        state,
        scopes: mod.TIKTOK_SCOPES,
      });
      return { url, redirectUri };
    }

    if (data.platform === "youtube") {
      // access_type=offline + prompt=consent: Google returns a refresh token,
      // so the connection renews itself instead of dying after an hour.
      const state = mod.encodeState(base);
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.searchParams.set("client_id", creds.clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", mod.YOUTUBE_SCOPES.join(" "));
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");
      url.searchParams.set("include_granted_scopes", "true");
      url.searchParams.set("state", state);
      return { url: url.toString(), redirectUri };
    }

    if (data.platform === "linkedin") {
      const state = mod.encodeState(base);
      const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", creds.clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("scope", mod.LINKEDIN_SCOPES.join(" "));
      url.searchParams.set("state", state);
      return { url: url.toString(), redirectUri };
    }

    const state = mod.encodeState(base);
    const url = new URL("https://threads.net/oauth/authorize");
    url.searchParams.set("client_id", creds.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", mod.THREADS_SCOPES.join(","));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    return { url: url.toString(), redirectUri };
  });
