/**
 * Turns browser measurements into findings and scores a set of findings.
 * Pure and client-safe — no server imports.
 */
import type { BrowserVitals } from "@/hooks/use-browser-vitals";
import type { PerfFinding, PerfSeverity } from "./performance-center.functions";

const grade = (v: number, good: number, poor: number): PerfSeverity =>
  v <= good ? "ok" : v <= poor ? "warning" : "critical";

/** Google's published "good" / "poor" boundaries for the vitals. */
export function browserFindings(v: BrowserVitals, isDevBuild: boolean): PerfFinding[] {
  const out: PerfFinding[] = [];
  const add = (f: Omit<PerfFinding, "source">) => out.push({ ...f, source: "browser" });
  const pending = (id: string, category: PerfFinding["category"], title: string, detail: string) =>
    add({ id, category, title, detail, severity: "info", impact: "high" });

  if (!v.supported) {
    pending("cwv-unsupported", "cwv", "Browser performance APIs unavailable",
      "This browser does not expose PerformanceObserver, so Core Web Vitals cannot be measured here.");
    return out;
  }

  if (v.lcpMs != null) {
    add({
      id: "cwv-lcp", category: "cwv", impact: "high",
      title: `LCP ${(v.lcpMs / 1000).toFixed(2)}s`,
      detail: "Largest Contentful Paint of this page load. Target ≤ 2.5s. Preload the LCP image, ship AVIF/WebP, and keep critical CSS inlined.",
      severity: grade(v.lcpMs, 2500, 4000),
    });
  } else pending("cwv-lcp", "cwv", "LCP — not observed yet", "The browser has not reported a Largest Contentful Paint for this page load.");

  if (v.inpMs != null) {
    add({
      id: "cwv-inp", category: "cwv", impact: "high",
      title: `INP ${Math.round(v.inpMs)}ms`,
      detail: "Worst interaction latency since load. Target ≤ 200ms. Break up long tasks with startTransition and move heavy work to workers or server functions.",
      severity: grade(v.inpMs, 200, 500),
    });
  } else pending("cwv-inp", "cwv", "INP — interact with the page to measure",
    "Interaction to Next Paint needs at least one click or keypress. Use the page, then refresh this tab.");

  if (v.cls != null) {
    add({
      id: "cwv-cls", category: "cwv", impact: "medium",
      title: `CLS ${v.cls.toFixed(3)}`,
      detail: "Cumulative Layout Shift since load. Target ≤ 0.1. Reserve dimensions for media and avoid injecting banners above the fold.",
      severity: grade(v.cls, 0.1, 0.25),
    });
  }

  if (v.ttfbMs != null) {
    add({
      id: "cwv-ttfb", category: "cwv", impact: "medium",
      title: `TTFB ${v.ttfbMs}ms`,
      detail: "Time to first byte of the document. Target ≤ 800ms. Cache SSR output at the edge and keep the app close to its database.",
      severity: grade(v.ttfbMs, 800, 1800),
    });
  }

  if (v.js) {
    add({
      id: "bundle-size", category: "bundle", impact: "high",
      title: `JavaScript loaded ${v.js.transferKb}KB in ${v.js.files} files`,
      detail: `Largest file ${v.js.largestKb}KB. Target under ~250KB for the initial route. ${
        isDevBuild
          ? "This is a DEVELOPMENT build (unbundled modules), so the figure is not representative — measure a production build."
          : "Audit with a bundle analyzer, code-split heavy panels behind dynamic imports, and drop unused libraries."}`,
      // A dev server serves thousands of unbundled modules; grading that would be noise.
      severity: isDevBuild ? "info" : grade(v.js.transferKb, 250, 600),
    });
  }

  if (v.jsHeapMb != null) {
    add({
      id: "browser-memory", category: "memory", impact: "medium",
      title: `JS heap ${v.jsHeapMb}MB`,
      detail: "Used JavaScript heap in this tab (Chromium only). Above ~512MB look for leaked listeners and unbounded in-memory caches.",
      severity: grade(v.jsHeapMb, 512, 1024),
    });
  }

  add({
    id: "long-tasks", category: "cwv", impact: "medium",
    title: `${v.longTasks} long task${v.longTasks === 1 ? "" : "s"} since load`,
    detail: "Main-thread tasks over 50ms since this page loaded. Fewer is better; each one delays input handling.",
    severity: v.longTasks <= 5 ? "ok" : v.longTasks <= 20 ? "warning" : "critical",
  });

  return out;
}

const POINTS: Record<PerfSeverity, number | null> = { ok: 100, warning: 60, critical: 20, info: null };

/**
 * Mean of the findings that were actually measured. `info` (no measurement) is
 * excluded rather than counted as good or bad; with nothing measured there is no
 * score at all.
 */
export function performanceScore(findings: PerfFinding[]): { score: number | null; measured: number; total: number } {
  const pts = findings.map((f) => POINTS[f.severity]).filter((p): p is number => p != null);
  return {
    score: pts.length ? Math.round(pts.reduce((s, n) => s + n, 0) / pts.length) : null,
    measured: pts.length,
    total: findings.length,
  };
}
