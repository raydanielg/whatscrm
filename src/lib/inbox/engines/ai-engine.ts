/**
 * AI Engine — provider-abstracted intelligence layer.
 *
 * Uses the existing `src/lib/ai/providers/*` gateway (OpenAI / Gemini /
 * Claude / Lovable AI) so the Inbox never talks to a specific LLM.
 *
 * Features exposed to the Inbox:
 *   - Reply drafting (channel-aware tone)
 *   - Summarization (whole conversation, since last-read)
 *   - Sentiment + intent tagging
 *   - Language detection + auto-translate
 *   - Lead qualification score
 *   - Next-best-action suggestions
 *   - RAG grounding over Knowledge Base
 *   - Voice-note transcription (STT) & TTS previews
 *   - Semantic search reranker for the Search Engine
 */

export type AITask =
  | "draft_reply"
  | "summarize"
  | "sentiment"
  | "intent"
  | "translate"
  | "qualify_lead"
  | "next_best_action"
  | "transcribe"
  | "rerank";

export interface AIRequest<T = unknown> {
  workspaceId: string;
  conversationId?: string;
  task: AITask;
  input: T;
  locale?: string;
}
