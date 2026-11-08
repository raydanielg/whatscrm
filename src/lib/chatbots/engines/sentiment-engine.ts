/**
 * SentimentEngine — very fast lexicon scoring for realtime routing.
 *
 * Not a replacement for a full sentiment model; it exists so the handoff and
 * context engines can react to angry customers without paying an LLM call.
 */
import type { SentimentResult } from "./types";

const POSITIVE = [
  "great","good","love","excellent","perfect","thanks","thank you","amazing",
  "awesome","fantastic","happy","pleased","brilliant",
];
const NEGATIVE = [
  "bad","terrible","awful","hate","angry","furious","broken","useless","scam",
  "worst","refund","complaint","frustrated","annoyed","disappointed","stupid",
];

export const SentimentEngine = {
  score(text: string): SentimentResult {
    const t = text.toLowerCase();
    let score = 0;
    for (const w of POSITIVE) if (t.includes(w)) score += 1;
    for (const w of NEGATIVE) if (t.includes(w)) score -= 1.2;
    if (/!{2,}/.test(text)) score -= 0.3;
    if (/[A-Z]{4,}/.test(text)) score -= 0.3; // shouting

    const norm = Math.max(-1, Math.min(1, score / 3));
    const label: SentimentResult["label"] =
      norm > 0.2 ? "positive" : norm < -0.2 ? "negative" : "neutral";
    return { score: norm, label };
  },
};
