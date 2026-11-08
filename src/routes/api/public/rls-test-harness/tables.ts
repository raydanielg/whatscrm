import { createFileRoute } from "@tanstack/react-router";
/**
 * RLS cross-org test harness — TABLE DISCOVERY.
 * Returns every public table with a workspace_id or organization_id column.
 */
export const Route = createFileRoute("/api/public/rls-test-harness/tables")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.RLS_TEST_HARNESS_SECRET;
        if (!secret) return json({ error: "harness_disabled" }, 503);
        if (request.headers.get("x-harness-secret") !== secret) {
          return json({ error: "unauthorized" }, 401);
        }

        try {
          const { listScopedTables } = await import("./server/tables.server");
          const rows = await listScopedTables();
          
          if (rows) {
            return json({ tables: rows });
          }

          return json(
            {
              error: "missing_helper",
              hint: "Run the rls_harness_list_scoped_tables migration.",
            },
            500,
          );
        } catch (err) {
          return json({ error: "discovery_failed", message: (err as Error).message }, 500);
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
