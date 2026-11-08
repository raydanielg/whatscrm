import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/api/request-guards";

/**
 * Pulls new Facebook / YouTube / LinkedIn / TikTok comments into the Inbox.
 * Invoked by pg_cron (`wa-social-inbox-sync`, every 5 minutes) with the
 * private `x-cron-token` header.
 */
export const Route = createFileRoute("/api/public/hooks/social-inbox-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = guardCronRequest(request);
        if (denied) return denied;
        try {
          const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
          const { syncSocialInbox } = await import("@/lib/social-inbox/sync.server");
          const results = await syncSocialInbox(supabaseAdmin as never);
          return Response.json({
            ok: true,
            accounts: results.length,
            failed: results.filter((r) => !r.ok).length,
            inserted: results.reduce((n, r) => n + (r.inserted ?? 0), 0),
          });
        } catch (err) {
          return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
        }
      },
    },
  },
});
