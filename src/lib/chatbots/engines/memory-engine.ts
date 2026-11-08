/**
 * MemoryEngine — short/long-term memory for a chatbot session.
 *
 * • Short-term: rolling summary of the last N turns, kept per session.
 * • Long-term: durable facts about the contact (name, email, preferences),
 *   stored on `chatbot_sessions.metadata.long_memory` and merged across
 *   channels via the customer identity graph elsewhere in WACRM.
 *
 * Kept storage-agnostic: takes a `store` adapter so it can run against
 * Supabase in production and an in-memory Map in tests.
 */
import type { ChatMessage } from "./types";

export interface MemoryStore {
  loadShort(sessionId: string): Promise<string | null>;
  saveShort(sessionId: string, summary: string): Promise<void>;
  loadLong(sessionId: string): Promise<string | null>;
  saveLong(sessionId: string, facts: string): Promise<void>;
}

export const MemoryEngine = {
  /**
   * Produce a compressed running summary from the last few turns. Prefers a
   * cheap heuristic; the caller can plug an LLM summarizer for higher fidelity.
   */
  summarize(history: ChatMessage[], previous?: string | null, maxChars = 800): string {
    const recent = history.slice(-6);
    const bullets = recent.map((m) => {
      const who = m.role === "assistant" ? "bot" : "user";
      const line = m.content.replace(/\s+/g, " ").slice(0, 120);
      return `- ${who}: ${line}`;
    });
    const body = [previous ? `Previous:\n${previous}` : "", "Recent turns:", ...bullets]
      .filter(Boolean)
      .join("\n");
    return body.length > maxChars ? body.slice(-maxChars) : body;
  },

  /**
   * Extract durable facts from user messages using regex heuristics.
   * Merges with existing long memory, deduplicated line-by-line.
   */
  extractFacts(userMessage: string, previous?: string | null): string {
    const found: string[] = [];
    const nameMatch = userMessage.match(/\b(?:my\s+name\s+is|i(?:'|)m)\s+([A-Z][a-zA-Z]{1,30})/);
    if (nameMatch) found.push(`Name: ${nameMatch[1]}`);
    const emailMatch = userMessage.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    if (emailMatch) found.push(`Email: ${emailMatch[0]}`);
    const companyMatch = userMessage.match(/\b(?:i\s+work\s+at|from)\s+([A-Z][A-Za-z0-9 &.'-]{2,40})/);
    if (companyMatch) found.push(`Company: ${companyMatch[1]}`);

    const existing = (previous ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
    const merged = Array.from(new Set([...existing, ...found]));
    return merged.slice(-20).join("\n");
  },
};

/** In-memory store — for tests and local dev. */
export class InMemoryMemoryStore implements MemoryStore {
  private short = new Map<string, string>();
  private long = new Map<string, string>();
  async loadShort(id: string) { return this.short.get(id) ?? null; }
  async saveShort(id: string, s: string) { this.short.set(id, s); }
  async loadLong(id: string) { return this.long.get(id) ?? null; }
  async saveLong(id: string, s: string) { this.long.set(id, s); }
}
