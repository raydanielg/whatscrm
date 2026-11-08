import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { computeAvailability, dedupeSlotsByStart } from "@/lib/booking/availability-engine";
import { sbAny } from "@/lib/supabase/untyped";

const querySchema = z.object({
  slug: z.string().optional(),
  event_type_id: z.string().uuid().optional(),
  from: z.string().datetime(),
  to: z.string().datetime(),
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/public/booking/slots")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: "invalid_query", issues: parsed.error.issues }), {
            status: 400, headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const supabase = createClient(process.env.SUPABASE_URL!, key, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            fetch: (input, init) => {
              const h = new Headers(init?.headers);
              if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
              h.set("apikey", key);
              return fetch(input, { ...init, headers: h });
            },
          },
        });

        let eventTypeId = parsed.data.event_type_id;
        if (!eventTypeId && parsed.data.slug) {
          const { data } = await sbAny(supabase).from("booking_event_types")
            .select("id").eq("slug", parsed.data.slug).eq("is_active", true).maybeSingle();
          eventTypeId = data?.id;
        }
        if (!eventTypeId) {
          return new Response(JSON.stringify({ error: "not_found" }), {
            status: 404, headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        const slots = dedupeSlotsByStart(
          await computeAvailability(supabase as never, eventTypeId, parsed.data.from, parsed.data.to),
        );
        return new Response(JSON.stringify({ slots }), {
          headers: { "Content-Type": "application/json", ...CORS },
        });
      },
    },
  },
});
