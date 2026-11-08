/**
 * AI workflow node evaluators.
 *
 * Every AI-powered node routes through `runChat` from the AI Provider Engine,
 * so users can pick provider (OpenAI, Gemini, Claude, Lovable, ) and model
 * per node. The workflow-level `provider_id` / `model` inputs override the
 * workspace default; leaving them blank uses the workspace default provider.
 */

import { runChat } from "@/lib/ai/complete.functions";
import type { AIMessage, ChatRequest } from "@/lib/ai/types";

export type AiEvalCtx = {
  workspaceId: string;
  actorUserId?: string | null;
  dryRun?: boolean;
};

type CommonInputs = {
  provider_id?: string | null;
  fallback_provider_ids?: string[];
  model?: string | null;
  temperature?: number | null;
  max_tokens?: number | null;
  system?: string | null;
  feature?: string | null;
};

function pickCommon(input: Record<string, unknown>): CommonInputs {
  return {
    provider_id: (input.provider_id as string | null) || null,
    fallback_provider_ids: (input.fallback_provider_ids as string[]) || [],
    model: (input.model as string | null) || null,
    temperature: input.temperature == null ? null : Number(input.temperature),
    max_tokens: input.max_tokens == null ? null : Number(input.max_tokens),
    system: (input.system as string | null) || null,
    feature: (input.feature as string | null) || null,
  };
}

function s(v: unknown): string {
  if (v == null) return "";
  return typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v);
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch { /* try fenced */ }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch { /* fallthrough */ }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)); } catch { /* fallthrough */ }
  }
  return null;
}

async function callAI(
  ctx: AiEvalCtx,
  feature: string,
  systemPrompt: string,
  userPrompt: string,
  common: CommonInputs,
  jsonMode = false,
): Promise<{ content: string; parsed: unknown | null; providerId: string; providerKind: string; model: string; usage: unknown }> {
  const messages: AIMessage[] = [];
  const sys = common.system?.trim() || systemPrompt;
  if (sys) messages.push({ role: "system", content: sys });
  messages.push({ role: "user", content: userPrompt });

  const request: ChatRequest = {
    messages,
    model: common.model || "google/gemini-2.5-flash",
    temperature: common.temperature ?? 0.4,
    max_tokens: common.max_tokens ?? 1024,
    response_format: jsonMode ? "json_object" : "text",
  };

  const res = await runChat({
    workspaceId: ctx.workspaceId,
    userId: ctx.actorUserId ?? null,
    feature: common.feature || feature,
    request,
    primaryProviderId: common.provider_id ?? null,
    fallbackProviderIds: common.fallback_provider_ids ?? [],
  });

  const parsed = jsonMode ? extractJson(res.content ?? "") : null;
  return {
    content: res.content ?? "",
    parsed,
    providerId: res.providerId,
    providerKind: res.providerKind,
    model: res.model ?? request.model,
    usage: res.usage,
  };
}

/** ─── Node evaluators ────────────────────────────────────────── */

export async function evalAiReply(input: Record<string, unknown>, ctx: AiEvalCtx) {
  const common = pickCommon(input);
  const tone = s(input.tone) || "professional and friendly";
  const goal = s(input.goal) || "answer the customer's last message";
  const context = s(input.conversation) || s(input.message) || s(input.context);
  const language = s(input.language) || "the same language as the customer";
  const sys = `You are an expert customer support agent for WhatsApp. Reply concisely (max 2-3 sentences), match a ${tone} tone, and write in ${language}. Never invent facts. Goal: ${goal}.`;
  const user = `Conversation / last customer message:\n${context}\n\nDraft the next reply. Output ONLY the reply text.`;
  const r = await callAI(ctx, "workflow.ai.reply", sys, user, common);
  return { reply: r.content.trim(), provider_kind: r.providerKind, model: r.model };
}

export async function evalAiSummarize(input: Record<string, unknown>, ctx: AiEvalCtx) {
  const common = pickCommon(input);
  const style = s(input.style) || "bullet-points";
  const length = s(input.length) || "short";
  const sys = `You summarize customer conversations for CRM handoff. Style: ${style}. Length: ${length}. Be factual, no filler.`;
  const user = `Conversation:\n${s(input.conversation) || s(input.text)}\n\nProduce the summary.`;
  const r = await callAI(ctx, "workflow.ai.summarize", sys, user, common);
  return { summary: r.content.trim(), model: r.model };
}

export async function evalAiSentiment(input: Record<string, unknown>, ctx: AiEvalCtx) {
  const common = pickCommon(input);
  const sys = `Classify sentiment of the given text. Respond ONLY as JSON: {"sentiment":"positive|neutral|negative","score":-1..1,"emotions":["..."],"reason":"short"}.`;
  const user = `Text:\n${s(input.text) || s(input.conversation)}`;
  const r = await callAI(ctx, "workflow.ai.sentiment", sys, user, common, true);
  const p = (r.parsed as Record<string, unknown>) ?? {};
  return {
    sentiment: (p.sentiment as string) || "neutral",
    score: Number(p.score ?? 0),
    emotions: (p.emotions as string[]) ?? [],
    reason: (p.reason as string) ?? "",
    raw: r.content,
  };
}

export async function evalAiIntent(input: Record<string, unknown>, ctx: AiEvalCtx) {
  const common = pickCommon(input);
  const intents = (input.intents as string[]) ?? ["question", "complaint", "purchase_interest", "cancellation", "support_request", "small_talk"];
  const sys = `You detect the primary intent from a customer message. Choose EXACTLY ONE from: ${intents.join(", ")}. Respond ONLY as JSON: {"intent":"...","confidence":0..1,"entities":{...}}.`;
  const user = `Message:\n${s(input.text) || s(input.message)}`;
  const r = await callAI(ctx, "workflow.ai.intent", sys, user, common, true);
  const p = (r.parsed as Record<string, unknown>) ?? {};
  return {
    intent: (p.intent as string) || intents[0],
    confidence: Number(p.confidence ?? 0),
    entities: (p.entities as Record<string, unknown>) ?? {},
  };
}

export async function evalAiCrmNote(input: Record<string, unknown>, ctx: AiEvalCtx) {
  const common = pickCommon(input);
  const sys = `You write concise CRM notes for sales/support reps. Structure: 1) what happened, 2) key info captured, 3) next step. Max 6 lines.`;
  const user = `Source:\n${s(input.conversation) || s(input.text)}`;
  const r = await callAI(ctx, "workflow.ai.crm_note", sys, user, common);
  return { note: r.content.trim(), model: r.model };
}

export async function evalAiEmail(input: Record<string, unknown>, ctx: AiEvalCtx) {
  const common = pickCommon(input);
  const tone = s(input.tone) || "professional";
  const subject_hint = s(input.subject) || "auto";
  const sys = `You draft business emails. Tone: ${tone}. Return ONLY JSON: {"subject":"...","body":"..."} with a compelling subject (≤60 chars) and a clean plain-text body.`;
  const user = `Purpose: ${s(input.purpose) || s(input.goal)}\nRecipient context: ${s(input.recipient)}\nExtra context: ${s(input.context)}\nSubject hint: ${subject_hint}`;
  const r = await callAI(ctx, "workflow.ai.email", sys, user, common, true);
  const p = (r.parsed as Record<string, unknown>) ?? {};
  return {
    subject: (p.subject as string) || "",
    body: (p.body as string) || r.content,
    model: r.model,
  };
}

export async function evalAiRewrite(input: Record<string, unknown>, ctx: AiEvalCtx) {
  const common = pickCommon(input);
  const style = s(input.style) || "clearer and more professional";
  const sys = `Rewrite the given text to be ${style}. Preserve meaning and language. Output ONLY the rewritten text.`;
  const user = `Text:\n${s(input.text)}`;
  const r = await callAI(ctx, "workflow.ai.rewrite", sys, user, common);
  return { text: r.content.trim() };
}

export async function evalAiTranslate(input: Record<string, unknown>, ctx: AiEvalCtx) {
  const common = pickCommon(input);
  const target = s(input.target_language) || "English";
  const sys = `Translate the given text into ${target}. Preserve tone, emojis, and formatting. Output ONLY the translation.`;
  const user = `Text:\n${s(input.text)}`;
  const r = await callAI(ctx, "workflow.ai.translate", sys, user, common);
  return { text: r.content.trim(), language: target };
}

export async function evalAiCategorize(input: Record<string, unknown>, ctx: AiEvalCtx) {
  const common = pickCommon(input);
  const categories = (input.categories as string[]) ?? ["sales", "support", "billing", "feedback", "spam", "other"];
  const sys = `Categorize the conversation. Choose EXACTLY ONE from: ${categories.join(", ")}. Respond ONLY as JSON: {"category":"...","confidence":0..1,"tags":["..."]}.`;
  const user = `Conversation:\n${s(input.conversation) || s(input.text)}`;
  const r = await callAI(ctx, "workflow.ai.categorize", sys, user, common, true);
  const p = (r.parsed as Record<string, unknown>) ?? {};
  return {
    category: (p.category as string) || categories[categories.length - 1],
    confidence: Number(p.confidence ?? 0),
    tags: (p.tags as string[]) ?? [],
  };
}

export async function evalAiClassifyLead(input: Record<string, unknown>, ctx: AiEvalCtx) {
  const common = pickCommon(input);
  const sys = `You are a B2B lead qualification analyst using BANT+intent signals. Score 0-100 and grade Hot/Warm/Cold. Respond ONLY as JSON: {"score":0-100,"grade":"hot|warm|cold","reasons":["..."],"next_action":"...","buying_intent":"low|medium|high"}.`;
  const user = `Lead context:\n${s(input.lead) || s(input.conversation) || s(input.text)}`;
  const r = await callAI(ctx, "workflow.ai.classify_lead", sys, user, common, true);
  const p = (r.parsed as Record<string, unknown>) ?? {};
  return {
    score: Number(p.score ?? 0),
    grade: (p.grade as string) || "cold",
    reasons: (p.reasons as string[]) ?? [],
    next_action: (p.next_action as string) ?? "",
    buying_intent: (p.buying_intent as string) ?? "low",
  };
}

export async function evalAiExtract(input: Record<string, unknown>, ctx: AiEvalCtx) {
  const common = pickCommon(input);
  const fields = (input.fields as Array<{ name: string; description?: string; type?: string }>) ?? [];
  const schemaHint = fields.length
    ? fields.map((f) => `- ${f.name} (${f.type ?? "string"}): ${f.description ?? ""}`).join("\n")
    : "- email\n- phone\n- full_name\n- company\n- intent";
  const sys = `Extract structured data from the given text. Return ONLY JSON with the requested fields (null when absent). Fields:\n${schemaHint}`;
  const user = `Text:\n${s(input.text) || s(input.conversation)}`;
  const r = await callAI(ctx, "workflow.ai.extract", sys, user, common, true);
  return { data: r.parsed ?? {}, raw: r.content };
}

export async function evalAiFollowup(input: Record<string, unknown>, ctx: AiEvalCtx) {
  const common = pickCommon(input);
  const channel = s(input.channel) || "whatsapp";
  const goal = s(input.goal) || "re-engage the customer and move to next step";
  const sys = `You draft short follow-up messages for ${channel}. Warm, value-first, ≤2 sentences. Goal: ${goal}. Output ONLY the message.`;
  const user = `Prior context:\n${s(input.conversation) || s(input.context)}\n\nLast contact: ${s(input.last_contact) || "unknown"}`;
  const r = await callAI(ctx, "workflow.ai.followup", sys, user, common);
  return { message: r.content.trim() };
}

export async function evalAiDecision(input: Record<string, unknown>, ctx: AiEvalCtx) {
  const common = pickCommon(input);
  const options = (input.options as string[]) ?? ["yes", "no"];
  const criteria = s(input.criteria) || "the best next action";
  const sys = `You are a decision engine. Choose EXACTLY ONE of: ${options.join(", ")}. Base the choice on: ${criteria}. Respond ONLY as JSON: {"decision":"...","confidence":0..1,"reason":"short"}.`;
  const user = `Context:\n${s(input.context) || s(input.text)}`;
  const r = await callAI(ctx, "workflow.ai.decision", sys, user, common, true);
  const p = (r.parsed as Record<string, unknown>) ?? {};
  const decision = String(p.decision ?? options[0]);
  const match = options.find((o) => o.toLowerCase() === decision.toLowerCase()) ?? options[0];
  return {
    decision: match,
    confidence: Number(p.confidence ?? 0),
    reason: (p.reason as string) ?? "",
  };
}

/**
 * Strictly match a model reply to one of the configured labels.
 * Trims whitespace, surrounding quotes/backticks and a trailing period, then
 * requires an exact case-insensitive match. Returns null when nothing matches.
 */
export function matchClassifyLabel(raw: string, labels: string[]): string | null {
  const cleaned = raw
    .trim()
    .replace(/\.$/, "")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim()
    .toLowerCase();
  if (!cleaned) return null;
  const hit = labels.find((l) => l.toLowerCase() === cleaned);
  return hit ?? null;
}

export async function evalAiClassify(input: Record<string, unknown>, ctx: AiEvalCtx) {
  const text = s(input.text);
  const labels = (Array.isArray(input.labels)
    ? (input.labels as unknown[]).map((l) => s(l).trim())
    : s(input.labels).split(",").map((l) => l.trim())
  ).filter((l) => l.length > 0);
  if (labels.length === 0) throw new Error("ai.classify: at least one label is required");
  const fallback = s(input.fallback).trim() || null;

  if (ctx.dryRun) return { simulated: true, input };

  const common = pickCommon(input);
  const sys = `You classify text. Choose EXACTLY ONE category from this list: ${labels.join(", ")}. Respond with ONLY the category name, exactly as written in the list, with no other words, punctuation or explanation.`;
  const user = `Text:\n${text}\n\nCategory:`;
  const r = await callAI(ctx, "workflow.ai.classify", sys, user, common);
  const matched = matchClassifyLabel(r.content, labels);
  if (matched) {
    return { label: matched, provider_kind: r.providerKind, model: r.model };
  }
  if (fallback && labels.some((l) => l.toLowerCase() === fallback.toLowerCase())) {
    return { label: labels.find((l) => l.toLowerCase() === fallback.toLowerCase())!, provider_kind: r.providerKind, model: r.model };
  }
  throw new Error(
    `ai.classify: model reply "${r.content.trim().slice(0, 120)}" did not match any label (${labels.join(", ")})`,
  );
}

export const AI_NODE_HANDLERS: Record<
  string,
  (input: Record<string, unknown>, ctx: AiEvalCtx) => Promise<unknown>
> = {
  "ai.reply.generate": evalAiReply,
  // Same behaviour under the name the registry uses for the reply node.
  "ai.generate_reply": evalAiReply,
  "ai.classify": evalAiClassify,
  "ai.summarize": evalAiSummarize,
  "ai.sentiment": evalAiSentiment,
  "ai.intent": evalAiIntent,
  "ai.crm_note": evalAiCrmNote,
  "ai.email": evalAiEmail,
  "ai.rewrite": evalAiRewrite,
  "ai.translate": evalAiTranslate,
  "ai.categorize": evalAiCategorize,
  "ai.classify_lead": evalAiClassifyLead,
  "ai.extract": evalAiExtract,
  "ai.followup": evalAiFollowup,
  "ai.decision": evalAiDecision,
};
