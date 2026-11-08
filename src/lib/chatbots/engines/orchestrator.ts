/**
 * ChatbotOrchestrator — composes every engine into one turn.
 *
 * Pipeline per user message:
 *   1. ChannelAdapter (already parsed by the caller)
 *   2. IntentEngine + SentimentEngine (fast, non-LLM)
 *   3. FlowEngine.step()  — if a deterministic flow handles the turn, use it
 *   4. HandoffEngine.decide() — early exit if we should escalate
 *   5. MemoryEngine  — pull short/long memory
 *   6. KbEngine.retrieve() — RAG context (bot.rag_enabled)
 *   7. ContextEngine.build() — assemble messages
 *   8. AIEngine.complete() — LLM call
 *   9. MemoryEngine.summarize()/extractFacts() — persist
 *  10. AnalyticsEngine metrics attached to the turn result
 *
 * The Orchestrator is intentionally storage-agnostic: it takes a `deps` bag
 * so it can run against Supabase in production and in-memory adapters in
 * tests. The existing `chatbotChat` server function is the production wiring.
 */
import type { Chatbot } from "../chatbots.functions";
import { AIEngine } from "./ai-engine";
import { ContextEngine } from "./context-engine";
import { FlowEngine, type FlowGraph, type FlowState } from "./flow-engine";
import { HandoffEngine } from "./handoff-engine";
import { IntentEngine } from "./intent-engine";
import { KbEngine } from "./kb-engine";
import { MemoryEngine, type MemoryStore } from "./memory-engine";
import { SentimentEngine } from "./sentiment-engine";
import type { ChatMessage, TurnRequest, TurnResult } from "./types";

export interface OrchestratorDeps {
  /** Persist a user message row; returns nothing. */
  saveMessage: (row: {
    sessionId: string; role: "user" | "assistant" | "system" | "tool";
    content: string; citations?: unknown; latencyMs?: number; model?: string; providerKind?: string;
  }) => Promise<void>;
  /** Persist / restore session state. */
  loadSession: (
    sessionId: string | undefined, seed: { chatbotId: string; workspaceId: string; channel: string; externalId?: string | null }
  ) => Promise<{ id: string; flowState: FlowState; unknownStreak: number; negativeStreak: number }>;
  saveSession: (
    id: string, patch: { flowState?: FlowState; unknownStreak?: number; negativeStreak?: number; handoff?: { reason: string; teamId?: string | null }; lastMessageAt?: string; messageCount?: number }
  ) => Promise<void>;
  /** Load the last N turns for context building. */
  loadHistory: (sessionId: string, limit: number) => Promise<ChatMessage[]>;
  memory: MemoryStore;
  /** Supabase RPC handle for KB retrieval. */
  supabaseRpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
}

export interface RunTurnInput {
  bot: Chatbot;
  request: TurnRequest;
  deps: OrchestratorDeps;
}

export async function runChatbotTurn({ bot, request, deps }: RunTurnInput): Promise<TurnResult> {
  const started = Date.now();

  // 1. Session + history
  const session = await deps.loadSession(request.sessionId, {
    chatbotId: bot.id, workspaceId: bot.workspace_id,
    channel: request.channel, externalId: request.externalId ?? null,
  });

  await deps.saveMessage({
    sessionId: session.id, role: "user", content: request.message,
  });

  const history = ContextEngine.trim(await deps.loadHistory(session.id, 20), 2500);

  // 2. Intent + sentiment
  const intent = IntentEngine.classifyFast(request.message);
  intent.entities = IntentEngine.extractEntities(request.message);
  const sentiment = SentimentEngine.score(request.message);

  const unknownStreak = intent.name === "unknown" ? session.unknownStreak + 1 : 0;
  const negativeStreak = sentiment.label === "negative" ? session.negativeStreak + 1 : 0;

  // 3. Flow engine (deterministic branch)
  const flow = bot.flow as unknown as FlowGraph | null;
  let reply: string | null = null;
  let quickReplies: string[] | undefined;
  let handoffFromFlow: { reason: string; teamId?: string | null } | undefined;
  let nextFlowState = session.flowState;

  if (flow && !FlowEngine.isEmpty(flow as unknown as never)) {
    const step = FlowEngine.step(flow, session.flowState, request.message, intent.name);
    nextFlowState = step.state;
    if (step.reply) reply = step.reply;
    quickReplies = step.quickReplies;
    if (step.handoff) handoffFromFlow = step.handoff;
  }

  // 4. Handoff decision
  const handoff = HandoffEngine.decide({
    handoffEnabled: bot.handoff_enabled,
    keywords: bot.handoff_keywords ?? [],
    message: request.message,
    intent, sentiment,
    consecutiveUnknown: unknownStreak,
    consecutiveNegative: negativeStreak,
  });
  if (handoffFromFlow) {
    handoff.handoff = true;
    handoff.reason = "flow";
    handoff.targetTeamId = handoffFromFlow.teamId ?? null;
  }

  if (handoff.handoff) {
    const msg = "Connecting you with a human agent — one moment.";
    await deps.saveMessage({ sessionId: session.id, role: "assistant", content: msg, latencyMs: Date.now() - started });
    await deps.saveSession(session.id, {
      flowState: nextFlowState, unknownStreak, negativeStreak,
      handoff: { reason: handoff.reason ?? "manual", teamId: handoff.targetTeamId ?? null },
      lastMessageAt: new Date().toISOString(),
    });
    return {
      sessionId: session.id, reply: msg, citations: [], intent, sentiment, handoff,
      latencyMs: Date.now() - started, model: "", providerKind: "",
    };
  }

  // 5. Memory
  const longMemory = await deps.memory.loadLong(session.id);
  const shortMemory = await deps.memory.loadShort(session.id);

  // 6. RAG
  let citations: TurnResult["citations"] = [];
  let ragContext = "";
  if (bot.rag_enabled && !reply) {
    citations = await KbEngine.retrieve({
      workspaceId: bot.workspace_id,
      query: request.message,
      matchCount: bot.rag_match_count ?? 5,
      minSimilarity: bot.rag_min_similarity ?? 0.25,
      supabaseRpc: deps.supabaseRpc,
    });
    ragContext = KbEngine.format(citations);
  }

  // 7. Context
  const ctx = ContextEngine.build({
    systemPrompt: bot.system_prompt,
    ragContext,
    citations,
    intent, sentiment,
    shortMemory: shortMemory ?? undefined,
    longMemory: longMemory ?? undefined,
    locale: request.locale,
    history,
    userMessage: request.message,
  });

  // 8. AI (skipped if flow already produced a reply)
  let model = bot.model ?? "google/gemini-2.5-flash";
  let providerKind = "";
  if (!reply) {
    try {
      const ai = await AIEngine.complete({
        workspaceId: bot.workspace_id,
        providerId: bot.provider_id ?? undefined,
        model,
        temperature: bot.temperature ?? 0.4,
        maxTokens: bot.max_tokens ?? 800,
        messages: ctx.messages,
      });
      reply = ai.content || bot.fallback_message;
      model = ai.model;
      providerKind = ai.providerKind;
    } catch {
      reply = bot.fallback_message;
    }
  }

  const finalReply = reply ?? bot.fallback_message;
  const latencyMs = Date.now() - started;

  await deps.saveMessage({
    sessionId: session.id, role: "assistant", content: finalReply,
    citations, latencyMs, model, providerKind,
  });

  // 9. Memory persistence
  const updatedShort = MemoryEngine.summarize(
    [...history, { role: "user", content: request.message }, { role: "assistant", content: finalReply }],
    shortMemory,
  );
  await deps.memory.saveShort(session.id, updatedShort);
  const nextFacts = MemoryEngine.extractFacts(request.message, longMemory);
  if (nextFacts) await deps.memory.saveLong(session.id, nextFacts);

  await deps.saveSession(session.id, {
    flowState: nextFlowState, unknownStreak, negativeStreak,
    lastMessageAt: new Date().toISOString(),
  });

  return {
    sessionId: session.id, reply: finalReply, citations, intent, sentiment,
    handoff: { handoff: false },
    latencyMs, model, providerKind,
    suggestions: quickReplies,
  };
}
