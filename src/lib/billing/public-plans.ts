/**
 * Shared public plan catalog helpers.
 *
 * Both the marketing landing page pricing section and the standalone /pricing
 * page render the same live `plans` rows, so price formatting, feature bullets
 * and the monthly/yearly switch live here instead of being duplicated.
 *
 * Client-safe: only imports the public server function.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getMyPlanSummary, listPublicPlans } from "@/lib/billing/plans.functions";

export type PublicPlan = {
  id: string;
  code: string;
  name: string;
  tier: string;
  description: string | null;
  tagline: string | null;
  badge: string | null;
  cta_label: string | null;
  price_cents: number;
  currency: string;
  interval: "month" | "year" | "lifetime";
  trial_days: number;
  features: Record<string, unknown>;
  limits: Record<string, unknown>;
  highlight: boolean;
  sort_order: number;
  is_custom: boolean;
  monthly_plan_code: string | null;
};

export type BillingInterval = "month" | "year";

/**
 * Currency formatting without cents — marketing prices are always round.
 *
 * `currency` is the plan's own (`plans.currency` is NOT NULL), so there is no
 * fallback here: substituting dollars for a blank would contradict the price
 * being printed beside it.
 */
export function formatPlanPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** True for plans that can't be self-served (lifetime / custom / enterprise). */
export function isContactSalesPlan(plan: PublicPlan): boolean {
  return plan.is_custom || plan.interval === "lifetime" || plan.tier === "enterprise";
}

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Unlimited is encoded as -1 (or the literal "unlimited"). */
function unlimited(value: unknown): boolean {
  return value === -1 || value === "unlimited" || value === null;
}

function count(value: unknown, singular: string, plural = `${singular}s`): string | null {
  if (value === undefined) return null;
  if (unlimited(value)) return `Unlimited ${plural}`;
  const n = num(value);
  if (n === null || n <= 0) return null;
  return `${n.toLocaleString()} ${n === 1 ? singular : plural}`;
}

const SUPPORT_LABEL: Record<string, string> = {
  community: "Community support",
  email: "Priority email support",
  priority: "Priority support with fast SLAs",
  dedicated: "Dedicated success manager",
};

/**
 * Marketing bullet list derived from the plan's `limits` / `features` jsonb.
 * Covers every key the catalog uses today so no plan renders an empty card.
 */
export function planBullets(plan: PublicPlan, max = 6): string[] {
  const l = (plan.limits ?? {}) as Record<string, unknown>;
  const f = (plan.features ?? {}) as Record<string, unknown>;
  const out: Array<string | null> = [];

  out.push(
    "messages_per_month" in l
      ? unlimited(l.messages_per_month)
        ? "Unlimited messages"
        : count(l.messages_per_month, "message")?.concat(" / month") ?? null
      : null,
  );
  // Prefer "agents" over "seats" — they describe the same thing on most plans.
  out.push(count(l.agents ?? f.agents ?? l.seats, "agent"));
  out.push(count(l.contacts, "contact"));
  out.push(count(f.channels, "connected channel"));

  // Tier differentiators first, generic platform features after, so short
  // lists still show what makes the plan different.
  if (f.ai) out.push("AI Studio & smart replies");
  if (f.sso) out.push("SSO / SAML");
  if (f.sla) out.push("Uptime SLA");
  const support = typeof f.support === "string" ? SUPPORT_LABEL[f.support] : null;
  out.push(support ?? null);
  if (f.automations) out.push("No-code automation builder");
  if (f.api) out.push("Full REST API & webhooks");
  if (f.broadcasts) out.push("Broadcast campaigns");
  if (f.audit_export) out.push("Audit log export");
  out.push(count(l.workspaces, "workspace"));

  const seen = new Set<string>();
  return out
    .filter((v): v is string => Boolean(v))
    .filter((v) => (seen.has(v) ? false : (seen.add(v), true)))
    .slice(0, max);
}

/** Yearly price expressed per month, for "$X / mo billed yearly" copy. */
export function monthlyEquivalent(plan: PublicPlan): string | null {
  if (plan.interval !== "year" || plan.price_cents <= 0) return null;
  return formatPlanPrice(Math.round(plan.price_cents / 12), plan.currency);
}

/**
 * Live public plan catalog with the monthly/yearly switch already applied.
 * Contact-sales plans are always appended so they stay visible on both tabs.
 */
export function usePublicPlans(initialInterval: BillingInterval = "month") {
  const list = useServerFn(listPublicPlans);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["public-plans"],
    queryFn: () => list(),
    staleTime: 5 * 60_000,
  });
  const [interval, setInterval] = useState<BillingInterval>(initialInterval);

  const all = useMemo(() => (data ?? []) as unknown as PublicPlan[], [data]);

  const plans = useMemo(() => {
    const forInterval = all.filter((p) => p.interval === interval);
    const contact = all.filter((p) => isContactSalesPlan(p) && p.interval !== interval);
    return [...forInterval, ...contact].sort((a, b) => a.sort_order - b.sort_order);
  }, [all, interval]);

  /** Best real discount across any paired monthly/yearly plan. */
  const savingsPct = useMemo(() => {
    let best = 0;
    for (const yearly of all) {
      if (yearly.interval !== "year" || !yearly.monthly_plan_code) continue;
      const monthly = all.find((p) => p.code === yearly.monthly_plan_code);
      if (!monthly || monthly.price_cents <= 0) continue;
      best = Math.max(best, Math.round((1 - yearly.price_cents / (monthly.price_cents * 12)) * 100));
    }
    return best > 0 ? best : 20;
  }, [all]);

  const hasYearly = useMemo(() => all.some((p) => p.interval === "year"), [all]);
  const maxTrialDays = useMemo(() => all.reduce((m, p) => Math.max(m, p.trial_days ?? 0), 0), [all]);

  return { plans, all, interval, setInterval, savingsPct, hasYearly, maxTrialDays, isLoading, isError };
}

/* ------------------------------------------------------------------ */
/* Plan comparison table                                               */
/* ------------------------------------------------------------------ */

export type ComparisonValue = string | boolean;
export type ComparisonRow = { label: string; values: ComparisonValue[] };
export type ComparisonGroup = { label: string; rows: ComparisonRow[] };

/** Limit cell: number, "Unlimited", or "—" when the plan doesn't define it. */
function limitCell(value: unknown, suffix = ""): ComparisonValue {
  if (value === undefined) return false;
  if (unlimited(value)) return "Unlimited";
  const n = num(value);
  if (n === null) return false;
  return `${n.toLocaleString()}${suffix}`;
}

function featureCell(value: unknown): ComparisonValue {
  if (typeof value === "string") return value;
  const n = num(value);
  if (n !== null && typeof value !== "boolean") return n.toLocaleString();
  return Boolean(value);
}

const LIMIT_ROWS: Array<{ key: string; label: string; suffix?: string }> = [
  { key: "messages_per_month", label: "Messages", suffix: " / mo" },
  { key: "agents", label: "Agents / seats" },
  { key: "contacts", label: "Contacts" },
  { key: "workspaces", label: "Workspaces" },
  { key: "channels", label: "Connected channels" },
  { key: "storage_gb", label: "Storage", suffix: " GB" },
];

const FEATURE_ROWS: Array<{ key: string; label: string }> = [
  { key: "inbox", label: "Shared omnichannel inbox" },
  { key: "broadcasts", label: "Broadcast campaigns" },
  { key: "templates", label: "WhatsApp template manager" },
  { key: "automations", label: "No-code automation builder" },
  { key: "chatbot", label: "AI chatbot builder" },
  { key: "ai", label: "AI Studio & smart replies" },
  { key: "crm", label: "CRM & sales pipeline" },
  { key: "commerce", label: "WhatsApp commerce / catalog" },
  { key: "analytics", label: "Advanced analytics" },
  { key: "api", label: "REST API & webhooks" },
  { key: "white_label", label: "White-label branding" },
  { key: "sso", label: "SSO / SAML" },
  { key: "audit_export", label: "Audit log export" },
  { key: "sla", label: "Uptime SLA" },
];

/**
 * Builds the comparison matrix. Rows where no plan defines the key are
 * dropped so the table never shows an all-empty line.
 */
export function comparisonGroups(plans: PublicPlan[]): ComparisonGroup[] {
  const limits = plans.map((p) => (p.limits ?? {}) as Record<string, unknown>);
  const features = plans.map((p) => (p.features ?? {}) as Record<string, unknown>);

  const limitRows: ComparisonRow[] = LIMIT_ROWS.map(({ key, label, suffix }) => ({
    label,
    values: plans.map((_, i) =>
      limitCell(limits[i]?.[key] ?? features[i]?.[key], suffix ?? ""),
    ),
  })).filter((r) => r.values.some((v) => v !== false));

  const featureRows: ComparisonRow[] = FEATURE_ROWS.map(({ key, label }) => ({
    label,
    values: plans.map((_, i) => featureCell(features[i]?.[key] ?? limits[i]?.[key])),
  })).filter((r) => r.values.some((v) => v !== false));

  const supportRow: ComparisonRow = {
    label: "Support",
    values: plans.map((_, i) => {
      const s = features[i]?.support;
      return typeof s === "string" ? (SUPPORT_LABEL[s] ?? s) : false;
    }),
  };

  const trialRow: ComparisonRow = {
    label: "Free trial",
    values: plans.map((p) => (p.trial_days > 0 ? `${p.trial_days} days` : false)),
  };

  const groups: ComparisonGroup[] = [];
  if (limitRows.length) groups.push({ label: "Usage & limits", rows: limitRows });
  if (featureRows.length) groups.push({ label: "Features", rows: featureRows });
  const tail = [supportRow, trialRow].filter((r) => r.values.some((v) => v !== false));
  if (tail.length) groups.push({ label: "Support & terms", rows: tail });
  return groups;
}

/* ------------------------------------------------------------------ */
/* Current subscription badge (signed-in visitors)                     */
/* ------------------------------------------------------------------ */

export type MyPlanSummary = {
  organization_id: string;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at: string | null;
  plan_code: string | null;
  plan_name: string | null;
  plan_tier: string | null;
  plan_interval: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  trialing: "Free trial",
  active: "Active",
  past_due: "Past due",
  canceled: "Canceled",
  incomplete: "Incomplete",
  paused: "Paused",
};

export function planStatusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status.replace(/_/g, " ");
}

/** Short human note under the badge, e.g. trial end or renewal date. */
export function planStatusDetail(sub: MyPlanSummary): string | null {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (sub.status === "trialing" && sub.trial_ends_at) return `Trial ends ${fmt(sub.trial_ends_at)}`;
  if (sub.cancel_at) return `Cancels ${fmt(sub.cancel_at)}`;
  if (sub.current_period_end) return `Renews ${fmt(sub.current_period_end)}`;
  return null;
}

/**
 * Current plan for the signed-in visitor, or null when signed out.
 *
 * The pricing pages are public, so the protected server function is only
 * called once a Supabase session exists on the client — never during SSR or
 * prerender, where there is no bearer token.
 */
export function useMyPlanSummary() {
  const fetchSummary = useServerFn(getMyPlanSummary);

  const { data: hasSession } = useQuery({
    queryKey: ["public-plans", "has-session"],
    queryFn: async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.auth.getSession();
      return Boolean(data.session);
    },
    staleTime: 60_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["public-plans", "my-subscription"],
    queryFn: () => fetchSummary(),
    enabled: hasSession === true,
    staleTime: 60_000,
    retry: false,
  });

  return {
    subscription: (data ?? null) as MyPlanSummary | null,
    isSignedIn: hasSession === true,
    isLoading: hasSession === undefined || (hasSession === true && isLoading),
  };
}
