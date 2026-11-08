/**
 * Setup wizard server functions.
 *
 * Setup settings are writable only by the authenticated first super admin
 * before setup_complete is set. Post-setup edits use the Super Admin surface.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import { sbAny } from "@/lib/supabase/untyped";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SETUP_FLAG_KEY = "setup_complete";

async function readSetupStatus() {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

  const { data: roles, error: rolesError } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "superadmin")
    .limit(1);
  if (rolesError) throw new Error(`Unable to check super admin status: ${rolesError.message}`);
  const superAdminExists = (roles?.length ?? 0) > 0;

  const { data: setting, error: settingError } = await supabaseAdmin
    .from("settings")
    .select("value, updated_at")
    .eq("scope", "platform")
    .eq("key", SETUP_FLAG_KEY)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (settingError) throw new Error(`Unable to check setup status: ${settingError.message}`);
  const v = (setting?.value ?? null) as { complete?: boolean; completed_at?: string } | null;
  const setupComplete = !!v?.complete;
  const completedAt = v?.completed_at ?? setting?.updated_at ?? null;

  return { superAdminExists, setupComplete, completedAt };
}

async function assertSetupOpen() {
  const status = await readSetupStatus();
  if (status.setupComplete) {
    const err = new Error("Setup is already complete. Sign in as an administrator to change these settings.");
    (err as Error & { status?: number }).status = 423;
    throw err;
  }
  return status;
}

async function assertSetupAdmin(supabase: unknown, userId: string) {
  const status = await assertSetupOpen();
  if (!status.superAdminExists) throw new Error("Create or assign the first super admin before saving setup.");
  const { assertSuperAdmin } = await import("@/lib/admin/platform-guard.server");
  await assertSuperAdmin(supabase, userId);
  return status;
}

export const getSetupStatus = createServerFn({ method: "GET" }).handler(async () => {
  return readSetupStatus();
});

async function upsertPlatformSetting(key: string, value: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { error } = await sbAny(supabaseAdmin).from("settings").upsert(
    {
      scope: "platform",
      key,
      value: value as Json,
      organization_id: null,
      workspace_id: null,
      user_id: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "scope,organization_id,workspace_id,user_id,key" },
  );
  if (error) throw new Error(error.message);
}

const brandingSchema = z.object({
  app_name: z.string().trim().min(1).max(80),
  tagline: z.string().trim().max(200).optional().nullable(),
  primary_color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/u, "Must be a hex color like #3B82F6")
    .optional()
    .nullable(),
  logo_url: z.string().trim().url().max(2048).optional().nullable(),
  favicon_url: z.string().trim().url().max(2048).optional().nullable(),
});

export const saveSetupBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: z.input<typeof brandingSchema>) => brandingSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertSetupAdmin(context.supabase, context.userId);
    await upsertPlatformSetting("branding", {
      app_name: data.app_name,
      tagline: data.tagline ?? null,
      primary_color: data.primary_color ?? null,
      logo_url: data.logo_url ?? null,
      favicon_url: data.favicon_url ?? null,
    });
    return { ok: true };
  });

const systemConfigSchema = z.object({
  timezone: z.string().trim().min(1).max(80),
  currency: z.string().trim().length(3),
  date_format: z.enum(["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"]),
  language: z.string().trim().min(2).max(10),
  smtp: z
    .object({
      host: z.string().trim().max(200).optional().nullable(),
      port: z.number().int().min(1).max(65535).optional().nullable(),
      username: z.string().trim().max(200).optional().nullable(),
      from_email: z.string().trim().email().max(200).optional().nullable(),
      from_name: z.string().trim().max(200).optional().nullable(),
      secure: z.boolean().optional(),
    })
    .optional(),
  notifications: z
    .object({
      email_enabled: z.boolean().optional(),
      in_app_enabled: z.boolean().optional(),
    })
    .optional(),
});

export const saveSetupSystemConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: z.input<typeof systemConfigSchema>) => systemConfigSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertSetupAdmin(context.supabase, context.userId);
    await upsertPlatformSetting("localization", {
      timezone: data.timezone,
      currency: data.currency,
      date_format: data.date_format,
      language: data.language,
    });
    if (data.smtp) await upsertPlatformSetting("smtp", data.smtp as Record<string, unknown>);
    if (data.notifications)
      await upsertPlatformSetting("notifications", data.notifications as Record<string, unknown>);
    return { ok: true };
  });

const saasSchema = z.object({
  saas_enabled: z.boolean(),
  subscriptions_enabled: z.boolean(),
  default_plan: z.string().trim().max(40).optional().nullable(),
  multi_tenant: z.boolean(),
});

export const saveSetupSaas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: z.input<typeof saasSchema>) => saasSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertSetupAdmin(context.supabase, context.userId);
    await upsertPlatformSetting("billing", {
      saas_enabled: data.saas_enabled,
      subscriptions_enabled: data.subscriptions_enabled,
      default_plan: data.default_plan ?? null,
      multi_tenant: data.multi_tenant,
    });
    return { ok: true };
  });

export const completeSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSetupAdmin(context.supabase, context.userId);
    await upsertPlatformSetting(SETUP_FLAG_KEY, {
      complete: true,
      completed_at: new Date().toISOString(),
    });
    return { ok: true };
  });
