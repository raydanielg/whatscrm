/**
 * Aggregates local test artifacts (vitest + playwright + coverage) into a
 * single JSON snapshot for the Testing Dashboard. Reads only files that exist;
 * missing files degrade gracefully.
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

export type TestSuiteSummary = {
  name: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration_ms: number;
  updated_at: string | null;
};

export type CoverageSummary = {
  lines: number;
  statements: number;
  functions: number;
  branches: number;
};

export type TestingDashboardData = {
  overall: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    pass_rate: number;
    updated_at: string;
  };
  suites: TestSuiteSummary[];
  coverage: CoverageSummary | null;
  categories: { key: string; label: string; enabled: boolean; hint: string }[];
};

async function readJson<T>(p: string): Promise<T | null> {
  const full = path.resolve(ROOT, p);
  if (!existsSync(full)) return null;
  try {
    return JSON.parse(await readFile(full, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function collectTestingSnapshot(): Promise<TestingDashboardData> {
  type VitestJson = {
    numTotalTests?: number;
    numPassedTests?: number;
    numFailedTests?: number;
    numPendingTests?: number;
    startTime?: number;
    testResults?: Array<{ perfStats?: { runtime?: number } }>;
  };
  type PlaywrightJson = {
    stats?: { expected?: number; unexpected?: number; skipped?: number; duration?: number };
    startTime?: string;
  };
  type CoverageJson = {
    total?: {
      lines?: { pct?: number };
      statements?: { pct?: number };
      functions?: { pct?: number };
      branches?: { pct?: number };
    };
  };

  const vitest = await readJson<VitestJson>("coverage/vitest-results.json");
  const pw = await readJson<PlaywrightJson>("test-results/results.json");
  const cov = await readJson<CoverageJson>("coverage/coverage-summary.json");

  const suites: TestSuiteSummary[] = [];

  if (vitest) {
    suites.push({
      name: "Vitest (unit + integration + API)",
      total: vitest.numTotalTests ?? 0,
      passed: vitest.numPassedTests ?? 0,
      failed: vitest.numFailedTests ?? 0,
      skipped: vitest.numPendingTests ?? 0,
      duration_ms:
        vitest.testResults?.reduce((s, r) => s + (r.perfStats?.runtime ?? 0), 0) ?? 0,
      updated_at: vitest.startTime ? new Date(vitest.startTime).toISOString() : null,
    });
  }
  if (pw) {
    const s = pw.stats ?? {};
    suites.push({
      name: "Playwright (E2E + UI + a11y + perf + security)",
      total: (s.expected ?? 0) + (s.unexpected ?? 0) + (s.skipped ?? 0),
      passed: s.expected ?? 0,
      failed: s.unexpected ?? 0,
      skipped: s.skipped ?? 0,
      duration_ms: s.duration ?? 0,
      updated_at: pw.startTime ?? null,
    });
  }

  const overall = suites.reduce(
    (acc, s) => {
      acc.total += s.total;
      acc.passed += s.passed;
      acc.failed += s.failed;
      acc.skipped += s.skipped;
      return acc;
    },
    { total: 0, passed: 0, failed: 0, skipped: 0 },
  );

  const coverage: CoverageSummary | null = cov?.total
    ? {
        lines: cov.total.lines?.pct ?? 0,
        statements: cov.total.statements?.pct ?? 0,
        functions: cov.total.functions?.pct ?? 0,
        branches: cov.total.branches?.pct ?? 0,
      }
    : null;

  return {
    overall: {
      ...overall,
      pass_rate: overall.total ? Math.round((overall.passed / overall.total) * 1000) / 10 : 0,
      updated_at: new Date().toISOString(),
    },
    suites,
    coverage,
    categories: [
      { key: "unit", label: "Unit Tests", enabled: true, hint: "npm run test:unit" },
      { key: "integration", label: "Integration Tests", enabled: true, hint: "npm run test:integration" },
      { key: "api", label: "API Tests", enabled: true, hint: "npm run test:api" },
      { key: "e2e", label: "End-to-End Tests", enabled: true, hint: "npm run test:e2e" },
      { key: "ui", label: "UI Tests", enabled: true, hint: "Playwright chromium project" },
      { key: "a11y", label: "Accessibility Tests", enabled: true, hint: "npm run test:a11y (axe-core)" },
      { key: "perf", label: "Performance Tests", enabled: true, hint: "npm run test:perf" },
      { key: "security", label: "Security Tests", enabled: true, hint: "npm run test:security" },
      { key: "regression", label: "Regression Tests", enabled: true, hint: "npm run test:regression" },
      { key: "smoke", label: "Smoke Tests", enabled: true, hint: "npm run test:smoke (post-deploy)" },
    ],
  };
}
