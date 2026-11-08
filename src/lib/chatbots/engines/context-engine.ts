/**
 * ContextEngine — assembles the model input for one turn.
 *
 * Combines the bot's system prompt with retrieved KB context, current turn
 * intent/sentiment metadata, and long/short-term memory. Kept pure so it can
 * be unit-tested without a database.
 */
import type { ChatMessage, IntentResult, KbCitation, SentimentResult } from "./types";

export interface BuildContextInput {
  systemPrompt: string;
  ragContext?: string;
  citations?: KbCitation[];
  intent?: IntentResult | null;
  sentiment?: SentimentResult | null;
  shortMemory?: string;   // rolling summary of the last N turns
  longMemory?: string;    // durable facts about the contact
  locale?: string;
  history: ChatMessage[]; // recent history (oldest → newest)
  userMessage: string;
}

export interface BuiltContext {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  systemLength: number;
  tokensEstimate: number;
}

export const ContextEngine = {
  build(input: BuildContextInput): BuiltContext {
    const parts: string[] = [];
    parts.push(input.systemPrompt.trim());

    if (input.locale) parts.push(`Respond in the user's language (${input.locale}) unless asked otherwise.`);
    if (input.longMemory) parts.push(`Known facts about the user:\n${input.longMemory}`);
    if (input.shortMemory) parts.push(`Conversation summary so far:\n${input.shortMemory}`);
    if (input.intent) parts.push(`Detected intent: ${input.intent.name} (confidence ${input.intent.confidence.toFixed(2)}).`);
    if (input.sentiment) parts.push(`User sentiment: ${input.sentiment.label} (${input.sentiment.score.toFixed(2)}).`);
    if (input.ragContext) {
      parts.push(
        `Knowledge base context — use it as the primary source of truth. Cite sources as [1], [2]:\n${input.ragContext}`,
      );
    }
    parts.push("Rules: be concise, honest, and never invent facts outside the provided knowledge.");

    const system = parts.filter(Boolean).join("\n\n");

    const messages: BuiltContext["messages"] = [
      { role: "system" as const, content: system },
      ...input.history.map((m) => ({
        role: (m.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
        content: m.content,
      })),
      { role: "user" as const, content: input.userMessage },
    ];

    // Rough token estimate = chars / 4
    const total = messages.reduce((n, m) => n + m.content.length, 0);
    return {
      messages,
      systemLength: system.length,
      tokensEstimate: Math.ceil(total / 4),
    };
  },

  /** Truncate history so the context stays within `maxTokens`. */
  trim(history: ChatMessage[], maxTokens = 3000): ChatMessage[] {
    let budget = maxTokens * 4;
    const out: ChatMessage[] = [];
    for (let i = history.length - 1; i >= 0; i--) {
      const cost = history[i].content.length;
      if (cost > budget) break;
      out.unshift(history[i]);
      budget -= cost;
    }
    return out;
  },
};
