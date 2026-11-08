import { useEffect, useState } from "react";

/**
 * Real Core Web Vitals and bundle figures for THIS browser session.
 *
 * Measured with the browser's own PerformanceObserver / Resource Timing APIs.
 * They describe the page load the viewer is looking at, not other users — this
 * app has no platform-wide real-user-monitoring pipeline, so the Performance
 * Center labels them as "your browser".
 *
 * Every field is `null` until it has genuinely been observed:
 *  - INP / FID need an interaction, so they stay null until the user clicks or types.
 *  - jsHeapMb is Chromium-only (`performance.memory`).
 */
export type BrowserVitals = {
  supported: boolean;
  lcpMs: number | null;
  cls: number | null;
  /** Worst interaction latency since load (approximates INP). */
  inpMs: number | null;
  ttfbMs: number | null;
  longTasks: number;
  jsHeapMb: number | null;
  js: { transferKb: number; files: number; largestKb: number } | null;
};

const EMPTY: BrowserVitals = {
  supported: false, lcpMs: null, cls: null, inpMs: null, ttfbMs: null,
  longTasks: 0, jsHeapMb: null, js: null,
};

type LayoutShiftEntry = PerformanceEntry & { value: number; hadRecentInput: boolean };
type EventTimingEntry = PerformanceEntry & { interactionId?: number };

function readBundle(): BrowserVitals["js"] {
  const scripts = (performance.getEntriesByType("resource") as PerformanceResourceTiming[]).filter(
    (r) => r.initiatorType === "script" || /\.m?js(\?|$)/.test(r.name),
  );
  if (scripts.length === 0) return null;
  // transferSize is 0 for cache hits and cross-origin without Timing-Allow-Origin;
  // fall back to the decoded body so a cached load does not read as "0 KB".
  const sizes = scripts.map((r) => (r.transferSize > 0 ? r.transferSize : r.decodedBodySize) / 1024);
  return {
    transferKb: Math.round(sizes.reduce((s, n) => s + n, 0)),
    files: scripts.length,
    largestKb: Math.round(Math.max(...sizes)),
  };
}

export function useBrowserVitals(): BrowserVitals {
  const [vitals, setVitals] = useState<BrowserVitals>(EMPTY);

  useEffect(() => {
    if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") return;

    let lcp: number | null = null;
    let cls = 0;
    let clsSeen = false;
    let inp: number | null = null;
    let longTasks = 0;
    const observers: PerformanceObserver[] = [];

    const observe = (type: string, cb: (entries: PerformanceEntry[]) => void, extra: PerformanceObserverInit = {}) => {
      try {
        const po = new PerformanceObserver((list) => cb(list.getEntries()));
        po.observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
        observers.push(po);
      } catch {
        /* entry type not supported by this browser — that metric stays null */
      }
    };

    observe("largest-contentful-paint", (es) => {
      const last = es[es.length - 1];
      if (last) lcp = last.startTime;
    });
    observe("layout-shift", (es) => {
      for (const e of es as LayoutShiftEntry[]) {
        clsSeen = true;
        if (!e.hadRecentInput) cls += e.value;
      }
    });
    observe("event", (es) => {
      for (const e of es as EventTimingEntry[]) {
        if (e.interactionId && e.interactionId > 0) inp = Math.max(inp ?? 0, e.duration);
      }
    }, { durationThreshold: 40 } as PerformanceObserverInit);
    observe("longtask", (es) => { longTasks += es.length; });

    const snapshot = () => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      setVitals({
        supported: true,
        lcpMs: lcp,
        cls: clsSeen ? Math.round(cls * 1000) / 1000 : null,
        inpMs: inp,
        ttfbMs: nav && nav.responseStart > 0 ? Math.round(nav.responseStart - nav.startTime) : null,
        longTasks,
        jsHeapMb: mem ? Math.round(mem.usedJSHeapSize / 1024 / 1024) : null,
        js: readBundle(),
      });
    };

    snapshot();
    // Observers deliver asynchronously and INP only exists after interaction,
    // so re-read periodically instead of once.
    const timer = window.setInterval(snapshot, 3000);
    return () => {
      window.clearInterval(timer);
      observers.forEach((o) => o.disconnect());
    };
  }, []);

  return vitals;
}
