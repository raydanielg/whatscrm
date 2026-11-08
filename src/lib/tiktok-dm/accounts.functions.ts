/**
 * TikTok Business Messaging setup: status, connect (OAuth start), the
 * app-level webhook registration and disconnect. Token columns are never
 * returned to the browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";
import { oauthOrigin } from "@/lib/social/oauth-origin.server";
import { tiktokDmCallbackUri } from "./protocol";

export interface TikTokDmAccountStatus {
  id: string;
  businessId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  status: string;
  lastError: string | null;
  lastEventAt: string | null;
  expiresAt: string | null;
}

export interface TikTokDmSetup {
  appConfigured: boolean;
  missingEnv: string[];
  accounts: TikTokDmAccountStatus[];
}

const ws = z.object({ workspaceId: z.string().uuid() });

async function assertMember(supabase: unknown, workspaceId: string, userId: string) {
  const { data } = await sbAny(supabase)
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (!data) throw new Error("You are not a member of this workspace.");
}

async function assertAdmin(supabase: unknown, workspaceId: string, userId: string) {
  const { data } = await sbAny(supabase).rpc("is_workspace_admin" as never, {
    _workspace_id: workspaceId,
    _user_id: userId,
  } as never);
  if (!data) throw new Error("Only workspace owners and admins can manage TikTok messaging.");
}

export const getTikTokDmSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => ws.parse(v))
  .handler(async ({ data, context }): Promise<TikTokDmSetup> => {
    await assertMember(context.supabase, data.workspaceId, context.userId);
    const { TIKTOK_DM_ENV } = await import("./client.server");
    const missingEnv = TIKTOK_DM_ENV.filter((k) => !process.env[k]?.trim());
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: rows } = await sbAny(supabaseAdmin)
      .from("tiktok_business_accounts")
      .select("id, business_id, username, display_name, avatar_url, status, last_error, last_event_at, expires_at")
      .eq("workspace_id", data.workspaceId)
      .neq("status", "disconnected")
      .order("created_at", { ascending: true });
    const accounts = ((rows ?? []) as Array<Record<string, string | null>>).map((r) => ({
      id: r.id!,
      businessId: r.business_id!,
      username: r.username,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      status: r.status ?? "active",
      lastError: r.last_error,
      lastEventAt: r.last_event_at,
      expiresAt: r.expires_at,
    }));
    return { appConfigured: missingEnv.length === 0, missingEnv: [...missingEnv], accounts };
  });

export const startTikTokDmConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => ws.extend({ origin: z.string().url() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.workspaceId, context.userId);
    const { tiktokDmAppCreds } = await import("./client.server");
    const creds = tiktokDmAppCreds();
    if (!creds) throw new Error("TIKTOK_BUSINESS_APP_ID and TIKTOK_BUSINESS_APP_SECRET are not set on the server.");
    const { encodeState } = await import("@/lib/social/oauth.server");
    const { buildTikTokDmAuthorizeUrl } = await import("./protocol");
    const redirectUri = tiktokDmCallbackUri(oauthOrigin(data.origin, new URL(getRequest().url).origin));
    const state = encodeState({
      platform: "tiktok",
      workspaceId: data.workspaceId,
      userId: context.userId,
      returnTo: "/api-config/tiktok-dm",
      redirectUri,
      exp: Date.now() + 10 * 60 * 1000,
    });
    return { url: buildTikTokDmAuthorizeUrl({ appId: creds.appId, redirectUri, state }), redirectUri };
  });

/** Reads or (with `register`) points the app's DIRECT_MESSAGE webhook at this deployment. */
export const syncTikTokDmWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => ws.extend({ origin: z.string().url(), register: z.boolean() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.workspaceId, context.userId);
    const expected = `${oauthOrigin(data.origin, new URL(getRequest().url).origin)}/api/public/webhooks/tiktok`;
    const mod = await import("./client.server");
    if (data.register) await mod.setTikTokDmWebhook(expected);
    const current = await mod.getTikTokDmWebhook();
    return { expected, current, matches: current === expected };
  });

export const disconnectTikTokDmAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => ws.extend({ accountId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.workspaceId, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { error } = await sbAny(supabaseAdmin)
      .from("tiktok_business_accounts")
      .update({ status: "disconnected", updated_at: new Date().toISOString() })
      .eq("id", data.accountId)
      .eq("workspace_id", data.workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
