/**
 * AI Conversation Engine — shared types (client-safe).
 */

export type Json = string | number | boolean | null | { [k: string]: Json } | Json[];
export type Role = "system" | "user" | "assistant" | "tool";
export type Tone =
  | "professional" | "friendly" | "casual" | "empathetic"
  | "concise" | "enthusiastic" | "formal" | "playful";
export type Length = "short" | "medium" | "long";
export type ConversationStatus = "active" | "archived" | "reset";

export interface ConversationConfig {
  /** Free-form prompt appended after org + workspace prompts. */
  systemPrompt?: string;
  tone?: Tone;
  length?: Length;
  /** ISO-639-1, e.g. "en", "no", "es". `auto` = detect per message. */
  language?: string | "auto";
  /** Auto-translate outgoing replies to this language. */
  translateTo?: string | null;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Return the assistant reply as strict JSON of the given schema. */
  json?: boolean;
  /** Enable server-side tool calling. */
  toolsEnabled?: boolean;
  /** Selected tool names (from the server registry). Empty = all enabled. */
  tools?: string[];
  /** Customer context injected as a memory block. */
  customerMemory?: Json | null;
}

export interface UiMessage {
  id: string;
  role: Role;
  content: string;
  toolCalls?: Array<{ name: string; args: Json; result?: Json }>;
  model?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  latencyMs?: number | null;
  language?: string | null;
  detectedLanguage?: string | null;
  status?: "ok" | "failed" | "pending";
  createdAt: string;
}

export interface Conversation {
  id: string;
  workspace_id: string;
  user_id: string | null;
  customer_id: string | null;
  title: string;
  status: ConversationStatus;
  config: ConversationConfig;
  metadata: Json;
  message_count: number;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PromptSettings {
  workspace_id: string;
  org_prompt: string | null;
  workspace_prompt: string | null;
  default_tone: Tone;
  default_length: Length;
  default_language: string | null;
  default_model: string;
  fallback_message: string;
  updated_at: string;
}
