/**
 * POST /api/public/widget/beacon
 *
 * sendBeacon target for lightweight widget analytics: load/open/message.
 * Body: { widgetId, event, url?, referrer?, sessionId? }
 * Anonymous — write via admin client after light validation.
 */
import { createFileRoute } from "@tanstack/react-router";
import { sbAny } from "@/lib/supabase/untyped";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

const ALLOWED = new Set(["load", "open", "close", "message", "handoff", "rating"]);

export const Route = createFileRoute("/api/public/widget/beacon")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("bad json", { status: 400, headers: CORS });
        }
        const b = body as {
          widgetId?: unknown;
          event?: unknown;
          url?: unknown;
          referrer?: unknown;
          sessionId?: unknown;
        };
        const widgetId = typeof b.widgetId === "string" ? b.widgetId : "";
        const event = typeof b.event === "string" ? b.event : "";
        if (!/^[0-9a-f-]{36}$/i.test(widgetId) || !ALLOWED.has(event)) {
          return new Response("bad input", { status: 400, headers: CORS });
        }
        const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
        const { data: widget } = await supabaseAdmin
          .from("chat_widgets")
          .select("workspace_id, is_active")
          .eq("id", widgetId)
          .maybeSingle();
        const w = widget as { workspace_id: string; is_active: boolean } | null;
        if (!w || !w.is_active) return new Response("ok", { status: 204, headers: CORS });
        await sbAny(supabaseAdmin).from("chat_widget_events").insert({
          widget_id: widgetId,
          workspace_id: w.workspace_id,
          event_type: event,
          session_id: typeof b.sessionId === "string" ? b.sessionId.slice(0, 200) : null,
          url: typeof b.url === "string" ? b.url.slice(0, 2048) : null,
          referrer: typeof b.referrer === "string" ? b.referrer.slice(0, 2048) : null,
          user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
        } as never);
        return new Response("ok", { status: 204, headers: CORS });
      },
    },
  },
});
