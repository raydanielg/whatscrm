/**
 * AI Conversation Engine — server functions.
 *
 * Covers:
 *   - Prompt settings CRUD (org / workspace / defaults)
 *   - Conversation lifecycle (create, list, get, rename, archive, reset)
 *   - Message history CRUD
 *   - Non-streaming send (chat, JSON mode, tool calling)
 *   - Language detection + translation utilities
 *
 * Streaming lives at `src/routes/api/ai/conversation.stream.ts` — this file
 * stays a client-safe module and lazy-loads the AI SDK inside handlers.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenantAccess } from "@/lib/auth/tenant-auth";
import { GEMINI_DEFAULT_CHAT_MODEL } from "@/lib/ai/gemini.server";
import { z } from "zod";
import type {
  Conversation,
  ConversationConfig,
  ConversationStatus,
  PromptSettings,
  UiMessage,
  Tone,
  Length,
} from "./types";

// ==================== Zod schemas ====================

const ToneEnum = z.enum([
  "professional",
  "friendly",
  "casual",
  "empathetic",
  "concise",
  "enthusiastic",
  "formal",
  "playful",
]);
const LengthEnum = z.enum(["short", "medium", "long"]);

const ConfigSchema: z.ZodType<ConversationConfig> = z
  .object({
    systemPrompt: z.string().optional(),
    tone: ToneEnum.optional(),
    length: LengthEnum.optional(),
    language: z.string().optional(),
    translateTo: z.string().nullable().optional(),
    model: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().min(16).max(8192).optional(),
    json: z.boolean().optional(),
    toolsEnabled: z.boolean().optional(),
    tools: z.array(z.string()).optional(),
    customerMemory: z.record(z.unknown()).nullable().optional(),
  })
  .passthrough() as z.ZodType<ConversationConfig>;

// ==================== Prompt Settings ====================

export const getPromptSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((v: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<PromptSettings | null> => {
    const { data: row, error } = await context.supabase
      .from("ai_prompt_settings" as never)
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row as PromptSettings | null) ?? null;
  });

export const upsertPromptSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        orgPrompt: z.string().nullable().optional(),
        workspacePrompt: z.string().nullable().optional(),
        defaultTone: ToneEnum.optional(),
        defaultLength: LengthEnum.optional(),
        defaultLanguage: z.string().nullable().optional(),
        defaultModel: z.string().optional(),
        fallbackMessage: z.string().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<PromptSettings> => {
    const patch: Record<string, unknown> = {
      workspace_id: data.workspaceId,
      updated_by: context.userId,
    };
    if (data.orgPrompt !== undefined) patch.org_prompt = data.orgPrompt;
    if (data.workspacePrompt !== undefined) patch.workspace_prompt = data.workspacePrompt;
    if (data.defaultTone) patch.default_tone = data.defaultTone;
    if (data.defaultLength) patch.default_length = data.defaultLength;
    if (data.defaultLanguage !== undefined) patch.default_language = data.defaultLanguage;
    if (data.defaultModel) patch.default_model = data.defaultModel;
    if (data.fallbackMessage) patch.fallback_message = data.fallbackMessage;

    const { data: row, error } = await context.supabase
      .from("ai_prompt_settings" as never)
      .upsert(patch as never, { onConflict: "workspace_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as PromptSettings;
  });

// ==================== Conversations ====================

export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).optional(),
        status: z.enum(["active", "archived", "reset"]).optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<Conversation[]> => {
    let q = context.supabase
      .from("ai_conversations" as never)
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(data.limit ?? 50);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as Conversation[];
  });

export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(
    async ({ data, context }): Promise<{ conversation: Conversation; messages: UiMessage[] }> => {
      const { data: conv, error } = await context.supabase
        .from("ai_conversations" as never)
        .select("*")
        .eq("id", data.id)
        .single();
      if (error) throw new Error(error.message);
      const { data: rows, error: mErr } = await context.supabase
        .from("ai_conversation_messages" as never)
        .select("*")
        .eq("conversation_id", data.id)
        .order("created_at", { ascending: true });
      if (mErr) throw new Error(mErr.message);
      return {
        conversation: conv as Conversation,
        messages: (rows ?? []).map(rowToUi),
      };
    },
  );

export const createConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        title: z.string().optional(),
        customerId: z.string().uuid().nullable().optional(),
        config: ConfigSchema.optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<Conversation> => {
    const { data: row, error } = await context.supabase
      .from("ai_conversations" as never)
      .insert({
        workspace_id: data.workspaceId,
        user_id: context.userId,
        customer_id: data.customerId ?? null,
        title: data.title?.trim() || "New conversation",
        config: (data.config ?? {}) as never,
      } as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as Conversation;
  });

export const updateConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((v: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().optional(),
        status: z.enum(["active", "archived", "reset"]).optional(),
        config: ConfigSchema.optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<Conversation> => {
    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.status) patch.status = data.status;
    if (data.config) patch.config = data.config;
    const { data: row, error } = await context.supabase
      .from("ai_conversations" as never)
      .update(patch as never)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as Conversation;
  });

export const deleteConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<{ deleted: true }> => {
    const { error } = await context.supabase
      .from("ai_conversations" as never)
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { deleted: true as const };
  });

/**
 * Reset a conversation: deletes all messages, marks status back to active,
 * clears message_count, and preserves the same conversation id.
 */
export const resetConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<{ reset: true }> => {
    const { error: dErr } = await context.supabase
      .from("ai_conversation_messages" as never)
      .delete()
      .eq("conversation_id", data.id);
    if (dErr) throw new Error(dErr.message);
    const { error: uErr } = await context.supabase
      .from("ai_conversations" as never)
      .update({
        message_count: 0,
        last_message_at: null,
        status: "active" as ConversationStatus,
      } as never)
      .eq("id", data.id);
    if (uErr) throw new Error(uErr.message);
    return { reset: true as const };
  });

// ==================== Send (non-streaming) ====================

/**
 * Send a user message and get an assistant reply back synchronously.
 * Handles: language detection, translation, tool calling, JSON mode,
 * fallback messages, and full persistence of the exchange.
 */
export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((v: unknown) =>
    z
      .object({
        conversationId: z.string().uuid(),
        message: z.string().min(1).max(20_000),
        overrideConfig: ConfigSchema.optional(),
      })
      .parse(v),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      userMessage: UiMessage;
      assistantMessage: UiMessage;
      conversation: Conversation;
    }> => {
      const started = Date.now();
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

      // 1. Load conversation + effective config + prompt settings
      const { data: convRow, error: cErr } = await context.supabase
        .from("ai_conversations" as never)
        .select("*")
        .eq("id", data.conversationId)
        .single();
      if (cErr) throw new Error(cErr.message);
      const conv = convRow as Conversation;
      const config: ConversationConfig = { ...(conv.config ?? {}), ...(data.overrideConfig ?? {}) };

      const { data: settingsRow } = await context.supabase
        .from("ai_prompt_settings" as never)
        .select("*")
        .eq("workspace_id", conv.workspace_id)
        .maybeSingle();
      const settings = (settingsRow ?? null) as PromptSettings | null;

      // 2. Language detection
      const { detectLanguageHeuristic, translate } = await import("./language.server");
      const { buildSystemPrompt } = await import("./prompts.server");
      const detected = detectLanguageHeuristic(data.message);

      // 3. Persist user message
      const { data: userRow, error: uErr } = await context.supabase
        .from("ai_conversation_messages" as never)
        .insert({
          conversation_id: conv.id,
          workspace_id: conv.workspace_id,
          role: "user",
          content: data.message,
          detected_language: detected,
          metadata: {},
        } as never)
        .select("*")
        .single();
      if (uErr) throw new Error(uErr.message);

      // 4. Load recent history (last 30 turns)
      const { data: historyRows } = await context.supabase
        .from("ai_conversation_messages" as never)
        .select("role,content,tool_calls")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true })
        .limit(60);

      // 5. Build messages
      const systemPrompt = buildSystemPrompt(settings, config);
      const history = ((historyRows ?? []) as Array<{ role: string; content: string }>)
        .map((r) => ({
          role: r.role as "user" | "assistant" | "system",
          content: r.content,
        }))
        .filter((m) => m.role === "user" || m.role === "assistant");

      // 6. Call the model via AI SDK
      const model = config.model ?? settings?.default_model ?? GEMINI_DEFAULT_CHAT_MODEL;
      const { generateText, Output, NoObjectGeneratedError, stepCountIs } = await import("ai");
      const { createDirectGeminiProvider } = await import("@/lib/ai-gateway.server");
      const gateway = createDirectGeminiProvider(apiKey, {
        structuredOutputs: model.startsWith("openai/") && !!config.json,
      });
      const languageModel = gateway(model);

      let assistantText = "";
      let toolCalls: Array<{ name: string; args: unknown; result?: unknown }> = [];
      let status: "ok" | "failed" = "ok";
      let usage: { promptTokens?: number; completionTokens?: number } = {};

      try {
        if (config.json) {
          // JSON mode — schema-free (accept any JSON object). Model instructed by prompt.
          try {
            const { output, usage: u } = await generateText({
              model: languageModel,
              system: systemPrompt,
              messages: [...history, { role: "user", content: data.message }],
              output: Output.object({ schema: z.record(z.unknown()) }),
              temperature: config.temperature ?? 0.2,
            });
            assistantText = JSON.stringify(output);
            usage = { promptTokens: u?.inputTokens, completionTokens: u?.outputTokens };
          } catch (err) {
            if (NoObjectGeneratedError.isInstance(err)) {
              assistantText = err.text ?? "";
              status = assistantText ? "ok" : "failed";
            } else throw err;
          }
        } else if (config.toolsEnabled) {
          const { buildConversationTools } = await import("./tools.server");
          const tools = buildConversationTools(
            {
              supabase: context.supabase,
              workspaceId: conv.workspace_id,
              userId: context.userId,
              conversationId: conv.id,
            },
            config.tools,
          );
          const {
            text,
            toolCalls: calls,
            toolResults,
            usage: u,
          } = await generateText({
            model: languageModel,
            system: systemPrompt,
            messages: [...history, { role: "user", content: data.message }],
            tools,
            stopWhen: stepCountIs(50),
            temperature: config.temperature ?? 0.4,
          });
          assistantText = text;
          toolCalls = (calls ?? []).map((c, i) => ({
            name: c.toolName,
            args: c.input,
            result: toolResults?.[i]?.output,
          }));
          usage = { promptTokens: u?.inputTokens, completionTokens: u?.outputTokens };
        } else {
          const { text, usage: u } = await generateText({
            model: languageModel,
            system: systemPrompt,
            messages: [...history, { role: "user", content: data.message }],
            temperature: config.temperature ?? 0.4,
          });
          assistantText = text;
          usage = { promptTokens: u?.inputTokens, completionTokens: u?.outputTokens };
        }
      } catch (e) {
        status = "failed";
        assistantText =
          settings?.fallback_message ?? "I ran into a problem answering that. Please try again.";
        // Non-fatal — still persist the fallback so the UI has something to show.
        console.error("[ai-conversation] model call failed", e);
      }

      // 7. Optional translation
      if (config.translateTo && status === "ok" && !config.json) {
        assistantText = await translate({
          apiKey,
          text: assistantText,
          targetLanguage: config.translateTo,
          sourceLanguage: detected,
          model,
        });
      }

      const latencyMs = Date.now() - started;

      // 8. Persist assistant message
      const { data: asstRow, error: aErr } = await context.supabase
        .from("ai_conversation_messages" as never)
        .insert({
          conversation_id: conv.id,
          workspace_id: conv.workspace_id,
          role: "assistant",
          content: assistantText,
          tool_calls: toolCalls.length ? toolCalls : null,
          model,
          tokens_in: usage.promptTokens ?? null,
          tokens_out: usage.completionTokens ?? null,
          latency_ms: latencyMs,
          language: config.translateTo ?? config.language ?? null,
          detected_language: detected,
          status,
        } as never)
        .select("*")
        .single();
      if (aErr) throw new Error(aErr.message);

      // 9. Bump conversation counters + auto-title on first turn
      const nextCount = (conv.message_count ?? 0) + 2;
      let title = conv.title;
      if (conv.message_count === 0 && (!title || title === "New conversation")) {
        title = data.message.split(/\s+/).slice(0, 8).join(" ").slice(0, 80) || title;
      }
      const { data: updated } = await context.supabase
        .from("ai_conversations" as never)
        .update({
          message_count: nextCount,
          last_message_at: new Date().toISOString(),
          title,
        } as never)
        .eq("id", conv.id)
        .select("*")
        .single();

      return {
        userMessage: rowToUi(userRow),
        assistantMessage: rowToUi(asstRow),
        conversation: (updated ?? conv) as Conversation,
      };
    },
  );

// ==================== Utilities ====================

export const detectLanguage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((v: unknown) => z.object({ text: z.string() }).parse(v))
  .handler(async ({ data }): Promise<{ language: string | null }> => {
    const { detectLanguageHeuristic } = await import("./language.server");
    return { language: detectLanguageHeuristic(data.text) };
  });

export const translateText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((v: unknown) =>
    z
      .object({
        text: z.string().min(1),
        targetLanguage: z.string().min(2),
        sourceLanguage: z.string().nullable().optional(),
        model: z.string().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data }): Promise<{ text: string }> => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
    const { translate } = await import("./language.server");
    const text = await translate({
      apiKey,
      text: data.text,
      targetLanguage: data.targetLanguage,
      sourceLanguage: data.sourceLanguage ?? null,
      model: data.model,
    });
    return { text };
  });

// ==================== Helpers ====================

function rowToUi(r: unknown): UiMessage {
  const row = r as Record<string, unknown>;
  return {
    id: row.id as string,
    role: row.role as UiMessage["role"],
    content: (row.content as string) ?? "",
    toolCalls: (row.tool_calls as UiMessage["toolCalls"]) ?? undefined,
    model: (row.model as string) ?? null,
    tokensIn: (row.tokens_in as number) ?? null,
    tokensOut: (row.tokens_out as number) ?? null,
    latencyMs: (row.latency_ms as number) ?? null,
    language: (row.language as string) ?? null,
    detectedLanguage: (row.detected_language as string) ?? null,
    status: (row.status as UiMessage["status"]) ?? "ok",
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
  };
}

// Re-export types for hook consumers
export type { Conversation, ConversationConfig, UiMessage, PromptSettings, Tone, Length };
