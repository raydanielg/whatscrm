/**
 * White Label — per-workspace branding + theme engine.
 * Workspace admins update the config; everyone in the workspace can read it.
 * Anonymous callers may look up a config by custom_domain to render tenant branding.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sbAny } from "@/lib/supabase/untyped";

async function activeWorkspaceId(supabase: any, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.workspace_id as string | undefined) ?? null;
}

async function requireActiveWorkspaceId(supabase: any, userId: string, requested?: string | null): Promise<string> {
  if (requested) {
    const { data, error } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", requested)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("You are not a member of the selected workspace");
    return requested;
  }
  const id = await activeWorkspaceId(supabase, userId);
  if (!id) throw new Error("No workspace for user");
  return id;
}

const nStr = z.string().max(2000).optional().nullable();
const color = z.string().max(64).optional().nullable();
const brandingImageUrl = z
  .string()
  .max(2000)
  .refine((value) => {
    if (/^\/api\/public\/branding\/(?:platform|(?:org|workspace)\/[0-9a-f-]{36})\/[\w./-]+$/i.test(value)) {
      return !value.split("/").some((segment) => segment === "." || segment === "..");
    }
    try {
      return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, "Enter a valid image URL or upload a branding image")
  .optional()
  .nullable();

const WhiteLabelSchema = z.object({
  // Brand identity
  brand_name: z.string().max(80).optional().nullable(),
  logo_url: brandingImageUrl,
  logo_dark_url: brandingImageUrl,
  favicon_url: brandingImageUrl,

  // Colors
  primary_color: color,
  secondary_color: color,
  accent_color: color,
  background_color: color,
  foreground_color: color,
  border_color: color,

  // Sidebar theme
  sidebar_background: color,
  sidebar_foreground: color,
  sidebar_accent: color,
  sidebar_border: color,

  // Dashboard theme
  dashboard_background: color,
  dashboard_accent: color,

  // Typography
  font_family_sans: nStr,
  font_family_heading: nStr,
  font_family_mono: nStr,
  font_size_base: nStr,

  // Dark / light mode
  default_color_mode: z.enum(["light", "dark", "system"]).optional().nullable(),
  dark_primary_color: color,
  dark_background_color: color,
  dark_accent_color: color,

  // Login page
  login_background_url: brandingImageUrl,
  login_headline: z.string().max(200).optional().nullable(),
  login_subheadline: z.string().max(400).optional().nullable(),
  login_layout: z.enum(["centered", "split", "minimal"]).optional().nullable(),

  // Loader
  loader_url: brandingImageUrl,
  loader_style: z.enum(["spinner", "dots", "bar", "logo", "custom"]).optional().nullable(),

  // Icons
  icon_style: z.enum(["outline", "solid", "duotone"]).optional().nullable(),
  icon_stroke_width: z.number().min(0.5).max(4).optional().nullable(),

  // Radius
  border_radius: nStr,

  // Email branding
  email_logo_url: brandingImageUrl,
  email_from_name: z.string().max(80).optional().nullable(),
  email_primary_color: color,
  email_header_color: color,
  custom_email_footer: z.string().max(4000).optional().nullable(),

  // Custom domain / SEO
  custom_domain: z.string().trim().toLowerCase().max(200)
    .regex(/^(?=.{4,200}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, "Enter a valid domain name")
    .optional().nullable(),
  support_email: z.string().email().optional().nullable(),
  support_url: z.string().url().optional().nullable(),
  meta_title: z.string().max(120).optional().nullable(),
  meta_description: z.string().max(300).optional().nullable(),

  // Social handles (stored without the @, or as a full profile URL)
  social_x: z.string().max(200).optional().nullable(),
  social_instagram: z.string().max(200).optional().nullable(),
  social_facebook: z.string().max(200).optional().nullable(),
  social_tiktok: z.string().max(200).optional().nullable(),
  social_threads: z.string().max(200).optional().nullable(),
  social_youtube: z.string().max(200).optional().nullable(),
  social_linkedin: z.string().max(200).optional().nullable(),
  social_website: z.string().max(200).optional().nullable(),

  // Advanced
  remove_lovable_branding: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

export const getWhiteLabel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ workspaceId: z.string().uuid().optional().nullable() })
      .partial()
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    // Honour the caller's *active* workspace when they are a member of it —
    // otherwise fall back to their first membership. Without this the brand
    // could resolve from a different workspace than the one being viewed.
    let workspaceId: string | null = null;
    const requested = data?.workspaceId ?? null;
    if (requested) {
      const { data: member, error: memberError } = await sbAny(context.supabase)
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", context.userId)
        .eq("workspace_id", requested)
        .maybeSingle();
      if (memberError) throw memberError;
      if (!member) throw new Error("You are not a member of the selected workspace");
      workspaceId = requested;
    }
    if (!workspaceId)
      workspaceId = await activeWorkspaceId(sbAny(context.supabase), context.userId);
    if (!workspaceId) return { config: null, workspaceId: null };
    const { data: config, error } = await sbAny(context.supabase)
      .from("white_label_configs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (error) throw error;
    if (config) {
      delete config.custom_css;
      delete config.custom_js;
    }
    return { config: config ?? null, workspaceId };
  });

export const upsertWhiteLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => WhiteLabelSchema.extend({ workspaceId: z.string().uuid().optional().nullable() }).parse(input))
  .handler(async ({ data, context }) => {
    const { workspaceId: requested, ...changes } = data;
    const workspaceId = await requireActiveWorkspaceId(sbAny(context.supabase), context.userId, requested);
    const { data: isAdmin, error: adminError } = await context.supabase.rpc('is_workspace_admin', {
      _workspace_id: workspaceId,
      _user_id: context.userId,
    });
    if (adminError) throw adminError;
    if (!isAdmin) throw new Error('Only workspace owners and admins can manage customization');
    const { data: before } = await sbAny(context.supabase)
      .from("white_label_configs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    const domainChanged = changes.custom_domain !== undefined && changes.custom_domain !== before?.custom_domain;
    const pending: Record<string, unknown> = { ...changes };
    let saved: any = null;
    let error: any = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      ({ data: saved, error } = await sbAny(context.supabase)
        .from("white_label_configs")
        .upsert({ workspace_id: workspaceId, ...pending, ...(domainChanged ? { custom_domain_verified: false } : {}) }, { onConflict: "workspace_id" })
        .select("*")
        .maybeSingle());
      if (!error) break;
      const missing = /Could not find the '([^']+)' column of 'white_label_configs' in the schema cache/i.exec(error.message ?? "")?.[1];
      if (!missing || !["border_color", "foreground_color", "sidebar_border"].includes(missing)) break;
      if (pending[missing] != null) {
        throw new Error(`Database update required before saving ${missing.replaceAll("_", " ")}. Apply migration 20261014130000_white_label_border_colors.sql.`);
      }
      delete pending[missing];
    }
    if (error) throw error;

    // Record which colours changed, the resolved `--primary`, and the CSS
    // variables that move as a result.
    const { auditBrandingColorChange } = await import("./branding-audit.server");
    await auditBrandingColorChange({
      workspaceId,
      actorId: context.userId,
      before,
      after: saved,
    });

    if (saved) {
      delete saved.custom_css;
      delete saved.custom_js;
    }
    return { config: saved };
  });

export const verifyCustomDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ workspaceId: z.string().uuid().optional().nullable() }).parse(input ?? {}))
  .handler(async ({ data: input, context }) => {
    const workspaceId = await requireActiveWorkspaceId(sbAny(context.supabase), context.userId, input.workspaceId);
    const { data: isAdmin, error: adminError } = await context.supabase.rpc('is_workspace_admin', {
      _workspace_id: workspaceId,
      _user_id: context.userId,
    });
    if (adminError) throw adminError;
    if (!isAdmin) throw new Error('Only workspace owners and admins can verify domains');
    const { data: config, error: readError } = await sbAny(context.supabase)
      .from("white_label_configs")
      .select("custom_domain")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (readError) throw readError;
    const domain = config?.custom_domain as string | null | undefined;
    if (!domain) throw new Error("Save the custom domain before verifying it");
    const expected = `wacrm-verify=${workspaceId}`;
    let records: string[][];
    try {
      const { resolveTxt } = await import("node:dns/promises");
      records = await resolveTxt(`_wacrm.${domain}`);
    } catch {
      throw new Error(`No TXT record found for _wacrm.${domain}. DNS changes may take time to appear.`);
    }
    if (!records.some((parts) => parts.join("").trim() === expected)) {
      throw new Error(`TXT record _wacrm.${domain} must contain ${expected}`);
    }
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: claimed, error: claimError } = await sbAny(supabaseAdmin)
      .from("white_label_configs")
      .select("workspace_id")
      .ilike("custom_domain", domain)
      .eq("custom_domain_verified", true)
      .neq("workspace_id", workspaceId)
      .limit(1);
    if (claimError) throw claimError;
    if (claimed?.length) throw new Error("This domain is already verified for another workspace");
    const { data, error } = await sbAny(context.supabase)
      .from("white_label_configs")
      .update({ custom_domain_verified: true })
      .eq("workspace_id", workspaceId)
      .eq("custom_domain", domain)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("The domain changed before verification completed. Please retry.");
    return { config: data };
  });
