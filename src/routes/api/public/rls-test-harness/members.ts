import { createFileRoute } from "@tanstack/react-router";
/**
 * RLS cross-org test harness — MEMBERS.
 *
 * Creates additional ephemeral users enrolled into an existing harness tenant
 * with explicit organization/workspace roles, so RLS suites can assert access
 * per role (owner, admin, billing, member, guest) instead of owner-only.
 *
 * SECURITY: same gate as the other harness routes — shared secret header and
 * a hard refusal in production.
 */
export const Route = createFileRoute("/api/public/rls-test-harness/members")({
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
          const body = (await request.json()) as { members?: unknown };
          const specs = Array.isArray(body.members) ? body.members : [];
          if (specs.length === 0) return json({ error: "no_members" }, 400);

          const { createHarnessMembers } = await import("./server/members.server");
          const result = await createHarnessMembers(
            specs as Parameters<typeof createHarnessMembers>[0],
          );
          return json(result);
        } catch (err) {
          return json({ error: "members_failed", message: (err as Error).message }, 500);
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
