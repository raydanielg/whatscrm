/**
 * AI configuration server functions — CRUD for providers, models, feature
 * configs, and prompts, plus health-check runners.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { AIProviderKind } from "./types";
import { getAIProvider, listProviderKinds, resolveProviderCredentials } from "./registry.server";
import { AIError } from "./errors";
import { sbAny } from "@/lib/supabase/untyped";

// --------- Serializable return shapes (avoid Record<string,unknown>) ---------

export interface AIProviderRow {
  id: string;
  workspace_id: string;
  kind: AIProviderKind;
  name: string;
  base_url: string | null;
  api_key_secret_name: string | null;
  organization_id: string | null;
  enabled: boolean;
  is_default: boolean;
  priority: number;
  config: string; // stringified jsonb — the client parses when needed
  created_at: string;
  updated_at: string;
  health_status?: string | null;
  health_last_check?: string | null;
  health_last_error?: string | null;
  health_latency_ms?: number | null;
  model_count?: number;
}

export interface AIModelRow {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string;
  capabilities: string;
  context_window: number | null;
  max_output_tokens: number | null;
  input_cost_per_1k: number;
  output_cost_per_1k: number;
  enabled: boolean;
  is_default: boolean;
}

export interface AIFeatureConfigRow {
  id: string;
  workspace_id: string;
  feature: string;
  provider_id: string | null;
  fallback_provider_ids: string[];
  model: string | null;
  temperature: number | null;
  max_tokens: number | null;
  system_prompt: string | null;
  enabled: boolean;
  config: string;
}

export interface AIPromptRow {
  id: string;
  workspace_id: string;
  key: string;
  name: string;
  description: string | null;
  template: string;
  variables: string[];
  system_prompt: string | null;
  category: string | null;
  version: number;
  is_active: boolean;
}

export interface AIUsageDailyRow {
  workspace_id: string;
  day: string;
  provider_id: string | null;
  model: string;
  requests: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  errors: number;
}

export interface AIRequestLogRow {
  id: string;
  workspace_id: string;
  user_id: string | null;
  provider_id: string | null;
  provider_kind: string | null;
  model: string | null;
  operation: string;
  feature: string | null;
  status: string;
  http_status: number | null;
  latency_ms: number | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  error_type: string | null;
  error_message: string | null;
  created_at: string;
}

const providerKind = z.enum([
  "lovable",
  "openai",
  "gemini",
  "anthropic",
  "deepseek",
  "grok",
  "openrouter",
  "ollama",
  "lmstudio",
  "custom_openai",
]);

function serializeConfig(c: unknown): string {
  try {
    return JSON.stringify(c ?? {});
  } catch {
    return "{}";
  }
}

async function getWorkspaceId(userId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data } = await sbAny(supabaseAdmin)
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("No workspace found for current user");
  return (data as { workspace_id: string }).workspace_id;
}

async function assertPlatformSuperAdmin(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "superadmin")
    .maybeSingle();
  if (error || !data) throw new Error("Platform super admin permission required");
}

function normalizeProvider(row: unknown): AIProviderRow {
  const r = row as Record<string, unknown>;
  const health = (r.ai_provider_health as Array<Record<string, unknown>> | undefined)?.[0] ?? null;
  const models = r.ai_models as Array<{ count: number }> | undefined;
  return {
    id: r.id as string,
    workspace_id: r.workspace_id as string,
    kind: r.kind as AIProviderKind,
    name: r.name as string,
    base_url: (r.base_url as string | null) ?? null,
    api_key_secret_name: (r.api_key_secret_name as string | null) ?? null,
    organization_id: (r.organization_id as string | null) ?? null,
    enabled: r.enabled as boolean,
    is_default: r.is_default as boolean,
    priority: (r.priority as number) ?? 100,
    config: serializeConfig(r.config),
    created_at: (r.created_at as string) ?? "",
    updated_at: (r.updated_at as string) ?? "",
    health_status: (health?.status as string | null) ?? null,
    health_last_check: (health?.last_check_at as string | null) ?? null,
    health_last_error: (health?.last_error as string | null) ?? null,
    health_latency_ms: (health?.latency_ms as number | null) ?? null,
    model_count: models?.[0]?.count ?? 0,
  };
}

function normalizeModel(row: unknown): AIModelRow {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    provider_id: r.provider_id as string,
    model_id: r.model_id as string,
    display_name: r.display_name as string,
    capabilities: serializeConfig(r.capabilities),
    context_window: (r.context_window as number | null) ?? null,
    max_output_tokens: (r.max_output_tokens as number | null) ?? null,
    input_cost_per_1k: Number(r.input_cost_per_1k ?? 0),
    output_cost_per_1k: Number(r.output_cost_per_1k ?? 0),
    enabled: r.enabled as boolean,
    is_default: r.is_default as boolean,
  };
}

function normalizeFeatureConfig(row: unknown): AIFeatureConfigRow {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    workspace_id: r.workspace_id as string,
    feature: r.feature as string,
    provider_id: (r.provider_id as string | null) ?? null,
    fallback_provider_ids: (r.fallback_provider_ids as string[]) ?? [],
    model: (r.model as string | null) ?? null,
    temperature: (r.temperature as number | null) ?? null,
    max_tokens: (r.max_tokens as number | null) ?? null,
    system_prompt: (r.system_prompt as string | null) ?? null,
    enabled: (r.enabled as boolean) ?? true,
    config: serializeConfig(r.config),
  };
}

function normalizePrompt(row: unknown): AIPromptRow {
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    workspace_id: r.workspace_id as string,
    key: r.key as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    template: r.template as string,
    variables: (r.variables as string[]) ?? [],
    system_prompt: (r.system_prompt as string | null) ?? null,
    category: (r.category as string | null) ?? null,
    version: (r.version as number) ?? 1,
    is_active: (r.is_active as boolean) ?? true,
  };
}

// ---------- Providers ----------

export const listAIProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AIProviderRow[]> => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data } = await sbAny(supabaseAdmin)
      .from("ai_providers" as never)
      .select("*, ai_provider_health(*), ai_models(count)")
      .eq("workspace_id", workspaceId)
      .order("priority", { ascending: true });
    return ((data as unknown as unknown[]) ?? []).map(normalizeProvider);
  });

export const listSupportedProviderKinds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<AIProviderKind[]> => listProviderKinds());

export const upsertAIProviderInput = z.object({
  id: z.string().uuid().optional(),
  kind: providerKind,
  name: z.string().min(1),
  baseUrl: z.string().url().optional().nullable(),
  apiKeySecretName: z.string().optional().nullable(),
  organizationId: z.string().optional().nullable(),
  enabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  priority: z.number().int().default(100),
  config: z.record(z.unknown()).default({}),
});
export type UpsertAIProviderInput = z.infer<typeof upsertAIProviderInput>;

export const upsertAIProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => upsertAIProviderInput.parse(v))
  .handler(async ({ data, context }): Promise<AIProviderRow> => {
    await assertPlatformSuperAdmin(context.supabase, context.userId);
    const workspaceId = await getWorkspaceId(context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const row = {
      workspace_id: workspaceId,
      kind: data.kind,
      name: data.name,
      base_url: data.baseUrl ?? null,
      api_key_secret_name: data.apiKeySecretName ?? null,
      organization_id: data.organizationId ?? null,
      enabled: data.enabled,
      is_default: data.isDefault,
      priority: data.priority,
      config: data.config,
    };
    if (data.id) {
      const { data: updated, error } = await sbAny(supabaseAdmin)
        .from("ai_providers" as never)
        .update(row as never)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return normalizeProvider(updated);
    }
    const { data: inserted, error } = await sbAny(supabaseAdmin)
      .from("ai_providers" as never)
      .insert(row as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return normalizeProvider(inserted);
  });

export const deleteAIProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertPlatformSuperAdmin(context.supabase, context.userId);
    const workspaceId = await getWorkspaceId(context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: deleted, error } = await sbAny(supabaseAdmin)
      .from("ai_providers" as never)
      .delete()
      .eq("id", data.id)
      .eq("workspace_id", workspaceId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!deleted) throw new Error("Provider was not deleted in this workspace.");
    const { data: remaining, error: verifyError } = await sbAny(supabaseAdmin)
      .from("ai_providers" as never)
      .select("id")
      .eq("id", data.id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (verifyError) throw new Error(`Could not verify provider deletion: ${verifyError.message}`);
    if (remaining)
      throw new Error("Provider is still in the database. Deletion was not confirmed.");
    return { ok: true };
  });

export interface HealthResult {
  ok: boolean;
  latency_ms: number;
  error?: string;
}

export const testAIProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<HealthResult> => {
    await assertPlatformSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: row } = await sbAny(supabaseAdmin)
      .from("ai_providers" as never)
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Provider not found");
    const rec = row as unknown as {
      id: string;
      workspace_id: string;
      kind: AIProviderKind;
      name: string;
      base_url: string | null;
      api_key_secret_name: string | null;
      credential_source?: "platform" | "workspace" | null;
      vault_secret_id?: string | null;
      api_key_last4?: string | null;
      organization_id: string | null;
      enabled: boolean;
      is_default: boolean;
      priority: number;
      config: Record<string, unknown>;
    };
    try {
      const impl = getAIProvider(rec.kind);
      const creds = await resolveProviderCredentials({
        id: rec.id,
        workspaceId: rec.workspace_id,
        kind: rec.kind,
        name: rec.name,
        baseUrl: rec.base_url,
        apiKeySecretName: rec.api_key_secret_name,
        credentialSource: rec.credential_source ?? "platform",
        vaultSecretId: rec.vault_secret_id ?? null,
        apiKeyLast4: rec.api_key_last4 ?? null,
        organizationId: rec.organization_id,
        enabled: rec.enabled,
        isDefault: rec.is_default,
        priority: rec.priority,
        config: rec.config,
      });
      const health = (await impl.healthCheck?.(creds)) ?? {
        ok: false,
        latency_ms: 0,
        error: "no healthcheck",
      };
      await sbAny(supabaseAdmin)
        .from("ai_provider_health" as never)
        .upsert(
          {
            provider_id: rec.id,
            status: health.ok ? "healthy" : "down",
            last_check_at: new Date().toISOString(),
            last_success_at: health.ok ? new Date().toISOString() : null,
            last_error: health.error ?? null,
            latency_ms: health.latency_ms,
            consecutive_failures: health.ok ? 0 : 1,
            updated_at: new Date().toISOString(),
          } as never,
          { onConflict: "provider_id" },
        );
      return { ok: health.ok, latency_ms: health.latency_ms, error: health.error };
    } catch (e) {
      const msg = e instanceof AIError ? e.message : (e as Error).message;
      await sbAny(supabaseAdmin)
        .from("ai_provider_health" as never)
        .upsert(
          {
            provider_id: rec.id,
            status: "down",
            last_check_at: new Date().toISOString(),
            last_error: msg,
            latency_ms: 0,
            consecutive_failures: 1,
            updated_at: new Date().toISOString(),
          } as never,
          { onConflict: "provider_id" },
        );
      return { ok: false, latency_ms: 0, error: msg };
    }
  });

export interface RemoteModel {
  id: string;
  name?: string;
}

export const listProviderModelsRemote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<RemoteModel[]> => {
    await assertPlatformSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: row } = await sbAny(supabaseAdmin)
      .from("ai_providers" as never)
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Provider not found");
    const r = row as unknown as Record<string, unknown>;
    const impl = getAIProvider(r.kind as AIProviderKind);
    const creds = await resolveProviderCredentials({
      id: r.id as string,
      workspaceId: r.workspace_id as string,
      kind: r.kind as AIProviderKind,
      name: r.name as string,
      baseUrl: (r.base_url as string | null) ?? null,
      apiKeySecretName: (r.api_key_secret_name as string | null) ?? null,
      credentialSource: (r.credential_source as "platform" | "workspace" | null) ?? "platform",
      vaultSecretId: (r.vault_secret_id as string | null) ?? null,
      apiKeyLast4: (r.api_key_last4 as string | null) ?? null,
      organizationId: (r.organization_id as string | null) ?? null,
      enabled: r.enabled as boolean,
      isDefault: r.is_default as boolean,
      priority: (r.priority as number) ?? 100,
      config: (r.config as Record<string, unknown>) ?? {},
    });
    const models = (await impl.listModels?.(creds)) ?? [];
    return models.map((m) => ({ id: m.id, name: m.name }));
  });

// ---------- Models ----------

export const upsertAIModelInput = z.object({
  id: z.string().uuid().optional(),
  providerId: z.string().uuid(),
  modelId: z.string().min(1),
  displayName: z.string().min(1),
  capabilities: z.record(z.boolean()).default({}),
  contextWindow: z.number().int().nullable().optional(),
  maxOutputTokens: z.number().int().nullable().optional(),
  inputCostPer1k: z.number().default(0),
  outputCostPer1k: z.number().default(0),
  enabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
});
export type UpsertAIModelInput = z.infer<typeof upsertAIModelInput>;

export const upsertAIModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => upsertAIModelInput.parse(v))
  .handler(async ({ data, context }): Promise<AIModelRow> => {
    await assertPlatformSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const row = {
      provider_id: data.providerId,
      model_id: data.modelId,
      display_name: data.displayName,
      capabilities: data.capabilities,
      context_window: data.contextWindow ?? null,
      max_output_tokens: data.maxOutputTokens ?? null,
      input_cost_per_1k: data.inputCostPer1k,
      output_cost_per_1k: data.outputCostPer1k,
      enabled: data.enabled,
      is_default: data.isDefault,
    };
    if (data.id) {
      const { data: updated, error } = await sbAny(supabaseAdmin)
        .from("ai_models" as never)
        .update(row as never)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return normalizeModel(updated);
    }
    const { data: inserted, error } = await sbAny(supabaseAdmin)
      .from("ai_models" as never)
      .insert(row as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return normalizeModel(inserted);
  });

export const deleteAIModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertPlatformSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    await sbAny(supabaseAdmin)
      .from("ai_models" as never)
      .delete()
      .eq("id", data.id);
    return { ok: true };
  });

// ---------- Feature configs ----------

export const upsertAIFeatureConfigInput = z.object({
  feature: z.string().min(1),
  providerId: z.string().uuid().nullable().optional(),
  fallbackProviderIds: z.array(z.string().uuid()).default([]),
  model: z.string().nullable().optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  maxTokens: z.number().int().nullable().optional(),
  systemPrompt: z.string().nullable().optional(),
  enabled: z.boolean().default(true),
  config: z.record(z.unknown()).default({}),
});
export type UpsertAIFeatureConfigInput = z.infer<typeof upsertAIFeatureConfigInput>;

export const upsertAIFeatureConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => upsertAIFeatureConfigInput.parse(v))
  .handler(async ({ data, context }): Promise<AIFeatureConfigRow> => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: row, error } = await sbAny(supabaseAdmin)
      .from("ai_feature_config" as never)
      .upsert(
        {
          workspace_id: workspaceId,
          feature: data.feature,
          provider_id: data.providerId ?? null,
          fallback_provider_ids: data.fallbackProviderIds,
          model: data.model ?? null,
          temperature: data.temperature ?? null,
          max_tokens: data.maxTokens ?? null,
          system_prompt: data.systemPrompt ?? null,
          enabled: data.enabled,
          config: data.config,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "workspace_id,feature" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return normalizeFeatureConfig(row);
  });

// ---------- Prompt templates ----------

export const upsertAIPromptInput = z.object({
  id: z.string().uuid().optional(),
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  template: z.string().min(1),
  variables: z.array(z.string()).default([]),
  systemPrompt: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});
export type UpsertAIPromptInput = z.infer<typeof upsertAIPromptInput>;

export const upsertAIPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => upsertAIPromptInput.parse(v))
  .handler(async ({ data, context }): Promise<AIPromptRow> => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const row = {
      workspace_id: workspaceId,
      key: data.key,
      name: data.name,
      description: data.description ?? null,
      template: data.template,
      variables: data.variables,
      system_prompt: data.systemPrompt ?? null,
      category: data.category ?? null,
      is_active: data.isActive,
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { data: updated, error } = await sbAny(supabaseAdmin)
        .from("ai_prompts" as never)
        .update(row as never)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return normalizePrompt(updated);
    }
    const { data: inserted, error } = await sbAny(supabaseAdmin)
      .from("ai_prompts" as never)
      .insert(row as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return normalizePrompt(inserted);
  });

// ---------- Usage / logs ----------

export const getAIUsageSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AIUsageDailyRow[]> => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const { data } = await sbAny(supabaseAdmin)
      .from("ai_usage_daily" as never)
      .select("*")
      .eq("workspace_id", workspaceId)
      .gte("day", since)
      .order("day", { ascending: false });
    return ((data as unknown as unknown[]) ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        workspace_id: row.workspace_id as string,
        day: row.day as string,
        provider_id: (row.provider_id as string | null) ?? null,
        model: (row.model as string) ?? "",
        requests: Number(row.requests ?? 0),
        prompt_tokens: Number(row.prompt_tokens ?? 0),
        completion_tokens: Number(row.completion_tokens ?? 0),
        total_tokens: Number(row.total_tokens ?? 0),
        cost_usd: Number(row.cost_usd ?? 0),
        errors: Number(row.errors ?? 0),
      };
    });
  });

export const getAIRecentLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(500).default(100),
        status: z.enum(["success", "error", "rate_limited", "timeout", "cancelled"]).optional(),
        providerId: z.string().uuid().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<AIRequestLogRow[]> => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    let q = sbAny(supabaseAdmin)
      .from("ai_request_logs" as never)
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    if (data.providerId) q = q.eq("provider_id", data.providerId);
    const { data: rows } = await q;
    return ((rows as unknown as unknown[]) ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      return {
        id: row.id as string,
        workspace_id: row.workspace_id as string,
        user_id: (row.user_id as string | null) ?? null,
        provider_id: (row.provider_id as string | null) ?? null,
        provider_kind: (row.provider_kind as string | null) ?? null,
        model: (row.model as string | null) ?? null,
        operation: (row.operation as string) ?? "chat",
        feature: (row.feature as string | null) ?? null,
        status: (row.status as string) ?? "unknown",
        http_status: (row.http_status as number | null) ?? null,
        latency_ms: (row.latency_ms as number | null) ?? null,
        prompt_tokens: Number(row.prompt_tokens ?? 0),
        completion_tokens: Number(row.completion_tokens ?? 0),
        total_tokens: Number(row.total_tokens ?? 0),
        cost_usd: Number(row.cost_usd ?? 0),
        error_type: (row.error_type as string | null) ?? null,
        error_message: (row.error_message as string | null) ?? null,
        created_at: (row.created_at as string) ?? "",
      };
    });
  });
