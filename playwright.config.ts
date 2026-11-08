import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 8080);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * Playwright — E2E, UI, accessibility, smoke & regression suites.
 * Runs against the local dev server unless E2E_BASE_URL is set (staging/prod smoke).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
    /**
     * Visual-regression defaults. `toHaveScreenshot` writes
     * `<name>-expected.png`, `<name>-actual.png` and `<name>-diff.png` into
     * `outputDir` on every failure, so the gradient/hero suites always leave
     * reviewable pixel evidence behind (CI uploads `test-results/`).
     */
    toHaveScreenshot: {
      // Suites that need tighter/looser tolerance override this per assertion.
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
    toMatchSnapshot: { maxDiffPixelRatio: 0.02 },
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  // Keep artifacts for failed runs (default), never prune diffs mid-run.
  preserveOutput: "failures-only",
  reporter: [
    ["list"],
    ["html", { outputFolder: "./playwright-report", open: "never" }],
    ["json", { outputFile: "./test-results/results.json" }],
    ["junit", { outputFile: "./test-results/junit.xml" }],
  ],
  use: {
    baseURL: BASE_URL,
    /**
     * `retain-on-failure` (not `on-first-retry`) so the very first failing
     * attempt is captured too — visual diffs are often not reproducible on a
     * retry, and a trace-less first failure is unreviewable.
     */
    trace: "retain-on-failure",
    screenshot: { mode: "only-on-failure", fullPage: false },
    video: "retain-on-failure",
    testIdAttribute: "data-testid",
  },

  projects: [
    { name: "smoke", testMatch: /.*\.smoke\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "chromium", testMatch: /.*\.spec\.ts/, testIgnore: /.*\.(smoke|mobile)\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", testMatch: /.*\.spec\.ts/, testIgnore: /.*\.(smoke|mobile|a11y)\.spec\.ts/, use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", testMatch: /.*\.spec\.ts/, testIgnore: /.*\.(smoke|mobile|a11y)\.spec\.ts/, use: { ...devices["Desktop Safari"] } },
    { name: "mobile", testMatch: /.*\.mobile\.spec\.ts/, use: { ...devices["iPhone 14"] } },
    { name: "a11y", testMatch: /.*\.a11y\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
