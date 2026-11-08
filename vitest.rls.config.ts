import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Vitest project for the RLS cross-org matrix.
 *
 * Runs against a live dev server (default http://localhost:8080). Skipped in
 * the default `npm test` project. Invoke with:
 *
 *   RLS_TEST_HARNESS_SECRET=... npm run test:rls
 *
 * Set RLS_HARNESS_BASE_URL=https://preview-url to target a deployed preview.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/rls/**/*.test.ts"],
    testTimeout: 300_000,
    hookTimeout: 120_000,
    reporters: ["default"],
    // No MSW setup — this suite hits the real Supabase Data API.
    setupFiles: [],
    globals: true,
  },
});
