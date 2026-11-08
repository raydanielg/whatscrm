/**
 * Meta channel management: inspect the grant status of each connected Page /
 * Instagram account and revoke a token without anyone pasting tokens around.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

const wsInput = z.object({ workspaceId: z.string().uuid() });
const revokeInput = z.object({ workspaceId: z.string().uuid(), channelId: z.string().uuid() });

export interface MetaGrant {
  id: string;
  platform: "facebook" | "instagram";
  name: string;
  username: string | null;
  externalId: string | null;
  avatarUrl: string | null;
  status: string;
  valid: boolean;
  scopes: string[];
  missingScopes: string[];
  expiresAt: string | null;
  error: string | null;
}

const REQUIRED_SCOPES = ["pages_manage_posts", "pages_read_engagement"];
const REQUIRED_IG_SCOPES = ["instagram_basic", "instagram_content_publish"];

async function assertAdmin(supabase: unknown, workspaceId: string, userId: string) {
  const { data: isAdmin } = await sbAny(supabase).rpc("is_workspace_admin" as never, {
    _workspace_id: workspaceId,
    _user_id: userId,
  } as never);
  if (!isAdmin) throw new Error("Only workspace owners and admins can manage connected channels");
}

export const listMetaGrants = createServerFn({ method: "POST" })
  .validator((v: unknown) => wsInput.parse(v))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<MetaGrant[]> => {
    await assertAdmin(context.supabase, data.workspaceId, context.userId);

    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const db = sbAny(supabaseAdmin);
    const { data: rows, error } = await db
      .from("social_channels")
      .select("id, platform, name, username, external_id, avatar_url, status, access_token, token_expires_at")
      .eq("workspace_id", data.workspaceId)
      .in("platform", ["facebook", "instagram"])
      .order("platform", { ascending: true });
    if (error) throw new Error(error.message);

    const appId = process.env["META_APP_ID"];
    const appSecret = process.env["META_APP_SECRET"];
    const appToken = appId && appSecret ? `${appId}|${appSecret}` : null;
    const { decryptToken } = await import("@/lib/instagram/token-crypto.server");
    const { META_GRAPH } = await import("./meta-oauth.server");

    const list = (rows ?? []) as Array<Record<string, unknown>>;
    const out: MetaGrant[] = [];
    for (const row of list) {
      const grant: MetaGrant = {
        id: String(row.id),
        platform: row.platform as "facebook" | "instagram",
        name: String(row.name ?? ""),
        username: (row.username as string) ?? null,
        externalId: (row.external_id as string) ?? null,
        avatarUrl: (row.avatar_url as string) ?? null,
        status: String(row.status ?? "connected"),
        valid: false,
        scopes: [],
        missingScopes: [],
        expiresAt: (row.token_expires_at as string) ?? null,
        error: null,
      };

      const cipher = row.access_token as string | null;
      if (!cipher) {
        grant.error = "No token stored for this channel.";
        out.push(grant);
        continue;
      }
      if (!appToken) {
        grant.error = "Meta app credentials are not configured, so grant status cannot be checked.";
        out.push(grant);
        continue;
      }

      let token = cipher;
      try {
        token = decryptToken(cipher);
      } catch {
        /* legacy plaintext token */
      }

      try {
        const url = new URL(`${META_GRAPH}/debug_token`);
        url.searchParams.set("input_token", token);
        url.searchParams.set("access_token", appToken);
        const res = await fetch(url.toString());
        const json = (await res.json()) as {
          data?: { is_valid?: boolean; scopes?: string[]; expires_at?: number; error?: { message?: string } };
          error?: { message?: string };
        };
        const d = json.data;
        if (!res.ok || !d) {
          grant.error = json.error?.message ?? "Meta could not inspect this token.";
        } else {
          grant.valid = Boolean(d.is_valid);
          grant.scopes = d.scopes ?? [];
          const required = grant.platform === "facebook" ? REQUIRED_SCOPES : REQUIRED_IG_SCOPES;
          grant.missingScopes = required.filter((s) => !grant.scopes.includes(s));
          if (d.expires_at && d.expires_at > 0) grant.expiresAt = new Date(d.expires_at * 1000).toISOString();
          if (d.error?.message) grant.error = d.error.message;
          if (!grant.valid && !grant.error) grant.error = "Meta reports this token as no longer valid.";
        }
      } catch (e) {
        grant.error = e instanceof Error ? e.message : "Grant check failed.";
      }
      out.push(grant);
    }
    return out;
  });

export const revokeMetaGrant = createServerFn({ method: "POST" })
  .validator((v: unknown) => revokeInput.parse(v))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, data.workspaceId, context.userId);

    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const db = sbAny(supabaseAdmin);
    const { data: row, error } = await db
      .from("social_channels")
      .select("id, platform, external_id, access_token")
      .eq("id", data.channelId)
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Channel not found");

    let revoked = false;
    let revokeError: string | null = null;
    const cipher = (row as { access_token?: string }).access_token;
    const externalId = (row as { external_id?: string }).external_id;
    if (cipher && externalId) {
      try {
        const { decryptToken } = await import("@/lib/instagram/token-crypto.server");
        const { META_GRAPH } = await import("./meta-oauth.server");
        let token = cipher;
        try {
          token = decryptToken(cipher);
        } catch {
          /* legacy plaintext */
        }
        const res = await fetch(
          `${META_GRAPH}/${externalId}/permissions?access_token=${encodeURIComponent(token)}`,
          { method: "DELETE" },
        );
        const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
        revoked = Boolean(json.success);
        if (!revoked) revokeError = json.error?.message ?? "Meta declined the revoke request.";
      } catch (e) {
        revokeError = e instanceof Error ? e.message : "Revoke request failed.";
      }
    }

    // Always drop the stored token locally so the scheduler stops using it.
    const { error: updErr } = await db
      .from("social_channels")
      .update({ access_token: null, status: "revoked", token_expires_at: null })
      .eq("id", data.channelId)
      .eq("workspace_id", data.workspaceId);
    if (updErr) throw new Error(updErr.message);

    return { ok: true, revokedAtMeta: revoked, revokeError };
  });
