/**
 * AnalyticsProvider — boots the configured analytics vendor, reports client
 * side page views, and captures clicks on any element tagged with
 * `data-analytics-id` (see `ctaAttrs`). Rendered once from the root layout.
 */
import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { usePlatformRuntime } from "@/hooks/use-platform-runtime";
import { configureAnalytics, trackEvent, trackPageView } from "@/lib/analytics/client";
import type { MarketingEvent } from "@/lib/analytics/events";
import {
  COOKIE_CONSENT_CHANGED_EVENT,
  hasCookieConsentFor,
} from "@/lib/compliance/cookie-consent";
import { useState } from "react";

function useAnalyticsConsent(): boolean {
  const [consented, setConsented] = useState(false);
  useEffect(() => {
    const read = () => setConsented(hasCookieConsentFor("analytics"));
    read();
    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, read);
    return () => window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, read);
  }, []);
  return consented;
}

export function AnalyticsProvider() {
  const { config } = usePlatformRuntime();
  const analytics = config.analytics;
  const consented = useAnalyticsConsent();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    configureAnalytics(analytics, consented);
  }, [analytics, consented]);

  // Depends on the config too: the runtime config resolves asynchronously, so
  // the first page view must be (re)sent once a provider is actually active.
  const activeKey = `${analytics.provider}:${analytics.key ?? ""}:${consented}`;
  useEffect(() => {
    trackPageView(pathname, typeof document === "undefined" ? undefined : document.title);
  }, [pathname, activeKey]);

  // Delegated CTA tracking: one listener instead of dozens of onClick props.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const el = target?.closest<HTMLElement>("[data-analytics-id]");
      if (!el) return;
      const event = (el.dataset["analyticsEvent"] as MarketingEvent | undefined) ?? "cta_click";
      const anchor = el.closest("a");
      trackEvent(event, {
        cta_id: el.dataset["analyticsId"] ?? "",
        location: el.dataset["analyticsLocation"] ?? "",
        label: el.dataset["analyticsLabel"] ?? el.textContent?.trim().slice(0, 80) ?? "",
        href: anchor?.getAttribute("href") ?? null,
        page_path: window.location.pathname,
      });
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
