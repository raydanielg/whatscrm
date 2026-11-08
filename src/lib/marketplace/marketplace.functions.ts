/**
 * Integration Marketplace — server functions.
 * Catalog is public read; installations are per-organization.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function getOrgId(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data?.organization_id) throw new Error("No organization for user");
  return data.organization_id as string;
}

/** Public — no auth required. Catalog is world-readable. */
export const listMarketplaceCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const client = createClient(process.env.SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: any, init: any) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data, error } = await client
    .from("marketplace_integrations")
    .select("*")
    .order("featured", { ascending: false })
    .order("install_count", { ascending: false });
  if (error) throw error;
  return { integrations: data ?? [] };
});

export const listMyInstallations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await getOrgId(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("marketplace_installations")
      .select("*, integration:marketplace_integrations(*)")
      .eq("organization_id", orgId)
      .order("installed_at", { ascending: false });
    if (error) throw error;
    return { installations: data ?? [] };
  });

const InstallSchema = z.object({
  integrationId: z.string().uuid(),
  config: z.record(z.string(), z.any()).default({}),
  scopes: z.array(z.string()).default([]),
});

export const installIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => InstallSchema.parse(d))
  .handler(async ({ data, context }) => {
    const orgId = await getOrgId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: integ, error: iErr } = await (supabaseAdmin as any)
      .from("marketplace_integrations")
      .select("id, version, scopes")
      .eq("id", data.integrationId)
      .single();
    if (iErr || !integ) throw new Error("Integration not found");
    const scopes = data.scopes.length ? data.scopes : (integ.scopes as string[]);
    const { data: installed, error } = await (supabaseAdmin as any)
      .from("marketplace_installations")
      .upsert(
        {
          organization_id: orgId,
          integration_id: integ.id,
          installed_by: context.userId,
          status: "active",
          version: integ.version,
          config: data.config,
          granted_scopes: scopes,
          disabled_at: null,
        },
        { onConflict: "organization_id,integration_id" },
      )
      .select("*")
      .single();
    if (error) throw error;
    await (supabaseAdmin as any).rpc("increment_install_count", { p_id: integ.id }).then(() => {}, () => {});
    return { installation: installed };
  });

export const setInstallationEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const orgId = await getOrgId(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("marketplace_installations")
      .update({
        status: data.enabled ? "active" : "disabled",
        disabled_at: data.enabled ? null : new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("organization_id", orgId);
    if (error) throw error;
    return { ok: true };
  });

export const updateInstallationConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) =>
    z.object({
      id: z.string().uuid(),
      config: z.record(z.string(), z.any()),
      scopes: z.array(z.string()).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const orgId = await getOrgId(context.supabase, context.userId);
    const patch: any = { config: data.config };
    if (data.scopes) patch.granted_scopes = data.scopes;
    const { error } = await context.supabase
      .from("marketplace_installations")
      .update(patch)
      .eq("id", data.id)
      .eq("organization_id", orgId);
    if (error) throw error;
    return { ok: true };
  });

export const uninstallIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const orgId = await getOrgId(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("marketplace_installations")
      .delete()
      .eq("id", data.id)
      .eq("organization_id", orgId);
    if (error) throw error;
    return { ok: true };
  });
