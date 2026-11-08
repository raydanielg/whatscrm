import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { API_SCOPES, WILDCARD_SCOPE } from "@/lib/api/scopes";
import { assertOrgRole } from "@/lib/rbac-org";
import { sbAny } from "@/lib/supabase/untyped";

/** Scopes a key may hold: any known API scope, or the "*" wildcard. */
const scopeSchema = z.enum([...API_SCOPES, WILDCARD_SCOPE] as [string, ...string[]]);

export class ForbiddenOrgError extends Error {
  status = 403 as const;
  constructor(orgId: string) {
    super(`Caller is not a member of organization ${orgId}`);
    this.name = "ForbiddenOrgError";
  }
}

/**
 * Resolve the organization id the caller is acting as.
 *
 * - When `requestedOrgId` is provided, verify the caller is a member of it
 *   (queried under the caller's RLS — cannot bypass by claiming an id) and
 *   return that id. Reject with {@link ForbiddenOrgError} otherwise.
 * - When omitted, return the caller's earliest membership. If none exists,
 *   atomically provision a personal organization via the SECURITY DEFINER
 *   RPC and return that id.
 */
export async function getCallerOrgId(
  supabase: any,
  userId: string,
  requestedOrgId?: string | null,
): Promise<string> {
  // Explicit org selection — verify membership under the caller's RLS.
  if (requestedOrgId) {
    const uuid = z.string().uuid().safeParse(requestedOrgId);
    if (!uuid.success) throw new ForbiddenOrgError(requestedOrgId);

    const { data, error } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .eq("organization_id", requestedOrgId)
      .maybeSingle();
    if (error) throw error;
    if (!data?.organization_id) throw new ForbiddenOrgError(requestedOrgId);
    return data.organization_id as string;
  }

  // Fast path under the caller's RLS — no admin client needed when membership exists
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data?.organization_id) return data.organization_id as string;

  // Atomic, idempotent provisioning via SECURITY DEFINER RPC. The function
  // takes a per-user advisory lock, so concurrent callers converge on one
  // personal organization instead of racing to create duplicates.
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = userRes?.user?.email ?? undefined;

  const { data: orgId, error: rpcErr } = await sbAny(supabaseAdmin).rpc(
    "ensure_personal_organization",
    { _user_id: userId, _email: email },
  );
  if (rpcErr) throw rpcErr;
  if (!orgId) throw new Error("Failed to provision personal organization");
  return orgId as string;
}

function randomKey(): { full: string; prefix: string } {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let body = "";
  for (const b of bytes) body += alphabet[b % alphabet.length];
  const full = `wdf_live_${body}`;
  return { full, prefix: full.slice(0, 12) };
}

async function sha256(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Common org-scope shape. Every API-keys endpoint requires the caller to
 * pass the organizationId it intends to act on. `getCallerOrgId` verifies
 * membership under the caller's RLS before any table query runs — a
 * mismatched or non-member id throws {@link ForbiddenOrgError} and no
 * downstream select/insert/update touches the DB.
 */
const orgScope = z.object({ organizationId: z.string().uuid() });

export const listApiKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { organizationId: string }) => orgScope.parse(d))
  .handler(async ({ data, context }) => {
    const orgId = await getCallerOrgId(context.supabase, context.userId, data.organizationId);
    const { data: rows, error } = await context.supabase
      .from("api_keys")
      .select(
        "id, name, description, prefix, scopes, ip_allowlist, last_used_at, expires_at, revoked_at, rotated_from, created_at",
      )
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { orgId, keys: rows ?? [] };
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      organizationId: string;
      name: string;
      description?: string;
      scopes: string[];
      expiresInDays?: number | null;
      ipAllowlist?: string[];
    }) =>
      orgScope
        .extend({
          name: z.string().min(1).max(80),
          description: z.string().max(500).optional(),
          scopes: z
            .array(scopeSchema)
            .min(1)
            .max(API_SCOPES.length + 1),
          expiresInDays: z.number().int().positive().max(3650).nullable().optional(),
          ipAllowlist: z.array(z.string().max(45)).max(50).optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const orgId = await getCallerOrgId(context.supabase, context.userId, data.organizationId);
    // Mutating key management requires an elevated org role (owner/admin).
    await assertOrgRole(context.supabase, context.userId, orgId);
    const { full, prefix } = randomKey();
    const hashed_key = await sha256(full);
    const expires_at = data.expiresInDays
      ? new Date(Date.now() + data.expiresInDays * 86400_000).toISOString()
      : null;

    const { data: row, error } = await context.supabase
      .from("api_keys")
      .insert({
        organization_id: orgId,
        created_by: context.userId,
        name: data.name,
        description: data.description ?? null,
        prefix,
        hashed_key,
        scopes: data.scopes,
        ip_allowlist: data.ipAllowlist ?? [],
        expires_at,
      })
      .select("id, name, prefix, scopes, ip_allowlist, expires_at, created_at")
      .single();
    if (error) throw error;

    // one-time reveal
    return { key: row, secret: full };
  });

export const rotateApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { organizationId: string; id: string }) =>
    orgScope.extend({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const orgId = await getCallerOrgId(context.supabase, context.userId, data.organizationId);
    // Mutating key management requires an elevated org role (owner/admin).
    await assertOrgRole(context.supabase, context.userId, orgId);
    const { data: existing, error: fetchErr } = await context.supabase
      .from("api_keys")
      .select("id, name, description, scopes, ip_allowlist, expires_at")
      .eq("id", data.id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!existing) throw new Error("API key not found");

    const { full, prefix } = randomKey();
    const hashed_key = await sha256(full);

    // Insert new, revoke old atomically (best-effort sequential)
    const { data: row, error: insErr } = await context.supabase
      .from("api_keys")
      .insert({
        organization_id: orgId,
        created_by: context.userId,
        name: existing.name,
        description: existing.description,
        prefix,
        hashed_key,
        scopes: existing.scopes,
        ip_allowlist: existing.ip_allowlist ?? [],
        expires_at: existing.expires_at,
        rotated_from: existing.id,
      })
      .select("id, name, prefix, scopes, ip_allowlist, expires_at, created_at")
      .single();
    if (insErr) throw insErr;

    const { error: revokeErr } = await context.supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", existing.id)
      .eq("organization_id", orgId);
    if (revokeErr) {
      // New key inserted but old key revocation failed — roll back the new key
      await context.supabase
        .from("api_keys")
        .delete()
        .eq("id", (row as { id: string }).id);
      throw revokeErr;
    }

    return { key: row, secret: full };
  });

export const updateApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (d: {
      organizationId: string;
      id: string;
      name?: string;
      description?: string;
      scopes?: string[];
      ipAllowlist?: string[];
      expiresInDays?: number | null;
    }) =>
      orgScope
        .extend({
          id: z.string().uuid(),
          name: z.string().min(1).max(80).optional(),
          description: z.string().max(500).optional(),
          scopes: z
            .array(scopeSchema)
            .min(1)
            .max(API_SCOPES.length + 1)
            .optional(),
          ipAllowlist: z.array(z.string().max(45)).max(50).optional(),
          expiresInDays: z.number().int().positive().max(3650).nullable().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const orgId = await getCallerOrgId(context.supabase, context.userId, data.organizationId);
    // Mutating key management requires an elevated org role (owner/admin).
    await assertOrgRole(context.supabase, context.userId, orgId);
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.scopes !== undefined) patch.scopes = data.scopes;
    if (data.ipAllowlist !== undefined) patch.ip_allowlist = data.ipAllowlist;
    if (data.expiresInDays !== undefined) {
      patch.expires_at = data.expiresInDays
        ? new Date(Date.now() + data.expiresInDays * 86400_000).toISOString()
        : null;
    }
    const { error } = await context.supabase
      .from("api_keys")
      .update(patch as any)
      .eq("id", data.id)
      .eq("organization_id", orgId);
    if (error) throw error;
    return { ok: true };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { organizationId: string; id: string }) =>
    orgScope.extend({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const orgId = await getCallerOrgId(context.supabase, context.userId, data.organizationId);
    // Mutating key management requires an elevated org role (owner/admin).
    await assertOrgRole(context.supabase, context.userId, orgId);
    const { error } = await context.supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("organization_id", orgId);
    if (error) throw error;
    return { ok: true };
  });

export const getApiKeyStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { organizationId: string; id: string; days?: number }) =>
    orgScope
      .extend({
        id: z.string().uuid(),
        days: z.number().int().min(1).max(90).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const orgId = await getCallerOrgId(context.supabase, context.userId, data.organizationId);
    const since = new Date(Date.now() - (data.days ?? 7) * 86400_000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("api_gateway_logs")
      .select("status_code, latency_ms, created_at")
      .eq("organization_id", orgId)
      .eq("api_key_id", data.id)
      .gte("created_at", since)
      .limit(10000);
    if (error) throw error;
    const total = rows?.length ?? 0;
    const errors = (rows ?? []).filter((r: any) => r.status_code >= 400).length;
    const latencies = (rows ?? [])
      .map((r: any) => r.latency_ms ?? 0)
      .filter((n) => n > 0)
      .sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
    const avg = latencies.length
      ? Math.round(latencies.reduce((s, n) => s + n, 0) / latencies.length)
      : 0;
    return { total, errors, avgLatencyMs: avg, p95LatencyMs: p95, days: data.days ?? 7 };
  });

export const listWebhookActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { organizationId: string }) => orgScope.parse(d))
  .handler(async ({ data, context }) => {
    // Verify the caller is a member of the requested org before any query.
    const orgId = await getCallerOrgId(context.supabase, context.userId, data.organizationId);

    // Scope workspaces to this organization AND the caller's membership so
    // an admin in another org can't reach into workspaces via a stale id.
    const { data: workspaces } = await context.supabase
      .from("workspace_members")
      .select("workspace_id, workspaces:workspaces!inner(organization_id)")
      .eq("user_id", context.userId)
      .eq("workspaces.organization_id", orgId);
    const ids = (workspaces ?? []).map((w: any) => w.workspace_id);
    if (ids.length === 0) return { orgId, secrets: [], events: [] };

    const [secrets, events] = await Promise.all([
      context.supabase
        .from("webhook_signing_secrets")
        .select("id, workspace_id, secret_prefix, is_primary, activated_at, retired_at, created_at")
        .in("workspace_id", ids)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("webhook_events")
        .select(
          "id, provider, event_type, signature_valid, processed, attempts, last_error, received_at",
        )
        .in("workspace_id", ids)
        .order("received_at", { ascending: false })
        .limit(50),
    ]);
    return { orgId, secrets: secrets.data ?? [], events: events.data ?? [] };
  });
