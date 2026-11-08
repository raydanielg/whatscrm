/**
 * Live Chat AI Assistant
 *
 * Enriches each visitor turn with the shared WACRM AI Provider Engine:
 *   • Language detection + optional translation
 *   • Intent classification (support / sales / faq / booking / other)
 *   • Sentiment analysis
 *   • RAG-grounded reply via the workspace Knowledge Base
 *   • Product recommendations, appointment suggestions, FAQ answers
 *   • Lead qualification score
 *   • Conversation summary
 *   • Escalation / human-handoff decision
 *
 * All model calls go through `runChat` in the shared provider engine so the
 * bot's configured provider (OpenAI / Gemini / Anthropic / custom) is honored,
 * with credit metering, logging, and fallbacks.
 *
 * This module is server-only. Import it inside handlers, never at module
 * scope of a client-imported file.
 */

import type { WidgetBot } from "./widget-runtime.server";
import { sbAny } from "@/lib/supabase/untyped";

// ------------------------------ Types ------------------------------

export type Sentiment = "positive" | "neutral" | "negative" | "frustrated";
export type Intent =
  | "greeting"
  | "question"
  | "support_issue"
  | "sales_inquiry"
  | "pricing"
  | "booking"
  | "complaint"
  | "handoff_request"
  | "smalltalk"
  | "other";

export interface AssistantAnalysis {
  language: string;
  intent: Intent;
  sentiment: Sentiment;
  sentimentScore: number;
  topics: string[];
  leadScore: number;
  leadStage: "cold" | "warm" | "hot" | "qualified" | "unqualified";
  productRecommendations: string[];
  appointmentSuggested: boolean;
  appointmentReason: string | null;
  escalate: boolean;
  escalationReason: string | null;
  summary: string;
}

export interface KbHit {
  articleId: string;
  title: string;
  snippet: string;
  similarity: number;
  url?: string | null;
}

export interface AssistantContext {
  reply: string;
  kbHits: KbHit[];
  analysis: AssistantAnalysis;
  handoff: boolean;
  handoffReason: string | null;
}

// ------------------------------ Helpers ------------------------------

function extractJson<T>(raw: string): T | null {
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const DEFAULT_ANALYSIS: AssistantAnalysis = {
  language: "en",
  intent: "other",
  sentiment: "neutral",
  sentimentScore: 0,
  topics: [],
  leadScore: 0,
  leadStage: "cold",
  productRecommendations: [],
  appointmentSuggested: false,
  appointmentReason: null,
  escalate: false,
  escalationReason: null,
  summary: "",
};

// ------------------------------ KB retrieval ------------------------------

export async function retrieveKb(
  workspaceId: string,
  query: string,
  matchCount = 4,
): Promise<KbHit[]> {
  try {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { retrieveKbContext } = await import("@/lib/kb/kb.functions");
    const rpc = async (fn: string, args: Record<string, unknown>) => {
      const { data, error } = await sbAny(supabaseAdmin).rpc(fn as never, args as never);
      return { data, error: error ? { message: error.message } : null };
    };
    const rows = await retrieveKbContext({
      supabaseRpc: rpc,
      workspaceId,
      query,
      matchCount,
      minSimilarity: 0.2,
    });
    return rows.slice(0, matchCount).map((r) => ({
      articleId: (r as { article_id?: string }).article_id ?? "",
      title: (r as { title?: string }).title ?? "Article",
      snippet: ((r as { content?: string }).content ?? "").slice(0, 400),
      similarity: (r as { similarity?: number }).similarity ?? 0,
      url: (r as { url?: string | null }).url ?? null,
    }));
  } catch {
    return [];
  }
}

// ------------------------------ Analysis ------------------------------

interface AnalysisInput {
  bot: WidgetBot;
  userMessage: string;
  history: { role: "user" | "assistant"; content: string }[];
  kbHits: KbHit[];
}

/**
 * One structured LLM pass that returns every insight we need. Doing this in
 * one round-trip keeps latency and cost predictable — the visitor should
 * never wait on multiple sequential model calls.
 */
export async function analyzeConversation(
  input: AnalysisInput,
): Promise<AssistantAnalysis> {
  const { bot, userMessage, history, kbHits } = input;

  const transcript = history
    .slice(-8)
    .map((m) => `${m.role === "user" ? "Visitor" : "Assistant"}: ${m.content}`)
    .join("\n");

  const kbSnippet = kbHits.length
    ? kbHits.map((h, i) => `[${i + 1}] ${h.title}: ${h.snippet}`).join("\n")
    : "(no knowledge base results)";

  const systemPrompt = [
    "You are an analytical assistant for a customer-support live chat.",
    "Given the latest visitor message and short conversation history, return ONLY a JSON object matching this TypeScript type:",
    `{
  "language": string,               // ISO 639-1 code, e.g. "en", "es", "fr"
  "intent": "greeting"|"question"|"support_issue"|"sales_inquiry"|"pricing"|"booking"|"complaint"|"handoff_request"|"smalltalk"|"other",
  "sentiment": "positive"|"neutral"|"negative"|"frustrated",
  "sentiment_score": number,        // -1..1
  "topics": string[],               // up to 5 short topic tags
  "lead_score": number,             // 0..100
  "lead_stage": "cold"|"warm"|"hot"|"qualified"|"unqualified",
  "product_recommendations": string[], // up to 3 short product/service names inferred from context, [] if none
  "appointment_suggested": boolean,
  "appointment_reason": string|null,
  "escalate": boolean,              // true when a human should take over
  "escalation_reason": string|null,
  "summary": string                 // one-sentence summary of the visitor's need
}`,
    "Return ONLY the JSON — no markdown, no commentary.",
  ].join("\n");

  const userPrompt = [
    `Business context: ${bot.organization_prompt || bot.system_prompt || "General customer support"}`,
    `\nConversation:\n${transcript}`,
    `\nLatest visitor message: ${userMessage}`,
    `\nRelevant knowledge base:\n${kbSnippet}`,
  ].join("\n");

  try {
    const { runChat } = await import("@/lib/ai/complete.functions");
    const res = await runChat({
      workspaceId: bot.workspace_id,
      userId: null,
      feature: "widget-analysis",
      primaryProviderId: bot.provider_id,
      request: {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        model: bot.model || "google/gemini-2.5-flash",
        temperature: 0.1,
        max_tokens: 500,
      },
    });

    const parsed = extractJson<{
      language?: string;
      intent?: string;
      sentiment?: string;
      sentiment_score?: number;
      topics?: unknown;
      lead_score?: number;
      lead_stage?: string;
      product_recommendations?: unknown;
      appointment_suggested?: boolean;
      appointment_reason?: string | null;
      escalate?: boolean;
      escalation_reason?: string | null;
      summary?: string;
    }>(res.content || "");
    if (!parsed) return DEFAULT_ANALYSIS;

    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 5) : [];

    return {
      language: (parsed.language || "en").toLowerCase().slice(0, 5),
      intent: (parsed.intent as Intent) || "other",
      sentiment: (parsed.sentiment as Sentiment) || "neutral",
      sentimentScore: clamp(Number(parsed.sentiment_score ?? 0), -1, 1),
      topics: arr(parsed.topics),
      leadScore: clamp(Math.round(Number(parsed.lead_score ?? 0)), 0, 100),
      leadStage:
        (parsed.lead_stage as AssistantAnalysis["leadStage"]) || "cold",
      productRecommendations: arr(parsed.product_recommendations).slice(0, 3),
      appointmentSuggested: Boolean(parsed.appointment_suggested),
      appointmentReason: parsed.appointment_reason ?? null,
      escalate: Boolean(parsed.escalate),
      escalationReason: parsed.escalation_reason ?? null,
      summary: (parsed.summary || "").slice(0, 500),
    };
  } catch {
    return DEFAULT_ANALYSIS;
  }
}

// ------------------------------ Reply generation ------------------------------

interface ReplyInput {
  bot: WidgetBot;
  userMessage: string;
  history: { role: "user" | "assistant"; content: string }[];
  kbHits: KbHit[];
  targetLanguage?: string;
}

export async function generateAssistantReply(
  input: ReplyInput,
): Promise<{ reply: string; model: string }> {
  const { bot, userMessage, history, kbHits, targetLanguage } = input;

  const kbContext = kbHits.length
    ? [
        "Grounding — use these knowledge-base snippets to answer factual questions. Cite them naturally, never fabricate details:",
        ...kbHits.map(
          (h, i) => `[${i + 1}] ${h.title}\n${h.snippet}`,
        ),
      ].join("\n\n")
    : "";

  const systemPrompt = [
    bot.system_prompt ||
      "You are a helpful AI assistant embedded on a website. Be concise, friendly, and helpful.",
    bot.organization_prompt
      ? `Organization context:\n${bot.organization_prompt}`
      : "",
    bot.personality ? `Personality: ${bot.personality}` : "",
    bot.tone ? `Tone: ${bot.tone}` : "",
    targetLanguage
      ? `Reply in language "${targetLanguage}" unless the visitor writes in another language.`
      : bot.language
        ? `Prefer language "${bot.language}" unless the visitor uses another.`
        : "",
    "Keep replies short (1–3 short paragraphs). Use markdown lists when helpful.",
    "If you don't know the answer from the knowledge base, say so briefly and offer to hand off to a human.",
    kbContext,
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages: { role: "system" | "user" | "assistant"; content: string }[] =
    [
      { role: "system", content: systemPrompt },
      ...history.slice(-10).map((m) => ({
        role: (m.role === "assistant" ? "assistant" : "user") as
          | "user"
          | "assistant",
        content: m.content,
      })),
      { role: "user", content: userMessage },
    ];

  try {
    const { runChat } = await import("@/lib/ai/complete.functions");
    const res = await runChat({
      workspaceId: bot.workspace_id,
      userId: null,
      feature: "widget-reply",
      primaryProviderId: bot.provider_id,
      request: {
        messages,
        model: bot.model || "google/gemini-2.5-flash",
        temperature: bot.temperature ?? 0.4,
        max_tokens: bot.max_tokens ?? 700,
      },
    });
    return {
      reply:
        (res.content || "").trim() ||
        bot.fallback_message ||
        "Sorry, I couldn't process that just now.",
      model: res.model || bot.model || "",
    };
  } catch {
    return {
      reply:
        bot.fallback_message ||
        "Sorry, I'm having trouble reaching the AI service. A team member will follow up shortly.",
      model: bot.model || "",
    };
  }
}

// ------------------------------ Translate ------------------------------

export async function translate(params: {
  workspaceId: string;
  providerId: string | null;
  text: string;
  targetLanguage: string;
}): Promise<string> {
  try {
    const { runChat } = await import("@/lib/ai/complete.functions");
    const res = await runChat({
      workspaceId: params.workspaceId,
      userId: null,
      feature: "widget-translate",
      primaryProviderId: params.providerId,
      request: {
        messages: [
          {
            role: "system",
            content: `Translate the user's message into ${params.targetLanguage}. Return only the translation, no commentary.`,
          },
          { role: "user", content: params.text },
        ],
        model: "google/gemini-2.5-flash-lite",
        temperature: 0.1,
        max_tokens: 800,
      },
    });
    return (res.content || "").trim();
  } catch {
    return params.text;
  }
}

// ------------------------------ Persistence ------------------------------

export async function persistAnalysis(
  sessionId: string,
  messageId: string | null,
  analysis: AssistantAnalysis,
  kbHits: KbHit[],
): Promise<void> {
  try {
    const { supabaseAdmin } = await import(
      "@/lib/demo/admin-write-guard.server"
    );
    await supabaseAdmin
      .from("chatbot_sessions")
      .update({
        ai_language: analysis.language,
        ai_sentiment: analysis.sentiment,
        ai_sentiment_score: analysis.sentimentScore,
        ai_intent: analysis.intent,
        ai_summary: analysis.summary,
        ai_topics: analysis.topics,
        ai_lead_score: analysis.leadScore,
        ai_lead_stage: analysis.leadStage,
        ai_recommendations: {
          products: analysis.productRecommendations,
          appointment: analysis.appointmentSuggested
            ? { reason: analysis.appointmentReason }
            : null,
        },
        ai_escalation_reason: analysis.escalate
          ? analysis.escalationReason
          : null,
        ai_updated_at: new Date().toISOString(),
      } as never)
      .eq("id", sessionId);

    if (messageId) {
      await supabaseAdmin
        .from("chatbot_messages")
        .update({
          ai_intent: analysis.intent,
          ai_sentiment: analysis.sentiment,
          ai_language: analysis.language,
          ai_kb_hits: kbHits.length
            ? kbHits.map((h) => ({
                article_id: h.articleId,
                title: h.title,
                similarity: h.similarity,
              }))
            : null,
        } as never)
        .eq("id", messageId);
    }
  } catch (err) {
    console.warn("[livechat-ai] persistAnalysis failed:", (err as Error).message);
  }
}
