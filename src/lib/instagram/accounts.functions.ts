/**
 * Instagram (Meta) OAuth + account management server functions.
 *
 * Flow:
 *   1. `startInstagramOAuth` creates a signed CSRF `state`, stores it, and
 *      returns Meta's Facebook Login dialog URL. The client redirects there.
 *   2. Meta redirects back to /api/public/instagram/callback with `code` +
 *      `state`. That route exchanges the code, discovers the IG business
 *      account attached to the user's Facebook Pages, and inserts an
 *      `instagram_accounts` row.
 *   3. `listInstagramAccounts` / `disconnectInstagramAccount` power the UI.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

const META_OAUTH_BASE = "https://www.facebook.com/v21.0/dialog/oauth";
const META_SCOPES = [
  "instagram_basic",
  "instagram_manage_messages",
  "pages_show_list",
  "pages_manage_metadata",
  "pages_read_engagement",
  "business_management",
];

function requireAppId(): string {
  const id = process.env.META_APP_ID;
  if (!id) throw new Error("META_APP_ID not configured. Add it in project secrets to enable Instagram linking.");
  return id;
}

export const startInstagramOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { workspaceId: string; origin: string; returnTo?: string }) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        origin: z.string().url(),
        returnTo: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const appId = requireAppId();
    const { randomBytes } = await import("node:crypto");
    const state = randomBytes(24).toString("base64url");
    const redirectUri = `${data.origin.replace(/\/$/, "")}/api/public/instagram/callback`;

    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { error } = await sbAny(supabaseAdmin).from("instagram_oauth_states").insert({
      state,
      workspace_id: data.workspaceId,
      user_id: context.userId,
      redirect_uri: redirectUri,
      return_to: data.returnTo ?? "/api-config/instagram",
    });
    if (error) throw new Error(error.message);

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      state,
      scope: META_SCOPES.join(","),
      response_type: "code",
      display: "popup",
    });
    return { url: `${META_OAUTH_BASE}?${params.toString()}` };
  });

export const listInstagramAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { workspaceId: string }) =>
    z.object({ workspaceId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("instagram_accounts")
      .select(
        "id, ig_user_id, username, name, profile_picture_url, page_id, page_name, status, status_reason, scopes, connected_at, last_verified_at, token_expires_at",
      )
      .eq("workspace_id", data.workspaceId)
      .order("connected_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Audit mass secret view (Instagram access tokens are hidden behind column-level security
    // but listing them still indicates access to the account management layer)
    if (rows && rows.length > 0) {
      const { recordServerAuditEvent } = await import("@/lib/security/audit.server");
      void recordServerAuditEvent({
        eventType: "secrets.list",
        severity: "warning",
        workspaceId: data.workspaceId,
        actorId: context.userId,
        resourceType: "instagram_account",
        data: { count: rows.length },
      });
    }

    return { accounts: rows ?? [], configured: Boolean(process.env.META_APP_ID) };
  });

/**
 * Re-arm the Page webhook subscription for a linked account.
 *
 * `meta-health.functions.ts` already reports an unsubscribed Page as an error
 * and tells the operator to reconnect; until now no Instagram code path
 * actually performed the subscribe, so that remedy could not work.
 */
export const reconnectInstagramAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { accountId: string }) =>
    z.object({ accountId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // RLS confirms the caller may act on this workspace's account.
    const { data: acc, error } = await context.supabase
      .from("instagram_accounts")
      .select("id, page_id, workspace_id")
      .eq("id", data.accountId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!acc) throw new Error("Instagram account not found in this workspace");

    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: tokenRow } = await sbAny(supabaseAdmin)
      .from("instagram_accounts")
      .select("access_token_ciphertext")
      .eq("id", data.accountId)
      .maybeSingle();

    const { ensureIgPageSubscription } = await import("./capabilities.server");
    const res = await ensureIgPageSubscription(
      acc.page_id,
      (tokenRow as { access_token_ciphertext?: string | null } | null)?.access_token_ciphertext ?? null,
    );

    // Only a working subscription may be called connected — an account that
    // cannot receive DMs must not read as healthy.
    await context.supabase
      .from("instagram_accounts")
      .update({
        status: res.ok ? "connected" : "error",
        status_reason: res.ok ? null : `Webhook subscription failed: ${res.error}`,
        last_verified_at: new Date().toISOString(),
      })
      .eq("id", data.accountId);

    if (!res.ok) throw new Error(res.error ?? "Meta rejected the webhook subscription");
    return { ok: true as const, fields: res.fields };
  });

export const disconnectInstagramAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { accountId: string }) =>
    z.object({ accountId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("instagram_accounts")
      .update({ status: "disconnected", status_reason: "Disconnected by user" })
      .eq("id", data.accountId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteInstagramAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { accountId: string }) =>
    z.object({ accountId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("instagram_accounts")
      .delete()
      .eq("id", data.accountId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
