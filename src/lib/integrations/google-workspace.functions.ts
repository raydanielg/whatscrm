/**
 * Google Workspace Integration — server functions
 *
 * Uses this application's own Google OAuth callback and encrypted refresh tokens.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";
import { z } from "zod";

const workspaceSchema = z.object({ workspaceId: z.string().uuid() });

async function assertMember(client: Parameters<typeof sbAny>[0], userId: string, workspaceId: string) {
  const { data, error } = await sbAny(client).from("workspace_members").select("user_id")
    .eq("user_id", userId).eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Access to this workspace is required");
}

/** Start OAuth popup for Google Workspace. */
export const startGoogleWorkspaceOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) => workspaceSchema.extend({ targetOrigin: z.string().url() }).parse(value))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.workspaceId);
    const origin = new URL(data.targetOrigin);
    if (origin.origin !== data.targetOrigin || (origin.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(origin.hostname)))
      throw new Error("Invalid application origin");
    const canonical = process.env.APP_ORIGIN || new URL((await import("@tanstack/react-start/server")).getRequest().url).origin;
    if (new URL(canonical).origin !== origin.origin)
      throw new Error("Open the application at its configured APP_ORIGIN before connecting Google Workspace.");
    const { randomUUID } = await import("node:crypto");
    const { googleWorkspaceAuthorizationUrl } = await import("./google-oauth.server");
    const state = randomUUID();
    const authorizationUrl = await googleWorkspaceAuthorizationUrl(origin.origin, state);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { error } = await sbAny(supabaseAdmin).from("integration_oauth_states").insert({
      state, provider_id: "google-workspace", workspace_id: data.workspaceId,
      user_id: context.userId, return_origin: origin.origin,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    if (error) throw new Error(error.message);
    return { authorizationUrl };
  });

export const setGoogleWorkspaceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) => workspaceSchema.extend({ status: z.enum(["active", "disabled"]) }).parse(value))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.workspaceId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: row, error } = await sbAny(supabaseAdmin).from("installed_integrations")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("workspace_id", data.workspaceId).eq("user_id", context.userId).eq("provider_id", "google-workspace")
      .select("id").single();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Google Workspace connection not found");
    return { ok: true };
  });

/** Disconnect Google Workspace for this user. */
export const disconnectGoogleWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) => workspaceSchema.parse(value))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.workspaceId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const db = sbAny(supabaseAdmin);
    const { data: row, error } = await db.from("installed_integrations").select("id,connection_key_cipher")
      .eq("workspace_id", data.workspaceId).eq("user_id", context.userId).eq("provider_id", "google-workspace").maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { ok: true };
    const { decryptConnectionKey } = await import("@/lib/booking/providers/crypto.server");
    const refreshToken = decryptConnectionKey(row.connection_key_cipher);
    const revoke = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }),
    });
    if (!revoke.ok && revoke.status !== 400) throw new Error(`Google revocation failed (${revoke.status})`);
    const deleted = await db.from("installed_integrations").delete().eq("id", row.id);
    if (deleted.error) throw new Error(deleted.error.message);
    return { ok: true };
  });

export const listGoogleWorkspaceConnections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth]).validator((value: unknown) => workspaceSchema.parse(value))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, context.userId, data.workspaceId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: rows, error } = await sbAny(supabaseAdmin).from("installed_integrations")
      .select("id,provider_id,account_email,status,connected_at,updated_at")
      .eq("workspace_id", data.workspaceId).eq("user_id", context.userId).eq("provider_id", "google-workspace");
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{ id: string; provider_id: string; account_email: string; status: "active" | "disabled" | "needs_reconnect" | "error"; connected_at: string; updated_at: string }>;
  });
