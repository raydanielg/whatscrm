/**
 * AI Conversation Intelligence — analyzes conversations and stores rich AI
 * insights (summary, sentiment, urgency, priority, risk, spam, category)
 * back into the CRM. Also produces daily/weekly workspace-level rollups.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { runChat, resolveDefaultModel } from "./complete.functions";
import type { AIMessage, ChatRequest } from "./types";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";

// ---------- Types ----------

export interface ConversationInsight {
  conversationId: string;
  workspaceId: string;
  summary: string | null;
  keyPoints: string[];
  intent: string | null;
  sentiment: "positive" | "neutral" | "negative" | "mixed" | null;
  sentimentScore: number | null;
  emotion: string | null;
  urgency: "low" | "medium" | "high" | "critical" | null;
  priority: "low" | "medium" | "high" | "urgent" | null;
  satisfactionScore: number | null;
  satisfactionPrediction: string | null;
  riskScore: number | null;
  riskReasons: string[];
  isSpam: boolean;
  spamScore: number | null;
  category: string | null;
  topics: string[];
  language: string | null;
  model: string | null;
  tokensUsed: number;
  messagesAnalyzed: number;
  analyzedAt: string | null;
  needsReanalysis: boolean;
  lastMessageAt: string | null;
}

export interface WorkspaceSummaryStats {
  total: number;
  by_sentiment: Record<string, number>;
  by_urgency: Record<string, number>;
  by_category: Record<string, number>;
  spam: number;
  avg_satisfaction: number | null;
  avg_risk: number | null;
}

export interface WorkspaceAiSummary {
  id: string;
  workspaceId: string;
  period: "daily" | "weekly";
  periodStart: string;
  periodEnd: string;
  summary: string;
  highlights: string[];
  stats: WorkspaceSummaryStats;
  model: string | null;
  tokensUsed: number;
  createdAt: string;
}

interface RawIntelRow {
  conversation_id: string;
  workspace_id: string;
  summary: string | null;
  key_points: unknown;
  intent: string | null;
  sentiment: string | null;
  sentiment_score: number | null;
  emotion: string | null;
  urgency: string | null;
  priority: string | null;
  satisfaction_score: number | null;
  satisfaction_prediction: string | null;
  risk_score: number | null;
  risk_reasons: unknown;
  is_spam: boolean;
  spam_score: number | null;
  category: string | null;
  topics: string[] | null;
  language: string | null;
  model: string | null;
  tokens_used: number | null;
  messages_analyzed: number | null;
  analyzed_at: string | null;
  needs_reanalysis: boolean;
  last_message_at: string | null;
}

function mapInsight(r: RawIntelRow): ConversationInsight {
  const kp = Array.isArray(r.key_points) ? (r.key_points as string[]) : [];
  const rr = Array.isArray(r.risk_reasons) ? (r.risk_reasons as string[]) : [];
  return {
    conversationId: r.conversation_id,
    workspaceId: r.workspace_id,
    summary: r.summary,
    keyPoints: kp,
    intent: r.intent,
    sentiment: (r.sentiment as ConversationInsight["sentiment"]) ?? null,
    sentimentScore: r.sentiment_score,
    emotion: r.emotion,
    urgency: (r.urgency as ConversationInsight["urgency"]) ?? null,
    priority: (r.priority as ConversationInsight["priority"]) ?? null,
    satisfactionScore: r.satisfaction_score,
    satisfactionPrediction: r.satisfaction_prediction,
    riskScore: r.risk_score,
    riskReasons: rr,
    isSpam: !!r.is_spam,
    spamScore: r.spam_score,
    category: r.category,
    topics: r.topics ?? [],
    language: r.language,
    model: r.model,
    tokensUsed: r.tokens_used ?? 0,
    messagesAnalyzed: r.messages_analyzed ?? 0,
    analyzedAt: r.analyzed_at,
    needsReanalysis: !!r.needs_reanalysis,
    lastMessageAt: r.last_message_at,
  };
}

// ---------- Read ----------

export const getConversationInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ conversationId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<ConversationInsight | null> => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("conversation_intelligence")
      .select("*")
      .eq("conversation_id", data.conversationId)
      .maybeSingle();
    return row ? mapInsight(row as unknown as RawIntelRow) : null;
  });

export const searchConversationInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        query: z.string().optional(),
        category: z.string().optional(),
        urgency: z.enum(["low", "medium", "high", "critical"]).optional(),
        sentiment: z.enum(["positive", "neutral", "negative", "mixed"]).optional(),
        isSpam: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).optional().default(50),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<ConversationInsight[]> => {
    const { supabase } = context;
    let q = supabase
      .from("conversation_intelligence")
      .select("*")
      .eq("workspace_id", data.workspaceId);
    if (data.query && data.query.trim()) {
      q = q.ilike("search_text", `%${sanitizeSearchTerm(data.query.trim())}%`);
    }
    if (data.category) q = q.eq("category", data.category);
    if (data.urgency) q = q.eq("urgency", data.urgency);
    if (data.sentiment) q = q.eq("sentiment", data.sentiment);
    if (typeof data.isSpam === "boolean") q = q.eq("is_spam", data.isSpam);
    q = q.order("analyzed_at", { ascending: false }).limit(data.limit);
    const { data: rows } = await q;
    return ((rows ?? []) as unknown as RawIntelRow[]).map(mapInsight);
  });

// ---------- Analysis ----------

interface MessageRow {
  direction: "inbound" | "outbound";
  body: string | null;
  message_type: string;
  created_at: string;
}

interface ConversationRow {
  id: string;
  workspace_id: string;
  contact_id: string | null;
  channel: string | null;
  subject: string | null;
}

interface ContactRow {
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  language: string | null;
  lead_status: string | null;
  customer_status: string | null;
  tags: string[] | null;
}

const AnalysisSchema = z.object({
  summary: z.string(),
  key_points: z.array(z.string()).default([]),
  intent: z.string().nullable().optional(),
  sentiment: z.enum(["positive", "neutral", "negative", "mixed"]).nullable().optional(),
  sentiment_score: z.number().min(-1).max(1).nullable().optional(),
  emotion: z.string().nullable().optional(),
  urgency: z.enum(["low", "medium", "high", "critical"]).nullable().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).nullable().optional(),
  satisfaction_score: z.number().min(0).max(1).nullable().optional(),
  satisfaction_prediction: z.string().nullable().optional(),
  risk_score: z.number().min(0).max(1).nullable().optional(),
  risk_reasons: z.array(z.string()).default([]),
  is_spam: z.boolean().default(false),
  spam_score: z.number().min(0).max(1).nullable().optional(),
  category: z.string().nullable().optional(),
  topics: z.array(z.string()).default([]),
  language: z.string().nullable().optional(),
});

function safeJsonParse(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export const analyzeConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        conversationId: z.string().uuid(),
        force: z.boolean().optional().default(false),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<ConversationInsight> => {
    const { supabase, userId } = context;

    const { data: convRaw, error: convErr } = await supabase
      .from("conversations")
      .select("id, workspace_id, contact_id, channel, subject")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (convErr) throw new Error(convErr.message);
    if (!convRaw) throw new Error("Conversation not found");
    const conv = convRaw as ConversationRow;

    let contact: ContactRow | null = null;
    if (conv.contact_id) {
      const { data: c } = await supabase
        .from("contacts")
        .select("first_name, last_name, company, language, lead_status, customer_status, tags")
        .eq("id", conv.contact_id)
        .maybeSingle();
      contact = (c ?? null) as ContactRow | null;
    }

    const { data: msgsRaw } = await supabase
      .from("messages")
      .select("direction, body, message_type, created_at")
      .eq("conversation_id", data.conversationId)
      .eq("is_internal", false)
      .order("created_at", { ascending: false })
      .limit(50);
    const messages = ((msgsRaw ?? []) as unknown as MessageRow[]).reverse();
    if (messages.length === 0) {
      throw new Error("No messages to analyze");
    }

    const contactName =
      contact && [contact.first_name, contact.last_name].filter(Boolean).length
        ? [contact.first_name, contact.last_name].filter(Boolean).join(" ")
        : "Customer";

    const transcript = messages
      .filter((m) => (m.body ?? "").trim())
      .map(
        (m) =>
          `${m.direction === "inbound" ? contactName : "Agent"} [${m.message_type}]: ${m.body}`,
      )
      .join("\n");

    const crmLines: string[] = [];
    if (contact?.company) crmLines.push(`Company: ${contact.company}`);
    if (contact?.lead_status) crmLines.push(`Lead status: ${contact.lead_status}`);
    if (contact?.customer_status) crmLines.push(`Customer status: ${contact.customer_status}`);
    if (contact?.tags?.length) crmLines.push(`Tags: ${contact.tags.join(", ")}`);

    const systemPrompt = `You are an AI conversation intelligence engine for a customer support & sales CRM.
You analyze a customer conversation and return a STRICT JSON object. No prose, no markdown, no code fences.

Return ONLY this JSON shape:
{
  "summary": "1-3 sentence neutral summary of what this conversation is about and where it stands",
  "key_points": ["short bullet", "..."],
  "intent": "purchase | support | complaint | inquiry | cancel | feedback | spam | other — one label",
  "sentiment": "positive | neutral | negative | mixed",
  "sentiment_score": -1..1 numeric,
  "emotion": "primary emotion e.g. happy, frustrated, anxious, angry, curious, satisfied",
  "urgency": "low | medium | high | critical",
  "priority": "low | medium | high | urgent",
  "satisfaction_score": 0..1 (0 = churn risk, 1 = delighted),
  "satisfaction_prediction": "short human-readable prediction (e.g. 'likely satisfied', 'at risk of churn')",
  "risk_score": 0..1 (churn / escalation / legal / refund risk),
  "risk_reasons": ["short reason", "..."],
  "is_spam": true|false,
  "spam_score": 0..1,
  "category": "billing | sales | support | onboarding | complaint | feature_request | shipping | technical | other",
  "topics": ["short topic tag", "..." up to 6],
  "language": "ISO 639-1 code detected in customer messages"
}
Base every field on evidence in the transcript. If unknown, use null or an empty array. Never invent facts.`;

    const userPrompt = [
      `Channel: ${conv.channel || "chat"}`,
      conv.subject ? `Subject: ${conv.subject}` : "",
      crmLines.length ? `CRM context:\n${crmLines.join("\n")}` : "",
      `Transcript (oldest to newest):`,
      transcript.slice(0, 12000),
    ]
      .filter(Boolean)
      .join("\n");

    const aiMessages: AIMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const req: ChatRequest = {
      model: await resolveDefaultModel(conv.workspace_id),
      messages: aiMessages,
      temperature: 0.2,
      max_tokens: 1200,
      response_format: "json_object",
    };

    const res = await runChat({
      workspaceId: conv.workspace_id,
      userId,
      feature: "conversation_intelligence",
      request: req,
    });

    const parsed = safeJsonParse(res.content || "");
    const validated = AnalysisSchema.safeParse(parsed);
    if (!validated.success) {
      throw new Error("AI returned malformed analysis");
    }
    const a = validated.data;

    const searchText = [
      a.summary,
      a.intent ?? "",
      a.category ?? "",
      (a.topics ?? []).join(" "),
      (a.key_points ?? []).join(" "),
    ]
      .filter(Boolean)
      .join(" ")
      .slice(0, 4000);

    const payload = {
      conversation_id: conv.id,
      workspace_id: conv.workspace_id,
      summary: a.summary,
      key_points: a.key_points ?? [],
      intent: a.intent ?? null,
      sentiment: a.sentiment ?? null,
      sentiment_score: a.sentiment_score ?? null,
      emotion: a.emotion ?? null,
      urgency: a.urgency ?? null,
      priority: a.priority ?? null,
      satisfaction_score: a.satisfaction_score ?? null,
      satisfaction_prediction: a.satisfaction_prediction ?? null,
      risk_score: a.risk_score ?? null,
      risk_reasons: a.risk_reasons ?? [],
      is_spam: !!a.is_spam,
      spam_score: a.spam_score ?? null,
      category: a.category ?? null,
      topics: a.topics ?? [],
      language: a.language ?? null,
      model: res.model,
      provider_kind: res.providerKind,
      tokens_used: res.usage?.total_tokens ?? 0,
      messages_analyzed: messages.length,
      last_message_at: messages[messages.length - 1]?.created_at ?? null,
      needs_reanalysis: false,
      analyzed_at: new Date().toISOString(),
      search_text: searchText,
    };

    const { data: saved, error: upErr } = await supabase
      .from("conversation_intelligence")
      .upsert(payload, { onConflict: "conversation_id" })
      .select("*")
      .maybeSingle();
    if (upErr) throw new Error(upErr.message);

    return mapInsight(saved as unknown as RawIntelRow);
  });

// ---------- Workspace daily / weekly summary ----------

export const generateWorkspaceSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        period: z.enum(["daily", "weekly"]),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<WorkspaceAiSummary> => {
    const { supabase, userId } = context;

    const now = new Date();
    const periodEnd = now;
    const periodStart = new Date(
      now.getTime() - (data.period === "daily" ? 24 : 24 * 7) * 3600_000,
    );

    const { data: intelRows } = await supabase
      .from("conversation_intelligence")
      .select(
        "summary, category, urgency, sentiment, priority, risk_score, is_spam, satisfaction_score, topics, intent, analyzed_at",
      )
      .eq("workspace_id", data.workspaceId)
      .gte("analyzed_at", periodStart.toISOString())
      .lte("analyzed_at", periodEnd.toISOString())
      .order("analyzed_at", { ascending: false })
      .limit(200);

    const rows = (intelRows ?? []) as Array<{
      summary: string | null;
      category: string | null;
      urgency: string | null;
      sentiment: string | null;
      priority: string | null;
      risk_score: number | null;
      is_spam: boolean;
      satisfaction_score: number | null;
      topics: string[] | null;
      intent: string | null;
      analyzed_at: string | null;
    }>;

    const stats = {
      total: rows.length,
      by_sentiment: countBy(rows, (r) => r.sentiment ?? "unknown"),
      by_urgency: countBy(rows, (r) => r.urgency ?? "unknown"),
      by_category: countBy(rows, (r) => r.category ?? "unknown"),
      spam: rows.filter((r) => r.is_spam).length,
      avg_satisfaction: avg(rows.map((r) => r.satisfaction_score ?? null)),
      avg_risk: avg(rows.map((r) => r.risk_score ?? null)),
    };

    const digest = rows
      .slice(0, 80)
      .map(
        (r, i) =>
          `${i + 1}. [${r.category ?? "?"}|${r.urgency ?? "?"}|${r.sentiment ?? "?"}] ${
            r.summary ?? ""
          }`,
      )
      .join("\n")
      .slice(0, 10000);

    const systemPrompt = `You are an executive AI analyst. Given a batch of per-conversation summaries from a customer support & sales workspace, produce a concise ${data.period} rollup for leadership.

Return STRICT JSON:
{
  "summary": "3-6 sentence executive summary — trends, sentiment shifts, top issues, wins",
  "highlights": ["short bullet", "..." up to 8]
}
No prose outside JSON. Focus on patterns, not individual conversations.`;

    const userPrompt = `Period: ${data.period} (${periodStart.toISOString()} → ${periodEnd.toISOString()})
Aggregate stats: ${JSON.stringify(stats)}

Conversation summaries:
${digest}`;

    const req: ChatRequest = {
      model: await resolveDefaultModel(data.workspaceId),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 800,
      response_format: "json_object",
    };

    const res = await runChat({
      workspaceId: data.workspaceId,
      userId,
      feature: "workspace_summary",
      request: req,
    });

    const parsed = safeJsonParse(res.content || "");
    const RollupSchema = z.object({
      summary: z.string(),
      highlights: z.array(z.string()).default([]),
    });
    const validated = RollupSchema.safeParse(parsed);
    const summary = validated.success ? validated.data.summary : (res.content || "").slice(0, 2000);
    const highlights = validated.success ? validated.data.highlights : [];

    const { data: saved, error: upErr } = await supabase
      .from("workspace_ai_summaries")
      .upsert(
        {
          workspace_id: data.workspaceId,
          period: data.period,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
          summary,
          highlights,
          stats,
          model: res.model,
          provider_kind: res.providerKind,
          tokens_used: res.usage?.total_tokens ?? 0,
        },
        { onConflict: "workspace_id,period,period_start" },
      )
      .select("*")
      .maybeSingle();
    if (upErr) throw new Error(upErr.message);

    const row = saved as unknown as {
      id: string;
      workspace_id: string;
      period: "daily" | "weekly";
      period_start: string;
      period_end: string;
      summary: string;
      highlights: unknown;
      stats: unknown;
      model: string | null;
      tokens_used: number | null;
      created_at: string;
    };
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      period: row.period,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      summary: row.summary,
      highlights: Array.isArray(row.highlights) ? (row.highlights as string[]) : [],
      stats: (row.stats as WorkspaceSummaryStats | null) ?? stats,
      model: row.model,
      tokensUsed: row.tokens_used ?? 0,
      createdAt: row.created_at,
    };
  });

function countBy<T>(arr: T[], key: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const item of arr) {
    const k = key(item);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function avg(nums: Array<number | null>): number | null {
  const valid = nums.filter((n): n is number => typeof n === "number");
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}
