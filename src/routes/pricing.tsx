import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarClock,
  Check,
  CircleHelp,
  Clock,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { MarketingShell } from "@/components/app/marketing-shell";
import { PlanComparisonTable } from "@/components/app/marketing/plan-comparison-table";
import {
  CurrentPlanBanner,
  CurrentPlanPill,
  isCurrentPlan,
} from "@/components/app/marketing/current-plan-badge";
import {
  formatPlanPrice,
  isContactSalesPlan,
  monthlyEquivalent,
  planBullets,
  useMyPlanSummary,
  usePublicPlans,
} from "@/lib/billing/public-plans";
import { ctaAttrs, trackMarketing } from "@/lib/analytics/events";
import { useTenantCurrency } from "@/hooks/use-currency";
import { redirectSignedInFromMarketing } from "@/lib/auth/marketing-redirect";
import { usePlatformBranding } from "@/hooks/use-platform-branding";

export const Route = createFileRoute("/pricing")({
  ssr: false,
  beforeLoad: redirectSignedInFromMarketing,
  head: () => ({
    meta: [
      { title: "Pricing" },
      {
        name: "description",
        content:
          "Simple, transparent pricing for teams of every size. Monthly and yearly plans, plus lifetime Enterprise.",
      },
      { property: "og:title", content: "Pricing" },
      {
        property: "og:description",
        content: "Simple, transparent pricing. Monthly or yearly. Cancel anytime.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PricingPage,
});

function CornerPlus({ corner }: { corner: "bl" | "br" }) {
  const sideClasses = corner === "bl" ? "left-4 bottom-4" : "right-4 bottom-4";

  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute ${sideClasses} flex items-center justify-center`}
    >
      <div className="relative size-5">
        <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-border" />
        <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-border" />
      </div>
    </div>
  );
}

function PricingPage() {
  const { supportEmail } = usePlatformBranding();
  const {
    plans: visible,
    interval,
    setInterval,
    savingsPct,
    hasYearly,
    maxTrialDays,
    isLoading,
  } = usePublicPlans("month");
  const { subscription } = useMyPlanSummary();

  // The footer used to assert "All prices in USD" as a literal, which
  // contradicted the prices right above it once the platform currency was
  // changed in Super Admin. Read it from the plans actually on display, and
  // fall back to the platform default when none carries one.
  const platformCurrency = useTenantCurrency();
  const displayCurrency =
    visible.find((p) => p.currency)?.currency?.toUpperCase() ?? platformCurrency;

  return (
    <MarketingShell>
      <div className="landing-shadows min-h-dvh bg-background">
        {/* Pricing Tables */}
        <Pricing />

        {/* Compare Every Plans */}
        <section className="relative overflow-hidden bg-background border-b border-border">
          <div className="container-marketing relative">
            {!isLoading && <PlanComparisonTable plans={visible} />}

            <p className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-xs text-muted-foreground">
              <span>All prices in {displayCurrency}.</span>
              <span aria-hidden className="hidden size-1 rounded-full bg-border sm:inline-block" />
              <span>Yearly plans billed annually.</span>
              <span aria-hidden className="hidden size-1 rounded-full bg-border sm:inline-block" />
              <span>Need something bigger?</span>
              <a
                href={`mailto:${supportEmail ?? "sales@wacrm.com"}`}
                className="font-medium text-primary hover:underline"
                {...ctaAttrs("talk-to-sales", "pricing-footer")}
              >
                Talk to sales
              </a>
            </p>
          </div>
        </section>

        <section aria-labelledby="pricing-details-heading" className="container-marketing">
          <div className="max-w-2xl">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary">
              Good to know
            </span>
            <h2 id="pricing-details-heading" className="text-marketing-title mt-2">
              A little more about pricing.
            </h2>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <article className="surface-marketing-card p-6">
              <div className="chip-marketing-icon">
                <CircleHelp className="size-4" aria-hidden />
              </div>
              <h3 className="text-marketing-card-title mt-5">Compare what matters</h3>
              <p className="text-marketing-card-body mt-2">
                Plan cards highlight the essentials. Use the comparison table above to check
                included features and limits side by side.
              </p>
            </article>

            <article className="surface-marketing-card p-6">
              <div className="chip-marketing-icon">
                <CalendarClock className="size-4" aria-hidden />
              </div>
              <h3 className="text-marketing-card-title mt-5">Choose your billing cadence</h3>
              <p className="text-marketing-card-body mt-2">
                Switch between monthly and yearly billing above. Yearly plans are billed annually;
                any monthly equivalent is shown for comparison.
              </p>
            </article>

            <article className="surface-marketing-card p-6">
              <div className="chip-marketing-icon">
                <Clock className="size-4" aria-hidden />
              </div>
              <h3 className="text-marketing-card-title mt-5">Check trial details</h3>
              <p className="text-marketing-card-body mt-2">
                If a plan offers a free trial, you&apos;ll see the trial length on its card before
                choosing that plan.
              </p>
            </article>
          </div>
          <div
            aria-labelledby="pricing-support-heading"
            className="mt-8 flex flex-col items-start justify-between gap-4 rounded-control border border-border bg-muted/50 p-5 sm:flex-row sm:items-center sm:p-6"
          >
            <div>
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary">
                Here to help
              </span>
              <h2 id="pricing-support-heading" className="text-marketing-card-title mt-2">
                Need help choosing a plan?
              </h2>
              <p className="text-marketing-card-body mt-1 max-w-2xl">
                Ask our helpdesk about plans, features, or billing. We reply within one business
                day.
              </p>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-3 sm:w-auto sm:flex-row">
              <a
                href={`mailto:${supportEmail ?? "support@wacrm.app"}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Contact helpdesk <ArrowRight className="size-4" aria-hidden />
              </a>
              <Link
                to="/contact"
                className="inline-flex min-h-11 items-center justify-center rounded-control border border-border bg-background px-5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                All contact options
              </Link>
            </div>
          </div>
        </section>
      </div>
    </MarketingShell>
  );
}

/* ============================================================ */
/* Pricing                                                      */
/* ============================================================ */
function Pricing() {
  const {
    plans,
    interval,
    setInterval: setBillingInterval,
    savingsPct,
    hasYearly,
    maxTrialDays,
  } = usePublicPlans("month");
  const { subscription } = useMyPlanSummary();

  // Was a literal "All prices in USD", which contradicted the prices above it
  // once the platform currency changed. Taken from the plans on display.
  const platformCurrency = useTenantCurrency();
  const displayCurrency =
    plans.find((p) => p.currency)?.currency?.toUpperCase() ?? platformCurrency;

  return (
    <section
      id="pricing"
      className="section-marketing relative scroll-mt-24 border-b border-border bg-background"
    >
      {/* <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-48 bottom-0 size-[34rem] rounded-full bg-primary/7 blur-3xl" />
        <div
          className="absolute inset-x-0 top-0 h-96 opacity-50"
          style={{
            backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
            maskImage: "radial-gradient(ellipse 55% 70% at 50% 0%, black 0%, transparent 78%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 55% 70% at 50% 0%, black 0%, transparent 78%)",
          }}
        />
      </div> */}

      <div className="relative container-marketing">
        <CornerPlus corner="bl" />
        <CornerPlus corner="br" />

        <div className="grid items-end gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
          <div className="max-w-xl">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary">
              Fair, flexible pricing
            </span>
            <h2 className="text-marketing-title mt-4">Simple pricing. No per-agent tax.</h2>
          </div>
          <div className="max-w-2xl lg:justify-self-end">
            <p className="text-marketing-lede">
              Every plan includes the full platform — inbox, automations, templates and CRM. You
              only choose how much volume and how many seats you need.
            </p>
          </div>
        </div>

        <div className="row-bleed-marketing mt-12 grid border-y border-border bg-background p-0">
          <div className="grid items-stretch lg:grid-cols-[1fr_auto_1fr]">
            <div className="hidden items-center gap-3 border-r border-border px-8 py-5 lg:flex">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-emerald-400/10 dark:text-emerald-400">
                <Clock className="size-4.5" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-foreground">
                  {maxTrialDays > 0 ? `${maxTrialDays}-day free trial` : "Start without friction"}
                </span>
                <span className="mt-0.5 block text-[12px] text-muted-foreground">
                  Test the complete platform before committing.
                </span>
              </span>
            </div>

            <div className="flex flex-col items-center justify-center px-6 py-4 lg:min-w-[22rem] bg-muted/50">
              <span className="mb-2 text-[10px] font-semibold uppercase text-muted-foreground">
                Choose billing frequency
              </span>
              {hasYearly && (
                <div
                  role="group"
                  aria-label="Billing interval"
                  className="inline-grid max-w-full grid-cols-2 overflow-hidden rounded-full border border-border bg-background p-1 text-xs sm:text-sm"
                >
                  {(["month", "year"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={interval === value}
                      onClick={() => {
                        setBillingInterval(value);
                        trackMarketing("cta_click", {
                          cta_id: "billing-interval",
                          location: "home-pricing",
                          label: value,
                        });
                      }}
                      className={`rounded-full px-3 py-2 font-medium transition-all duration-200 sm:px-4 ${
                        interval === value
                          ? "bg-primary text-white shadow-sm"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      }`}
                    >
                      {value === "month" ? "Monthly" : "Yearly"}
                      <span className="hidden sm:inline"> Billing</span>
                      {value === "year" && savingsPct > 0 && (
                        <span
                          className={`ml-1.5 hidden text-[11px] font-semibold uppercase sm:inline ${
                            interval === value
                              ? "text-emerald-200"
                              : "text-primary dark:text-emerald-400"
                          }`}
                        >
                          −{savingsPct}%
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="hidden items-center justify-end gap-3 border-l border-border px-8 py-5 lg:flex">
              <span>
                <span className="block text-right text-sm font-semibold text-foreground">
                  Flexible billing
                </span>
                <span className="mt-0.5 block text-right text-[11px] text-muted-foreground">
                  Upgrade, downgrade, or cancel anytime.
                </span>
              </span>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-emerald-400/10 dark:text-emerald-400">
                <ShieldCheck className="size-4.5" />
              </span>
            </div>
          </div>

          <CurrentPlanBanner subscription={subscription} />
        </div>

        {plans.length === 0 ? (
          <p className="text-marketing-meta mt-14 text-center">
            Plans are being updated —{" "}
            <Link to="/pricing" className="text-accent hover:underline">
              see full pricing
            </Link>
            .
          </p>
        ) : (
          <div className="row-bleed-marketing grid grid-cols-1 border-b border-border bg-background p-0 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((p, planIndex) => {
              const contactSales = isContactSalesPlan(p);
              const perMonth = monthlyEquivalent(p);
              const currentPlan = isCurrentPlan(p.code, subscription);
              const isLastMobileRow = planIndex === plans.length - 1;
              const isLastTabletRow = planIndex >= plans.length - (plans.length % 2 || 2);
              const isLastDesktopRow = planIndex >= plans.length - (plans.length % 4 || 4);
              const cta =
                p.cta_label ??
                (contactSales
                  ? "Contact sales"
                  : p.price_cents === 0
                    ? "Start free"
                    : "Start free trial");
              return (
                <div
                  key={p.id}
                  className={`group relative flex min-w-0 flex-col overflow-hidden rounded-0 border-r border-b border-border p-6 transition-all duration-300 ${isLastMobileRow ? "border-b-0" : ""} sm:border-b sm:[&:nth-child(2n)]:border-r-0 sm:p-4 ${isLastTabletRow ? "sm:border-b-0" : ""} lg:border-b lg:[&:nth-child(2n)]:border-r lg:[&:nth-child(4n)]:border-r-0 ${isLastDesktopRow ? "lg:border-b-0" : ""} ${
                    p.highlight
                    // ? "border-[#015941]/45 bg-[#eff9f2] dark:border-emerald-400/35 dark:bg-emerald-950/30"
                    // : "border-border bg-background hover:shadow-xl"
                  } ${currentPlan ? "ring-2 ring-inset ring-[#25D366]/60" : ""}`}
                >
                  {/* {p.highlight && (
                    <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-primary" />
                  )} */}
                  <div className="mb-8 rounded-control border border-border bg-muted/50 p-6 sm:min-h-[18.25rem]">
                    <div className="flex min-h-7 items-start justify-between gap-3">
                      <span className="font-mono text-[11px] font-semibold text-muted-foreground">
                        PLAN {String(planIndex + 1).padStart(2, "0")}
                      </span>
                      {p.badge && (
                        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-primary px-2.5 py-1 text-[9px] font-semibold uppercase text-white shadow-sm">
                          <Sparkles className="size-2.5" />
                          {p.badge}
                        </span>
                      )}
                    </div>

                    {currentPlan && (
                      <div className="mt-3 w-fit">
                        <CurrentPlanPill subscription={subscription} />
                      </div>
                    )}

                    <h3 className="mt-5 font-display text-lg font-semibold text-foreground">
                      {p.name}
                    </h3>
                    <div className="mt-4 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                      <span className="font-display text-[2.35rem] font-semibold leading-none text-foreground">
                        {p.price_cents === 0 ? "Free" : formatPlanPrice(p.price_cents, p.currency)}
                      </span>
                      {p.price_cents > 0 && (
                        <span className="text-[11px] text-muted-foreground">
                          {p.interval === "lifetime"
                            ? "one-time"
                            : `/ ${p.interval === "year" ? "year" : "month"}`}
                        </span>
                      )}
                    </div>
                    {perMonth && (
                      <p className="mt-1.5 text-[11px] font-medium text-primary dark:text-emerald-400">
                        {perMonth} / month, billed yearly
                      </p>
                    )}
                    {(p.tagline || p.description) && (
                      <p className="mt-3 min-h-10 text-[12px] leading-relaxed text-muted-foreground">
                        {p.tagline ?? p.description}
                      </p>
                    )}
                    {p.trial_days > 0 && !contactSales && (
                      <p className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-full border border-[#015941]/10 bg-background/80 px-2.5 py-1 text-[11px] font-semibold text-primary dark:bg-emerald-950/50 dark:text-emerald-300">
                        <Clock className="size-3" />
                        {p.trial_days}-day free trial
                      </p>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col p-4">
                    <p className="mb-3 text-[11px] font-semibold uppercase text-muted-foreground">
                      Included in this plan
                    </p>
                    <ul className="flex-1 space-y-2.5 text-sm">
                      {planBullets(p).map((f) => (
                        <li
                          key={f}
                          className="flex items-start gap-2.5 text-[12px] leading-relaxed text-foreground/75"
                        >
                          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/8 dark:bg-emerald-500/15">
                            <Check
                              className="size-2.5 text-primary dark:text-emerald-400"
                              strokeWidth={2.4}
                            />
                          </span>
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-auto border-t border-border row-bleed-marketing">
                    {contactSales ? (
                      <a
                        href={`mailto:${supportEmail ?? "sales@wacrm.com"}?subject=Enterprise%20inquiry`}
                        {...ctaAttrs(`plan-${p.code}`, "home-pricing", "pricing_click", cta)}
                        data-analytics-plan={p.code}
                        className="px-6 py-6 sm:-mx-4 sm:-mb-4 sm:px-8 flex items-center justify-between gap-2 text-base font-semibold  transition-colors hover:bg-muted"
                      >
                        {cta} <ArrowRight className="size-3.5" />
                      </a>
                    ) : currentPlan ? (
                      <Link
                        to="/billing"
                        data-analytics-plan={p.code}
                        className="px-6 py-6 sm:-mx-4 sm:-mb-4 sm:px-8 flex items-center justify-between gap-2 text-base font-semibold  transition-colors hover:bg-muted"
                      >
                        Manage your plan <ArrowRight className="size-3.5" />
                      </Link>
                    ) : (
                      <Link
                        to="/auth"
                        search={{ plan: p.code, mode: "sign-up" } as never}
                        {...ctaAttrs(`plan-${p.code}`, "home-pricing", "pricing_click", cta)}
                        data-analytics-plan={p.code}
                        className="px-6 py-6 sm:-mx-4 sm:-mb-4 sm:px-8 flex items-center justify-between gap-2 text-base font-semibold  transition-colors hover:bg-muted"
                      >
                        {cta} <ArrowRight className="size-3.5" />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8 flex flex-col gap-4 text-base text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
            <span>All prices in {displayCurrency}.</span>
            <span aria-hidden className="hidden size-1 rounded-full bg-border sm:inline-block" />
            <span>No hidden per-agent fees.</span>
            <span aria-hidden className="hidden size-1 rounded-full bg-border sm:inline-block" />
            <span>Cancel anytime.</span>
          </p>
          <Link
            to="/pricing"
            className="inline-flex items-center gap-2 font-semibold text-[13px] text-primary transition-colors hover:text-[#087F47] dark:text-emerald-400"
          >
            Compare every plan <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
