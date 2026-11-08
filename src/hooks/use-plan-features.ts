/**
 * usePlanFeatures — runtime capability view for the active organization.
 *
 * Combines the org's current subscription plan with the feature catalog to
 * expose typed helpers used across the app:
 *
 *   const { hasFeature, getLimit, checkQuota, plan } = usePlanFeatures();
 *   if (!hasFeature("automations.enabled")) return <Upsell />;
 *
 * Falls back to the free-tier defaults when the org has no subscription yet.
 */

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";

import { useActiveOrganization } from "@/hooks/use-organization";
import { getMySubscription } from "@/lib/billing/plans.functions";
import {
  capabilityView, checkQuota as checkQuotaFn, getLimit as getLimitFn, hasFeature as hasFeatureFn,
  type PlanCapabilityView, type QuotaCheck,
} from "@/lib/billing/feature-limits";
import { bucketForTier, LIMITS, FEATURES } from "@/lib/billing/feature-catalog";

export interface UsePlanFeaturesResult {
  loading: boolean;
  plan: { id?: string; code?: string; name?: string; tier?: string } | null;
  view: PlanCapabilityView;
  hasFeature: (key: string) => boolean;
  getLimit: (key: string) => number | null;
  checkQuota: (key: string, used: number, requested?: number) => QuotaCheck;
}

export function usePlanFeatures(): UsePlanFeaturesResult {
  const { active } = useActiveOrganization();
  const activeOrgId = active?.id;

  const fetchSub = useServerFn(getMySubscription);

  const q = useQuery({
    queryKey: ["my-subscription", activeOrgId],
    enabled: !!activeOrgId,
    staleTime: 60_000,
    queryFn: () => fetchSub({ data: { organization_id: activeOrgId! } }),
  });

  return useMemo<UsePlanFeaturesResult>(() => {
    const sub = q.data as { plan?: { id: string; code: string; name: string; tier: string; features: unknown; limits: unknown } } | null | undefined;
    const plan = sub?.plan ?? null;

    // Merge plan-defined values with catalog defaults so unspecified keys
    // still resolve to a sane bucket for the plan's tier.
    const bucket = bucketForTier(plan?.tier ?? "free");
    const mergedLimits: Record<string, number | null> = {};
    for (const l of LIMITS) mergedLimits[l.key] = l.defaults[bucket];
    const mergedFeatures: Record<string, boolean> = {};
    for (const f of FEATURES) mergedFeatures[f.key] = f.defaults[bucket];

    const view = capabilityView({ features: { ...mergedFeatures, ...(plan?.features as object ?? {}) }, limits: { ...mergedLimits, ...(plan?.limits as object ?? {}) } });

    return {
      loading: q.isLoading,
      plan: plan ? { id: plan.id, code: plan.code, name: plan.name, tier: plan.tier } : null,
      view,
      hasFeature: (k) => hasFeatureFn(view, k),
      getLimit: (k) => getLimitFn(view, k),
      checkQuota: (k, used, requested) => checkQuotaFn(view, k, used, requested),
    };
  }, [q.data, q.isLoading]);
}
