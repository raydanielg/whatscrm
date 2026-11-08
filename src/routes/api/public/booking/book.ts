import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { selectHost, type Strategy } from "@/lib/booking/round-robin";
import { provisionMeeting, type MeetingLocationKind } from "@/lib/booking/meeting-providers";
import { sbAny } from "@/lib/supabase/untyped";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const bookSchema = z.object({
  event_type_id: z.string().uuid().optional(),
  slug: z.string().optional(),
  customer_name: z.string().min(1).max(120),
  customer_email: z.string().email().optional().nullable(),
  customer_phone: z.string().max(40).optional().nullable(),
  customer_timezone: z.string().max(60).default("UTC"),
  start_at: z.string().datetime(),
  end_at: z.string().datetime(),
  answers: z.record(z.any()).default({}),
  source_channel: z.enum(["booking_page", "whatsapp", "instagram", "telegram", "email", "livechat", "api"]).default("booking_page"),
});

export const Route = createFileRoute("/api/public/booking/book")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let body: unknown;
        try { body = await request.json(); } catch {
          return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400, headers: CORS });
        }
        const parsed = bookSchema.safeParse(body);
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: "invalid_body", issues: parsed.error.issues }), {
            status: 400, headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");

        let eventTypeId = parsed.data.event_type_id;
        let workspaceId: string | undefined;
        if (eventTypeId) {
          const { data } = await sbAny(supabaseAdmin).from("booking_event_types")
            .select("id, workspace_id, is_active").eq("id", eventTypeId).maybeSingle();
          if (!data || !data.is_active) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: CORS });
          workspaceId = data.workspace_id;
        } else if (parsed.data.slug) {
          const { data } = await sbAny(supabaseAdmin).from("booking_event_types")
            .select("id, workspace_id").eq("slug", parsed.data.slug).eq("is_active", true).maybeSingle();
          if (!data) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: CORS });
          eventTypeId = data.id;
          workspaceId = data.workspace_id;
        } else {
          return new Response(JSON.stringify({ error: "missing_event_type" }), { status: 400, headers: CORS });
        }
        if (!eventTypeId || !workspaceId) {
          return new Response(JSON.stringify({ error: "missing_event_type" }), { status: 400, headers: CORS });
        }
        // Load event type meta for provider + strategy
        const { data: et } = await sbAny(supabaseAdmin).from("booking_event_types")
          .select("location_kind, location_details, name")
          .eq("id", eventTypeId).maybeSingle();

        // Load hosts with priority for round-robin selection
        const { data: hostRows } = await sbAny(supabaseAdmin).from("booking_event_type_hosts")
          .select("host_id, priority, strategy, created_at")
          .eq("event_type_id", eventTypeId);
        if (!hostRows?.length) {
          return new Response(JSON.stringify({ error: "no_host" }), { status: 400, headers: CORS });
        }

        // Compute 7-day load per host for round-robin
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
        const { data: recent } = await supabaseAdmin
          .from("booking_appointments")
          .select("host_id")
          .eq("event_type_id", eventTypeId)
          .gte("start_at", sevenDaysAgo);
        const loadMap = new Map<string, number>();
        for (const r of recent ?? []) {
          const h = (r as { host_id: string }).host_id;
          loadMap.set(h, (loadMap.get(h) ?? 0) + 1);
        }
        const loads = Array.from(loadMap.entries()).map(([host_id, bookings_last_7d]) => ({ host_id, bookings_last_7d }));

        // Filter out hosts that already have a conflicting appointment
        const { data: conflicts } = await supabaseAdmin
          .from("booking_appointments")
          .select("host_id")
          .in("host_id", hostRows.map((h) => (h as { host_id: string }).host_id))
          .lt("start_at", parsed.data.end_at)
          .gt("end_at", parsed.data.start_at)
          .in("status", ["pending", "confirmed"]);
        const busySet = new Set((conflicts ?? []).map((c) => (c as { host_id: string }).host_id));
        const eligible = hostRows.filter((h) => !busySet.has((h as { host_id: string }).host_id));
        if (!eligible.length) {
          return new Response(JSON.stringify({ error: "slot_taken" }), { status: 409, headers: CORS });
        }

        const strategy = ((hostRows[0] as { strategy?: string }).strategy ?? "round_robin") as Strategy;
        const hostId = selectHost({
          strategy,
          hosts: eligible.map((h) => ({
            host_id: (h as { host_id: string }).host_id,
            priority: (h as { priority: number | null }).priority,
            created_at: (h as { created_at: string }).created_at,
          })),
          loads,
        });
        if (!hostId) {
          return new Response(JSON.stringify({ error: "no_host" }), { status: 400, headers: CORS });
        }

        // Provision meeting artifact (join URL, external ids)
        const locationKind = ((et as { location_kind?: string })?.location_kind ?? "custom") as MeetingLocationKind;
        const artifact = await provisionMeeting({
          workspace_id: workspaceId,
          event_type_id: eventTypeId,
          host_id: hostId,
          customer_name: parsed.data.customer_name,
          customer_email: parsed.data.customer_email,
          customer_phone: parsed.data.customer_phone,
          start_at: parsed.data.start_at,
          end_at: parsed.data.end_at,
          location_kind: locationKind,
          location_details: (et as { location_details?: Record<string, unknown> })?.location_details ?? {},
          title: (et as { name?: string })?.name,
        });

        const { data: row, error } = await sbAny(supabaseAdmin).from("booking_appointments").insert({
          workspace_id: workspaceId,
          event_type_id: eventTypeId,
          host_id: hostId,
          customer_name: parsed.data.customer_name,
          customer_email: parsed.data.customer_email,
          customer_phone: parsed.data.customer_phone,
          customer_timezone: parsed.data.customer_timezone,
          start_at: parsed.data.start_at,
          end_at: parsed.data.end_at,
          answers: parsed.data.answers,
          source_channel: parsed.data.source_channel,
          status: "confirmed",
          location_kind: artifact.location_kind,
          location_details: artifact.location_details as never,
          join_url: artifact.join_url,
          external_event_ids: artifact.external_ids as never,
        }).select("id, manage_token, start_at, end_at, join_url, host_id").single();

        if (error) {
          const msg = String(error.message);
          if (msg.includes("booking_no_double_book")) {
            return new Response(JSON.stringify({ error: "slot_taken" }), {
              status: 409, headers: { "Content-Type": "application/json", ...CORS },
            });
          }
          return new Response(JSON.stringify({ error: "insert_failed", detail: msg }), {
            status: 500, headers: { "Content-Type": "application/json", ...CORS },
          });
        }

        return new Response(JSON.stringify({ appointment: row }), {
          status: 201, headers: { "Content-Type": "application/json", ...CORS },
        });
      },
    },
  },
});
