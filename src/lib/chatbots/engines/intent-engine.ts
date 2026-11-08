/**
 * IntentEngine — classifies user messages into a small taxonomy.
 *
 * Uses a fast, deterministic keyword classifier as the first pass so we don't
 * spend an LLM call on trivial messages ("hi", "thanks", "cancel").
 * Falls back to a lightweight LLM classifier when the score is low.
 */
import type { IntentResult } from "./types";

export type IntentName =
  | "greeting"
  | "farewell"
  | "thanks"
  | "affirm"
  | "deny"
  | "help"
  | "pricing"
  | "purchase"
  | "cancel"
  | "refund"
  | "support"
  | "handoff"
  | "faq"
  | "unknown";

const RULES: Array<{ intent: IntentName; patterns: RegExp[] }> = [
  { intent: "greeting", patterns: [/\b(hi|hello|hey|good\s+(morning|evening|afternoon))\b/i] },
  { intent: "farewell", patterns: [/\b(bye|goodbye|see\s+you|talk\s+later)\b/i] },
  { intent: "thanks", patterns: [/\b(thanks|thank\s+you|thx|ty)\b/i] },
  { intent: "affirm", patterns: [/^\s*(yes|yeah|yep|sure|ok(ay)?|please\s+do)\b/i] },
  { intent: "deny", patterns: [/^\s*(no|nope|nah|not\s+really)\b/i] },
  { intent: "pricing", patterns: [/\b(price|pricing|cost|how\s+much|plan|plans|subscription)\b/i] },
  { intent: "purchase", patterns: [/\b(buy|purchase|checkout|order|upgrade)\b/i] },
  { intent: "cancel", patterns: [/\b(cancel|unsubscribe|stop\s+my\s+plan)\b/i] },
  { intent: "refund", patterns: [/\b(refund|money\s+back|chargeback)\b/i] },
  { intent: "support", patterns: [/\b(help|support|issue|problem|error|broken|not\s+working)\b/i] },
  { intent: "handoff", patterns: [/\b(agent|human|representative|real\s+person|escalate)\b/i] },
  { intent: "faq", patterns: [/\?$/] },
];

export const IntentEngine = {
  classifyFast(text: string): IntentResult {
    const t = text.trim();
    for (const rule of RULES) {
      for (const p of rule.patterns) {
        if (p.test(t)) {
          return { name: rule.intent, confidence: 0.85, entities: {} };
        }
      }
    }
    return { name: "unknown", confidence: 0.2, entities: {} };
  },

  /**
   * Extract simple entities (emails, phone numbers, currency amounts, order IDs).
   */
  extractEntities(text: string): Record<string, string> {
    const entities: Record<string, string> = {};
    const email = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0];
    if (email) entities.email = email;
    const phone = text.match(/\+?\d[\d\s().-]{7,}\d/)?.[0];
    if (phone) entities.phone = phone;
    const amount = text.match(/(?:USD|EUR|\$|€)\s?\d+(?:[.,]\d+)?/)?.[0];
    if (amount) entities.amount = amount;
    const order = text.match(/\b(?:order|#)\s*([A-Z0-9-]{4,})\b/i)?.[1];
    if (order) entities.order_id = order;
    return entities;
  },
};
