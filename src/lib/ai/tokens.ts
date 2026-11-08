/**
 * Token estimation. We avoid shipping tiktoken to the Worker runtime — instead
 * we use a fast heuristic (~4 chars/token for English, ~2.5 for CJK). Providers
 * report actual usage on success; the estimate is used for pre-flight sizing
 * and when a provider omits usage.
 */

import type { AIMessage, TokenUsage } from "./types";

export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Rough heuristic covering latin + CJK.
  const cjk = (text.match(/[\u3000-\u9fff\uac00-\ud7af]/g) || []).length;
  const rest = text.length - cjk;
  return Math.ceil(cjk / 1.5 + rest / 4);
}

export function estimateMessageTokens(messages: AIMessage[]): number {
  let total = 0;
  for (const m of messages) {
    total += estimateTokens(m.content) + 4; // ~4 token overhead per message
    if (m.tool_calls) {
      for (const tc of m.tool_calls) {
        total += estimateTokens(JSON.stringify(tc.arguments)) + 6;
      }
    }
  }
  return total + 3; // priming
}

export function mergeUsage(a: TokenUsage | undefined, b: TokenUsage | undefined): TokenUsage {
  return {
    prompt_tokens: (a?.prompt_tokens ?? 0) + (b?.prompt_tokens ?? 0),
    completion_tokens: (a?.completion_tokens ?? 0) + (b?.completion_tokens ?? 0),
    total_tokens: (a?.total_tokens ?? 0) + (b?.total_tokens ?? 0),
  };
}
