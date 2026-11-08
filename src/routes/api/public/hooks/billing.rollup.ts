/**
 * Public rollup endpoint for pg_cron.
 * `POST /api/public/hooks/billing/rollup` — computes today's revenue snapshot
 * for every organization with an active or trialing subscription.
 *
 * Auth: bypasses platform auth via `/api/public/*`. We verify the Supabase
 * private `x-cron-token` header (INTERNAL_CRON_TOKEN) so only pg_cron hits it.
 */
import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/api/request-guards";

export const Route = createFileRoute("/api/public/hooks/billing/rollup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = guardCronRequest(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
        const { computeRevenueSnapshot, persistRevenueSnapshot } = await import("@/lib/billing/revenue.server");

        // Global (organization_id null) + per-org snapshots.
        const orgs = await supabaseAdmin
          .from("subscriptions")
          .select("organization_id")
          .in("status", ["active", "trialing", "past_due"]);
        const uniqueOrgs = [...new Set((orgs.data ?? []).map((r: any) => r.organization_id))];

        const global = await computeRevenueSnapshot(supabaseAdmin, {});
        await persistRevenueSnapshot(supabaseAdmin, global, null);

        for (const org of uniqueOrgs) {
          const snap = await computeRevenueSnapshot(supabaseAdmin, { organization_id: org });
          await persistRevenueSnapshot(supabaseAdmin, snap, org);
        }
        return Response.json({ ok: true, orgs: uniqueOrgs.length });
      },
    },
  },
});
