/**
 * AI Sales Assistant — server functions.
 *
 * Provides deal-aware AI features: summary, risk detection, next best action,
 * follow-up suggestions, email/WhatsApp drafting, proposal ideas, coaching,
 * revenue prediction, deal probability, pipeline health, CRM notes.
 *
 * All calls go through the Lovable AI Gateway using GEMINI_API_KEY (server-only).
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sbAny } from "@/lib/supabase/untyped";
import { resolveAggregateCurrency, resolveWorkspaceCurrency } from "@/lib/currency/resolve.server";
import { GEMINI_CHAT_URL, GEMINI_DEFAULT_CHAT_MODEL } from "@/lib/ai/gemini.server";

// ---------- Types ----------

export interface DealSummaryResult {
  headline: string;
  summary: string;
  keyPoints: string[];
  stakeholders: string[];
  updatedAt: string;
}

export interface DealRiskResult {
  score: number; // 0-100, higher = more risk
  level: "low" | "medium" | "high" | "critical";
  factors: { title: string; detail: string; severity: "low" | "medium" | "high" }[];
  mitigations: string[];
}

export interface NextBestActionResult {
  actions: {
    title: string;
    reason: string;
    channel: "email" | "whatsapp" | "call" | "meeting" | "internal";
    urgency: "now" | "today" | "this_week" | "later";
  }[];
}

export interface FollowUpResult {
  suggestions: { subject: string; preview: string; whenLabel: string }[];
}

export interface DraftMessageResult {
  channel: "email" | "whatsapp";
  subject?: string;
  body: string;
  tone: string;
}

export interface ProposalSuggestionResult {
  angle: string;
  valueProps: string[];
  pricingApproach: string;
  objectionsToPrepareFor: string[];
  bundleIdeas: string[];
}

export interface CoachingResult {
  strengths: string[];
  improvements: string[];
  scriptTip: string;
  metricsToWatch: string[];
}

export interface DealProbabilityResult {
  probability: number; // 0-100
  confidence: "low" | "medium" | "high";
  drivers: { label: string; impact: "positive" | "negative"; weight: number }[];
  predictedCloseDate: string | null;
}

export interface RevenuePredictionResult {
  periodLabel: string;
  bestCase: number;
  commit: number;
  worstCase: number;
  currency: string;
  narrative: string;
}

export interface PipelineHealthResult {
  score: number; // 0-100
  status: "healthy" | "watch" | "at_risk";
  highlights: string[];
  concerns: string[];
  recommendations: string[];
}

export interface LeadPriorityResult {
  ranking: {
    dealId: string;
    title: string;
    priority: "low" | "medium" | "high" | "urgent";
    reason: string;
  }[];
}

// ---------- Helpers ----------

const AI_GATEWAY = GEMINI_CHAT_URL;
const DEFAULT_MODEL = GEMINI_DEFAULT_CHAT_MODEL;

async function callGateway<T>(
  system: string,
  user: string,
  opts?: { model?: string; json?: boolean },
): Promise<T | string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY");
  const body = {
    model: opts?.model ?? DEFAULT_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    ...(opts?.json ? { response_format: { type: "json_object" } } : {}),
  };
  const res = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("AI rate limit exceeded — please retry shortly.");
    if (res.status === 402) throw new Error("AI credits exhausted. Please top up your workspace.");
    throw new Error(`AI gateway ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content ?? "";
  if (opts?.json) {
    try {
      // Strip code fences if any
      const clean = content
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/```$/i, "")
        .trim();
      return JSON.parse(clean) as T;
    } catch {
      throw new Error("AI returned invalid JSON");
    }
  }
  return content;
}

interface DealContext {
  id: string;
  title: string;
  description: string | null;
  amount: number;
  currency: string;
  probability: number;
  status: string;
  priority: string;
  stage: string | null;
  pipeline: string | null;
  expected_close_date: string | null;
  updated_at: string;
  created_at: string;
  tags: string[];
  contact?: { name: string | null; email: string | null; phone: string | null } | null;
  company?: { name: string | null; industry: string | null } | null;
  recent_activities: {
    type: string;
    subject: string | null;
    occurred_at: string;
    description: string | null;
  }[];
  recent_messages: { direction: string; body: string | null; created_at: string }[];
  daysSinceUpdate: number;
  daysToClose: number | null;
}

async function loadDealContext(dealId: string): Promise<DealContext> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data: deal, error } = await supabaseAdmin
    .from("deals")
    .select(
      "*, deal_stages(name), deal_pipelines(name), contacts(name, email, phone), companies(name, industry)",
    )
    .eq("id", dealId)
    .maybeSingle();
  if (error || !deal) throw new Error("Deal not found");
  const d = deal as Record<string, unknown>;

  const { data: activities } = await supabaseAdmin
    .from("sales_activities")
    .select("type, title, description, start_at, completed_at, status")
    .eq("entity_type", "deal")
    .eq("entity_id", dealId)
    .order("start_at", { ascending: false, nullsFirst: false })
    .limit(10);

  const contact = (d.contacts as { name?: string; email?: string; phone?: string } | null) ?? null;
  const company = (d.companies as { name?: string; industry?: string } | null) ?? null;
  const stage = (d.deal_stages as { name?: string } | null)?.name ?? null;
  const pipeline = (d.deal_pipelines as { name?: string } | null)?.name ?? null;

  const updatedAt = new Date(d.updated_at as string).getTime();
  const daysSinceUpdate = Math.floor((Date.now() - updatedAt) / 86400000);
  const closeDate = d.expected_close_date
    ? new Date(d.expected_close_date as string).getTime()
    : null;
  const daysToClose = closeDate ? Math.floor((closeDate - Date.now()) / 86400000) : null;

  return {
    id: d.id as string,
    title: d.title as string,
    description: (d.description as string | null) ?? null,
    amount: Number(d.amount ?? 0),
    currency:
      (d.currency as string | null) ??
      (await resolveWorkspaceCurrency(d.workspace_id as string | null)),
    probability: Number(d.probability ?? 0),
    status: (d.status as string) ?? "open",
    priority: (d.priority as string) ?? "normal",
    stage,
    pipeline,
    expected_close_date: (d.expected_close_date as string | null) ?? null,
    updated_at: d.updated_at as string,
    created_at: d.created_at as string,
    tags: (d.tags as string[]) ?? [],
    contact: contact
      ? { name: contact.name ?? null, email: contact.email ?? null, phone: contact.phone ?? null }
      : null,
    company: company ? { name: company.name ?? null, industry: company.industry ?? null } : null,
    recent_activities: (activities ?? []).map((a) => {
      const r = a as Record<string, unknown>;
      return {
        type: (r.type as string) ?? "note",
        subject: (r.title as string | null) ?? null,
        occurred_at: (r.start_at as string | null) ?? (r.completed_at as string | null) ?? "",
        description: (r.description as string | null) ?? null,
      };
    }),
    recent_messages: [],
    daysSinceUpdate,
    daysToClose,
  };
}

function dealContextText(c: DealContext): string {
  return [
    `Deal: ${c.title}`,
    `Amount: ${c.amount} ${c.currency}`,
    `Stage: ${c.stage ?? "unknown"} (pipeline: ${c.pipeline ?? "default"})`,
    `Status: ${c.status} | Priority: ${c.priority} | Probability: ${c.probability}%`,
    `Expected close: ${c.expected_close_date ?? "not set"} (${c.daysToClose ?? "?"} days away)`,
    `Last update: ${c.daysSinceUpdate} days ago`,
    `Contact: ${c.contact?.name ?? "—"} <${c.contact?.email ?? "—"}>`,
    `Company: ${c.company?.name ?? "—"} (${c.company?.industry ?? "—"})`,
    `Tags: ${c.tags.join(", ") || "none"}`,
    `Description: ${c.description ?? "(none)"}`,
    "",
    `Recent activities (${c.recent_activities.length}):`,
    ...c.recent_activities
      .slice(0, 6)
      .map(
        (a) =>
          `- ${a.occurred_at.slice(0, 10)} [${a.type}] ${a.subject ?? ""} ${a.description ? "— " + a.description.slice(0, 120) : ""}`,
      ),
    "",
    `Recent messages (${c.recent_messages.length}):`,
    ...c.recent_messages
      .slice(0, 8)
      .map((m) => `- ${m.created_at.slice(0, 10)} [${m.direction}] ${m.body?.slice(0, 200) ?? ""}`),
  ].join("\n");
}

async function getWorkspaceId(userId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { data } = await sbAny(supabaseAdmin)
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("No workspace for user");
  return (data as { workspace_id: string }).workspace_id;
}

// ---------- Server Functions ----------

const dealIdInput = z.object({ dealId: z.string().uuid() });

export const aiDealSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => dealIdInput.parse(v))
  .handler(async ({ data }): Promise<DealSummaryResult> => {
    const ctx = await loadDealContext(data.dealId);
    const result = (await callGateway<DealSummaryResult>(
      "You are an elite sales analyst. Summarize CRM deals crisply and accurately based only on given data. Return strict JSON.",
      `Summarize this deal for a sales rep. Return JSON with keys: headline (1 sentence), summary (2-3 sentences), keyPoints (array of 3-5 bullet strings), stakeholders (array of names or roles).\n\n${dealContextText(ctx)}`,
      { json: true },
    )) as DealSummaryResult;
    return { ...result, updatedAt: new Date().toISOString() };
  });

export const aiDealRisk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => dealIdInput.parse(v))
  .handler(async ({ data }): Promise<DealRiskResult> => {
    const ctx = await loadDealContext(data.dealId);
    return (await callGateway<DealRiskResult>(
      "You detect risk in sales deals. Analyze stalling, competitor risk, budget, timing, stakeholder issues. Return strict JSON.",
      `Analyze risk. Return JSON: { score: 0-100, level: 'low'|'medium'|'high'|'critical', factors: [{title, detail, severity}], mitigations: [strings] }.\n\n${dealContextText(ctx)}`,
      { json: true },
    )) as DealRiskResult;
  });

export const aiNextBestAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => dealIdInput.parse(v))
  .handler(async ({ data }): Promise<NextBestActionResult> => {
    const ctx = await loadDealContext(data.dealId);
    return (await callGateway<NextBestActionResult>(
      "You are a sales operations expert. Recommend concrete next actions. Return strict JSON.",
      `Recommend up to 4 next best actions. Return JSON { actions: [{title, reason, channel, urgency}] }. channel in [email,whatsapp,call,meeting,internal]. urgency in [now,today,this_week,later].\n\n${dealContextText(ctx)}`,
      { json: true },
    )) as NextBestActionResult;
  });

export const aiFollowUpSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => dealIdInput.parse(v))
  .handler(async ({ data }): Promise<FollowUpResult> => {
    const ctx = await loadDealContext(data.dealId);
    return (await callGateway<FollowUpResult>(
      "You suggest sales follow-ups tailored to deal context. Return strict JSON.",
      `Suggest 3 follow-ups. Return JSON { suggestions: [{subject, preview, whenLabel}] }. whenLabel like 'Tomorrow morning'.\n\n${dealContextText(ctx)}`,
      { json: true },
    )) as FollowUpResult;
  });

const draftInput = z.object({
  dealId: z.string().uuid(),
  channel: z.enum(["email", "whatsapp"]),
  intent: z.string().min(1).max(500),
  tone: z.enum(["friendly", "professional", "urgent", "casual", "formal"]).default("professional"),
});

export const aiDraftMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => draftInput.parse(v))
  .handler(async ({ data }): Promise<DraftMessageResult> => {
    const ctx = await loadDealContext(data.dealId);
    const constraints =
      data.channel === "whatsapp"
        ? "WhatsApp: max 3 short paragraphs, warm, mobile-friendly, no subject line."
        : "Email: include subject line. Professional, well-structured, 120-220 words.";
    const result = (await callGateway<{ subject?: string; body: string }>(
      `You draft ${data.channel} messages for a sales rep. ${constraints} Return strict JSON.`,
      `Write a ${data.channel} message for this deal. Tone: ${data.tone}. Intent: "${data.intent}".\nReturn JSON { subject?, body }.\n\n${dealContextText(ctx)}`,
      { json: true },
    )) as { subject?: string; body: string };
    return { channel: data.channel, subject: result.subject, body: result.body, tone: data.tone };
  });

export const aiProposalSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => dealIdInput.parse(v))
  .handler(async ({ data }): Promise<ProposalSuggestionResult> => {
    const ctx = await loadDealContext(data.dealId);
    return (await callGateway<ProposalSuggestionResult>(
      "You craft proposal strategies for B2B deals. Return strict JSON.",
      `Suggest a proposal strategy. Return JSON { angle, valueProps: [strings], pricingApproach, objectionsToPrepareFor: [strings], bundleIdeas: [strings] }.\n\n${dealContextText(ctx)}`,
      { json: true },
    )) as ProposalSuggestionResult;
  });

export const aiCoaching = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => dealIdInput.parse(v))
  .handler(async ({ data }): Promise<CoachingResult> => {
    const ctx = await loadDealContext(data.dealId);
    return (await callGateway<CoachingResult>(
      "You are a senior sales coach. Give constructive, specific coaching. Return strict JSON.",
      `Coach the rep working this deal. Return JSON { strengths: [strings], improvements: [strings], scriptTip, metricsToWatch: [strings] }.\n\n${dealContextText(ctx)}`,
      { json: true },
    )) as CoachingResult;
  });

export const aiDealProbability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => dealIdInput.parse(v))
  .handler(async ({ data }): Promise<DealProbabilityResult> => {
    const ctx = await loadDealContext(data.dealId);
    return (await callGateway<DealProbabilityResult>(
      "You estimate deal win probability using explicit signals. Return strict JSON.",
      `Estimate win probability (0-100), confidence, key drivers with impact, and a predicted close date (ISO date or null).\nReturn JSON { probability, confidence, drivers: [{label, impact, weight}], predictedCloseDate }.\n\n${dealContextText(ctx)}`,
      { json: true },
    )) as DealProbabilityResult;
  });

const revenueInput = z.object({ period: z.enum(["month", "quarter", "year"]).default("quarter") });

export const aiRevenuePrediction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => revenueInput.parse(v))
  .handler(async ({ data, context }): Promise<RevenuePredictionResult> => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: deals } = await supabaseAdmin
      .from("deals")
      .select(
        "id, title, amount, currency, probability, status, expected_close_date, stage_id, deal_stages(name)",
      )
      .eq("workspace_id", workspaceId)
      .eq("status", "open")
      .limit(200);
    const summary = (deals ?? [])
      .map((d) => {
        const r = d as Record<string, unknown>;
        const stage = (r.deal_stages as { name?: string } | null)?.name ?? "—";
        return `- ${r.title} | ${r.amount} ${r.currency} | ${r.probability}% | ${stage} | close ${r.expected_close_date ?? "?"}`;
      })
      .join("\n");
    // Row zero mislabels a mixed-currency pipeline, and "USD" then told the model
    // to forecast in dollars regardless of the tenant.
    const currency = await resolveAggregateCurrency(
      (deals ?? []) as Array<{ currency?: string | null }>,
      workspaceId,
    );
    return (await callGateway<RevenuePredictionResult>(
      "You forecast sales revenue by combining probability, stage, timing, and momentum. Return strict JSON.",
      `Forecast revenue for the current ${data.period}. Return JSON { periodLabel, bestCase, commit, worstCase, currency, narrative }. Use currency ${currency}.\n\nOpen pipeline:\n${summary || "(no open deals)"}`,
      { json: true },
    )) as RevenuePredictionResult;
  });

export const aiPipelineHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PipelineHealthResult> => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: deals } = await supabaseAdmin
      .from("deals")
      .select(
        "id, title, amount, currency, probability, status, priority, expected_close_date, updated_at, deal_stages(name)",
      )
      .eq("workspace_id", workspaceId)
      .limit(300);
    const now = Date.now();
    const summary = (deals ?? [])
      .map((d) => {
        const r = d as Record<string, unknown>;
        const stage = (r.deal_stages as { name?: string } | null)?.name ?? "—";
        const staleDays = Math.floor((now - new Date(r.updated_at as string).getTime()) / 86400000);
        return `- ${r.title} | ${r.amount} ${r.currency} | ${r.status} | ${r.probability}% | stage=${stage} | stale=${staleDays}d`;
      })
      .join("\n");
    return (await callGateway<PipelineHealthResult>(
      "You evaluate sales pipeline health. Consider velocity, stalled deals, stage distribution, deal size mix. Return strict JSON.",
      `Return JSON { score: 0-100, status: 'healthy'|'watch'|'at_risk', highlights: [strings], concerns: [strings], recommendations: [strings] }.\n\nPipeline:\n${summary || "(empty)"}`,
      { json: true },
    )) as PipelineHealthResult;
  });

export const aiLeadPriority = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LeadPriorityResult> => {
    const workspaceId = await getWorkspaceId(context.userId);
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { data: deals } = await supabaseAdmin
      .from("deals")
      .select(
        "id, title, amount, currency, probability, priority, status, expected_close_date, updated_at",
      )
      .eq("workspace_id", workspaceId)
      .eq("status", "open")
      .order("updated_at", { ascending: false })
      .limit(50);
    const summary = (deals ?? [])
      .map((d) => {
        const r = d as Record<string, unknown>;
        return `- id=${r.id} | ${r.title} | ${r.amount} ${r.currency} | ${r.probability}% | priority=${r.priority} | close ${r.expected_close_date ?? "?"}`;
      })
      .join("\n");
    return (await callGateway<LeadPriorityResult>(
      "You prioritize sales leads based on value, probability, timing, and momentum. Return strict JSON.",
      `Rank the top opportunities. Return JSON { ranking: [{dealId, title, priority: 'low'|'medium'|'high'|'urgent', reason}] }. Limit 12.\n\nDeals:\n${summary || "(none)"}`,
      { json: true },
    )) as LeadPriorityResult;
  });

const noteInput = z.object({ dealId: z.string().uuid(), event: z.string().min(1).max(500) });

export const aiGenerateCrmNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => noteInput.parse(v))
  .handler(async ({ data }): Promise<{ note: string }> => {
    const ctx = await loadDealContext(data.dealId);
    const note = (await callGateway<string>(
      "You write concise, professional CRM notes. Return plain text (no JSON, no markdown fences).",
      `Write a CRM note capturing this event in 2-4 sentences. Event: "${data.event}". Use deal context to make the note specific.\n\n${dealContextText(ctx)}`,
    )) as string;
    return { note: note.trim() };
  });

export const aiSalesRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => dealIdInput.parse(v))
  .handler(
    async ({
      data,
    }): Promise<{
      recommendations: { title: string; detail: string; impact: "low" | "medium" | "high" }[];
    }> => {
      const ctx = await loadDealContext(data.dealId);
      return (await callGateway<{
        recommendations: { title: string; detail: string; impact: "low" | "medium" | "high" }[];
      }>(
        "You give sharp, actionable sales recommendations. Return strict JSON.",
        `Give 4-6 recommendations to advance this deal. Return JSON { recommendations: [{title, detail, impact}] }.\n\n${dealContextText(ctx)}`,
        { json: true },
      )) as {
        recommendations: { title: string; detail: string; impact: "low" | "medium" | "high" }[];
      };
    },
  );
