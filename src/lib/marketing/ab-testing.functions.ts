/**
 * A/B testing server functions for marketing campaigns.
 * Statistical winner selection, auto-apply, AI recommendations.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sbAny } from "@/lib/supabase/untyped";
import { GEMINI_CHAT_URL, GEMINI_DEFAULT_CHAT_MODEL } from "@/lib/ai/gemini.server";

/* eslint-disable @typescript-eslint/no-explicit-any */

const AI_GATEWAY = GEMINI_CHAT_URL;
const DEFAULT_MODEL = GEMINI_DEFAULT_CHAT_MODEL;

type VariantRow = {
  id: string;
  campaign_id: string;
  workspace_id: string;
  name: string;
  weight: number;
  message_body: string | null;
  media_url: string | null;
  template_id: string | null;
  template_variables: Record<string, unknown>;
  is_winner: boolean;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  replied_count: number;
  clicked_count: number;
  failed_count: number;
};

/* ---------- Statistics ---------- */

function inverseNormalCdf(p: number): number {
  // Beasley-Springer-Moro approximation, adequate for confidence z-lookup.
  const a = [-39.69683, 220.946098, -275.92851, 138.357751, -30.664798, 2.506628];
  const b = [-54.476098, 161.585836, -155.698979, 66.801311, -13.280681];
  const c = [-0.007784, -0.322396, -2.400758, -2.549732, 4.374664, 2.938163];
  const d = [0.007784, 0.328761, 2.445134, 3.754408];
  const pLow = 0.02425,
    pHigh = 1 - pLow;
  let q: number, r: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

function normalCdf(z: number): number {
  // Abramowitz & Stegun 7.1.26
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804 * Math.exp((-z * z) / 2);
  const p =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

function twoProportionZ(x1: number, n1: number, x2: number, n2: number) {
  if (n1 === 0 || n2 === 0) return { z: 0, pValue: 1 };
  const p1 = x1 / n1,
    p2 = x2 / n2;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (se === 0) return { z: 0, pValue: 1 };
  const z = (p1 - p2) / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  return { z, pValue };
}

/* ---------- Compute analytics ---------- */

export type MetricKey = "delivered" | "read" | "replied" | "clicked";

function successCount(v: VariantRow, m: MetricKey): number {
  return v[`${m}_count` as const];
}

/* ---------- Server functions ---------- */

const declareInput = z.object({
  campaignId: z.string().uuid(),
  variantId: z.string().uuid(),
  metric: z.enum(["delivered", "read", "replied", "clicked"]).default("replied"),
});

export const declareAbWinner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => declareInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: variants, error } = await supabase
      .from("campaign_ab_variants")
      .select("*")
      .eq("campaign_id", data.campaignId);
    if (error) throw new Error(error.message);
    const rows = (variants ?? []) as VariantRow[];
    if (!rows.some((v) => v.id === data.variantId)) throw new Error("Variant not found");

    await supabase
      .from("campaign_ab_variants")
      .update({ is_winner: false } as any)
      .eq("campaign_id", data.campaignId);

    const { error: upErr } = await supabase
      .from("campaign_ab_variants")
      .update({ is_winner: true } as any)
      .eq("id", data.variantId);
    if (upErr) throw new Error(upErr.message);

    return { ok: true, variantId: data.variantId, metric: data.metric };
  });

const applyInput = z.object({
  campaignId: z.string().uuid(),
  variantId: z.string().uuid(),
});

/**
 * Promotes the winning variant to be the campaign default and gives it 100% weight.
 * Future dispatch reuses the winning copy for remaining/re-sent recipients.
 */
export const applyAbWinner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => applyInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: variant, error } = await supabase
      .from("campaign_ab_variants")
      .select("*")
      .eq("id", data.variantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!variant) throw new Error("Variant not found");

    const v = variant as VariantRow;
    await supabase
      .from("campaigns")
      .update({
        message_body: v.message_body,
        media_url: v.media_url,
        template_id: v.template_id,
        template_variables: v.template_variables ?? {},
      } as any)
      .eq("id", data.campaignId);

    await supabase
      .from("campaign_ab_variants")
      .update({ weight: 0, is_winner: false } as any)
      .eq("campaign_id", data.campaignId);

    await supabase
      .from("campaign_ab_variants")
      .update({ weight: 100, is_winner: true } as any)
      .eq("id", data.variantId);

    await sbAny(supabase)
      .from("campaign_events")
      .insert({
        workspace_id: v.workspace_id,
        campaign_id: data.campaignId,
        event_type: "ab_winner_applied",
        payload: { variant_id: v.id, variant_name: v.name },
      } as any);

    return { ok: true };
  });

const suggestInput = z.object({
  campaignId: z.string().uuid(),
});

export const abTestSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => suggestInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: campaign }, { data: variants }] = await Promise.all([
      sbAny(supabase).from("campaigns").select("*").eq("id", data.campaignId).maybeSingle(),
      supabase.from("campaign_ab_variants").select("*").eq("campaign_id", data.campaignId),
    ]);
    if (!campaign) throw new Error("Campaign not found");
    const rows = (variants ?? []) as VariantRow[];

    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("Missing GEMINI_API_KEY");

    const summary = rows.map((v) => ({
      name: v.name,
      weight: Number(v.weight),
      body: (v.message_body ?? "").slice(0, 400),
      sent: v.sent_count,
      delivered: v.delivered_count,
      read: v.read_count,
      replied: v.replied_count,
      clicked: v.clicked_count,
      failed: v.failed_count,
    }));

    const system =
      "You are a senior WhatsApp marketing strategist. Suggest concrete, data-backed A/B test ideas. " +
      'Return strict JSON of shape { hypotheses: [{ title, rationale, changes: ["..."], expected_lift_pct }], recommended_metric: string, recommended_min_sample: number, notes: string }.';
    const user = JSON.stringify({
      campaign: {
        name: (campaign as any).name,
        goal: (campaign as any).goal,
        channel: (campaign as any).channel,
        message: ((campaign as any).message_body ?? "").slice(0, 800),
      },
      variants: summary,
    });

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
      if (res.status === 402) throw new Error("AI credits exhausted.");
      throw new Error(`AI gateway ${res.status}: ${txt.slice(0, 200)}`);
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = (json.choices?.[0]?.message?.content ?? "")
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    try {
      return JSON.parse(content);
    } catch {
      return { hypotheses: [], notes: content };
    }
  });

/* ---------- Pure helpers exported for client-side re-use ---------- */

export const abStatsHelpers = {
  twoProportionZ,
  inverseNormalCdf,
  normalCdf,
  successCount,
};
