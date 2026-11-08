/**
 * Feature Limits + Plan Feature access.
 *
 * Plans store an arbitrary `features` and `limits` jsonb. This module gives
 * the app a typed, defaulted view over them so components/server code can
 * gate features without knowing about jsonb shape drift.
 *
 * Keys are meter codes for numeric limits (e.g. `messages_sent`, `ai_tokens`,
 * `seats`) — matching `usage_meters.code`. Feature flags are booleans keyed
 * by capability (e.g. `ai.reply_assistant`, `automations.enabled`).
 */

export type PlanLimits = Record<string, number | null>; // null = unlimited
export type PlanFeatures = Record<string, boolean>;

export interface PlanCapabilityView {
  limits: PlanLimits;
  features: PlanFeatures;
}

export function capabilityView(plan: { features?: unknown; limits?: unknown } | null | undefined): PlanCapabilityView {
  return {
    limits: normalizeLimits(plan?.limits),
    features: normalizeFeatures(plan?.features),
  };
}

export function hasFeature(view: PlanCapabilityView, key: string): boolean {
  return view.features[key] === true;
}

export function getLimit(view: PlanCapabilityView, meterCode: string): number | null {
  const v = view.limits[meterCode];
  return v === undefined ? 0 : v; // undefined => 0 (blocked), null => unlimited
}

export interface QuotaCheck {
  meter_code: string;
  limit: number | null;
  used: number;
  remaining: number | null;
  usage_ratio: number; // 0..1, 0 if unlimited
  allowed: boolean;
  approaching: boolean; // >= 80% usage
}

export function checkQuota(view: PlanCapabilityView, meter_code: string, used: number, requested = 1): QuotaCheck {
  const limit = getLimit(view, meter_code);
  if (limit === null) {
    return {
      meter_code,
      limit: null,
      used,
      remaining: null,
      usage_ratio: 0,
      allowed: true,
      approaching: false,
    };
  }
  const projected = used + requested;
  const remaining = Math.max(0, limit - used);
  const usage_ratio = limit === 0 ? 1 : Math.min(1, projected / limit);
  return {
    meter_code,
    limit,
    used,
    remaining,
    usage_ratio,
    allowed: projected <= limit,
    approaching: usage_ratio >= 0.8,
  };
}

function normalizeLimits(raw: unknown): PlanLimits {
  if (!raw || typeof raw !== "object") return {};
  const out: PlanLimits = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === null || v === "unlimited") out[k] = null;
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "string" && /^-?\d+$/.test(v)) out[k] = Number(v);
  }
  return out;
}

function normalizeFeatures(raw: unknown): PlanFeatures {
  if (!raw || typeof raw !== "object") return {};
  const out: PlanFeatures = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    out[k] = v === true || v === "true" || v === 1;
  }
  return out;
}
