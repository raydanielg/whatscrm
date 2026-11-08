/**
 * "You're on <plan>" banner + per-card current-plan marker for the public
 * pricing surfaces. Renders nothing for signed-out visitors.
 */

import { Link } from "@tanstack/react-router";
import { BadgeCheck } from "lucide-react";

import {
  planStatusDetail,
  planStatusLabel,
  type MyPlanSummary,
} from "@/lib/billing/public-plans";

/** Banner shown above the plan cards. */
export function CurrentPlanBanner({ subscription }: { subscription: MyPlanSummary | null }) {
  if (!subscription) return null;
  const detail = planStatusDetail(subscription);
  const isTrial = subscription.status === "trialing";

  return (
    <div className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-none border-t border-border bg-muted/50 px-4 py-2 text-sm">
      <BadgeCheck className="w-4 h-4 text-accent shrink-0" aria-hidden />
      <span className="text-foreground">
        You're on <strong className="font-semibold">{subscription.plan_name ?? "your current plan"}</strong>
      </span>
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] uppercase ${
          isTrial ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
        }`}
      >
        {planStatusLabel(subscription.status)}
      </span>
      {detail && <span className="text-muted-foreground text-xs">{detail}</span>}
      <Link to="/billing" className="text-accent hover:underline text-xs font-medium">
        Manage billing
      </Link>
    </div>
  );
}

/** True when a catalog plan is the visitor's active plan. */
export function isCurrentPlan(planCode: string, subscription: MyPlanSummary | null): boolean {
  return Boolean(subscription?.plan_code && subscription.plan_code === planCode);
}

/** Small pill rendered inside the matching plan card. */
export function CurrentPlanPill({ subscription }: { subscription: MyPlanSummary | null }) {
  if (!subscription) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium uppercase text-accent">
      <BadgeCheck className="w-3 h-3" aria-hidden /> Current plan
    </span>
  );
}
