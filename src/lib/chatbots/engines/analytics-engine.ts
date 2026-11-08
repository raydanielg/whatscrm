/**
 * AnalyticsEngine — records per-turn metrics and computes KPIs.
 *
 * Emits lightweight events into `chatbot_messages` (latency, tokens, model,
 * provider) and aggregates into `chatbot_analytics` on read. The
 * `chatbotAnalytics` server function in `chatbots.functions.ts` consumes
 * these fields.
 */
import type { HandoffDecision, IntentResult, SentimentResult } from "./types";

export interface TurnMetrics {
  latencyMs: number;
  tokensPrompt?: number;
  tokensCompletion?: number;
  intent: IntentResult | null;
  sentiment: SentimentResult | null;
  handoff: HandoffDecision;
  ragHits: number;
  model: string;
  providerKind: string;
}

export interface AggregateInput {
  sessions: Array<{ status: "active" | "handed_off" | "closed"; created_at: string }>;
  messages: Array<{ role: string; latency_ms: number | null; created_at: string }>;
}

export interface AggregateOutput {
  sessionCount: number;
  messageCount: number;
  assistantCount: number;
  handoffCount: number;
  handoffRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  byDay: Array<{ date: string; sessions: number; messages: number }>;
}

export const AnalyticsEngine = {
  aggregate(input: AggregateInput): AggregateOutput {
    const sessions = input.sessions ?? [];
    const messages = input.messages ?? [];
    const handoffCount = sessions.filter((s) => s.status === "handed_off").length;
    const assistantMsgs = messages.filter((m) => m.role === "assistant");
    const latencies = assistantMsgs.map((m) => m.latency_ms ?? 0).filter((n) => n > 0).sort((a, b) => a - b);
    const avg = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    const p95 = latencies.length ? latencies[Math.floor(latencies.length * 0.95)] ?? latencies[latencies.length - 1] : 0;

    const byDayMap = new Map<string, { sessions: number; messages: number }>();
    for (const s of sessions) {
      const d = s.created_at.slice(0, 10);
      const e = byDayMap.get(d) ?? { sessions: 0, messages: 0 };
      e.sessions++; byDayMap.set(d, e);
    }
    for (const m of messages) {
      const d = m.created_at.slice(0, 10);
      const e = byDayMap.get(d) ?? { sessions: 0, messages: 0 };
      e.messages++; byDayMap.set(d, e);
    }
    const byDay = Array.from(byDayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));

    return {
      sessionCount: sessions.length,
      messageCount: messages.length,
      assistantCount: assistantMsgs.length,
      handoffCount,
      handoffRate: sessions.length ? Math.round((handoffCount / sessions.length) * 100) : 0,
      avgLatencyMs: Math.round(avg),
      p95LatencyMs: Math.round(p95),
      byDay,
    };
  },
};
