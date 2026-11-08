// Public webhook triggered by pg_cron every minute — processes queued export jobs.
import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/api/request-guards";

export const Route = createFileRoute("/api/public/hooks/process-exports")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = guardCronRequest(request);
        if (denied) return denied;
        try {
          const { processExportBatch } = await import("@/lib/exports/run.server");
          const res = await processExportBatch(3);
          return Response.json({ ok: true, ...res });
        } catch (err) {
          return Response.json({ ok: false, error: (err as Error).message }, { status: 500 });
        }
      },
    },
  },
});
