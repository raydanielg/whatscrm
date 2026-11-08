import { createFileRoute } from "@tanstack/react-router";
/**
 * RLS cross-org test harness — TEARDOWN.
 * Deletes the ephemeral users; owned workspaces/orgs cascade.
 */
export const Route = createFileRoute("/api/public/rls-test-harness/teardown")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.RLS_TEST_HARNESS_SECRET;
        if (!secret) return json({ error: "harness_disabled" }, 503);
        if (request.headers.get("x-harness-secret") !== secret) {
          return json({ error: "unauthorized" }, 401);
        }

        let body: { user_ids?: string[] } = {};
        try {
          body = await request.json();
        } catch {
          // no-op
        }

        try {
          const { teardownHarness } = await import("./server/teardown.server");
          const result = await teardownHarness(body.user_ids ?? []);
          return json(result);
        } catch (err) {
          return json({ error: "teardown_failed", message: (err as Error).message }, 500);
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
