/**
 * Starts the Meta login flow that grants Page (and linked Instagram) tokens to
 * the app, so users never paste an access token by hand.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";
import { getRequest } from "@tanstack/react-start/server";
import { oauthOrigin, safeOAuthReturnTo } from "./oauth-origin.server";

const input = z.object({
  workspaceId: z.string().uuid(),
  origin: z.string().url(),
  returnTo: z.string().startsWith("/").max(200).optional(),
  target: z.enum(["facebook", "instagram"]).optional(),
});

export const startMetaConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => input.parse(v))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await sbAny(context.supabase).rpc("is_workspace_admin" as never, {
      _workspace_id: data.workspaceId,
      _user_id: context.userId,
    } as never);
    if (!isAdmin) throw new Error("Only workspace owners and admins can connect channels");

    const appId = process.env["META_APP_ID"];
    if (!appId) throw new Error("Meta login is not configured yet (missing app credentials).");

    const { encodeState, metaRedirectUri, META_SCOPES } = await import("./meta-oauth.server");
    const redirectUri = metaRedirectUri(oauthOrigin(data.origin, new URL(getRequest().url).origin));
    const state = encodeState({
      workspaceId: data.workspaceId,
      userId: context.userId,
      returnTo: safeOAuthReturnTo(data.returnTo),
      redirectUri,
      target: data.target ?? "facebook",
      exp: Date.now() + 10 * 60 * 1000,
    });

    const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", META_SCOPES);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);

    return { url: url.toString(), redirectUri };
  });
