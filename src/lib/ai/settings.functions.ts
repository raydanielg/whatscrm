/**
 * AI Settings — workspace-level configuration for AI behavior.
 * Owner/admin only for writes; members can read.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sbAny } from "@/lib/supabase/untyped";
import { appChatModelDetails, appChatModelIds, isChatModelId } from "@/lib/ai/model-kind";

export interface AiSettings {
  workspace_id: string;
  default_provider_id: string | null;
  default_model: string | null;
  temperature: number;
  max_tokens: number;
  organization_prompt: string | null;
  workspace_prompt: string | null;
  system_prompt: string | null;
  allowed_roles: string[];
  daily_request_limit: number | null;
  monthly_request_limit: number | null;
  daily_token_limit: number | null;
  monthly_token_limit: number | null;
  monthly_cost_limit_usd: number | null;
  per_user_daily_limit: number | null;
  moderation_enabled: boolean;
  moderation_blocklist: string[];
  moderation_categories: string[];
  redact_pii: boolean;
  log_prompts: boolean;
  log_responses: boolean;
  retention_days: number;
  audit_enabled: boolean;
  training_opt_out: boolean;
  config: Record<string, any>;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiSettingsQuotaUsage {
  todayRequests: number;
  todayTokens: number;
  todayCostUsd: number;
  monthRequests: number;
  monthTokens: number;
  monthCostUsd: number;
}

const DEFAULTS: Omit<AiSettings, "workspace_id" | "created_at" | "updated_at"> = {
  default_provider_id: null,
  default_model: null,
  temperature: 0.7,
  max_tokens: 1024,
  organization_prompt: null,
  workspace_prompt: null,
  system_prompt: null,
  allowed_roles: ["owner", "admin", "member"],
  daily_request_limit: null,
  monthly_request_limit: null,
  daily_token_limit: null,
  monthly_token_limit: null,
  monthly_cost_limit_usd: null,
  per_user_daily_limit: null,
  moderation_enabled: true,
  moderation_blocklist: [],
  moderation_categories: ["hate", "sexual", "violence", "self_harm"],
  redact_pii: true,
  log_prompts: true,
  log_responses: true,
  retention_days: 90,
  audit_enabled: true,
  training_opt_out: true,
  config: {},
  updated_by: null,
};

/** Read settings without requiring a member to create the first row. */
export const getAiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<AiSettings> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = sbAny(context.supabase);
    const existing = await sbAny(db)
      .from("ai_settings")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) return existing.data as AiSettings;
    return {
      workspace_id: data.workspaceId,
      ...DEFAULTS,
      created_at: "",
      updated_at: "",
    };
  });

const settingsPatchSchema = z
  .object({
    default_provider_id: z.string().uuid().nullable().optional(),
    default_model: z.string().max(200).nullable().optional(),
    temperature: z.number().min(0).max(2).optional(),
    max_tokens: z.number().int().min(1).max(200000).optional(),
    organization_prompt: z.string().max(8000).nullable().optional(),
    workspace_prompt: z.string().max(8000).nullable().optional(),
    system_prompt: z.string().max(8000).nullable().optional(),
    allowed_roles: z.array(z.string()).max(20).optional(),
    daily_request_limit: z.number().int().min(0).nullable().optional(),
    monthly_request_limit: z.number().int().min(0).nullable().optional(),
    daily_token_limit: z.number().int().min(0).nullable().optional(),
    monthly_token_limit: z.number().int().min(0).nullable().optional(),
    monthly_cost_limit_usd: z.number().min(0).nullable().optional(),
    per_user_daily_limit: z.number().int().min(0).nullable().optional(),
    moderation_enabled: z.boolean().optional(),
    moderation_blocklist: z.array(z.string().max(200)).max(500).optional(),
    moderation_categories: z.array(z.string().max(50)).max(20).optional(),
    redact_pii: z.boolean().optional(),
    log_prompts: z.boolean().optional(),
    log_responses: z.boolean().optional(),
    retention_days: z.number().int().min(1).max(3650).optional(),
    audit_enabled: z.boolean().optional(),
    training_opt_out: z.boolean().optional(),
  })
  .strict();

export const updateAiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        patch: settingsPatchSchema,
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<AiSettings> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = sbAny(context.supabase);

    // Ensure row exists
    const existing = await sbAny(db)
      .from("ai_settings")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (!existing.data) {
      const seed = await db
        .from("ai_settings")
        .insert({ workspace_id: data.workspaceId, ...DEFAULTS })
        .select("*")
        .single();
      if (seed.error) throw new Error(seed.error.message);
      existing.data = seed.data;
    }

    const prev = existing.data as AiSettings;
    if ("default_provider_id" in data.patch || "default_model" in data.patch) {
      const nextProviderId =
        data.patch.default_provider_id === undefined
          ? prev.default_provider_id
          : data.patch.default_provider_id;
      const nextModel =
        data.patch.default_model === undefined ? prev.default_model : data.patch.default_model;
      if (nextProviderId) {
        const { data: provider } = await db
          .from("ai_providers")
          .select("id, kind")
          .eq("id", nextProviderId)
          .eq("workspace_id", data.workspaceId)
          .eq("enabled", true)
          .maybeSingle();
        if (!provider) throw new Error("Choose an enabled provider in this workspace");
        if (nextModel) {
          const { data: model } = await db
            .from("ai_models")
            .select("model_id")
            .eq("provider_id", nextProviderId)
            .eq("model_id", nextModel)
            .eq("enabled", true)
            .maybeSingle();
          const allowed = appChatModelIds(provider.kind);
          if (!model || (allowed ? !allowed.includes(nextModel) : !isChatModelId(nextModel))) {
            throw new Error("Choose a supported chat model for the selected provider");
          }
        }
      }
    }
    const patch = { ...data.patch, updated_by: context.userId };
    const upd = await db
      .from("ai_settings")
      .update(patch)
      .eq("workspace_id", data.workspaceId)
      .select("*")
      .single();
    if (upd.error) throw new Error(upd.error.message);

    // Diff for audit log
    const changes: Record<string, { from: any; to: any }> = {};
    for (const [k, v] of Object.entries(data.patch)) {
      const before = (prev as any)[k];
      if (JSON.stringify(before) !== JSON.stringify(v)) {
        changes[k] = { from: before, to: v };
      }
    }
    if (Object.keys(changes).length && prev.audit_enabled) {
      await sbAny(db).from("ai_audit_logs").insert({
        workspace_id: data.workspaceId,
        actor_id: context.userId,
        action: "settings.update",
        target: "ai_settings",
        changes,
      });
    }
    return upd.data as AiSettings;
  });

export const getAiQuotaUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<AiSettingsQuotaUsage> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = context.supabase as any;
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 8) + "01";
    const rows = await db
      .from("ai_usage_daily")
      .select("day, requests, total_tokens, cost_usd")
      .eq("workspace_id", data.workspaceId)
      .gte("day", monthStart);
    let todayRequests = 0,
      todayTokens = 0,
      todayCost = 0;
    let monthRequests = 0,
      monthTokens = 0,
      monthCost = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (rows.data ?? []) as any[]) {
      monthRequests += r.requests || 0;
      monthTokens += Number(r.total_tokens || 0);
      monthCost += Number(r.cost_usd || 0);
      if (String(r.day).slice(0, 10) === today) {
        todayRequests += r.requests || 0;
        todayTokens += Number(r.total_tokens || 0);
        todayCost += Number(r.cost_usd || 0);
      }
    }
    return {
      todayRequests,
      todayTokens,
      todayCostUsd: Math.round(todayCost * 10000) / 10000,
      monthRequests,
      monthTokens,
      monthCostUsd: Math.round(monthCost * 10000) / 10000,
    };
  });

export interface AiAuditLogEntry {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  target: string | null;
  changes: Record<string, any> | null;
  created_at: string;
}

export const listAiAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        limit: z.number().int().min(1).max(200).optional().default(50),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<AiAuditLogEntry[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = context.supabase as any;
    const rows = await db
      .from("ai_audit_logs")
      .select("id, actor_id, action, target, changes, created_at")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = (rows.data ?? []) as any[];
    const actorIds = Array.from(new Set(list.map((r) => r.actor_id).filter(Boolean))) as string[];
    const profileMap = new Map<string, string>();
    if (actorIds.length) {
      const profs = await sbAny(db)
        .from("profiles")
        .select("id, full_name, email")
        .in("id", actorIds);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const p of (profs.data ?? []) as any[]) {
        profileMap.set(p.id, p.full_name || p.email || "User");
      }
    }
    return list.map((r) => ({
      id: r.id,
      actor_id: r.actor_id,
      actor_name: r.actor_id ? (profileMap.get(r.actor_id) ?? "User") : null,
      action: r.action,
      target: r.target,
      changes: r.changes,
      created_at: r.created_at,
    }));
  });

/* ------------------------------------------------ AI business context */

/**
 * Free-text description of the business (products, policies, tone) that the
 * AI reply assistant injects into its system prompt. Stored in `settings` as
 * scope='workspace', key='ai_business_context', value={ text }.
 * Read: any workspace member. Write: active workspace owner/admin (mirrors the
 * settings RLS policy so callers get a clear error instead of an RLS failure).
 */
export const AI_BUSINESS_CONTEXT_MAX = 4000;

export interface AiBusinessContext {
  workspaceId: string;
  text: string;
  canEdit: boolean;
  updatedAt: string | null;
}

/** Normalize settings.value (jsonb) — accepts a plain string or { text } / { value }. */
export function readBusinessContextValue(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const o = raw as { text?: unknown; value?: unknown };
    const v = o.text ?? o.value;
    return typeof v === "string" ? v : "";
  }
  return "";
}

async function loadMembership(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  workspaceId: string,
  userId: string,
): Promise<{ role?: string; status?: string } | null> {
  const { data } = await supabase
    .from("workspace_members")
    .select("role, status")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data ?? null) as { role?: string; status?: string } | null;
}

function isActiveAdmin(m: { role?: string; status?: string } | null): boolean {
  return !!m && m.status === "active" && ["owner", "admin"].includes(m.role ?? "");
}

export const getAiBusinessContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiBusinessContext> => {
    const { supabase, userId } = context;
    const { resolveActiveWorkspaceId } = await import("@/lib/auth/active-workspace.server");
    const workspaceId = await resolveActiveWorkspaceId(supabase, userId);
    if (!workspaceId) throw new Error("No active workspace");
    const member = await loadMembership(supabase, workspaceId, userId);
    if (!member) throw new Error("You are not a member of this workspace");
    const { data: row, error } = await sbAny(supabase)
      .from("settings")
      .select("value, updated_at")
      .eq("scope", "workspace")
      .eq("workspace_id", workspaceId)
      .is("user_id", null)
      .eq("key", "ai_business_context")
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const r = row as { value?: unknown; updated_at?: string | null } | null;
    return {
      workspaceId,
      text: readBusinessContextValue(r?.value),
      canEdit: isActiveAdmin(member),
      updatedAt: r?.updated_at ?? null,
    };
  });

export const saveAiBusinessContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        text: z
          .string()
          .max(
            AI_BUSINESS_CONTEXT_MAX,
            `Business context must be ${AI_BUSINESS_CONTEXT_MAX} characters or fewer`,
          )
          .transform((s) => s.trim()),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<AiBusinessContext> => {
    const { supabase, userId } = context;
    const { resolveActiveWorkspaceId } = await import("@/lib/auth/active-workspace.server");
    const workspaceId = await resolveActiveWorkspaceId(supabase, userId);
    if (!workspaceId) throw new Error("No active workspace");
    const member = await loadMembership(supabase, workspaceId, userId);
    if (!isActiveAdmin(member)) {
      throw new Error("Only workspace owners and admins can change the AI business context");
    }
    // organization_id / user_id are explicit NULLs so the row matches the
    // NULLS NOT DISTINCT unique key and the upsert updates in place.
    const { data: saved, error } = await sbAny(supabase)
      .from("settings")
      .upsert(
        {
          scope: "workspace",
          organization_id: null,
          workspace_id: workspaceId,
          user_id: null,
          key: "ai_business_context",
          value: { text: data.text },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "scope,organization_id,workspace_id,user_id,key" },
      )
      .select("value, updated_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    const r = saved as { value?: unknown; updated_at?: string | null } | null;
    return {
      workspaceId,
      text: readBusinessContextValue(r?.value ?? { text: data.text }),
      canEdit: true,
      updatedAt: r?.updated_at ?? null,
    };
  });

export interface AiSettingsOption {
  id: string;
  name: string;
  kind: string;
  isDefault: boolean;
  credentialSource: "platform" | "workspace";
  keyLast4: string | null;
  canManageByok: boolean;
  models: { id: string; label: string }[];
}

export const listAiProviderOptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<AiSettingsOption[]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = context.supabase as any;
    const provs = await db
      .from("ai_providers")
      .select("id, kind, name, enabled, is_default, credential_source, api_key_last4")
      .eq("workspace_id", data.workspaceId)
      .order("priority", { ascending: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = ((provs.data ?? []) as any[]).filter((p) => p.enabled);
    if (!list.length) return [];
    const ids = list.map((p) => p.id);
    const models = await db
      .from("ai_models")
      .select("provider_id, model_id, display_name, enabled")
      .in("provider_id", ids);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modelList = ((models.data ?? []) as any[]).filter((m) => m.enabled);
    const membership = await loadMembership(db, data.workspaceId, context.userId);
    const canManageByok = isActiveAdmin(membership);
    return list.map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      isDefault: Boolean(p.is_default),
      credentialSource: p.credential_source === "workspace" ? "workspace" : "platform",
      keyLast4: p.api_key_last4 ?? null,
      canManageByok,
      models: modelList
        .filter(
          (m) =>
            m.provider_id === p.id &&
            (appChatModelIds(p.kind)?.includes(m.model_id) ?? isChatModelId(m.model_id)),
        )
        .map((m) => ({ id: m.model_id, label: m.display_name || m.model_id })),
    }));
  });

const byokInput = z.object({
  workspaceId: z.string().uuid(),
  kind: z.enum(["openai", "gemini"]),
  apiKey: z.string().trim().min(12).max(500),
  organizationId: z.string().trim().max(200).optional(),
});

/** Create or rotate the current workspace's encrypted tenant-owned API key. */
export const saveTenantAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => byokInput.parse(v))
  .handler(async ({ data, context }): Promise<{ providerId: string }> => {
    const db = sbAny(context.supabase);
    const member = await loadMembership(db, data.workspaceId, context.userId);
    if (!isActiveAdmin(member)) {
      throw new Error("Only workspace owners and admins can manage tenant API keys");
    }
    const { data: providerId, error } = await db.rpc("set_workspace_ai_provider_byok", {
      p_workspace_id: data.workspaceId,
      p_kind: data.kind,
      p_name: `${data.kind === "openai" ? "OpenAI" : "Gemini"} (Workspace BYOK)`,
      p_api_key: data.apiKey,
      p_base_url:
        data.kind === "openai"
          ? "https://api.openai.com/v1"
          : "https://generativelanguage.googleapis.com/v1beta",
      p_organization_id: data.organizationId || null,
    });
    if (error || typeof providerId !== "string") {
      throw new Error(error?.message ?? "Failed to save the encrypted API key");
    }

    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const adminDb = sbAny(supabaseAdmin);
    const allowed = appChatModelIds(data.kind) ?? [];
    const { data: existing } = await adminDb
      .from("ai_models")
      .select("id, model_id")
      .eq("provider_id", providerId);
    const staleIds = ((existing ?? []) as { id: string; model_id: string }[])
      .filter((row) => !allowed.includes(row.model_id))
      .map((row) => row.id);
    if (staleIds.length) await adminDb.from("ai_models").delete().in("id", staleIds);
    if (allowed.length) {
      const models = allowed.map((modelId, index) => {
        const details = appChatModelDetails(modelId);
        return {
          provider_id: providerId,
          model_id: modelId,
          display_name: details ? `${details.label} · ${details.tier}` : modelId,
          input_cost_per_1k: details?.inputCostPer1k ?? 0,
          output_cost_per_1k: details?.outputCostPer1k ?? 0,
          enabled: true,
          is_default: index === 0,
          sort_order: index * 10,
        };
      });
      const saved = await adminDb
        .from("ai_models")
        .upsert(models, { onConflict: "provider_id,model_id" });
      if (saved.error) throw new Error(saved.error.message);
    }
    // A tenant adding their own key almost always means "use my key, not the
    // platform's" — without this, AI calls keep routing through whichever
    // provider was previously selected as default (often a platform key with
    // no credits left), and the new BYOK key silently never gets used.
    await adminDb
      .from("ai_settings")
      .update({ default_provider_id: providerId, updated_at: new Date().toISOString() })
      .eq("workspace_id", data.workspaceId);

    await sbAny(db)
      .from("ai_audit_logs")
      .insert({
        workspace_id: data.workspaceId,
        actor_id: context.userId,
        action: "provider.byok_saved",
        target: data.kind,
        changes: { credential: { from: "hidden", to: "rotated" } },
      });
    return { providerId };
  });

export const deleteTenantAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({ workspaceId: z.string().uuid(), providerId: z.string().uuid() }).parse(v),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const db = sbAny(context.supabase);
    const member = await loadMembership(db, data.workspaceId, context.userId);
    if (!isActiveAdmin(member)) {
      throw new Error("Only workspace owners and admins can manage tenant API keys");
    }
    const { error } = await db.rpc("delete_workspace_ai_provider_byok", {
      p_workspace_id: data.workspaceId,
      p_provider_id: data.providerId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
