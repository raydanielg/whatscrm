/**
 * AI Conversation Engine — streaming endpoint.
 *
 * POST /api/ai/conversation-stream
 * Body: { conversationId: string, message: string, overrideConfig?: ConversationConfig }
 * Auth: Bearer <supabase-access-token> in Authorization header.
 *
 * Streams the assistant reply using the AI SDK's UI message stream so the
 * client can use `useChat`. Persists the full user + assistant messages
 * once the stream completes (in `onFinish`).
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from "ai";
import { z } from "zod";
import { createDirectGeminiProvider } from "@/lib/ai-gateway.server";
import { GEMINI_DEFAULT_CHAT_MODEL } from "@/lib/ai/gemini.server";
import { buildSystemPrompt } from "@/lib/ai/conversation/prompts.server";
import { detectLanguageHeuristic } from "@/lib/ai/conversation/language.server";
import { buildConversationTools } from "@/lib/ai/conversation/tools.server";
import type { Conversation, ConversationConfig, PromptSettings } from "@/lib/ai/conversation/types";
import type { Database } from "@/integrations/supabase/types";
import { sbAny } from "@/lib/supabase/untyped";

const BodySchema = z.object({
  conversationId: z.string().uuid(),
  message: z.string().min(1).max(20_000),
  overrideConfig: z.record(z.unknown()).optional(),
});

export const Route = createFileRoute("/api/ai/conversation-stream")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // --- 1. Auth ---
        const authHeader = request.headers.get("authorization") ?? "";
        if (!authHeader.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = authHeader.slice("Bearer ".length);

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        const apiKey = process.env.GEMINI_API_KEY;
        if (!supabaseUrl || !supabaseKey || !apiKey) {
          return new Response("Server misconfigured", { status: 500 });
        }

        const isNewKey = supabaseKey.startsWith("sb_");
        const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            fetch: (input, init) => {
              const headers = new Headers(init?.headers);
              if (isNewKey && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
                headers.delete("Authorization");
              }
              headers.set("apikey", supabaseKey);
              headers.set("Authorization", `Bearer ${token}`);
              return fetch(input, { ...init, headers });
            },
          },
        });
        const { data: claims, error: cErr } = await supabase.auth.getClaims(token);
        if (cErr || !claims?.claims?.sub) {
          return new Response("Unauthorized", { status: 401 });
        }
        const userId = claims.claims.sub;

        // --- 2. Parse body ---
        let body: z.infer<typeof BodySchema>;
        try {
          body = BodySchema.parse(await request.json());
        } catch (e) {
          return new Response(e instanceof Error ? e.message : "Bad request", { status: 400 });
        }

        // --- 3. Load conversation + settings (RLS enforces access) ---
        const { data: convRow, error: convErr } = await supabase
          .from("ai_conversations" as never)
          .select("*")
          .eq("id", body.conversationId)
          .single();
        if (convErr || !convRow) {
          return new Response("Conversation not found", { status: 404 });
        }
        const conv = convRow as Conversation;
        // Only allow safe client-side overrides; never let callers inject model/tools.
        const SAFE_OVERRIDE_KEYS: Array<keyof ConversationConfig> = ["language", "tone"];
        const safeOverride: Partial<ConversationConfig> = {};
        for (const key of SAFE_OVERRIDE_KEYS) {
          const v = (body.overrideConfig as Record<string, unknown> | undefined)?.[key];
          if (v !== undefined) (safeOverride as Record<string, unknown>)[key] = v;
        }
        const config: ConversationConfig = {
          ...(conv.config ?? {}),
          ...safeOverride,
        };

        const { data: settingsRow } = await supabase
          .from("ai_prompt_settings" as never)
          .select("*")
          .eq("workspace_id", conv.workspace_id)
          .maybeSingle();
        const settings = (settingsRow ?? null) as PromptSettings | null;

        // --- 4. History ---
        const { data: historyRows } = await supabase
          .from("ai_conversation_messages" as never)
          .select("role,content")
          .eq("conversation_id", conv.id)
          .order("created_at", { ascending: true })
          .limit(60);
        const history = ((historyRows ?? []) as Array<{ role: string; content: string }>)
          .filter((r) => r.role === "user" || r.role === "assistant")
          .map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));

        // --- 5. Persist user message immediately ---
        const detected = detectLanguageHeuristic(body.message);
        const { data: userRow } = await supabase
          .from("ai_conversation_messages" as never)
          .insert({
            conversation_id: conv.id,
            workspace_id: conv.workspace_id,
            role: "user",
            content: body.message,
            detected_language: detected,
          } as never)
          .select("id")
          .single();

        // --- 6. Model call ---
        const model = config.model ?? settings?.default_model ?? GEMINI_DEFAULT_CHAT_MODEL;
        const gateway = createDirectGeminiProvider(apiKey);
        const languageModel = gateway(model);
        const systemPrompt = buildSystemPrompt(settings, config);

        const tools = config.toolsEnabled
          ? buildConversationTools(
              {
                supabase,
                workspaceId: conv.workspace_id,
                userId,
                conversationId: conv.id,
              },
              config.tools,
            )
          : undefined;

        const started = Date.now();
        const result = streamText({
          model: languageModel,
          system: systemPrompt,
          messages: [...history, { role: "user", content: body.message }],
          tools,
          stopWhen: tools ? stepCountIs(50) : undefined,
          temperature: config.temperature ?? 0.4,
          onFinish: async ({ text, toolCalls, usage }) => {
            const latencyMs = Date.now() - started;
            try {
              await sbAny(supabase)
                .from("ai_conversation_messages" as never)
                .insert({
                  conversation_id: conv.id,
                  workspace_id: conv.workspace_id,
                  role: "assistant",
                  content: text ?? "",
                  tool_calls: toolCalls?.length
                    ? toolCalls.map((c) => ({ name: c.toolName, args: c.input }))
                    : null,
                  model,
                  tokens_in: usage?.inputTokens ?? null,
                  tokens_out: usage?.outputTokens ?? null,
                  latency_ms: latencyMs,
                  detected_language: detected,
                  status: "ok",
                } as never);
              await sbAny(supabase)
                .from("ai_conversations" as never)
                .update({
                  message_count: (conv.message_count ?? 0) + 2,
                  last_message_at: new Date().toISOString(),
                } as never)
                .eq("id", conv.id);
            } catch (e) {
              console.error("[ai-conversation stream] persist failed", e);
            }
          },
        });

        return result.toUIMessageStreamResponse({
          originalMessages: history.map((h, i) => ({
            id: `hist-${i}`,
            role: h.role,
            parts: [{ type: "text", text: h.content }],
          })) as UIMessage[],
          headers: {
            "X-WACRM-User-Message-Id": (userRow as { id?: string } | null)?.id ?? "",
          },
        });
      },
    },
  },
});

// Silence unused-import warning when convertToModelMessages isn't referenced.
void convertToModelMessages;
