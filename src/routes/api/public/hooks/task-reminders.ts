import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/api/request-guards";

/**
 * Task reminder cron endpoint. Called every 5 minutes by pg_cron.
 * `/api/public/*` bypasses auth on published sites; we authenticate the
 * caller with the private `x-cron-token` header (INTERNAL_CRON_TOKEN).
 */
export const Route = createFileRoute("/api/public/hooks/task-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = guardCronRequest(request);
        if (denied) return denied;
try {
          const { runTaskReminders } = await import(
            "@/lib/tasks/reminders-runner.server"
          );
          const result = await runTaskReminders();
          const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
          const { runClientProjectUpdates } = await import("@/lib/inbox/client-updates.server");
          const clientUpdates = await runClientProjectUpdates(supabaseAdmin);
          return Response.json({ ok: true, ...result, client_updates: clientUpdates });
        } catch (e: any) {
          return new Response(
            JSON.stringify({ ok: false, error: e?.message ?? String(e) }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
      },
    },
  },
});
