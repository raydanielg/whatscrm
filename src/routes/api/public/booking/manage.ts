/**
 * Public appointment management (reschedule + cancel) by manage_token.
 * GET  /api/public/booking/manage?token=...           → appointment + event type
 * POST /api/public/booking/manage  { token, action: "cancel" | "reschedule", start_at?, end_at?, reason? }
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("cancel"),
    token: z.string().min(10),
    reason: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal("reschedule"),
    token: z.string().min(10),
    start_at: z.string().datetime(),
    end_at: z.string().datetime(),
  }),
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/booking/manage")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token");
        if (!token || token.length < 10) return json({ error: "invalid_token" }, 400);
        const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
        const { data: appt } = await supabaseAdmin
          .from("booking_appointments")
          .select("id, event_type_id, start_at, end_at, status, customer_name, customer_email, customer_timezone, location_kind, join_url, cancellation_reason")
          .eq("manage_token", token)
          .maybeSingle();
        if (!appt) return json({ error: "not_found" }, 404);
        const { data: eventType } = await supabaseAdmin
          .from("booking_event_types")
          .select("id, name, slug, description, duration_minutes, location_kind, color, confirmation_message")
          .eq("id", (appt as { event_type_id: string }).event_type_id)
          .maybeSingle();
        return json({ appointment: appt, eventType });
      },
      POST: async ({ request }) => {
        let body: unknown;
        try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
        const parsed = postSchema.safeParse(body);
        if (!parsed.success) return json({ error: "invalid_body", issues: parsed.error.issues }, 400);
        const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
        const { data: appt } = await supabaseAdmin
          .from("booking_appointments")
          .select("id, status, start_at, end_at, host_id, event_type_id")
          .eq("manage_token", parsed.data.token)
          .maybeSingle();
        if (!appt) return json({ error: "not_found" }, 404);
        const a = appt as { id: string; status: string; host_id: string | null; event_type_id: string };
        if (a.status === "cancelled") return json({ error: "already_cancelled" }, 409);

        if (parsed.data.action === "cancel") {
          const { error } = await supabaseAdmin
            .from("booking_appointments")
            .update({
              status: "cancelled",
              cancellation_reason: parsed.data.reason ?? null,
            } as never)
            .eq("id", a.id);
          if (error) return json({ error: "update_failed", detail: error.message }, 500);
          return json({ ok: true });
        }

        // Reschedule — check the new slot is free for this host
        const { start_at, end_at } = parsed.data;
        if (a.host_id) {
          const { data: conflicts } = await supabaseAdmin
            .from("booking_appointments")
            .select("id")
            .eq("host_id", a.host_id)
            .neq("id", a.id)
            .lt("start_at", end_at)
            .gt("end_at", start_at)
            .in("status", ["pending", "confirmed"]);
          if (conflicts && conflicts.length > 0) return json({ error: "slot_taken" }, 409);
        }
        const { error } = await supabaseAdmin
          .from("booking_appointments")
          .update({ start_at, end_at, status: "confirmed" } as never)
          .eq("id", a.id);
        if (error) {
          if (String(error.message).includes("booking_no_double_book")) return json({ error: "slot_taken" }, 409);
          return json({ error: "update_failed", detail: error.message }, 500);
        }
        return json({ ok: true, start_at, end_at });
      },
    },
  },
});
