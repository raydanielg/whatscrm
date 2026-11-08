/**
 * Public cron endpoint — removes storage objects for attachments whose
 * `expires_at` has passed. Called every minute (or on demand) by pg_cron.
 */

import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/api/request-guards";
import { sbAny } from "@/lib/supabase/untyped";

export const Route = createFileRoute("/api/public/hooks/cleanup-media")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = guardCronRequest(request);
        if (denied) return denied;
        try {
          const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
          const { data, error } = await sbAny(supabaseAdmin).rpc("claim_expired_media" as never, { _limit: 200 } as never);
          if (error) throw new Error(error.message);
          const rows = (data ?? []) as Array<{ id: string; storage_bucket: string; storage_path: string }>;
          const byBucket = new Map<string, string[]>();
          for (const r of rows) {
            if (!r.storage_path) continue;
            byBucket.set(r.storage_bucket, [...(byBucket.get(r.storage_bucket) ?? []), r.storage_path]);
          }
          for (const [bucket, paths] of byBucket) {
            if (paths.length) await supabaseAdmin.storage.from(bucket).remove(paths);
          }
          return new Response(JSON.stringify({ ok: true, removed: rows.length }), {
            status: 200, headers: { "content-type": "application/json" },
          });
        } catch (err) {
          return new Response(JSON.stringify({ ok: false, error: String(err) }), {
            status: 500, headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
