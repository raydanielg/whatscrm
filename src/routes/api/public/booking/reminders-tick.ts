import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/api/request-guards";

/**
 * Reminder tick — claims and dispatches due booking notifications.
 *
 * Uses the rule-driven notifications engine to render templates
 * (WhatsApp / Email / SMS / Push / In-App) and hand them to the
 * appropriate outbox. Intended to be called by pg_cron every minute.
 */
export const Route = createFileRoute("/api/public/booking/reminders-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = guardCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
        const { dispatchQueuedReminder } = await import(
          "@/lib/booking/notifications-engine.server"
        );
        const nowIso = new Date().toISOString();

        const { data: due, error: dueErr } = await supabaseAdmin
          .from("booking_reminders")
          .select("id")
          .eq("status", "queued")
          .lte("send_at", nowIso)
          .lt("attempts", 5)
          .order("send_at", { ascending: true })
          .limit(200);

        if (dueErr) {
          return Response.json(
            { error: "claim_failed", detail: dueErr.message },
            { status: 500 },
          );
        }
        if (!due?.length) return Response.json({ processed: 0 });

        const ids = (due as Array<{ id: string }>).map((r) => r.id);
        await supabaseAdmin
          .from("booking_reminders")
          .update({ status: "sending" })
          .in("id", ids);

        let sent = 0;
        let failed = 0;
        for (const id of ids) {
          const r = await dispatchQueuedReminder(supabaseAdmin, id);
          if (r.ok) sent += 1;
          else failed += 1;
        }
        return Response.json({ processed: ids.length, sent, failed });
      },
    },
  },
});
