import { createFileRoute } from "@tanstack/react-router";
/**
 * RLS cross-org test harness — SETUP.
 *
 * Creates two ephemeral auth users, each owning a fresh workspace + organization,
 * and returns credentials + access tokens for both.
 *
 * SECURITY:
 * - Gated by RLS_TEST_HARNESS_SECRET (header `x-harness-secret`).
 * - Refuses to run when APP_MODE=production unless RLS_TEST_HARNESS_ALLOW_PROD=1.
 */
export const Route = createFileRoute("/api/public/rls-test-harness/setup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.RLS_TEST_HARNESS_SECRET;
        if (!secret) return json({ error: "harness_disabled" }, 503);
        if (request.headers.get("x-harness-secret") !== secret) {
          return json({ error: "unauthorized" }, 401);
        }
        const mode = process.env.APP_MODE ?? process.env.VITE_APP_MODE;
        if (mode === "production" && process.env.RLS_TEST_HARNESS_ALLOW_PROD !== "1") {
          return json({ error: "refused_in_production" }, 403);
        }

        try {
          // Dynamic import to keep service role logic out of client bundle
          const { setupHarness } = await import("./server/setup.server");
          const result = await setupHarness();
          return json(result);
        } catch (err) {
          return json({ error: "setup_failed", message: (err as Error).message }, 500);
        }
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
