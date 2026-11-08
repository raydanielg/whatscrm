/**
 * Chatbot training: prompt library (versioning + sharing) and prompt testing.
 * Everything is workspace-scoped and works across multiple bots.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { sbAny } from "@/lib/supabase/untyped";

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export type PromptCategory =
  | "system" | "organization" | "department" | "personality" | "tone"
  | "greeting" | "fallback" | "escalation" | "custom";

export interface ChatbotPrompt {
  id: string;
  workspace_id: string;
  chatbot_id: string | null;
  parent_id: string | null;
  version: number;
  name: string;
  category: PromptCategory;
  content: string;
  variables: Json;
  tags: string[];
  language: string | null;
  is_shared: boolean;
  is_template: boolean;
  is_active: boolean;
  usage_count: number;
  avg_rating: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatbotPromptTest {
  id: string;
  workspace_id: string;
  prompt_id: string | null;
  chatbot_id: string | null;
  input: string;
  output: string | null;
  model: string | null;
  latency_ms: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  rating: number | null;
  notes: string | null;
  success: boolean;
  error: string | null;
  created_at: string;
}

// -------------------- Library --------------------

export const listPrompts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    workspaceId: z.string().uuid(),
    chatbotId: z.string().uuid().nullable().optional(),
    category: z.string().optional(),
    search: z.string().optional(),
    onlyShared: z.boolean().optional(),
  }).parse(v))
  .handler(async ({ data, context }): Promise<ChatbotPrompt[]> => {
    let q = context.supabase
      .from("chatbot_prompts" as never)
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false });

    if (data.chatbotId === null) {
      q = q.is("chatbot_id", null);
    } else if (data.chatbotId) {
      // Bot-scoped OR shared library prompts
      q = q.or(`chatbot_id.eq.${data.chatbotId},is_shared.eq.true,chatbot_id.is.null`);
    }
    if (data.category) q = q.eq("category", data.category);
    if (data.onlyShared) q = q.eq("is_shared", true);
    if (data.search) q = q.ilike("name", `%${sanitizeSearchTerm(data.search)}%`);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as ChatbotPrompt[];
  });

export const getPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("chatbot_prompts" as never)
      .select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    return (row ?? null) as unknown as ChatbotPrompt | null;
  });

const upsertPromptInput = z.object({
  id: z.string().uuid().optional(),
  workspaceId: z.string().uuid(),
  chatbotId: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(200),
  category: z.enum([
    "system","organization","department","personality","tone",
    "greeting","fallback","escalation","custom",
  ]),
  content: z.string().min(1).max(16000),
  variables: z.array(z.object({
    key: z.string(), label: z.string().optional(), default: z.string().optional(),
  })).optional(),
  tags: z.array(z.string()).optional(),
  language: z.string().max(10).nullable().optional(),
  is_shared: z.boolean().optional(),
  is_template: z.boolean().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const upsertPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => upsertPromptInput.parse(v))
  .handler(async ({ data, context }) => {
    const { id, workspaceId, chatbotId, ...rest } = data;
    const payload: Record<string, unknown> = {
      ...rest,
      workspace_id: workspaceId,
      chatbot_id: chatbotId ?? null,
      created_by: context.userId,
    };
    if (id) {
      const { data: row, error } = await context.supabase
        .from("chatbot_prompts" as never)
        .update(payload as never).eq("id", id).select("*").maybeSingle();
      if (error) throw new Error(error.message);
      return row as unknown as ChatbotPrompt;
    }
    const { data: row, error } = await context.supabase
      .from("chatbot_prompts" as never)
      .insert(payload as never).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    return row as unknown as ChatbotPrompt;
  });

/** Create a new version — clones the current prompt with parent_id + version+1. */
export const forkPromptVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    id: z.string().uuid(),
    content: z.string().min(1).max(16000),
    notes: z.string().max(2000).optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { data: src, error: e1 } = await context.supabase
      .from("chatbot_prompts" as never).select("*").eq("id", data.id).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!src) throw new Error("Prompt not found");
    const s = src as unknown as ChatbotPrompt;
    const parentId = s.parent_id ?? s.id;
    // Find highest existing version in the family
    const { data: siblings } = await context.supabase
      .from("chatbot_prompts" as never)
      .select("version")
      .or(`id.eq.${parentId},parent_id.eq.${parentId}`);
    const nextVersion = Math.max(
      1,
      ...((siblings ?? []) as { version: number }[]).map((r) => r.version),
    ) + 1;
    const { data: row, error } = await context.supabase
      .from("chatbot_prompts" as never)
      .insert({
        workspace_id: s.workspace_id,
        chatbot_id: s.chatbot_id,
        parent_id: parentId,
        version: nextVersion,
        name: s.name,
        category: s.category,
        content: data.content,
        variables: s.variables,
        tags: s.tags,
        language: s.language,
        is_shared: s.is_shared,
        is_template: false,
        notes: data.notes ?? null,
        created_by: context.userId,
      } as never)
      .select("*").maybeSingle();
    if (error) throw new Error(error.message);
    return row as unknown as ChatbotPrompt;
  });

export const listPromptVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<ChatbotPrompt[]> => {
    // Find root: either self or its parent_id
    const { data: seed } = await context.supabase
      .from("chatbot_prompts" as never).select("id,parent_id").eq("id", data.id).maybeSingle();
    if (!seed) return [];
    const s = seed as unknown as { id: string; parent_id: string | null };
    const root = s.parent_id ?? s.id;
    const { data: rows, error } = await context.supabase
      .from("chatbot_prompts" as never)
      .select("*")
      .or(`id.eq.${root},parent_id.eq.${root}`)
      .order("version", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as ChatbotPrompt[];
  });

export const deletePrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("chatbot_prompts" as never).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setPromptShared = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    id: z.string().uuid(), is_shared: z.boolean(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("chatbot_prompts" as never)
      .update({ is_shared: data.is_shared } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------- Testing --------------------

const testInput = z.object({
  workspaceId: z.string().uuid(),
  promptId: z.string().uuid().nullable().optional(),
  chatbotId: z.string().uuid().nullable().optional(),
  promptContent: z.string().min(1).max(16000),
  userInput: z.string().min(1).max(4000),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  variables: z.record(z.string()).optional(),
});

export const runPromptTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => testInput.parse(v))
  .handler(async ({ data, context }): Promise<ChatbotPromptTest> => {
    const start = Date.now();
    // Simple variable interpolation {{key}}
    let rendered = data.promptContent;
    for (const [k, val] of Object.entries(data.variables ?? {})) {
      rendered = rendered.replaceAll(`{{${k}}}`, val);
    }

    let output = "";
    let model = data.model ?? "google/gemini-2.5-flash";
    let success = true;
    let errorMsg: string | null = null;
    try {
      const { runChat } = await import("@/lib/ai/complete.functions");
      const res = await runChat({
        workspaceId: data.workspaceId,
        userId: context.userId,
        feature: "chatbot_test",
        primaryProviderId: null,
        request: {
          messages: [
            { role: "system", content: rendered },
            { role: "user", content: data.userInput },
          ],
          model,
          temperature: data.temperature ?? 0.4,
          max_tokens: 800,
        },
      });
      output = res.content?.trim() ?? "";
      model = res.model || model;
    } catch (e) {
      success = false;
      errorMsg = e instanceof Error ? e.message : String(e);
    }
    const latency = Date.now() - start;

    const { data: row, error } = await context.supabase
      .from("chatbot_prompt_tests" as never)
      .insert({
        workspace_id: data.workspaceId,
        prompt_id: data.promptId ?? null,
        chatbot_id: data.chatbotId ?? null,
        input: data.userInput,
        output,
        model,
        latency_ms: latency,
        success,
        error: errorMsg,
        created_by: context.userId,
      } as never)
      .select("*").maybeSingle();
    if (error) throw new Error(error.message);

    // Bump usage counter (non-transactional)
    if (data.promptId) {
      const { data: cur } = await context.supabase
        .from("chatbot_prompts" as never)
        .select("usage_count").eq("id", data.promptId).maybeSingle();
      const usage = ((cur as { usage_count?: number } | null)?.usage_count ?? 0) + 1;
      await sbAny(context.supabase).from("chatbot_prompts" as never)
        .update({ usage_count: usage } as never).eq("id", data.promptId);
    }

    return row as unknown as ChatbotPromptTest;
  });

export const listPromptTests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    workspaceId: z.string().uuid(),
    promptId: z.string().uuid().optional(),
    chatbotId: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(200).optional(),
  }).parse(v))
  .handler(async ({ data, context }): Promise<ChatbotPromptTest[]> => {
    let q = sbAny(context.supabase).from("chatbot_prompt_tests" as never)
      .select("*").eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.promptId) q = q.eq("prompt_id", data.promptId);
    if (data.chatbotId) q = q.eq("chatbot_id", data.chatbotId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as ChatbotPromptTest[];
  });

export const ratePromptTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    id: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    notes: z.string().max(2000).optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("chatbot_prompt_tests" as never)
      .update({ rating: data.rating, notes: data.notes ?? null } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    // Recompute avg rating for the prompt
    const { data: test } = await context.supabase
      .from("chatbot_prompt_tests" as never)
      .select("prompt_id").eq("id", data.id).maybeSingle();
    const promptId = (test as { prompt_id?: string | null } | null)?.prompt_id;
    if (promptId) {
      const { data: ratings } = await context.supabase
        .from("chatbot_prompt_tests" as never)
        .select("rating").eq("prompt_id", promptId).not("rating", "is", null);
      const nums = ((ratings ?? []) as { rating: number }[]).map((r) => r.rating);
      const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
      await sbAny(context.supabase).from("chatbot_prompts" as never)
        .update({ avg_rating: avg } as never).eq("id", promptId);
    }
    return { ok: true };
  });

// -------------------- Analytics --------------------

export const promptAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({
    workspaceId: z.string().uuid(),
    chatbotId: z.string().uuid().optional(),
    days: z.number().int().min(1).max(90).optional(),
  }).parse(v))
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - (data.days ?? 30) * 86400000).toISOString();
    let q = sbAny(context.supabase).from("chatbot_prompt_tests" as never)
      .select("prompt_id,latency_ms,rating,success,created_at")
      .eq("workspace_id", data.workspaceId).gte("created_at", since);
    if (data.chatbotId) q = q.eq("chatbot_id", data.chatbotId);
    const { data: rows } = await q;

    const list = (rows ?? []) as {
      prompt_id: string | null; latency_ms: number | null;
      rating: number | null; success: boolean;
    }[];
    const total = list.length;
    const failed = list.filter((r) => !r.success).length;
    const rated = list.filter((r) => r.rating != null);
    const avgRating = rated.length
      ? rated.reduce((a, b) => a + (b.rating ?? 0), 0) / rated.length : 0;
    const latencies = list.map((r) => r.latency_ms ?? 0).filter((n) => n > 0);
    const avgLatency = latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

    // Top prompts
    const byPrompt = new Map<string, number>();
    for (const r of list) if (r.prompt_id) byPrompt.set(r.prompt_id, (byPrompt.get(r.prompt_id) ?? 0) + 1);
    const top = Array.from(byPrompt.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return {
      totalTests: total,
      failedTests: failed,
      successRate: total ? Math.round(((total - failed) / total) * 100) : 100,
      avgLatency,
      avgRating: Math.round(avgRating * 100) / 100,
      topPrompts: top.map(([prompt_id, count]) => ({ prompt_id, count })),
    };
  });
