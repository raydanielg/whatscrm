/**
 * AI marketing assistant server functions.
 *
 * Uses Lovable AI Gateway directly (mirrors the pattern in ab-testing.functions.ts)
 * so it works without any workspace-level AI provider configuration.
 *
 * Features:
 *  - generateCampaignCopy       (headlines, body, CTAs)
 *  - rewriteMessage             (tone / length / style)
 *  - scoreContent               (quality + spam risk)
 *  - recommendAudience          (segment + list suggestions)
 *  - suggestSendTime            (best send window)
 *  - analyzeCampaignPerformance (summary, insights, improvements)
 *  - generateFollowUp           (drafts a follow-up campaign)
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";
import { GEMINI_CHAT_URL, GEMINI_DEFAULT_CHAT_MODEL } from "@/lib/ai/gemini.server";

/* eslint-disable @typescript-eslint/no-explicit-any */

const AI_GATEWAY = GEMINI_CHAT_URL;
const DEFAULT_MODEL = GEMINI_DEFAULT_CHAT_MODEL;

async function callAiJson<T = unknown>(system: string, user: string, fallback: T): Promise<T> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY");
  const res = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    if (res.status === 429) throw new Error("AI rate limit — retry shortly.");
    if (res.status === 402)
      throw new Error("AI credits exhausted. Add credits in workspace billing.");
    throw new Error(`AI gateway ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = (json.choices?.[0]?.message?.content ?? "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

async function loadCampaign(supabase: any, id: string) {
  // RLS on the supabase client enforces workspace isolation; the .eq("id") lookup is safe.
  const { data, error } = await sbAny(supabase)
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Campaign not found");
  return data;
}

/* ---------- Copy generation ---------- */

const copyInput = z.object({
  campaignId: z.string().uuid().optional(),
  goal: z.string().min(1).optional(),
  audience: z.string().optional(),
  brand: z.string().optional(),
  tone: z
    .enum(["friendly", "professional", "urgent", "playful", "luxury", "neutral"])
    .default("friendly"),
  language: z.string().default("en"),
  channel: z.string().default("whatsapp"),
  productContext: z.string().optional(),
  count: z.number().int().min(1).max(6).default(3),
});

export type CopyVariant = {
  headline: string;
  body: string;
  cta: string;
  hook: string;
};

export const generateCampaignCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => copyInput.parse(data))
  .handler(async ({ data, context }) => {
    let campaign: any = null;
    if (data.campaignId) {
      try {
        campaign = await loadCampaign(context.supabase, data.campaignId);
      } catch {
        /* ignore */
      }
    }
    const system =
      "You are an elite WhatsApp / messaging marketing copywriter. Write concise, high-converting, policy-safe copy. " +
      "Return strict JSON: { variants: [{ headline, body, cta, hook }], notes: string }. " +
      "Body: max 480 chars, natural WhatsApp voice. Headline: short subject line style. CTA: 2-5 words. Hook: opening sentence. " +
      "Do NOT use spammy language, ALL CAPS, or excessive emojis. Use language={language}.";
    const user = JSON.stringify({
      goal: data.goal ?? campaign?.goal ?? "engagement",
      audience: data.audience ?? campaign?.audience_description ?? "existing customers",
      brand: data.brand,
      tone: data.tone,
      language: data.language,
      channel: data.channel,
      product: data.productContext,
      existing_message: campaign?.message_body?.slice(0, 400),
      variants_wanted: data.count,
    });
    const out = await callAiJson<{ variants: CopyVariant[]; notes?: string }>(system, user, {
      variants: [],
    });
    return { variants: out.variants ?? [], notes: out.notes ?? "" };
  });

/* ---------- Rewrite ---------- */

const rewriteInput = z.object({
  message: z.string().min(1),
  instruction: z.string().default("Improve clarity and impact."),
  tone: z.string().optional(),
  targetLength: z.enum(["shorter", "same", "longer"]).default("same"),
  language: z.string().default("en"),
});

export const rewriteMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => rewriteInput.parse(data))
  .handler(async ({ data }) => {
    const system =
      "You are a marketing copy editor. Rewrite the given message following the instructions. " +
      "Return strict JSON: { rewritten: string, changes: string[], reasoning: string }.";
    const user = JSON.stringify(data);
    return callAiJson<{ rewritten: string; changes: string[]; reasoning: string }>(system, user, {
      rewritten: data.message,
      changes: [],
      reasoning: "",
    });
  });

/* ---------- Content scoring & spam risk ---------- */

const scoreInput = z.object({
  message: z.string().min(1),
  channel: z.string().default("whatsapp"),
});

export type ContentScore = {
  overall_score: number; // 0-100
  clarity: number;
  persuasiveness: number;
  brand_safety: number;
  spam_risk: number; // 0-100 (higher = riskier)
  spam_signals: string[];
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
};

export const scoreContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => scoreInput.parse(data))
  .handler(async ({ data }) => {
    const system =
      "You are a messaging compliance and marketing quality analyst. Score the message for a WhatsApp/SMS-class marketing channel. " +
      "Return strict JSON with keys: overall_score (0-100), clarity (0-100), persuasiveness (0-100), brand_safety (0-100), spam_risk (0-100), " +
      "spam_signals (string[]), strengths (string[]), weaknesses (string[]), suggestions (string[]). Be strict about ALL CAPS, false urgency, misleading claims, unsolicited-sounding phrasing.";
    return callAiJson<ContentScore>(system, JSON.stringify(data), {
      overall_score: 0,
      clarity: 0,
      persuasiveness: 0,
      brand_safety: 0,
      spam_risk: 0,
      spam_signals: [],
      strengths: [],
      weaknesses: [],
      suggestions: [],
    });
  });

/* ---------- Audience recommendations ---------- */

const audienceInput = z.object({
  goal: z.string().min(1),
  productContext: z.string().optional(),
  message: z.string().optional(),
});

export const recommendAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => audienceInput.parse(data))
  .handler(async ({ data, context }) => {
    // Provide the model with lightweight signal: which tags / lifecycle stages exist.
    const { supabase } = context;
    const [{ data: tagRows }, { data: listRows }] = await Promise.all([
      sbAny(supabase).from("contacts").select("tags").limit(500),
      sbAny(supabase)
        .from("contact_lists")
        .select("id, name, description, contact_count")
        .limit(50),
    ]);
    const tagCounts = new Map<string, number>();
    for (const row of (tagRows ?? []) as any[]) {
      for (const t of (row?.tags ?? []) as string[]) {
        tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
      }
    }
    const topTags = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([tag, count]) => ({ tag, count }));

    const system =
      "You recommend WhatsApp marketing audiences from real workspace data. " +
      "Return strict JSON: { segments: [{ name, description, filters: [{ field, op, value }], estimated_size_bucket }], suggested_lists: [{ list_id, reason }], notes }.";
    const user = JSON.stringify({
      goal: data.goal,
      product: data.productContext,
      message: data.message,
      available_tags: topTags,
      available_lists: listRows ?? [],
    });
    return callAiJson<{
      segments: Array<{
        name: string;
        description: string;
        filters: Array<{ field: string; op: string; value: string | number | boolean | null }>;
        estimated_size_bucket: string;
      }>;
      suggested_lists: Array<{ list_id: string; reason: string }>;
      notes: string;
    }>(system, user, { segments: [], suggested_lists: [], notes: "" });
  });

/* ---------- Best send time ---------- */

const timingInput = z.object({
  campaignId: z.string().uuid().optional(),
  goal: z.string().optional(),
  audienceTimezone: z.string().default("Europe/Oslo"),
});

export const suggestSendTime = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => timingInput.parse(data))
  .handler(async ({ data, context }) => {
    // Analyze past send/read timestamps from campaign_events.
    const { data: rows } = await context.supabase
      .from("campaign_events")
      .select("event_type, created_at")
      .in("event_type", ["message_delivered", "message_read", "message_replied"])
      .order("created_at", { ascending: false })
      .limit(2000);

    const buckets = new Map<string, number>();
    for (const r of (rows ?? []) as any[]) {
      if (r.event_type !== "message_read" && r.event_type !== "message_replied") continue;
      const d = new Date(r.created_at);
      const key = `${d.getUTCDay()}-${d.getUTCHours()}`;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    const heat = [...buckets.entries()].map(([k, v]) => {
      const [dow, hour] = k.split("-").map((n) => parseInt(n, 10));
      return { dayOfWeek: dow, hourUTC: hour, engagements: v };
    });

    const system =
      "You are a marketing send-time optimizer. Use the engagement heatmap and audience timezone to recommend send windows. " +
      "Return strict JSON: { best_windows: [{ day_of_week, start_hour_local, end_hour_local, confidence, rationale }], next_recommended_iso: string, avoid_windows: string[], notes }.";
    const user = JSON.stringify({
      audience_tz: data.audienceTimezone,
      goal: data.goal,
      heatmap_utc: heat.sort((a, b) => b.engagements - a.engagements).slice(0, 30),
    });
    return callAiJson(system, user, {
      best_windows: [],
      next_recommended_iso: null,
      avoid_windows: [],
      notes: "Not enough historical data yet — collecting engagements.",
    });
  });

/* ---------- Performance analysis + follow-up ---------- */

const analyzeInput = z.object({ campaignId: z.string().uuid() });

export const analyzeCampaignPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => analyzeInput.parse(data))
  .handler(async ({ data, context }) => {
    const campaign = await loadCampaign(context.supabase, data.campaignId);
    const total = Number(campaign.total_recipients) || 0;
    const sent = Number(campaign.sent_count) || 0;
    const delivered = Number(campaign.delivered_count) || 0;
    const read = Number(campaign.read_count) || 0;
    const replied = Number(campaign.replied_count) || 0;
    const clicked = Number(campaign.clicked_count) || 0;
    const failed = Number(campaign.failed_count) || 0;
    const optedOut = Number(campaign.opted_out_count) || 0;

    const rates = {
      delivery_rate: sent ? delivered / sent : 0,
      read_rate: delivered ? read / delivered : 0,
      response_rate: delivered ? replied / delivered : 0,
      click_rate: delivered ? clicked / delivered : 0,
      failure_rate: sent ? failed / sent : 0,
      opt_out_rate: delivered ? optedOut / delivered : 0,
    };

    const system =
      "You are a senior WhatsApp marketing analyst. Analyze the campaign KPIs and provide an executive summary. " +
      "Return strict JSON: { summary: string, health: 'excellent'|'good'|'fair'|'poor', insights: string[], strengths: string[], risks: string[], improvements: [{ title, action, expected_impact }], next_best_actions: string[] }.";
    const user = JSON.stringify({
      name: campaign.name,
      goal: campaign.goal,
      status: campaign.status,
      totals: { total, sent, delivered, read, replied, clicked, failed, optedOut },
      rates,
      message: (campaign.message_body ?? "").slice(0, 800),
    });

    return callAiJson(system, user, {
      summary: "",
      health: "fair",
      insights: [],
      strengths: [],
      risks: [],
      improvements: [],
      next_best_actions: [],
    });
  });

const followUpInput = z.object({
  campaignId: z.string().uuid(),
  segment: z
    .enum(["not_read", "read_no_reply", "clicked_no_convert", "all_engaged"])
    .default("read_no_reply"),
});

export const generateFollowUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => followUpInput.parse(data))
  .handler(async ({ data, context }) => {
    const campaign = await loadCampaign(context.supabase, data.campaignId);
    const system =
      "Design a follow-up WhatsApp campaign for the specified re-engagement segment. " +
      "Return strict JSON: { name: string, goal: string, segment_description: string, timing_offset_hours: number, message_body: string, cta: string, variants: [{ headline, body, cta }], rationale: string }.";
    const user = JSON.stringify({
      original: {
        name: campaign.name,
        goal: campaign.goal,
        message: (campaign.message_body ?? "").slice(0, 600),
      },
      segment: data.segment,
    });
    return callAiJson(system, user, {
      name: `${campaign.name} — follow-up`,
      goal: "re-engagement",
      segment_description: data.segment,
      timing_offset_hours: 48,
      message_body: "",
      cta: "",
      variants: [],
      rationale: "",
    });
  });
