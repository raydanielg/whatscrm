/**
 * Public cron endpoint that (a) claims failed sync jobs whose backoff has
 * elapsed and re-runs them, and (b) runs baseline scheduled syncs
 * (webhook drain, outbox drain, scheduled messages) for every connected
 * channel account.
 *
 * Wire via pg_cron every 1–5 min; body is unused.
 */
import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/api/request-guards";

export const Route = createFileRoute("/api/public/hooks/run-scheduled-syncs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = guardCronRequest(request);
        if (denied) return denied;
        try {
          const { runSync, claimFailedJobsForRetry } = await import("@/lib/messaging/sync.server");
          const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

          // 1) Baseline drains — workspace-agnostic queues
          const { data: accounts } = await supabaseAdmin
            .from("channel_accounts" as never)
            .select("id, workspace_id")
            .eq("status", "connected");
          const list = (accounts ?? []) as Array<{ id: string; workspace_id: string }>;
          const seenWs = new Set<string>();

          for (const a of list) {
            if (!seenWs.has(a.workspace_id)) {
              seenWs.add(a.workspace_id);
              await runSync({ workspaceId: a.workspace_id, kind: "webhook_drain", triggerSource: "cron" });
              await runSync({ workspaceId: a.workspace_id, kind: "outbox_drain", triggerSource: "cron" });
              await runSync({ workspaceId: a.workspace_id, kind: "scheduled_messages", triggerSource: "cron" });
            }
          }

          // 2) Retry failed jobs whose backoff has elapsed
          const retries = await claimFailedJobsForRetry(20);
          for (const r of retries) {
            await runSync({
              workspaceId: r.workspace_id,
              channelAccountId: r.channel_account_id,
              kind: r.kind,
              triggerSource: "retry",
              attempt: r.attempt + 1,
              parentJobId: r.id,
            });
          }

          return Response.json({
            ok: true,
            workspaces: seenWs.size,
            accounts: list.length,
            retries: retries.length,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
