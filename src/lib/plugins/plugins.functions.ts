/**
 * Plugin marketplace — server functions.
 * Public reads (catalog) use a publishable-key client; per-workspace
 * reads/installs go through requireSupabaseAuth and RLS.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { sbAny } from "@/lib/supabase/untyped";

function publicClient() {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient(process.env.SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: any, init: any) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
          h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

async function activeWorkspaceId(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data?.workspace_id) throw new Error("No workspace for user");
  return data.workspace_id as string;
}

/** Public catalog listing — filters, sort, categories. */
export const listPluginCatalog = createServerFn({ method: "GET" })
  .validator(
    (
      input:
        | { category?: string; search?: string; sort?: "top" | "new" | "rated"; limit?: number }
        | undefined,
    ) =>
      z
        .object({
          category: z.string().optional(),
          search: z.string().optional(),
          sort: z.enum(["top", "new", "rated"]).optional(),
          limit: z.number().int().min(1).max(100).optional(),
        })
        .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const client = publicClient();
    let q = sbAny(client)
      .from("plugins")
      .select("*")
      .eq("is_public", true)
      .eq("status", "published");
    if (data.category) q = q.eq("category", data.category);
    if (data.search) q = q.ilike("name", `%${sanitizeSearchTerm(data.search)}%`);
    if (data.sort === "new") q = q.order("created_at", { ascending: false });
    else if (data.sort === "rated") q = q.order("rating_avg", { ascending: false });
    else
      q = q.order("is_featured", { ascending: false }).order("install_count", { ascending: false });
    const { data: rows, error } = await q.limit(data.limit ?? 60);
    if (error) throw error;
    return { plugins: rows ?? [] };
  });

export const getPluginBySlug = createServerFn({ method: "GET" })
  .validator((input: { slug: string }) => z.object({ slug: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const client = publicClient();
    const [{ data: plugin }, { data: versions }, { data: reviews }] = await Promise.all([
      sbAny(client).from("plugins").select("*").eq("slug", data.slug).maybeSingle(),
      sbAny(client)
        .from("plugin_versions")
        .select("*")
        .eq(
          "plugin_id",
          (await sbAny(client).from("plugins").select("id").eq("slug", data.slug).maybeSingle())
            .data?.id ?? "00000000-0000-0000-0000-000000000000",
        )
        .order("published_at", { ascending: false })
        .limit(20),
      sbAny(client)
        .from("plugin_reviews")
        .select("*")
        .eq(
          "plugin_id",
          (await sbAny(client).from("plugins").select("id").eq("slug", data.slug).maybeSingle())
            .data?.id ?? "00000000-0000-0000-0000-000000000000",
        )
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (!plugin) throw new Error("Plugin not found");
    return { plugin, versions: versions ?? [], reviews: reviews ?? [] };
  });

/** Install a plugin into the caller's active workspace. */
export const installPlugin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { pluginId: string; versionId?: string; grantedPermissions?: string[] }) =>
    z
      .object({
        pluginId: z.string().uuid(),
        versionId: z.string().uuid().optional(),
        grantedPermissions: z.array(z.string()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await activeWorkspaceId(context.supabase, context.userId);
    const { data: plugin, error: pluginError } = await context.supabase
      .from("plugins")
      .select("id, status, is_public")
      .eq("id", data.pluginId)
      .maybeSingle();
    if (pluginError) throw pluginError;
    if (!plugin || plugin.status !== "published" || !plugin.is_public) {
      throw new Error("This plugin is not available for installation.");
    }

    let versionQuery = context.supabase
      .from("plugin_versions")
      .select("id, entry_url, permissions")
      .eq("plugin_id", data.pluginId)
      .eq("is_stable", true);
    versionQuery = data.versionId
      ? versionQuery.eq("id", data.versionId)
      : versionQuery.order("published_at", { ascending: false }).limit(1);
    const { data: version, error: versionError } = await versionQuery.maybeSingle();
    if (versionError) throw versionError;
    if (!version?.entry_url) {
      throw new Error(
        "This plugin has no installable release yet. Ask its publisher to publish one.",
      );
    }

    // Workspace membership was verified above. The service client reads the
    // license because another member may have purchased it for this workspace.
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: licenses, error: licenseError } = await sbAny(supabaseAdmin)
      .from("plugin_licenses")
      .select("id, expires_at")
      .eq("plugin_id", data.pluginId)
      .eq("customer_workspace_id", workspaceId)
      .eq("status", "active");
    if (licenseError) throw licenseError;
    const hasLicense = (licenses ?? []).some(
      (license: { expires_at: string | null }) =>
        !license.expires_at || new Date(license.expires_at).getTime() > Date.now(),
    );
    if (!hasLicense)
      throw new Error("Get a license for this workspace before installing this plugin.");

    const allowed = new Set((version.permissions ?? []) as string[]);
    if ((data.grantedPermissions ?? []).some((permission) => !allowed.has(permission))) {
      throw new Error("The requested permissions are not part of this plugin release.");
    }
    const { data: row, error } = await context.supabase
      .from("plugin_installations")
      .upsert(
        {
          workspace_id: workspaceId,
          plugin_id: data.pluginId,
          version_id: version.id,
          installed_by: context.userId,
          status: "active",
          granted_permissions: data.grantedPermissions ?? [],
        },
        { onConflict: "workspace_id,plugin_id" },
      )
      .select("*")
      .single();
    if (error) throw error;
    return { installation: row };
  });

export const uninstallPlugin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { pluginId: string }) =>
    z.object({ pluginId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await activeWorkspaceId(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("plugin_installations")
      .update({ status: "uninstalled" })
      .eq("workspace_id", workspaceId)
      .eq("plugin_id", data.pluginId);
    if (error) throw error;
    return { ok: true };
  });

export const listMyInstalledPlugins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const workspaceId = await activeWorkspaceId(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("plugin_installations")
      .select("*, plugins(*), plugin_versions(*)")
      .eq("workspace_id", workspaceId)
      .neq("status", "uninstalled")
      .order("installed_at", { ascending: false });
    if (error) throw error;
    return { installations: data ?? [] };
  });

/** Publisher — my plugins */
export const listMyPlugins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("plugins")
      .select("*")
      .eq("publisher_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return { plugins: data ?? [] };
  });

export const upsertMyPlugin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        slug: z
          .string()
          .min(2)
          .max(80)
          .regex(/^[a-z0-9-]+$/),
        name: z.string().min(2).max(120),
        tagline: z.string().max(200).optional().nullable(),
        description: z.string().max(4000).optional().nullable(),
        category: z.string().min(2).max(40).default("other"),
        tags: z.array(z.string()).default([]),
        icon_url: z.string().url().optional().nullable(),
        banner_url: z.string().url().optional().nullable(),
        homepage_url: z.string().url().optional().nullable(),
        repo_url: z.string().url().optional().nullable(),
        pricing_model: z.enum(["free", "one_time", "subscription", "freemium"]).default("free"),
        price_cents: z.number().int().min(0).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const row = {
      ...data,
      publisher_id: context.userId,
      status: "draft",
      is_public: false,
    };
    const { data: saved, error } = await context.supabase
      .from("plugins")
      .insert(row)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return { plugin: saved };
  });

export const publishPluginVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        pluginId: z.string().uuid(),
        version: z.string().regex(/^\d+\.\d+\.\d+([+\-][\w.]+)?$/),
        changelog: z.string().max(4000).optional(),
        manifest: z.record(z.unknown()).default({}),
        entry_url: z.string().url().refine((url) => new URL(url).protocol === "https:", "Plugin code must use HTTPS"),
        permissions: z.array(z.string()).default([]),
        min_app_version: z.string().optional(),
        is_stable: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Verify caller owns the plugin (RLS also enforces).
    const { data: plugin } = await context.supabase
      .from("plugins")
      .select("publisher_id, status")
      .eq("id", data.pluginId)
      .maybeSingle();
    if (!plugin || plugin.publisher_id !== context.userId) throw new Error("Forbidden");
    const { data: version, error } = await context.supabase
      .from("plugin_versions")
      .insert({
        plugin_id: data.pluginId,
        version: data.version,
        changelog: data.changelog,
        manifest: data.manifest as any,
        entry_url: data.entry_url,
        permissions: data.permissions,
        min_app_version: data.min_app_version,
        is_stable: data.is_stable,
      })
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (plugin.status !== "published") {
      const { data: queued, error: reviewError } = await context.supabase
        .from("plugins")
        .update({ status: "pending_review", is_public: false })
        .eq("id", data.pluginId)
        .eq("publisher_id", context.userId)
        .select("id")
        .maybeSingle();
      if (reviewError || !queued) throw reviewError ?? new Error("Could not submit plugin for review");
    }
    return { version };
  });

export const reviewPlugin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        pluginId: z.string().uuid(),
        rating: z.number().int().min(1).max(5),
        title: z.string().max(120).optional(),
        body: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await activeWorkspaceId(context.supabase, context.userId).catch(() => null);
    const { error } = await context.supabase.from("plugin_reviews").upsert(
      {
        plugin_id: data.pluginId,
        reviewer_id: context.userId,
        workspace_id: workspaceId,
        rating: data.rating,
        title: data.title,
        body: data.body,
      },
      { onConflict: "plugin_id,reviewer_id" },
    );
    if (error) throw error;
    return { ok: true };
  });
