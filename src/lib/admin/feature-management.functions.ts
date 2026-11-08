/**
 * Super Admin — Dynamic Feature Management.
 * All state is persisted in public.settings under scope='platform':
 *  - key='feature_registry'      → registry of feature flags
 *  - key='module_visibility'     → per-module visibility
 *  - key='feature_tenant_overrides' → { [org_id]: { [feature]: boolean } }
 *  - key='feature_plan_overrides'   → { [plan_code]: { [feature]: boolean } }
 *  - key='license_registry'      → { [license_key]: LicenseRecord }
 *  - key='license_logs'          → append-only event list (truncated to 500)
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { sbAny } from "@/lib/supabase/untyped";

export type FeatureTier = "stable" | "beta" | "premium" | "enterprise";
export type FeatureRecord = {
  key: string;
  label: string;
  description?: string;
  module: string;
  tier: FeatureTier;
  enabled: boolean;
  rollout_pct: number; // 0..100
  version: string;
  updated_at: string;
  updated_by?: string;
};
export type ModuleVisibility = {
  module: string;
  visible: boolean;
  min_tier: FeatureTier;
  updated_at: string;
};
export type LicenseStatus = "active" | "revoked" | "expired" | "pending";
export type LicenseRecord = {
  key: string;
  product: string;
  organization_id?: string | null;
  seats: number;
  status: LicenseStatus;
  activated_at?: string | null;
  revoked_at?: string | null;
  expires_at?: string | null;
  notes?: string;
};
export type LicenseLog = {
  ts: string;
  action: "activate" | "revoke" | "validate" | "issue" | "expire" | "update";
  license_key: string;
  actor?: string;
  ok: boolean;
  message?: string;
};

const REG_KEY = "feature_registry";
const MOD_KEY = "module_visibility";
const TEN_KEY = "feature_tenant_overrides";
const PLAN_KEY = "feature_plan_overrides";
const LIC_KEY = "license_registry";
const LOG_KEY = "license_logs";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readSetting<T>(admin: any, key: string, fallback: T): Promise<T> {
  const { data, error } = await admin
    .from("settings")
    .select("value")
    .eq("scope", "platform")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.value as T) ?? fallback;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function writeSetting(admin: any, key: string, value: unknown) {
  const { error } = await sbAny(admin)
    .from("settings")
    .upsert(
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function appendLog(admin: any, entry: LicenseLog) {
  const logs = await readSetting<LicenseLog[]>(admin, LOG_KEY, []);
  const next = [entry, ...logs].slice(0, 500);
  await writeSetting(admin, LOG_KEY, next);
}

/**
 * `audit_logs.action` is a narrow enum (`create` | `update` | `delete` |
 * `login` | `logout` | `invite` | `revoke` | `export` | `access`) — it does
 * NOT include free-form strings like "admin.action". That value silently
 * violated the enum and the insert always failed (swallowed below), so no
 * feature-management action was ever actually recorded. Map the detailed
 * action name onto the closest valid enum value instead; the detailed name
 * is preserved in `changes.platform_action` for the audit viewer.
 */
function toAuditAction(action: string): "create" | "update" | "delete" | "revoke" | "export" {
  if (action.includes("delete")) return "delete";
  if (action.includes("revoke")) return "revoke";
  if (action.includes("activate") || action.includes("upsert")) return "create";
  return "update";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function audit(
  admin: any,
  actor: string,
  action: string,
  resourceId: string,
  meta: Record<string, unknown>,
) {
  await admin
    .from("audit_logs")
    .insert({
      actor_id: actor,
      action: toAuditAction(action) as never,
      resource_type: "feature_management",
      resource_id: resourceId,
      changes: { platform_action: action, ...meta },
      metadata: { source: "super_admin" },
    })
    .then(
      () => undefined,
      () => undefined,
    );
}

// ============================================================================
// READ
// ============================================================================

export const getFeatureManagementState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const [registry, modules, tenantOverrides, planOverrides, licenses, logs, orgs, plans] =
      await Promise.all([
        readSetting<Record<string, FeatureRecord>>(supabaseAdmin, REG_KEY, {}),
        readSetting<Record<string, ModuleVisibility>>(supabaseAdmin, MOD_KEY, {}),
        readSetting<Record<string, Record<string, boolean>>>(supabaseAdmin, TEN_KEY, {}),
        readSetting<Record<string, Record<string, boolean>>>(supabaseAdmin, PLAN_KEY, {}),
        readSetting<Record<string, LicenseRecord>>(supabaseAdmin, LIC_KEY, {}),
        readSetting<LicenseLog[]>(supabaseAdmin, LOG_KEY, []),
        sbAny(supabaseAdmin)
          .from("organizations")
          .select("id, name, slug")
          .order("name")
          .limit(200),
        sbAny(supabaseAdmin).from("plans").select("code, name, tier").order("sort_order").limit(50),
      ]);
    return {
      registry,
      modules,
      tenantOverrides,
      planOverrides,
      licenses,
      logs,
      organizations: orgs.data ?? [],
      plans: plans.data ?? [],
    };
  });

// ============================================================================
// FEATURE REGISTRY
// ============================================================================

export const upsertFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      key: string;
      label: string;
      description?: string;
      module: string;
      tier: FeatureTier;
      enabled: boolean;
      rollout_pct: number;
      version: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const role = await assertPlatformStaff(context.supabase, context.userId);
    if (role !== "superadmin") throw new Error("Only superadmin can modify features");
    if (!/^[a-z0-9_.-]{2,80}$/.test(data.key)) throw new Error("Invalid feature key");
    const pct = Math.max(0, Math.min(100, Math.round(data.rollout_pct)));
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const registry = await readSetting<Record<string, FeatureRecord>>(supabaseAdmin, REG_KEY, {});
    const previous = registry[data.key];
    registry[data.key] = {
      key: data.key,
      label: data.label,
      description: data.description,
      module: data.module,
      tier: data.tier,
      enabled: data.enabled,
      rollout_pct: pct,
      version: data.version,
      updated_at: new Date().toISOString(),
      updated_by: context.userId,
    };
    await writeSetting(supabaseAdmin, REG_KEY, registry);
    await audit(supabaseAdmin, context.userId, "feature.upsert", data.key, {
      previous,
      next: registry[data.key],
    });
    return { ok: true };
  });

export const deleteFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { key: string }) => input)
  .handler(async ({ data, context }) => {
    const role = await assertPlatformStaff(context.supabase, context.userId);
    if (role !== "superadmin") throw new Error("Only superadmin can delete features");
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const registry = await readSetting<Record<string, FeatureRecord>>(supabaseAdmin, REG_KEY, {});
    delete registry[data.key];
    await writeSetting(supabaseAdmin, REG_KEY, registry);
    await audit(supabaseAdmin, context.userId, "feature.delete", data.key, {});
    return { ok: true };
  });

// ============================================================================
// MODULE VISIBILITY
// ============================================================================

export const setModuleVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { module: string; visible: boolean; min_tier: FeatureTier }) => input)
  .handler(async ({ data, context }) => {
    const role = await assertPlatformStaff(context.supabase, context.userId);
    if (role !== "superadmin") throw new Error("Only superadmin can change module visibility");
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const modules = await readSetting<Record<string, ModuleVisibility>>(supabaseAdmin, MOD_KEY, {});
    modules[data.module] = {
      module: data.module,
      visible: data.visible,
      min_tier: data.min_tier,
      updated_at: new Date().toISOString(),
    };
    await writeSetting(supabaseAdmin, MOD_KEY, modules);
    await audit(supabaseAdmin, context.userId, "module.visibility", data.module, data);
    return { ok: true };
  });

// ============================================================================
// OVERRIDES (Tenant + Plan)
// ============================================================================

export const setTenantOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { organization_id: string; feature_key: string; enabled: boolean | null }) => input,
  )
  .handler(async ({ data, context }) => {
    const role = await assertPlatformStaff(context.supabase, context.userId);
    if (role !== "superadmin") throw new Error("Only superadmin can set overrides");
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const map = await readSetting<Record<string, Record<string, boolean>>>(
      supabaseAdmin,
      TEN_KEY,
      {},
    );
    const bucket = map[data.organization_id] ?? {};
    if (data.enabled === null) delete bucket[data.feature_key];
    else bucket[data.feature_key] = data.enabled;
    if (Object.keys(bucket).length === 0) delete map[data.organization_id];
    else map[data.organization_id] = bucket;
    await writeSetting(supabaseAdmin, TEN_KEY, map);
    await audit(supabaseAdmin, context.userId, "override.tenant", data.organization_id, data);
    return { ok: true };
  });

export const setPlanOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { plan_code: string; feature_key: string; enabled: boolean | null }) => input)
  .handler(async ({ data, context }) => {
    const role = await assertPlatformStaff(context.supabase, context.userId);
    if (role !== "superadmin") throw new Error("Only superadmin can set overrides");
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const map = await readSetting<Record<string, Record<string, boolean>>>(
      supabaseAdmin,
      PLAN_KEY,
      {},
    );
    const bucket = map[data.plan_code] ?? {};
    if (data.enabled === null) delete bucket[data.feature_key];
    else bucket[data.feature_key] = data.enabled;
    if (Object.keys(bucket).length === 0) delete map[data.plan_code];
    else map[data.plan_code] = bucket;
    await writeSetting(supabaseAdmin, PLAN_KEY, map);
    await audit(supabaseAdmin, context.userId, "override.plan", data.plan_code, data);
    return { ok: true };
  });

// ============================================================================
// LICENSING
// ============================================================================

function generateKey() {
  const seg = () => Math.random().toString(36).slice(2, 7).toUpperCase();
  return `LIC-${seg()}-${seg()}-${seg()}-${seg()}`;
}

export const activateLicense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      key?: string;
      product: string;
      organization_id?: string | null;
      seats: number;
      expires_at?: string | null;
      notes?: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const role = await assertPlatformStaff(context.supabase, context.userId);
    if (role !== "superadmin") throw new Error("Only superadmin can issue licenses");
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const licenses = await readSetting<Record<string, LicenseRecord>>(supabaseAdmin, LIC_KEY, {});
    const key = data.key && data.key.trim().length > 0 ? data.key.trim() : generateKey();
    const record: LicenseRecord = {
      key,
      product: data.product,
      organization_id: data.organization_id ?? null,
      seats: Math.max(1, Math.floor(data.seats || 1)),
      status: "active",
      activated_at: new Date().toISOString(),
      revoked_at: null,
      expires_at: data.expires_at ?? null,
      notes: data.notes,
    };
    licenses[key] = record;
    await writeSetting(supabaseAdmin, LIC_KEY, licenses);
    await appendLog(supabaseAdmin, {
      ts: new Date().toISOString(),
      action: "activate",
      license_key: key,
      actor: context.userId,
      ok: true,
      message: `Activated ${data.seats} seats for ${data.product}`,
    });
    await audit(
      supabaseAdmin,
      context.userId,
      "license.activate",
      key,
      record as unknown as Record<string, unknown>,
    );
    return { ok: true, key, license: record };
  });

export const revokeLicense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { key: string; reason?: string }) => input)
  .handler(async ({ data, context }) => {
    const role = await assertPlatformStaff(context.supabase, context.userId);
    if (role !== "superadmin") throw new Error("Only superadmin can revoke licenses");
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const licenses = await readSetting<Record<string, LicenseRecord>>(supabaseAdmin, LIC_KEY, {});
    const record = licenses[data.key];
    if (!record) throw new Error("License not found");
    record.status = "revoked";
    record.revoked_at = new Date().toISOString();
    licenses[data.key] = record;
    await writeSetting(supabaseAdmin, LIC_KEY, licenses);
    await appendLog(supabaseAdmin, {
      ts: new Date().toISOString(),
      action: "revoke",
      license_key: data.key,
      actor: context.userId,
      ok: true,
      message: data.reason ?? "Revoked by admin",
    });
    await audit(supabaseAdmin, context.userId, "license.revoke", data.key, { reason: data.reason });
    return { ok: true };
  });

export const validateLicense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { key: string }) => input)
  .handler(async ({ data, context }) => {
    await assertPlatformStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const licenses = await readSetting<Record<string, LicenseRecord>>(supabaseAdmin, LIC_KEY, {});
    const record = licenses[data.key];
    const now = new Date();
    let ok = false;
    let message = "";
    if (!record) message = "License not found";
    else if (record.status === "revoked") message = "License revoked";
    else if (record.expires_at && new Date(record.expires_at) < now) {
      message = "License expired";
      record.status = "expired";
      licenses[data.key] = record;
      await writeSetting(supabaseAdmin, LIC_KEY, licenses);
    } else {
      ok = true;
      message = "License valid";
    }
    await appendLog(supabaseAdmin, {
      ts: new Date().toISOString(),
      action: "validate",
      license_key: data.key,
      actor: context.userId,
      ok,
      message,
    });
    return { ok, message, license: record ?? null };
  });
