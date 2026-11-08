import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/api/request-guards";
import { sbAny } from "@/lib/supabase/untyped";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Advance drip enrollments — moves due enrollments to their next step. */
export const Route = createFileRoute("/api/public/hooks/drip-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = guardCronRequest(request);
        if (denied) return denied;
        try {
          const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
          const admin = supabaseAdmin as any;
          const now = new Date().toISOString();

          const { data: enrollments, error: enrollmentError } = await admin
            .from("drip_enrollments")
            .select("id")
            .eq("status", "active")
            .lte("next_run_at", now)
            .limit(500);

          if (enrollmentError) throw enrollmentError;
          let advanced = 0;
          const errors: string[] = [];
          for (const e of (enrollments ?? []) as Array<{ id: string }>) {
            const { data: staged, error } = await sbAny(admin).rpc("enqueue_due_drip_step", { _enrollment_id: e.id });
            if (error) errors.push(e.id + ": " + error.message);
            else if (staged) advanced++;
          }

          return new Response(JSON.stringify({ ok: errors.length === 0, advanced, errors }), {
            status: errors.length ? 500 : 200,
            headers: { "content-type": "application/json" },
          });
        } catch (err) {
          return new Response(
            JSON.stringify({ ok: false, error: String((err as Error).message ?? err) }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
