/**
 * HandoffEngine — decides whether to escalate to a human agent.
 *
 * Combines three signals:
 *  • keyword match on the bot's `handoff_keywords`
 *  • detected intent = "handoff"
 *  • repeated negative sentiment or repeated "unknown" intents
 *
 * Returns a HandoffDecision the orchestrator can act on (mark session
 * handed_off, notify agents, stop AI replies).
 */
import type { HandoffDecision, IntentResult, SentimentResult } from "./types";

export interface HandoffContext {
  handoffEnabled: boolean;
  keywords: string[];
  message: string;
  intent: IntentResult | null;
  sentiment: SentimentResult | null;
  consecutiveUnknown: number;
  consecutiveNegative: number;
  targetTeamId?: string | null;
}

export const HandoffEngine = {
  decide(ctx: HandoffContext): HandoffDecision {
    if (!ctx.handoffEnabled) return { handoff: false };

    const t = ctx.message.toLowerCase();
    if (ctx.keywords.some((k) => k && t.includes(k.toLowerCase()))) {
      return { handoff: true, reason: "keyword", targetTeamId: ctx.targetTeamId ?? null };
    }
    if (ctx.intent?.name === "handoff" && ctx.intent.confidence > 0.5) {
      return { handoff: true, reason: "intent", targetTeamId: ctx.targetTeamId ?? null };
    }
    if (ctx.sentiment?.label === "negative" && ctx.consecutiveNegative >= 2) {
      return { handoff: true, reason: "sentiment", targetTeamId: ctx.targetTeamId ?? null };
    }
    if (ctx.consecutiveUnknown >= 3) {
      return { handoff: true, reason: "fallback", targetTeamId: ctx.targetTeamId ?? null };
    }
    return { handoff: false };
  },
};
