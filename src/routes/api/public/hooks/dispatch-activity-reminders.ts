import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/api/request-guards";

// Called by pg_cron every minute to:
//  1. mark planned activities whose start_at has passed as `overdue`
//  2. flag reminders whose `reminder_at <= now()` as sent (so UIs can dispatch push/toast)
// It writes to `notifications` if desired later; kept as a pure DB operation here.
export const Route = createFileRoute("/api/public/hooks/dispatch-activity-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = guardCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
        const nowIso = new Date().toISOString();
        // 1) mark overdue
        await supabaseAdmin
          .from("sales_activities")
          .update({ status: "overdue" })
          .in("status", ["planned", "in_progress"])
          .lt("start_at", nowIso)
          .is("deleted_at", null);
        // 2) flush reminders
        const { data: due } = await supabaseAdmin
          .from("sales_activities")
          .select("id, title, assigned_to, workspace_id, start_at")
          .lte("reminder_at", nowIso)
          .eq("reminder_sent", false)
          .is("deleted_at", null)
          .limit(500);
        if (due?.length) {
          await supabaseAdmin
            .from("sales_activities")
            .update({ reminder_sent: true })
            .in("id", due.map((d: { id: string }) => d.id));
        }
        return new Response(
          JSON.stringify({ ok: true, reminders_fired: due?.length ?? 0 }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
