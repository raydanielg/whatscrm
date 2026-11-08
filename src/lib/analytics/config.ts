/**
 * Analytics provider configuration (shared client + server).
 *
 * The provider is configurable in Super Admin → Platform Settings → Analytics,
 * so the app is never hard-coupled to a single vendor. Nothing here is secret:
 * every field is a public, browser-visible identifier (GA4 measurement ID,
 * GTM container, PostHog project token, Plausible domain).
 */

export const ANALYTICS_PROVIDERS = ["none", "ga4", "gtm", "posthog", "plausible", "custom"] as const;

export type AnalyticsProvider = (typeof ANALYTICS_PROVIDERS)[number];

export type AnalyticsConfig = {
  provider: AnalyticsProvider;
  /** GA4 measurement ID, GTM container ID, PostHog project token, or Plausible domain. */
  key: string | null;
  /** Self-hosted ingest host (PostHog / Plausible). Empty = vendor default. */
  host: string | null;
  /** Send a page_view on every client-side route change. */
  trackPageViews: boolean;
  /** Only load the vendor script after the visitor accepts analytics cookies. */
  requireConsent: boolean;
  /** Mirror every event to the browser console (staging aid). */
  debug: boolean;
};

export const ANALYTICS_FALLBACK: AnalyticsConfig = {
  provider: "none",
  key: null,
  host: null,
  trackPageViews: true,
  requireConsent: true,
  debug: false,
};

export const ANALYTICS_PROVIDER_LABELS: Record<AnalyticsProvider, string> = {
  none: "Disabled",
  ga4: "Google Analytics 4",
  gtm: "Google Tag Manager",
  posthog: "PostHog",
  plausible: "Plausible",
  custom: "Custom (window.dataLayer)",
};

/** What the "key" field means for each provider, for admin hints + validation. */
export const ANALYTICS_KEY_HINTS: Record<AnalyticsProvider, string> = {
  none: "Not required.",
  ga4: "Measurement ID, e.g. G-XXXXXXXXXX.",
  gtm: "Container ID, e.g. GTM-XXXXXXX.",
  posthog: "Project token, e.g. phc_xxxxxxxx.",
  plausible: "Site domain, e.g. wacrm.app.",
  custom: "Optional label pushed with each event.",
};

export function isAnalyticsProvider(v: unknown): v is AnalyticsProvider {
  return typeof v === "string" && (ANALYTICS_PROVIDERS as readonly string[]).includes(v);
}

/** A provider only counts as active when it has the identifier it needs. */
export function analyticsIsConfigured(config: AnalyticsConfig): boolean {
  if (config.provider === "none") return false;
  if (config.provider === "custom") return true;
  return Boolean(config.key && config.key.trim());
}

/** Default ingest host per provider when none is configured. */
export function analyticsHost(config: AnalyticsConfig): string {
  const custom = config.host?.trim().replace(/\/+$/, "");
  if (custom) return /^https?:\/\//i.test(custom) ? custom : `https://${custom}`;
  if (config.provider === "posthog") return "https://eu.i.posthog.com";
  if (config.provider === "plausible") return "https://plausible.io";
  return "";
}
