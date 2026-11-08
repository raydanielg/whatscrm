/**
 * Public booking page loader — /api/public/booking/page?slug=...
 * Returns the booking_pages row + its event types for service selection.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/public/booking/page")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const slug = url.searchParams.get("slug");
        if (!slug) return new Response(JSON.stringify({ error: "missing_slug" }), { status: 400, headers: { "Content-Type": "application/json", ...CORS } });
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
        const { data: page } = await supabase
          .from("booking_pages")
          .select("id, slug, title, description, brand_color, logo_url, theme, event_type_ids, is_active")
          .eq("slug", slug)
          .eq("is_active", true)
          .maybeSingle();
        if (!page) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "Content-Type": "application/json", ...CORS } });
        const ids = (page as { event_type_ids: string[] }).event_type_ids ?? [];
        const { data: types } = ids.length
          ? await supabase
              .from("booking_event_types")
              .select("id, name, slug, description, duration_minutes, location_kind, color, price, currency, category")
              .in("id", ids)
              .eq("is_active", true)
          : { data: [] as unknown[] };
        return new Response(JSON.stringify({ page, eventTypes: types ?? [] }), {
          headers: { "Content-Type": "application/json", ...CORS },
        });
      },
    },
  },
});
