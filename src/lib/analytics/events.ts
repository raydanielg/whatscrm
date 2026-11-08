/**
 * Marketing funnel events.
 *
 * One vocabulary for every landing surface so the funnel can be read in any
 * analytics tool: cta_click → pricing_click → lead_form_* → whatsapp_click.
 */
import { trackEvent, type AnalyticsProps } from "./client";

export type MarketingEvent =
  | "cta_click"
  | "pricing_click"
  | "lead_form_start"
  | "lead_form_submit"
  | "lead_form_error"
  | "lead_form_success"
  | "whatsapp_click"
  | "nav_click"
  | "outbound_click";

/** Data attributes read by the delegated click tracker. */
export type CtaAttrs = {
  "data-analytics-event": MarketingEvent;
  "data-analytics-id": string;
  "data-analytics-location": string;
  "data-analytics-label"?: string;
};

/**
 * Tag any anchor/button so <AnalyticsProvider /> reports its click, without
 * wiring an onClick through every marketing component.
 */
export function ctaAttrs(
  id: string,
  location: string,
  event: MarketingEvent = "cta_click",
  label?: string,
): CtaAttrs {
  return {
    "data-analytics-event": event,
    "data-analytics-id": id,
    "data-analytics-location": location,
    ...(label ? { "data-analytics-label": label } : {}),
  };
}

export function trackMarketing(event: MarketingEvent, props: AnalyticsProps = {}): void {
  trackEvent(event, {
    page_path: typeof window === "undefined" ? null : window.location.pathname,
    ...props,
  });
}

export function trackCtaClick(id: string, location: string, props: AnalyticsProps = {}): void {
  trackMarketing("cta_click", { cta_id: id, location, ...props });
}

export function trackPricingClick(plan: string, location: string, props: AnalyticsProps = {}): void {
  trackMarketing("pricing_click", { plan, location, ...props });
}
