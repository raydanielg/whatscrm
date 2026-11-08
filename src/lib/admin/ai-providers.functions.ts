/**
 * Super Admin — AI Provider management.
 *
 * Lets platform staff create, configure, test and delete AI providers for any
 * workspace, sync their model catalogs, and run an end-to-end smoke test that
 * proves the app-wide `runChat` path works with the configured provider.
 *
 * Authorization: every handler verifies the caller's platform role through the
 * caller's own RLS-scoped client BEFORE `supabaseAdmin` is imported.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { z } from "zod";
import type { AIProviderKind } from "@/lib/ai/types";
import { sbAny } from "@/lib/supabase/untyped";
import {
  appChatModelDetails,
  appChatModelIds,
  isChatModelId,
  providerChatModelId,
} from "@/lib/ai/model-kind";
import { safeAIErrorMessage } from "@/lib/ai/errors";

/* -------------------------------------------------------------------------- */
/* Guards                                                                     */
/* -------------------------------------------------------------------------- */

async function assertPlatformStaff(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
): Promise<"superadmin" | "support"> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["superadmin", "support"]);
  if (error) throw new Error("Unable to verify platform role");
  if (!data || data.length === 0) throw new Error("Forbidden: platform staff only");
  return (
    data.some((r: { role: string }) => r.role === "superadmin") ? "superadmin" : "support"
  ) as "superadmin" | "support";
}

async function assertSuperAdmin(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
) {
  const role = await assertPlatformStaff(supabase, userId);
  if (role !== "superadmin") throw new Error("Forbidden: superadmin role required for this action");
}

/* -------------------------------------------------------------------------- */
/* Static catalog (kinds + suggested models)                                  */
/* -------------------------------------------------------------------------- */

export type ProviderKindInfo = {
  kind: AIProviderKind;
  label: string;
  defaultBaseUrl: string;
  requiresKey: boolean;
  suggestedSecretName: string;
  models: { modelId: string; displayName: string }[];
};

const GEMINI_MODELS = [
  ["gemini-3.1-flash-lite", "Gemini 3.1 Flash Lite · Budget"],
  ["gemini-3.5-flash-lite", "Gemini 3.5 Flash Lite · Budget"],
  ["gemini-3.6-flash", "Gemini 3.6 Flash · Balanced"],
  ["gemini-3.5-flash", "Gemini 3.5 Flash · Balanced"],
  ["gemini-3.8-flash", "Gemini 3.8 Flash · Premium"],
  ["gemini-4-argon", "Gemini 4 Argon · Premium"],
] as const;

export const PROVIDER_KINDS: ProviderKindInfo[] = [
  {
    kind: "openai",
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    requiresKey: true,
    suggestedSecretName: "OPENAI_API_KEY",
    models: [
      { modelId: "gpt-6-luna", displayName: "GPT-6 Luna · Budget" },
      { modelId: "gpt-5.6-luna", displayName: "GPT-5.6 Luna · Budget" },
      { modelId: "gpt-5.4-mini", displayName: "GPT-5.4 Mini · Balanced" },
      { modelId: "gpt-5.6-terra", displayName: "GPT-5.6 Terra · Balanced" },
      { modelId: "gpt-5.6-sol", displayName: "GPT-5.6 Sol · Premium" },
      { modelId: "gpt-5.5", displayName: "GPT-5.5 · Premium" },
    ],
  },
  {
    kind: "anthropic",
    label: "Anthropic",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    requiresKey: true,
    suggestedSecretName: "ANTHROPIC_API_KEY",
    models: [],
  },
  {
    kind: "gemini",
    label: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    requiresKey: true,
    suggestedSecretName: "GEMINI_API_KEY",
    models: GEMINI_MODELS.map(([modelId, displayName]) => ({ modelId, displayName })),
  },
  {
    kind: "deepseek",
    label: "DeepSeek",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    requiresKey: true,
    suggestedSecretName: "DEEPSEEK_API_KEY",
    models: [],
  },
  {
    kind: "grok",
    label: "xAI Grok",
    defaultBaseUrl: "https://api.x.ai/v1",
    requiresKey: true,
    suggestedSecretName: "XAI_API_KEY",
    models: [],
  },
  {
    kind: "openrouter",
    label: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    requiresKey: true,
    suggestedSecretName: "OPENROUTER_API_KEY",
    models: [],
  },
  {
    kind: "ollama",
    label: "Ollama (self-hosted)",
    defaultBaseUrl: "http://localhost:11434/v1",
    requiresKey: false,
    suggestedSecretName: "",
    models: [],
  },
  {
    kind: "lmstudio",
    label: "LM Studio (self-hosted)",
    defaultBaseUrl: "http://localhost:1234/v1",
    requiresKey: false,
    suggestedSecretName: "",
    models: [],
  },
  {
    kind: "custom_openai",
    label: "Custom (OpenAI-compatible)",
    defaultBaseUrl: "",
    requiresKey: true,
    suggestedSecretName: "CUSTOM_AI_API_KEY",
    models: [],
  },
];

const KIND_VALUES = PROVIDER_KINDS.map((k) => k.kind) as [AIProviderKind, ...AIProviderKind[]];

/* -------------------------------------------------------------------------- */
/* Targets (workspaces + kinds)                                               */
/* -------------------------------------------------------------------------- */

export type AiProviderTargets = {
  workspaces: { id: string; name: string; organizationName: string | null }[];
  kinds: ProviderKindInfo[];
};

export const listAiProviderTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AiProviderTargets> => {
    await assertPlatformStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data } = await supabaseAdmin
      .from("workspaces")
      .select("id, name, organizations(name)")
      .order("created_at", { ascending: true })
      .limit(500);
    const rows = (data ?? []) as unknown as {
      id: string;
      name: string;
      organizations: { name: string } | { name: string }[] | null;
    }[];
    return {
      workspaces: rows.map((r) => ({
        id: r.id,
        name: r.name,
        organizationName: Array.isArray(r.organizations)
          ? (r.organizations[0]?.name ?? null)
          : (r.organizations?.name ?? null),
      })),
      kinds: PROVIDER_KINDS,
    };
  });

/* -------------------------------------------------------------------------- */
/* Create / update / delete                                                   */
/* -------------------------------------------------------------------------- */

const providerInput = z.object({
  id: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
  applyToAllWorkspaces: z.boolean().optional(),
  kind: z.enum(KIND_VALUES),
  name: z.string().min(1).max(120),
  baseUrl: z.string().max(300).optional().nullable(),
  apiKeySecretName: z.string().max(256).optional().nullable(),
  organizationId: z.string().max(200).optional().nullable(),
  enabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  priority: z.number().int().min(1).max(1000).default(100),
});

export const savePlatformAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => providerInput.parse(v))
  .handler(async ({ data, context }): Promise<{ ok: true; ids: string[] }> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

    const kindInfo = PROVIDER_KINDS.find((k) => k.kind === data.kind)!;
    const baseUrl = (data.baseUrl?.trim() || kindInfo.defaultBaseUrl || null) as string | null;
    const secretName = data.apiKeySecretName?.trim() || null;

    const base = {
      kind: data.kind,
      name: data.name.trim(),
      base_url: baseUrl,
      api_key_secret_name: secretName,
      organization_id: data.organizationId?.trim() || null,
      enabled: data.enabled,
      is_default: data.isDefault,
      priority: data.priority,
    };

    // Update path
    if (data.id) {
      const { data: row, error } = await supabaseAdmin
        .from("ai_providers" as never)
        .update(base as never)
        .eq("id", data.id)
        .select("id, workspace_id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      const updated = row as unknown as { id: string; workspace_id: string } | null;
      if (!updated) throw new Error("Provider not found");
      if (data.isDefault) await clearOtherDefaults(updated.workspace_id, updated.id);
      return { ok: true, ids: [updated.id] };
    }

    // Create path — one workspace, or fan out to all workspaces
    let workspaceIds: string[] = [];
    if (data.applyToAllWorkspaces) {
      const { data: ws } = await sbAny(supabaseAdmin).from("workspaces").select("id").limit(1000);
      workspaceIds = ((ws ?? []) as { id: string }[]).map((w) => w.id);
    } else {
      if (!data.workspaceId) throw new Error("Select a workspace");
      workspaceIds = [data.workspaceId];
    }

    const ids: string[] = [];
    for (const workspaceId of workspaceIds) {
      const { data: row, error } = await supabaseAdmin
        .from("ai_providers" as never)
        .insert({ ...base, workspace_id: workspaceId, config: {} } as never)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      const created = row as unknown as { id: string } | null;
      if (created) {
        ids.push(created.id);
        if (data.isDefault) await clearOtherDefaults(workspaceId, created.id);
      }
    }
    return { ok: true, ids };
  });

async function clearOtherDefaults(workspaceId: string, keepId: string) {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  await supabaseAdmin
    .from("ai_providers" as never)
    .update({ is_default: false } as never)
    .eq("workspace_id", workspaceId)
    .neq("id", keepId);
}

export const deletePlatformAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    // The provider FK cascades to models and health. Delete the parent once,
    // and require a returned row so a no-op cannot be reported as success.
    const { data: deleted, error } = await sbAny(supabaseAdmin)
      .from("ai_providers" as never)
      .delete()
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!deleted) throw new Error("Provider was not deleted. Refresh the list and try again.");
    const { data: remaining, error: verifyError } = await sbAny(supabaseAdmin)
      .from("ai_providers" as never)
      .select("id")
      .eq("id", data.id)
      .maybeSingle();
    if (verifyError) throw new Error(`Could not verify provider deletion: ${verifyError.message}`);
    if (remaining)
      throw new Error("Provider is still in the database. Deletion was not confirmed.");
    return { ok: true };
  });

/* -------------------------------------------------------------------------- */
/* Models                                                                     */
/* -------------------------------------------------------------------------- */

export type PlatformAiModelRow = {
  id: string;
  modelId: string;
  displayName: string;
  enabled: boolean;
  isDefault: boolean;
};

export const listPlatformAiModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ providerId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<PlatformAiModelRow[]> => {
    await assertPlatformStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: rows } = await supabaseAdmin
      .from("ai_models" as never)
      .select("id, model_id, display_name, enabled, is_default")
      .eq("provider_id", data.providerId)
      .order("is_default", { ascending: false })
      .order("model_id", { ascending: true });
    return ((rows ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      modelId: r.model_id as string,
      displayName: (r.display_name as string) ?? (r.model_id as string),
      enabled: Boolean(r.enabled),
      isDefault: Boolean(r.is_default),
    }));
  });

/**
 * Pull the provider's live model list (or the curated catalog for the Lovable
 * gateway, which does not expose /models) and upsert it into `ai_models`.
 */
export const syncPlatformProviderModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ providerId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<{ ok: true; count: number; source: string }> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { getAIProvider, resolveProviderCredentials } = await import("@/lib/ai/registry.server");

    const { data: row } = await supabaseAdmin
      .from("ai_providers" as never)
      .select("*")
      .eq("id", data.providerId)
      .maybeSingle();
    const p = row as unknown as Record<string, unknown> | null;
    if (!p) throw new Error("Provider not found");

    const kind = p.kind as AIProviderKind;
    const kindInfo = PROVIDER_KINDS.find((k) => k.kind === kind);

    let discovered: { id: string; name?: string }[] = [];
    let source = "catalog";
    try {
      const impl = getAIProvider(kind);
      const creds = await resolveProviderCredentials({
        credentialSource: (p.credential_source as "platform" | "workspace" | null) ?? "platform",
        vaultSecretId: (p.vault_secret_id as string | null) ?? null,
        apiKeyLast4: (p.api_key_last4 as string | null) ?? null,
        id: p.id as string,
        workspaceId: p.workspace_id as string,
        kind,
        name: p.name as string,
        baseUrl: (p.base_url as string | null) ?? null,
        apiKeySecretName: (p.api_key_secret_name as string | null) ?? null,
        organizationId: (p.organization_id as string | null) ?? null,
        enabled: Boolean(p.enabled),
        isDefault: Boolean(p.is_default),
        priority: (p.priority as number) ?? 100,
        config: (p.config as Record<string, unknown>) ?? {},
      });
      discovered = (await impl.listModels?.(creds)) ?? [];
      if (discovered.length > 0) source = "provider";
    } catch {
      discovered = [];
    }

    if (discovered.length === 0 && kindInfo && kindInfo.models.length > 0) {
      discovered = kindInfo.models.map((m) => ({ id: m.modelId, name: m.displayName }));
    }
    if (discovered.length === 0) {
      throw new Error(
        "No models returned by this provider. Check the API key secret and base URL.",
      );
    }

    const allowed = appChatModelIds(kind);
    discovered = discovered.filter((model) =>
      allowed ? allowed.includes(model.id) : isChatModelId(model.id),
    );
    if (allowed) {
      discovered.sort((a, b) => allowed.indexOf(a.id) - allowed.indexOf(b.id));
    } else {
      discovered = discovered.slice(0, 5);
    }
    if (discovered.length === 0) {
      throw new Error("No supported chat models were returned by this provider.");
    }

    const { data: existing } = await supabaseAdmin
      .from("ai_models" as never)
      .select("id, model_id, is_default")
      .eq("provider_id", data.providerId);
    const existingRows = (existing ?? []) as unknown as {
      id: string;
      model_id: string;
      is_default: boolean;
    }[];
    const desired = new Set(discovered.map((model) => model.id));
    const staleIds = existingRows
      .filter((model) => !desired.has(model.model_id))
      .map((model) => model.id);
    if (staleIds.length) {
      const { error } = await sbAny(supabaseAdmin)
        .from("ai_models" as never)
        .delete()
        .in("id", staleIds);
      if (error) throw new Error(error.message);
    }
    const existingDefault = existingRows.find(
      (row) => row.is_default && desired.has(row.model_id),
    )?.model_id;
    const defaultModel = existingDefault ?? discovered[0]?.id;
    const modelRows = discovered.slice(0, 200).map((model, index) => {
      const details = appChatModelDetails(model.id);
      return {
        provider_id: data.providerId,
        model_id: model.id,
        display_name: details ? `${details.label} · ${details.tier}` : (model.name ?? model.id),
        capabilities: { chat: true },
        input_cost_per_1k: details?.inputCostPer1k ?? 0,
        output_cost_per_1k: details?.outputCostPer1k ?? 0,
        enabled: true,
        is_default: model.id === defaultModel,
        sort_order: index * 10,
      };
    });

    if (modelRows.length > 0) {
      const { error } = await sbAny(supabaseAdmin)
        .from("ai_models" as never)
        .upsert(modelRows as never, { onConflict: "provider_id,model_id" });
      if (error) throw new Error(error.message);
    }
    return { ok: true, count: modelRows.length, source };
  });

export const setPlatformAiModelState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        modelRowId: z.string().uuid(),
        enabled: z.boolean().optional(),
        isDefault: z.boolean().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const patch: Record<string, unknown> = {};
    if (typeof data.enabled === "boolean") patch.enabled = data.enabled;
    if (typeof data.isDefault === "boolean") patch.is_default = data.isDefault;
    const { data: row, error } = await supabaseAdmin
      .from("ai_models" as never)
      .update(patch as never)
      .eq("id", data.modelRowId)
      .select("id, provider_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    const updated = row as unknown as { id: string; provider_id: string } | null;
    if (updated && data.isDefault) {
      await supabaseAdmin
        .from("ai_models" as never)
        .update({ is_default: false } as never)
        .eq("provider_id", updated.provider_id)
        .neq("id", updated.id);
    }
    return { ok: true };
  });

/* -------------------------------------------------------------------------- */
/* Test / verify                                                              */
/* -------------------------------------------------------------------------- */

export type ProviderTestResult = {
  ok: boolean;
  latencyMs: number;
  model: string | null;
  reply: string | null;
  error: string | null;
};

/**
 * End-to-end smoke test: runs a real completion through the SAME `runChat`
 * pipeline the whole app uses (credentials, rate limit, logging, cost).
 */
export const testPlatformAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({ providerId: z.string().uuid(), model: z.string().max(200).optional() }).parse(v),
  )
  .handler(async ({ data, context }): Promise<ProviderTestResult> => {
    await assertPlatformStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { runChat } = await import("@/lib/ai/complete.functions");

    const { data: row } = await supabaseAdmin
      .from("ai_providers" as never)
      .select("id, workspace_id, kind")
      .eq("id", data.providerId)
      .maybeSingle();
    const p = row as unknown as { id: string; workspace_id: string; kind: string } | null;
    if (!p) throw new Error("Provider not found");

    let model = data.model?.trim() || "";
    if (!model) {
      const { data: models } = await supabaseAdmin
        .from("ai_models" as never)
        .select("model_id, is_default")
        .eq("provider_id", p.id)
        .eq("enabled", true)
        .order("is_default", { ascending: false })
        .order("model_id", { ascending: true })
        .limit(100);
      const modelRows = (models ?? []) as unknown as Array<{
        model_id: string;
        is_default?: boolean;
      }>;
      model = providerChatModelId(p.kind, modelRows) ?? "";
    }
    if (!model) {
      return {
        ok: false,
        latencyMs: 0,
        model: null,
        reply: null,
        error: "No model configured. Sync the model catalog first.",
      };
    }

    const start = Date.now();
    try {
      const res = await runChat({
        workspaceId: p.workspace_id,
        userId: context.userId,
        feature: "platform_provider_test",
        request: {
          model,
          messages: [{ role: "user", content: "Reply with exactly: OK" }],
          max_tokens: 256,
          temperature: 0,
        },
        primaryProviderId: p.id,
      });
      return {
        ok: true,
        latencyMs: Date.now() - start,
        model: res.model || model,
        reply: (res.content ?? "").trim().slice(0, 200) || "(empty response)",
        error: null,
      };
    } catch (e) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        model,
        reply: null,
        error: safeAIErrorMessage(e),
      };
    }
  });
