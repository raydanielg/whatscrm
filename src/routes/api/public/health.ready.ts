import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { sbAny } from "@/lib/supabase/untyped";

/**
 * Readiness probe — verifies critical dependencies (DB reachable).
 * Returns 200 when ready, 503 otherwise. Kept cheap: single lightweight
 * `select 1`-equivalent via the Data API. Do not call from user paths.
 */
export const Route = createFileRoute("/api/public/health/ready")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        const checks: Record<string, { ok: boolean; latency_ms?: number; error?: string }> = {};

        try {
          const supabase = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
            { auth: { persistSession: false, autoRefreshToken: false } },
          );
          const t0 = Date.now();
          const { error } = await sbAny(supabase).from("plans").select("id", { head: true, count: "exact" }).limit(1);
          checks.database = error
            ? { ok: false, error: error.message }
            : { ok: true, latency_ms: Date.now() - t0 };
        } catch (err) {
          checks.database = { ok: false, error: (err as Error).message };
        }

        const allOk = Object.values(checks).every((c) => c.ok);
        return new Response(
          JSON.stringify({
            status: allOk ? "ready" : "degraded",
            checks,
            duration_ms: Date.now() - started,
            timestamp: new Date().toISOString(),
          }),
          {
            status: allOk ? 200 : 503,
            headers: { "content-type": "application/json", "cache-control": "no-store" },
          },
        );
      },
    },
  },
});
