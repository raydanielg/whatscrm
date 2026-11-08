/**
 * POST /api/public/hooks/billing/automation
 * Called by pg_cron every 15 minutes to run the billing automation pass.
 * Auth: private `x-cron-token` header matching INTERNAL_CRON_TOKEN.
 */
import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/api/request-guards";

export const Route = createFileRoute("/api/public/hooks/billing/automation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = guardCronRequest(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
        const { runBillingAutomation } = await import("@/lib/billing/automation.server");
        const result = await runBillingAutomation(supabaseAdmin);
        return Response.json(result);
      },
    },
  },
});
