/**
 * Shared types for the modular Chatbot Platform.
 *
 * Every engine is a small pure module that receives a typed context and
 * returns a typed result. The Orchestrator composes them for one turn.
 */
import type { ChatbotChannel, JsonValue } from "../chatbots.functions";

export type Role = "user" | "assistant" | "system" | "tool";

export interface ChatMessage {
  role: Role;
  content: string;
  createdAt?: string;
}

export interface KbCitation {
  article_id: string;
  title: string;
  similarity: number;
  content?: string;
}

export interface TurnRequest {
  workspaceId: string;
  chatbotId: string;
  sessionId?: string;
  channel: ChatbotChannel | string;
  externalId?: string | null;
  contactId?: string | null;
  message: string;
  /** Locale of the incoming message, if the adapter already detected it. */
  locale?: string;
  /** Free-form channel metadata (attachments, buttons, contact card). */
  meta?: Record<string, JsonValue>;
}

export interface TurnResult {
  sessionId: string;
  reply: string;
  citations: KbCitation[];
  intent: IntentResult | null;
  sentiment: SentimentResult | null;
  handoff: HandoffDecision;
  latencyMs: number;
  model: string;
  providerKind: string;
  /** Suggested quick replies for the channel adapter. */
  suggestions?: string[];
}

export interface IntentResult {
  name: string;
  confidence: number;
  entities: Record<string, string>;
}

export interface SentimentResult {
  score: number; // -1 negative  +1 positive
  label: "negative" | "neutral" | "positive";
}

export interface HandoffDecision {
  handoff: boolean;
  reason?: "keyword" | "intent" | "sentiment" | "flow" | "manual" | "fallback";
  targetTeamId?: string | null;
}

export interface EngineLogger {
  debug: (msg: string, data?: Record<string, unknown>) => void;
  info: (msg: string, data?: Record<string, unknown>) => void;
  warn: (msg: string, data?: Record<string, unknown>) => void;
  error: (msg: string, data?: Record<string, unknown>) => void;
}
