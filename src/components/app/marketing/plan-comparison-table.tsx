/**
 * Side-by-side plan comparison table for the public pricing page.
 *
 * Reads the same live `plans` rows as the pricing cards and renders each
 * limit/feature key as a row so tiers can be compared at a glance.
 * Desktop: one column per plan. Mobile: horizontally scrollable.
 */

import { Fragment } from "react";
import { Check, Minus } from "lucide-react";

import {
  comparisonGroups,
  formatPlanPrice,
  isContactSalesPlan,
  type PublicPlan,
} from "@/lib/billing/public-plans";

export function PlanComparisonTable({ plans }: { plans: PublicPlan[] }) {
  if (plans.length === 0) return null;
  const groups = comparisonGroups(plans);

  return (
    <div>
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="font-display text-2xl lg:text-3xl font-semibold">Compare every plan</h2>
        <p className="mt-3 text-muted-foreground text-sm">
          All the limits and capabilities of each tier, side by side.
        </p>
      </div>

      <div className="mt-8 overflow-x-auto rounded-control border border-border bg-surface">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <caption className="sr-only">Feature comparison across all subscription plans</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="text-left font-medium text-muted-foreground p-4 w-56">
                Plan
              </th>
              {plans.map((p) => (
                <th
                  key={p.id}
                  scope="col"
                  className={`p-4 text-left align-bottom ${p.highlight ? "bg-accent/5" : ""}`}
                >
                  <span className="block font-semibold text-foreground">{p.name}</span>
                  <span className="block mt-1 text-xs text-muted-foreground">
                    {isContactSalesPlan(p)
                      ? "Custom pricing"
                      : p.price_cents === 0
                        ? "Free"
                        : `${formatPlanPrice(p.price_cents, p.currency)} / ${p.interval === "year" ? "yr" : "mo"}`}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <Fragment key={group.label}>
                <tr className="bg-muted/40">
                  <th
                    scope="colgroup"
                    colSpan={plans.length + 1}
                    className="text-left p-3 px-4 text-xs uppercase   text-muted-foreground font-medium"
                  >
                    {group.label}
                  </th>
                </tr>
                {group.rows.map((row) => (
                  <tr key={`${group.label}-${row.label}`} className="border-t border-border/60">
                    <th scope="row" className="text-left font-normal text-muted-foreground p-4">
                      {row.label}
                    </th>
                    {row.values.map((value, i) => (
                      <td
                        key={plans[i]?.id ?? i}
                        className={`p-4 ${plans[i]?.highlight ? "bg-accent/5" : ""}`}
                      >
                        {value === true ? (
                          <>
                            <Check className="w-4 h-4 text-accent" aria-hidden />
                            <span className="sr-only">Included</span>
                          </>
                        ) : value === false ? (
                          <>
                            <Minus className="w-4 h-4 text-muted-foreground/60" aria-hidden />
                            <span className="sr-only">Not included</span>
                          </>
                        ) : (
                          <span className="text-foreground">{value}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
