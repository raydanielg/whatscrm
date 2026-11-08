import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";

/**
 * Vitest — unit + integration + component tests.
 * E2E lives in Playwright (see playwright.config.ts).
 */
export default defineConfig({
  plugins: [react(), tsconfigPaths({ projects: ["./tsconfig.json"] })],
  // Explicit alias: tsconfig-paths can bail out when a nested tsconfig
  // (mobile/) fails to parse, which breaks every "@/..." import in tests.
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    css: false,
    include: [
      "tests/unit/**/*.{test,spec}.{ts,tsx}",
      "tests/integration/**/*.{test,spec}.{ts,tsx}",
      "tests/api/**/*.{test,spec}.{ts,tsx}",
      "src/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: ["tests/e2e/**", "node_modules/**", ".output/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.{test,spec}.{ts,tsx}",
        "src/routeTree.gen.ts",
        "src/integrations/supabase/**",
        "src/**/*.d.ts",
        "src/main.tsx",
        "src/router.tsx",
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 65,
        statements: 70,
      },
    },
    testTimeout: 10_000,
    hookTimeout: 10_000,
    reporters: ["default", "json"],
    outputFile: { json: "./coverage/vitest-results.json" },
  },
});
