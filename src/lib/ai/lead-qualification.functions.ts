/**
 * AI Lead Qualification — analyzes a lead using its CRM fields, notes,
 * activity and any related conversations, then persists rich AI signals
 * (score, priority, temperature, buying stage, deal probability, revenue
 * & CLV predictions, risk, and recommended sales actions).
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { runChat, resolveDefaultModel } from "./complete.functions";
import type { AIMessage, ChatRequest } from "./types";

// ---------- Types ----------

export type LeadTemperature = "hot" | "warm" | "cold";
export type LeadPriority = "low" | "medium" | "high" | "urgent";
export type BuyingStage =
  "awareness" | "consideration" | "decision" | "purchase" | "retention" | "unknown";

export interface RecommendedAction {
  title: string;
  detail?: string | null;
  priority?: LeadPriority | null;
  due_in_days?: number | null;
}

export interface LeadQualification {
  leadId: string;
  workspaceId: string;
  leadScore: number | null;
  scoreRationale: string | null;
  leadPriority: LeadPriority | null;
  temperature: LeadTemperature | null;
  purchaseIntent: number | null;
  purchaseIntentLabel: string | null;
  customerInterest: number | null;
  interestSignals: string[];
  buyingStage: BuyingStage | null;
  dealProbability: number | null;
  revenuePrediction: number | null;
  revenueCurrency: string | null;
  clvPrediction: number | null;
  riskScore: number | null;
  riskReasons: string[];
  recommendedFollowUpAt: string | null;
  recommendedFollowUp: string | null;
  recommendedActions: RecommendedAction[];
  nextBestAction: string | null;
  insights: string[];
  model: string | null;
  tokensUsed: number;
  analyzedAt: string | null;
  needsReanalysis: boolean;
}

interface RawRow {
  lead_id: string;
  workspace_id: string;
  lead_score: number | null;
  score_rationale: string | null;
  lead_priority: string | null;
  temperature: string | null;
  purchase_intent: number | null;
  purchase_intent_label: string | null;
  customer_interest: number | null;
  interest_signals: string[] | null;
  buying_stage: string | null;
  deal_probability: number | null;
  revenue_prediction: number | null;
  revenue_currency: string | null;
  clv_prediction: number | null;
  risk_score: number | null;
  risk_reasons: string[] | null;
  recommended_follow_up_at: string | null;
  recommended_follow_up: string | null;
  recommended_actions: unknown;
  next_best_action: string | null;
  insights: string[] | null;
  model: string | null;
  tokens_used: number | null;
  analyzed_at: string | null;
  needs_reanalysis: boolean;
}

function mapRow(r: RawRow): LeadQualification {
  const actions = Array.isArray(r.recommended_actions)
    ? (r.recommended_actions as RecommendedAction[])
    : [];
  return {
    leadId: r.lead_id,
    workspaceId: r.workspace_id,
    leadScore: r.lead_score,
    scoreRationale: r.score_rationale,
    leadPriority: (r.lead_priority as LeadPriority) ?? null,
    temperature: (r.temperature as LeadTemperature) ?? null,
    purchaseIntent: r.purchase_intent,
    purchaseIntentLabel: r.purchase_intent_label,
    customerInterest: r.customer_interest,
    interestSignals: r.interest_signals ?? [],
    buyingStage: (r.buying_stage as BuyingStage) ?? null,
    dealProbability: r.deal_probability,
    revenuePrediction: r.revenue_prediction,
    revenueCurrency: r.revenue_currency,
    clvPrediction: r.clv_prediction,
    riskScore: r.risk_score,
    riskReasons: r.risk_reasons ?? [],
    recommendedFollowUpAt: r.recommended_follow_up_at,
    recommendedFollowUp: r.recommended_follow_up,
    recommendedActions: actions,
    nextBestAction: r.next_best_action,
    insights: r.insights ?? [],
    model: r.model,
    tokensUsed: r.tokens_used ?? 0,
    analyzedAt: r.analyzed_at,
    needsReanalysis: !!r.needs_reanalysis,
  };
}

// ---------- Read ----------

export const getLeadQualification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ leadId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<LeadQualification | null> => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("lead_qualification")
      .select("*")
      .eq("lead_id", data.leadId)
      .maybeSingle();
    return row ? mapRow(row as unknown as RawRow) : null;
  });

export const listLeadQualifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        temperature: z.enum(["hot", "warm", "cold"]).optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        minScore: z.number().int().min(0).max(100).optional(),
        limit: z.number().int().min(1).max(200).optional().default(50),
      })
      .parse(v),
  )
  .handler(async ({ data, context }): Promise<LeadQualification[]> => {
    const { supabase } = context;
    let q = supabase.from("lead_qualification").select("*").eq("workspace_id", data.workspaceId);
    if (data.temperature) q = q.eq("temperature", data.temperature);
    if (data.priority) q = q.eq("lead_priority", data.priority);
    if (typeof data.minScore === "number") q = q.gte("lead_score", data.minScore);
    q = q.order("lead_score", { ascending: false, nullsFirst: false }).limit(data.limit);
    const { data: rows } = await q;
    return ((rows ?? []) as unknown as RawRow[]).map(mapRow);
  });

// ---------- Analysis ----------

interface LeadRow {
  id: string;
  workspace_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  job_title: string | null;
  source: string | null;
  status: string;
  score: number;
  rating: string | null;
  notes: string | null;
  tags: string[] | null;
  custom_fields: Record<string, unknown> | null;
  created_at: string;
  last_activity_at: string | null;
  next_follow_up_at: string | null;
}

interface MessageRow {
  direction: string;
  body: string | null;
  message_type: string;
  created_at: string;
}

interface ActivityRow {
  verb: string;
  summary: string | null;
  created_at: string;
}

const RecommendedActionSchema = z.object({
  title: z.string(),
  detail: z.string().nullable().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).nullable().optional(),
  due_in_days: z.number().nullable().optional(),
});

const AnalysisSchema = z.object({
  lead_score: z.number().min(0).max(100),
  score_rationale: z.string(),
  lead_priority: z.enum(["low", "medium", "high", "urgent"]),
  temperature: z.enum(["hot", "warm", "cold"]),
  purchase_intent: z.number().min(0).max(1),
  purchase_intent_label: z.string(),
  customer_interest: z.number().min(0).max(1),
  interest_signals: z.array(z.string()).default([]),
  buying_stage: z.enum([
    "awareness",
    "consideration",
    "decision",
    "purchase",
    "retention",
    "unknown",
  ]),
  deal_probability: z.number().min(0).max(1),
  revenue_prediction: z.number().nullable(),
  revenue_currency: z.string().default("USD"),
  clv_prediction: z.number().nullable(),
  risk_score: z.number().min(0).max(1),
  risk_reasons: z.array(z.string()).default([]),
  recommended_follow_up: z.string(),
  recommended_follow_up_in_days: z.number().nullable().optional(),
  recommended_actions: z.array(RecommendedActionSchema).default([]),
  next_best_action: z.string(),
  insights: z.array(z.string()).default([]),
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

export const qualifyLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ leadId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<LeadQualification> => {
    const { supabase, userId } = context;

    const { data: leadRaw, error: leadErr } = await supabase
      .from("leads")
      .select(
        "id, workspace_id, first_name, last_name, full_name, email, phone, company_name, job_title, source, status, score, rating, notes, tags, custom_fields, created_at, last_activity_at, next_follow_up_at",
      )
      .eq("id", data.leadId)
      .maybeSingle();
    if (leadErr) throw new Error(leadErr.message);
    if (!leadRaw) throw new Error("Lead not found");
    const lead = leadRaw as LeadRow;

    // Related conversations (via contact email/phone match on this workspace)
    let recentMessages: MessageRow[] = [];
    if (lead.email || lead.phone) {
      let cq = supabase.from("contacts").select("id").eq("workspace_id", lead.workspace_id);
      if (lead.email) cq = cq.eq("email", lead.email);
      else if (lead.phone) cq = cq.eq("phone", lead.phone);
      const { data: matched } = await cq.limit(1).maybeSingle();
      if (matched?.id) {
        const { data: convs } = await supabase
          .from("conversations")
          .select("id")
          .eq("workspace_id", lead.workspace_id)
          .eq("contact_id", matched.id)
          .order("last_message_at", { ascending: false })
          .limit(3);
        const convIds = (convs ?? []).map((c) => c.id);
        if (convIds.length) {
          const { data: msgs } = await supabase
            .from("messages")
            .select("direction, body, message_type, created_at")
            .in("conversation_id", convIds)
            .eq("is_internal", false)
            .order("created_at", { ascending: false })
            .limit(25);
          recentMessages = ((msgs ?? []) as unknown as MessageRow[]).reverse();
        }
      }
    }

    // Recent activity
    const { data: acts } = await supabase
      .from("activities")
      .select("verb, summary, created_at")
      .eq("workspace_id", lead.workspace_id)
      .eq("object_type", "lead")
      .eq("object_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(15);
    const activities = (acts ?? []) as ActivityRow[];

    const name =
      lead.full_name || [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Unknown";

    const leadCard = [
      `Name: ${name}`,
      lead.job_title ? `Title: ${lead.job_title}` : "",
      lead.company_name ? `Company: ${lead.company_name}` : "",
      lead.email ? `Email: ${lead.email}` : "",
      lead.phone ? `Phone: ${lead.phone}` : "",
      lead.source ? `Source: ${lead.source}` : "",
      `Status: ${lead.status}`,
      lead.rating ? `Current rating: ${lead.rating}` : "",
      `Manual score: ${lead.score}/100`,
      (lead.tags?.length ?? 0) > 0 ? `Tags: ${lead.tags!.join(", ")}` : "",
      `Created: ${lead.created_at}`,
      lead.last_activity_at ? `Last activity: ${lead.last_activity_at}` : "",
      lead.next_follow_up_at ? `Scheduled follow-up: ${lead.next_follow_up_at}` : "",
      lead.notes ? `Notes:\n${lead.notes}` : "",
      lead.custom_fields && Object.keys(lead.custom_fields).length
        ? `Custom fields: ${JSON.stringify(lead.custom_fields)}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const transcript = recentMessages
      .filter((m) => (m.body ?? "").trim())
      .map((m) => `${m.direction === "inbound" ? name : "Agent"} [${m.message_type}]: ${m.body}`)
      .join("\n")
      .slice(0, 8000);

    const activityLog = activities
      .map((a) => `- ${a.created_at} ${a.verb}${a.summary ? ` — ${a.summary}` : ""}`)
      .join("\n");

    const systemPrompt = `You are an AI sales qualification engine for a B2B CRM.
You analyze a lead and return STRICT JSON scoring their fit, intent and next steps. No prose, no markdown, no code fences.

Return ONLY this JSON shape:
{
  "lead_score": 0..100 integer overall qualification score,
  "score_rationale": "1-2 sentence explanation of the score, grounded in evidence",
  "lead_priority": "low | medium | high | urgent",
  "temperature": "hot | warm | cold",
  "purchase_intent": 0..1 float,
  "purchase_intent_label": "no intent | curious | evaluating | ready to buy | decision maker",
  "customer_interest": 0..1 float,
  "interest_signals": ["short concrete evidence phrase", "..."],
  "buying_stage": "awareness | consideration | decision | purchase | retention | unknown",
  "deal_probability": 0..1 float,
  "revenue_prediction": estimated deal value as a number, or null if unknown,
  "revenue_currency": "USD" or matching currency,
  "clv_prediction": estimated customer lifetime value number, or null,
  "risk_score": 0..1 (higher = more risk of loss / no-show / bad fit),
  "risk_reasons": ["short reason", "..."],
  "recommended_follow_up": "one-line description of the ideal next follow-up",
  "recommended_follow_up_in_days": integer days from now for that follow-up (1-30),
  "recommended_actions": [
    { "title": "short imperative", "detail": "optional context", "priority": "low|medium|high|urgent", "due_in_days": integer }
  ],
  "next_best_action": "single most important action to take right now",
  "insights": ["actionable insight for the sales team", "..." up to 5]
}
Base every field on evidence in the lead card, activity and transcript. Prefer conservative estimates when data is thin. Never invent facts.`;

    const userPrompt = [
      "LEAD CARD:",
      leadCard,
      activityLog ? `\nRECENT ACTIVITY:\n${activityLog}` : "",
      transcript ? `\nRECENT CONVERSATION (oldest to newest):\n${transcript}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const aiMessages: AIMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const req: ChatRequest = {
      model: await resolveDefaultModel(lead.workspace_id),
      messages: aiMessages,
      temperature: 0.2,
      max_tokens: 1400,
      response_format: "json_object",
    };

    const res = await runChat({
      workspaceId: lead.workspace_id,
      userId,
      feature: "lead_qualification",
      request: req,
    });

    const parsed = safeJsonParse(res.content || "");
    const validated = AnalysisSchema.safeParse(parsed);
    if (!validated.success) {
      throw new Error("AI returned malformed qualification");
    }
    const a = validated.data;

    const followUpAt =
      typeof a.recommended_follow_up_in_days === "number"
        ? new Date(
            Date.now() + Math.max(0, a.recommended_follow_up_in_days) * 86400_000,
          ).toISOString()
        : null;

    const payload = {
      lead_id: lead.id,
      workspace_id: lead.workspace_id,
      lead_score: Math.round(a.lead_score),
      score_rationale: a.score_rationale,
      lead_priority: a.lead_priority,
      temperature: a.temperature,
      purchase_intent: a.purchase_intent,
      purchase_intent_label: a.purchase_intent_label,
      customer_interest: a.customer_interest,
      interest_signals: a.interest_signals,
      buying_stage: a.buying_stage,
      deal_probability: a.deal_probability,
      revenue_prediction: a.revenue_prediction,
      revenue_currency: a.revenue_currency,
      clv_prediction: a.clv_prediction,
      risk_score: a.risk_score,
      risk_reasons: a.risk_reasons,
      recommended_follow_up_at: followUpAt,
      recommended_follow_up: a.recommended_follow_up,
      recommended_actions: a.recommended_actions,
      next_best_action: a.next_best_action,
      insights: a.insights,
      model: res.model,
      provider_kind: res.providerKind,
      tokens_used: res.usage?.total_tokens ?? 0,
      analyzed_at: new Date().toISOString(),
      needs_reanalysis: false,
    };

    const { data: saved, error: upErr } = await supabase
      .from("lead_qualification")
      .upsert(payload, { onConflict: "lead_id" })
      .select("*")
      .maybeSingle();
    if (upErr) throw new Error(upErr.message);

    // Also sync the lead's rating/score if AI is confident
    await supabase
      .from("leads")
      .update({
        rating: a.temperature,
        score: Math.round(a.lead_score),
        score_reason: a.score_rationale,
      })
      .eq("id", lead.id);

    return mapRow(saved as unknown as RawRow);
  });
