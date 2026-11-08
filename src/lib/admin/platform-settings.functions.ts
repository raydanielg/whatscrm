/**
 * Super Admin — Platform-scope settings.
 * All keys are stored in public.settings with scope='platform'.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { validatePlatformSettingValue } from "@/lib/admin/platform-settings-validation";



// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertPlatformStaff(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["superadmin", "support"]);
  if (error) throw new Error("Unable to verify platform role");
  if (!data || data.length === 0) throw new Error("Forbidden: platform staff only");
  return data[0].role as "superadmin" | "support";
}

export const PLATFORM_SETTING_KEYS = [
  "general",
  "branding",
  "localization",
  "smtp",
  "storage",
  "security",
  "authentication",
  "billing",
  "payments",
  "whatsapp",
  "api",
  "notifications",
  "email_templates",
  "maintenance",
  "feature_flags",
  "pwa",
  "analytics",
] as const;
export type PlatformSettingKey = (typeof PLATFORM_SETTING_KEYS)[number];

export const getPlatformSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data, error } = await supabaseAdmin
      .from("settings")
      .select("key, value, updated_at")
      .eq("scope", "platform");
    if (error) throw new Error(error.message);
    const map: Record<string, { value: Json; updated_at: string }> = {};
    (data ?? []).forEach((r) => {
      map[r.key] = { value: (r.value ?? {}) as Json, updated_at: r.updated_at };
    });
    return map;
  });

export const updatePlatformSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { key: PlatformSettingKey; value: Record<string, unknown> }) => input)
  .handler(async ({ data, context }) => {
    const role = await assertPlatformStaff(context.supabase, context.userId);
    if (role !== "superadmin") throw new Error("Only superadmin can change platform settings");
    if (!PLATFORM_SETTING_KEYS.includes(data.key)) throw new Error("Unknown setting key");
    const value = validatePlatformSettingValue(data.key, data.value);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

    const { error } = await supabaseAdmin
      .from("settings")
      .upsert(
        { scope: "platform", key: data.key, value: value as Json, organization_id: null, workspace_id: null, user_id: null, updated_at: new Date().toISOString() },
        { onConflict: "scope,organization_id,workspace_id,user_id,key" },
      );
    if (error) throw new Error(error.message);

    await supabaseAdmin
      .from("audit_logs")
      .insert({
        actor_id: context.userId,
        action: "admin.action" as never,
        resource_type: "platform_setting",
        resource_id: data.key,
        changes: { platform_action: "settings.update", key: data.key },
        metadata: { source: "super_admin" },
      })
      .then(() => undefined, () => undefined);

    return { ok: true };
  });
