/**
 * AIEngine — provider-agnostic LLM call.
 *
 * Sits behind `runChat` from `src/lib/ai/complete.functions.ts`, which handles
 * provider selection, fallbacks, and rate limiting. This wrapper narrows the
 * surface used by the chatbot pipeline and makes it trivial to swap.
 */
import type { ChatMessage } from "./types";

export interface AIEngineOpts {
  workspaceId: string;
  userId?: string | null;
  providerId?: string | null;
  model: string;
  temperature: number;
  maxTokens: number;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  feature?: string;
}

export interface AIEngineResult {
  content: string;
  model: string;
  providerKind: string;
  tokensPrompt?: number;
  tokensCompletion?: number;
}

export const AIEngine = {
  async complete(opts: AIEngineOpts): Promise<AIEngineResult> {
    const { runChat } = await import("@/lib/ai/complete.functions");
    const res = await runChat({
      workspaceId: opts.workspaceId,
      userId: opts.userId ?? undefined,
      feature: opts.feature ?? "chatbot",
      primaryProviderId: opts.providerId ?? undefined,
      request: {
        messages: opts.messages,
        model: opts.model,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
      },
    });
    return {
      content: res.content?.trim() ?? "",
      model: res.model ?? opts.model,
      providerKind: res.providerKind,
      tokensPrompt: (res as { usage?: { prompt_tokens?: number } }).usage?.prompt_tokens,
      tokensCompletion: (res as { usage?: { completion_tokens?: number } }).usage?.completion_tokens,
    };
  },

  /** Utility for lightweight classification / rewriting tasks. */
  async oneShot(
    workspaceId: string,
    prompt: string,
    opts?: { model?: string; system?: string; maxTokens?: number },
  ): Promise<string> {
    const messages: ChatMessage[] = [];
    if (opts?.system) messages.push({ role: "system", content: opts.system });
    messages.push({ role: "user", content: prompt });
    const res = await AIEngine.complete({
      workspaceId,
      model: opts?.model ?? "google/gemini-2.5-flash",
      temperature: 0.1,
      maxTokens: opts?.maxTokens ?? 256,
      messages: messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user",
        content: m.content,
      })),
      feature: "chatbot.oneshot",
    });
    return res.content;
  },
};
