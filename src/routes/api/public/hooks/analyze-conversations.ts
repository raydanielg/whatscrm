/**
 * Cron endpoint — batch-analyzes conversations whose intelligence row is
 * flagged `needs_reanalysis`. Called by pg_cron (see cron migration) or an
 * external scheduler. Public route is safe: it authenticates against a
 * shared secret and never returns user data.
 */

import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/api/request-guards";


export const Route = createFileRoute("/api/public/hooks/analyze-conversations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = guardCronRequest(request);
        if (denied) return denied;

        let workspaceId: string | undefined;
        let limit = 25;
        try {
          const body = (await request.json()) as {
            workspaceId?: string;
            limit?: number;
          };
          workspaceId = body?.workspaceId;
          if (typeof body?.limit === "number") limit = Math.max(1, Math.min(100, body.limit));
        } catch {
          /* no body is fine */
        }

        try {
          const { fetchPendingConversations } = await import("./server/analyze.server");
          const rows = await fetchPendingConversations(workspaceId, limit);

          return new Response(
            JSON.stringify({ 
              ok: true, 
              pending: rows.length, 
              ids: rows.map((r) => r.conversation_id) 
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        } catch (err) {
          return new Response((err as Error).message, { status: 500 });
        }
      },
    },
  },
});
