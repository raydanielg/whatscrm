/**
 * OAuth 2.0 management server functions:
 * - Register / list / update / revoke OAuth clients (developer surface).
 * - List and revoke user consents ("Connected applications").
 * - Server-side helpers for the consent screen: fetch client details,
 *   issue authorization code, deny.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";

async function getCallerOrgId(supabase: any, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.organization_id) throw new Error("No organization for user");
  return data.organization_id as string;
}

// -------- Client CRUD --------

export const listOAuthClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await getCallerOrgId(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("oauth_clients")
      .select(
        "id, client_id, client_type, name, description, logo_url, homepage_url, redirect_uris, allowed_grant_types, allowed_scopes, require_pkce, is_first_party, approved, approved_at, revoked_at, created_at",
      )
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { orgId, clients: data ?? [] };
  });

export const createOAuthClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    name: string;
    description?: string;
    clientType: "confidential" | "public";
    redirectUris: string[];
    allowedGrantTypes?: string[];
    allowedScopes?: string[];
    homepageUrl?: string;
    logoUrl?: string;
    privacyUrl?: string;
    tosUrl?: string;
  }) =>
    z
      .object({
        name: z.string().min(1).max(120),
        description: z.string().max(500).optional(),
        clientType: z.enum(["confidential", "public"]),
        redirectUris: z
          .array(z.string().url().max(2048))
          .min(1)
          .max(20),
        allowedGrantTypes: z
          .array(z.enum(["authorization_code", "refresh_token", "client_credentials"]))
          .optional(),
        allowedScopes: z.array(z.string().max(60)).max(50).optional(),
        homepageUrl: z.string().url().optional().or(z.literal("")),
        logoUrl: z.string().url().optional().or(z.literal("")),
        privacyUrl: z.string().url().optional().or(z.literal("")),
        tosUrl: z.string().url().optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const orgId = await getCallerOrgId(context.supabase, context.userId);
    const { generateClientCredentials, sha256Hex } = await import("./oauth.server");
    const { client_id, client_secret } = generateClientCredentials();
    const secretHash =
      data.clientType === "confidential" ? await sha256Hex(client_secret) : null;

    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: row, error } = await supabaseAdmin
      .from("oauth_clients")
      .insert({
        organization_id: orgId,
        created_by: context.userId,
        client_id,
        client_secret_hash: secretHash,
        client_type: data.clientType,
        name: data.name,
        description: data.description ?? null,
        logo_url: data.logoUrl || null,
        homepage_url: data.homepageUrl || null,
        privacy_url: data.privacyUrl || null,
        tos_url: data.tosUrl || null,
        redirect_uris: data.redirectUris,
        allowed_grant_types: data.allowedGrantTypes ?? [
          "authorization_code",
          "refresh_token",
        ],
        allowed_scopes: data.allowedScopes ?? ["openid", "profile", "email"],
        require_pkce: data.clientType === "public",
      })
      .select("id, client_id")
      .single();
    if (error) throw error;

    return {
      id: row.id,
      client_id: row.client_id,
      // Returned ONCE. Confidential clients only.
      client_secret: data.clientType === "confidential" ? client_secret : null,
    };
  });

export const updateOAuthClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: {
    id: string;
    name?: string;
    description?: string;
    redirectUris?: string[];
    allowedScopes?: string[];
    allowedGrantTypes?: string[];
    homepageUrl?: string;
    logoUrl?: string;
  }) => z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).optional(),
    redirectUris: z.array(z.string().url().max(2048)).max(20).optional(),
    allowedScopes: z.array(z.string().max(60)).max(50).optional(),
    allowedGrantTypes: z.array(z.string()).max(10).optional(),
    homepageUrl: z.string().url().optional().or(z.literal("")),
    logoUrl: z.string().url().optional().or(z.literal("")),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const orgId = await getCallerOrgId(context.supabase, context.userId);
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.redirectUris) patch.redirect_uris = data.redirectUris;
    if (data.allowedScopes) patch.allowed_scopes = data.allowedScopes;
    if (data.allowedGrantTypes) patch.allowed_grant_types = data.allowedGrantTypes;
    if (data.homepageUrl !== undefined) patch.homepage_url = data.homepageUrl || null;
    if (data.logoUrl !== undefined) patch.logo_url = data.logoUrl || null;
    const { error } = await (sbAny(context.supabase).from("oauth_clients") as any)
      .update(patch)
      .eq("id", data.id)
      .eq("organization_id", orgId);
    if (error) throw error;
    return { ok: true };
  });

export const rotateClientSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const orgId = await getCallerOrgId(context.supabase, context.userId);
    const { generateClientCredentials, sha256Hex } = await import("./oauth.server");
    const { client_secret } = generateClientCredentials();
    const hash = await sha256Hex(client_secret);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { error } = await supabaseAdmin
      .from("oauth_clients")
      .update({ client_secret_hash: hash, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("organization_id", orgId)
      .eq("client_type", "confidential");
    if (error) throw error;
    return { client_secret };
  });

export const revokeOAuthClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const orgId = await getCallerOrgId(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("oauth_clients")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("organization_id", orgId);
    if (error) throw error;
    // Revoke all outstanding tokens for this client.
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const now = new Date().toISOString();
    await supabaseAdmin
      .from("oauth_access_tokens")
      .update({ revoked_at: now })
      .eq("client_id", data.id)
      .is("revoked_at", null);
    await supabaseAdmin
      .from("oauth_refresh_tokens")
      .update({ revoked_at: now })
      .eq("client_id", data.id)
      .is("revoked_at", null);
    return { ok: true };
  });

// -------- Consent screen server helpers --------

const AuthorizeParamsSchema = z.object({
  client_id: z.string().min(1),
  redirect_uri: z.string().url(),
  response_type: z.literal("code"),
  scope: z.string().default("openid profile email"),
  state: z.string().optional(),
  code_challenge: z.string().optional(),
  code_challenge_method: z.enum(["S256", "plain"]).optional(),
  nonce: z.string().optional(),
});

export const getAuthorizationDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: Record<string, string>) => AuthorizeParamsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: client } = await supabaseAdmin
      .from("oauth_clients")
      .select(
        "id, client_id, client_type, name, description, logo_url, homepage_url, privacy_url, tos_url, redirect_uris, allowed_scopes, allowed_grant_types, require_pkce, is_first_party, approved, revoked_at, organization_id",
      )
      .eq("client_id", data.client_id)
      .maybeSingle();
    if (!client || client.revoked_at) throw new Error("invalid_client");
    if (!client.redirect_uris.includes(data.redirect_uri)) throw new Error("invalid_redirect_uri");
    if (!client.allowed_grant_types.includes("authorization_code")) throw new Error("unauthorized_grant_type");
    if (client.require_pkce && !data.code_challenge) throw new Error("pkce_required");

    const requested = data.scope.split(/\s+/).filter(Boolean);
    const invalidScope = requested.find((s) => !client.allowed_scopes.includes(s));
    if (invalidScope) throw new Error(`invalid_scope:${invalidScope}`);

    const { data: existingConsent } = await context.supabase
      .from("oauth_user_consents")
      .select("scopes, revoked_at")
      .eq("user_id", context.userId)
      .eq("client_id", client.id)
      .maybeSingle();
    const consented =
      !!existingConsent &&
      !existingConsent.revoked_at &&
      requested.every((s) => (existingConsent.scopes as string[]).includes(s));

    return {
      client: {
        id: client.id,
        client_id: client.client_id,
        name: client.name,
        description: client.description,
        logo_url: client.logo_url,
        homepage_url: client.homepage_url,
        privacy_url: client.privacy_url,
        tos_url: client.tos_url,
        approved: client.approved,
        is_first_party: client.is_first_party,
        organization_id: client.organization_id,
      },
      requested_scopes: requested,
      already_consented: consented || client.is_first_party,
      params: data,
    };
  });

export const approveAuthorization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: Record<string, string>) => AuthorizeParamsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: client } = await supabaseAdmin
      .from("oauth_clients")
      .select("id, organization_id, redirect_uris, allowed_scopes, require_pkce, revoked_at")
      .eq("client_id", data.client_id)
      .maybeSingle();
    if (!client || client.revoked_at) throw new Error("invalid_client");
    if (!client.redirect_uris.includes(data.redirect_uri)) throw new Error("invalid_redirect_uri");
    if (client.require_pkce && !data.code_challenge) throw new Error("pkce_required");

    const scopes = data.scope.split(/\s+/).filter(Boolean);
    if (scopes.some((s) => !client.allowed_scopes.includes(s)))
      throw new Error("invalid_scope");

    // Upsert consent (widen scopes to union).
    const { data: existing } = await context.supabase
      .from("oauth_user_consents")
      .select("id, scopes")
      .eq("user_id", context.userId)
      .eq("client_id", client.id)
      .maybeSingle();
    const unionScopes = Array.from(new Set([...(existing?.scopes ?? []), ...scopes]));
    if (existing) {
      await context.supabase
        .from("oauth_user_consents")
        .update({ scopes: unionScopes, revoked_at: null, granted_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await context.supabase
        .from("oauth_user_consents")
        .insert({ user_id: context.userId, client_id: client.id, scopes: unionScopes });
    }

    const { randomToken, sha256Hex, OAUTH_TTL } = await import("./oauth.server");
    const code = randomToken(32);
    const codeHash = await sha256Hex(code);
    const { error } = await sbAny(supabaseAdmin).from("oauth_authorization_codes").insert({
      code_hash: codeHash,
      client_id: client.id,
      user_id: context.userId,
      organization_id: client.organization_id,
      redirect_uri: data.redirect_uri,
      scopes,
      code_challenge: data.code_challenge ?? null,
      code_challenge_method: data.code_challenge_method ?? (data.code_challenge ? "S256" : null),
      nonce: data.nonce ?? null,
      expires_at: new Date(Date.now() + OAUTH_TTL.CODE_TTL_S * 1000).toISOString(),
    });
    if (error) throw error;

    const url = new URL(data.redirect_uri);
    url.searchParams.set("code", code);
    if (data.state) url.searchParams.set("state", data.state);
    return { redirect_to: url.toString() };
  });

export const denyAuthorization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { redirect_uri: string; state?: string }) =>
    z.object({ redirect_uri: z.string().url(), state: z.string().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const url = new URL(data.redirect_uri);
    url.searchParams.set("error", "access_denied");
    if (data.state) url.searchParams.set("state", data.state);
    return { redirect_to: url.toString() };
  });

// -------- Connected apps (user-side) --------

export const listConnectedApps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: consents } = await context.supabase
      .from("oauth_user_consents")
      .select("id, client_id, scopes, granted_at, revoked_at")
      .eq("user_id", context.userId)
      .is("revoked_at", null);
    const ids = (consents ?? []).map((c: any) => c.client_id);
    if (!ids.length) return { apps: [] };
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: clients } = await supabaseAdmin
      .from("oauth_clients")
      .select("id, name, description, logo_url, homepage_url, client_type")
      .in("id", ids);
    const byId: Record<string, any> = {};
    for (const c of clients ?? []) byId[c.id] = c;
    const apps = (consents ?? []).map((c: any) => ({
      consent_id: c.id,
      client: byId[c.client_id],
      scopes: c.scopes,
      granted_at: c.granted_at,
    }));
    return { apps };
  });

export const revokeConnectedApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { consentId: string }) =>
    z.object({ consentId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: consent } = await context.supabase
      .from("oauth_user_consents")
      .select("id, client_id, user_id")
      .eq("id", data.consentId)
      .maybeSingle();
    if (!consent) throw new Error("not_found");
    await context.supabase
      .from("oauth_user_consents")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", consent.id);
    // Revoke all tokens for this user + client.
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const now = new Date().toISOString();
    await supabaseAdmin
      .from("oauth_access_tokens")
      .update({ revoked_at: now })
      .eq("user_id", context.userId)
      .eq("client_id", consent.client_id)
      .is("revoked_at", null);
    await supabaseAdmin
      .from("oauth_refresh_tokens")
      .update({ revoked_at: now })
      .eq("user_id", context.userId)
      .eq("client_id", consent.client_id)
      .is("revoked_at", null);
    return { ok: true };
  });
