/**
 * Public cron endpoint — SLA breach scanner.
 * Called by pg_cron every 5 minutes. Authenticated via private x-cron-token header (INTERNAL_CRON_TOKEN).
 */
import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/api/request-guards";
import { scanBreaches } from "@/lib/helpdesk/sla-engine.functions";

export const Route = createFileRoute("/api/public/hooks/sla-scan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = guardCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
        try {
          const result = await scanBreaches(supabaseAdmin);
          return Response.json({ ok: true, ...result });
        } catch (e: any) {
          console.error("sla-scan failed:", e);
          return Response.json({ ok: false, error: e.message }, { status: 500 });
        }
      },
      GET: async () => Response.json({ ok: true, hint: "POST to run scan" }),
    },
  },
});
