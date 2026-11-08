import type { AIModelRecord, TokenUsage } from "./types";

/** USD cost given a model's per-1k rates. Returns 0 for unknown models. */
export function computeCost(model: AIModelRecord | null, usage: TokenUsage | undefined): number {
  if (!model || !usage) return 0;
  const inCost = ((usage.prompt_tokens ?? 0) / 1000) * (model.inputCostPer1k ?? 0);
  const outCost = ((usage.completion_tokens ?? 0) / 1000) * (model.outputCostPer1k ?? 0);
  return Number((inCost + outCost).toFixed(6));
}
