import { createFileRoute } from "@tanstack/react-router";
import { guardCronRequest } from "@/lib/api/request-guards";
import { supabaseAdmin } from "@/lib/demo/admin-write-guard.server";
import type { WorkflowGraph } from "@/lib/workflows/types";

/**
 * Workflow queue processor.
 *
 * Invoked by pg_cron on a short interval. Leases a batch of ready jobs
 * atomically via `wf_queue_lease`, executes each one against a service-role
 * client, and finalises status. Failed jobs are retried with exponential
 * backoff up to `max_attempts` before being marked `dead` (dead-letter).
 *
 * Auth: `/api/public/*` bypasses signed-in gating, so we require a matching
 * `x-cron-token` header (INTERNAL_CRON_TOKEN) before doing any work.
 */

const BATCH = 10;
const LEASE_SECONDS = 60;

export const Route = createFileRoute("/api/public/hooks/workflow-queue")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = guardCronRequest(request);
        if (denied) return denied;

        const admin = supabaseAdmin;
        const worker = `wf-worker-${crypto.randomUUID().slice(0, 8)}`;
        const { data: jobs, error } = await (admin as any).rpc("wf_queue_lease", {
          _worker: worker,
          _batch: BATCH,
          _lease_seconds: LEASE_SECONDS,
        });
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (!jobs || jobs.length === 0) {
          return Response.json({ processed: 0 });
        }

        const { executeAutomation } = await import("@/lib/workflows/engine.server");
        const results: Array<{ id: string; status: string }> = [];

        for (const job of jobs as any[]) {
          try {
            const { data: automation, error: loadErr } = await admin
              .from("automations")
              .select("id, workspace_id, graph, status, version, runs_count")
              .eq("id", job.automation_id)
              .single();
            if (loadErr || !automation) throw new Error(`automation missing: ${loadErr?.message}`);
            if (automation.status === "paused" || automation.status === "draft") {
              await admin
                .from("workflow_queue")
                .update({ status: "cancelled", last_error: { message: "automation not active" } })
                .eq("id", job.id);
              results.push({ id: job.id, status: "cancelled" });
              continue;
            }

            const result = await executeAutomation({
              supabase: admin as any,
              automation: {
                id: automation.id,
                workspace_id: automation.workspace_id,
                version: automation.version,
                graph: (automation.graph ?? { nodes: [], edges: [] }) as WorkflowGraph,
                runs_count: automation.runs_count,
              },
              triggerSource: job.trigger_source ?? "event",
              input: (job.input ?? {}) as Record<string, unknown>,
            });

            if (result.status === "success") {
              await admin
                .from("workflow_queue")
                .update({
                  status: "success",
                  run_id: result.runId,
                  last_error: null,
                  lease_expires_at: null,
                })
                .eq("id", job.id);
              results.push({ id: job.id, status: "success" });
            } else {
              throw new Error(result.error?.message ?? "workflow failed");
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const attempts = Number(job.attempts ?? 1);
            const maxAttempts = Number(job.max_attempts ?? 5);

            if (attempts >= maxAttempts) {
              await admin
                .from("workflow_queue")
                .update({
                  status: "dead",
                  last_error: { message, attempts },
                  lease_expires_at: null,
                })
                .eq("id", job.id);
              results.push({ id: job.id, status: "dead" });
            } else {
              // Exponential backoff with jitter: 5s, 30s, 2m, 10m, 60m, capped 60m
              const base = Math.min(60 * 60, Math.round(5 * Math.pow(6, attempts - 1)));
              const jitter = Math.floor(Math.random() * Math.max(1, base * 0.2));
              const nextRun = new Date(Date.now() + (base + jitter) * 1000).toISOString();
              await admin
                .from("workflow_queue")
                .update({
                  status: "queued",
                  run_at: nextRun,
                  last_error: { message, attempts },
                  lease_expires_at: null,
                  leased_by: null,
                })
                .eq("id", job.id);
              results.push({ id: job.id, status: "retry" });
            }
          }
        }

        return Response.json({ processed: results.length, results });
      },
    },
  },
});
