/**
 * Vendor-agnostic browser analytics runtime.
 *
 * `configureAnalytics()` is called once by <AnalyticsProvider /> with the
 * platform's configured provider; everything else in the app just calls
 * `trackEvent()` and never learns which vendor is in use. Events fired before
 * the provider script finishes loading are buffered and flushed afterwards,
 * so instrumentation on the landing page never races the script tag.
 */
import { logger } from "@/shared/lib/logger";
import {
  ANALYTICS_FALLBACK,
  analyticsHost,
  analyticsIsConfigured,
  type AnalyticsConfig,
} from "./config";

export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

type AnalyticsWindow = Window & {
  gtag?: (...args: unknown[]) => void;
  dataLayer?: unknown[];
  posthog?: { capture: (name: string, props?: AnalyticsProps) => void; init?: unknown };
  plausible?: ((name: string, opts?: { props?: AnalyticsProps }) => void) & { q?: unknown[] };
};

let current: AnalyticsConfig = ANALYTICS_FALLBACK;
let loadedFor: string | null = null;
let ready = false;
const queue: { name: string; props: AnalyticsProps }[] = [];
const MAX_QUEUE = 50;

function w(): AnalyticsWindow | null {
  return typeof window === "undefined" ? null : (window as AnalyticsWindow);
}

function signature(config: AnalyticsConfig): string {
  return `${config.provider}:${config.key ?? ""}:${config.host ?? ""}`;
}

function injectScript(src: string, attrs: Record<string, string> = {}): void {
  if (typeof document === "undefined") return;
  if (document.querySelector(`script[src="${src}"]`)) return;
  const el = document.createElement("script");
  el.async = true;
  el.src = src;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.head.appendChild(el);
}

function loadProvider(config: AnalyticsConfig): void {
  const win = w();
  if (!win) return;
  const key = (config.key ?? "").trim();
  const host = analyticsHost(config);

  switch (config.provider) {
    case "ga4": {
      win.dataLayer = win.dataLayer || [];
      const gtag = (...args: unknown[]) => {
        win.dataLayer!.push(args);
      };
      win.gtag = win.gtag ?? gtag;
      injectScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(key)}`);
      win.gtag("js", new Date());
      // Route changes are reported explicitly by <AnalyticsProvider />.
      win.gtag("config", key, { send_page_view: false });
      break;
    }
    case "gtm": {
      win.dataLayer = win.dataLayer || [];
      win.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
      injectScript(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(key)}`);
      break;
    }
    case "posthog": {
      // Minimal stub-free load: the snippet-less bundle exposes window.posthog.
      injectScript(`${host}/static/array.js`, { "data-ph-token": key });
      const started = Date.now();
      const boot = window.setInterval(() => {
        const ph = w()?.posthog as { init?: (t: string, o: Record<string, unknown>) => void } | undefined;
        if (ph?.init) {
          ph.init(key, { api_host: host, capture_pageview: false });
          window.clearInterval(boot);
          flush();
        } else if (Date.now() - started > 10_000) {
          window.clearInterval(boot);
        }
      }, 100);
      break;
    }
    case "plausible": {
      injectScript(`${host}/js/script.js`, { "data-domain": key, defer: "true" });
      win.plausible =
        win.plausible ??
        (((name: string, opts?: { props?: AnalyticsProps }) => {
          (win.plausible!.q = win.plausible!.q || []).push([name, opts]);
        }) as AnalyticsWindow["plausible"]);
      break;
    }
    case "custom": {
      win.dataLayer = win.dataLayer || [];
      break;
    }
    default:
      break;
  }
}

function dispatch(name: string, props: AnalyticsProps): void {
  const win = w();
  if (!win) return;
  switch (current.provider) {
    case "ga4":
      win.gtag?.("event", name, props);
      break;
    case "gtm":
    case "custom":
      win.dataLayer?.push({ event: name, ...props });
      break;
    case "posthog":
      win.posthog?.capture(name, props);
      break;
    case "plausible":
      win.plausible?.(name, { props });
      break;
    default:
      break;
  }
}

function flush(): void {
  ready = true;
  while (queue.length) {
    const item = queue.shift()!;
    dispatch(item.name, item.props);
  }
}

/**
 * Apply the platform's analytics configuration. Safe to call repeatedly —
 * the vendor script is only injected when the provider or key actually
 * changes. `consented` gates loading when the config requires cookie consent.
 */
export function configureAnalytics(config: AnalyticsConfig, consented: boolean): void {
  current = config;
  if (!analyticsIsConfigured(config)) {
    ready = false;
    queue.length = 0;
    return;
  }
  if (config.requireConsent && !consented) {
    ready = false;
    return;
  }
  const sig = signature(config);
  if (loadedFor !== sig) {
    loadedFor = sig;
    loadProvider(config);
  }
  // PostHog flushes itself once init() resolves.
  if (config.provider !== "posthog") flush();
}

/** Emit a product event to the configured provider. */
export function trackEvent(name: string, props: AnalyticsProps = {}): void {
  if (typeof window === "undefined") return;
  const payload: AnalyticsProps = { ...props };
  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined) delete payload[k];
  }
  try {
    if (current.debug || import.meta.env.DEV) logger.debug(`analytics:${name}`, payload);
    if (!analyticsIsConfigured(current)) return;
    if (!ready) {
      if (queue.length < MAX_QUEUE) queue.push({ name, props: payload });
      return;
    }
    dispatch(name, payload);
  } catch {
    // Analytics must never break the UI.
  }
}

/** Report a client-side navigation. */
export function trackPageView(path: string, title?: string): void {
  if (!current.trackPageViews) return;
  trackEvent("page_view", { page_path: path, page_title: title ?? null });
}

/** Exposed for tests and debug surfaces. */
export function analyticsState() {
  return { provider: current.provider, ready, queued: queue.length };
}
