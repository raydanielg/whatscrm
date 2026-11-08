import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { WorkflowGraph } from "./types";
import { sbAny } from "@/lib/supabase/untyped";

/**
 * Workflow engine — public server-function surface.
 *
 * Delivers manual runs, event fan-out, queue processing, publishing, and
 * cancellation. Actual DAG execution lives in `engine.server.ts` and runs
 * against whichever Supabase client the caller provides (RLS user client for
 * manual runs, service-role client for queue workers).
 */

/* ------------------------------- Manual run ------------------------------- */

const RunInput = z.object({
  automationId: z.string().uuid(),
  triggerSource: z.string().default("manual"),
  input: z.record(z.unknown()).default({}),
  dryRun: z.boolean().optional(),
});

export const runWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => RunInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: automation, error } = await supabase
      .from("automations")
      .select("id, workspace_id, graph, status, version, runs_count")
      .eq("id", data.automationId)
      .single();
    if (error || !automation) throw new Error(`Automation not found: ${error?.message ?? "unknown"}`);
    if (automation.status !== "active" && data.triggerSource !== "manual") {
      throw new Error("Automation is not active");
    }

    const { executeAutomation } = await import("./engine.server");
    const result = await executeAutomation({
      supabase,
      automation: {
        id: automation.id,
        workspace_id: automation.workspace_id,
        version: automation.version,
        graph: (automation.graph ?? { nodes: [], edges: [] }) as WorkflowGraph,
        runs_count: automation.runs_count,
      },
      triggerSource: data.triggerSource,
      input: data.input,
      actorUserId: userId,
      dryRun: data.dryRun,
    });
    return { runId: result.runId, status: result.status, error: result.error };
  });

/* --------------------------------- Enqueue -------------------------------- */

const EnqueueInput = z.object({
  automationId: z.string().uuid(),
  triggerSource: z.string().default("manual"),
  input: z.record(z.unknown()).default({}),
  runAt: z.string().datetime().optional(),
  priority: z.number().int().min(1).max(9).optional(),
  maxAttempts: z.number().int().min(1).max(20).optional(),
  idempotencyKey: z.string().min(1).max(200).optional(),
});

export const enqueueWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => EnqueueInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: automation, error } = await supabase
      .from("automations")
      .select("id, workspace_id, version, status")
      .eq("id", data.automationId)
      .single();
    if (error || !automation) throw new Error("Automation not found");

    // Idempotency: if a job already exists for this key, return it unchanged.
    if (data.idempotencyKey) {
      const { data: existing } = await supabase
        .from("workflow_queue")
        .select("id, run_at, status")
        .eq("workspace_id", automation.workspace_id)
        .eq("automation_id", automation.id)
        .eq("idempotency_key", data.idempotencyKey)
        .maybeSingle();
      if (existing) return { ...existing, deduped: true };
    }

    const { data: job, error: qErr } = await supabase
      .from("workflow_queue")
      .insert({
        workspace_id: automation.workspace_id,
        automation_id: automation.id,
        version: automation.version ?? 1,
        trigger_source: data.triggerSource,
        input: data.input as any,
        run_at: data.runAt ?? new Date().toISOString(),
        priority: data.priority ?? 5,
        max_attempts: data.maxAttempts ?? 5,
        idempotency_key: data.idempotencyKey ?? null,
      })
      .select("id, run_at")
      .single();
    if (qErr) throw new Error(qErr.message);
    return job;
  });

/* ------------------------------- Trigger fan-out -------------------------- */

const EmitEventInput = z.object({
  eventType: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
  workspaceId: z.string().uuid().optional(),
  idempotencyKey: z.string().min(1).max(200).optional(),
});

/**
 * Trigger Engine — matches active automations to an event type and enqueues
 * a job for each. Called from realtime hooks (message received, deal stage
 * changed, contact created, etc.) or from other server fns.
 */
export const emitWorkflowEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => EmitEventInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let query = supabase
      .from("automations")
      .select("id, workspace_id, version")
      .eq("status", "active")
      .eq("trigger_type", data.eventType);
    if (data.workspaceId) query = query.eq("workspace_id", data.workspaceId);

    const { data: matches, error } = await query.limit(500);
    if (error) throw new Error(error.message);
    if (!matches?.length) return { enqueued: 0 };

    const rows = matches.map((a) => ({
      workspace_id: a.workspace_id,
      automation_id: a.id,
      version: a.version ?? 1,
      trigger_source: "event",
      event_type: data.eventType,
      input: data.payload as any,
      run_at: new Date().toISOString(),
      priority: 5,
      max_attempts: 5,
      idempotency_key: data.idempotencyKey ?? null,
    }));
    // Dedupe replays against the partial unique index
    // workflow_queue_idem_uidx (workspace_id, automation_id, idempotency_key)
    // WHERE idempotency_key IS NOT NULL. supabase-js can't express the partial
    // ON CONFLICT predicate, so select existing keys first, then insert.
    let toInsert = rows;
    if (data.idempotencyKey) {
      const { data: existing, error: exErr } = await supabase
        .from("workflow_queue")
        .select("workspace_id, automation_id")
        .eq("idempotency_key", data.idempotencyKey)
        .in("automation_id", rows.map((r) => r.automation_id));
      if (exErr) throw new Error(exErr.message);
      const seen = new Set((existing ?? []).map((e) => `${e.workspace_id}:${e.automation_id}`));
      toInsert = rows.filter((r) => !seen.has(`${r.workspace_id}:${r.automation_id}`));
    }
    if (!toInsert.length) return { enqueued: 0 };
    const { error: qErr } = await supabase.from("workflow_queue").insert(toInsert);
    // 23505 = a concurrent replay won the race; the unique index kept it safe.
    if (qErr && qErr.code !== "23505") throw new Error(qErr.message);
    return { enqueued: toInsert.length };
  });


/* ------------------------------- Publish / version ------------------------ */

const PublishInput = z.object({
  automationId: z.string().uuid(),
  changelog: z.string().optional(),
  activate: z.boolean().default(true),
});

export const publishWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => PublishInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: automation, error } = await supabase
      .from("automations")
      .select("id, workspace_id, name, description, graph, trigger_type, trigger_config, version")
      .eq("id", data.automationId)
      .single();
    if (error || !automation) throw new Error("Automation not found");

    // Server-side gate: never publish a graph the engine cannot execute.
    const graph = (automation.graph ?? { nodes: [], edges: [] }) as WorkflowGraph;
    const { validateGraph } = await import("./validation");
    const blocking = validateGraph(graph).filter((i) => i.level === "error");
    if (blocking.length > 0) {
      throw new Error(`Cannot publish — fix ${blocking.length} validation error(s): ${blocking[0].message}`);
    }

    // Version numbers are unique per automation. Two concurrent publishes race
    // on that constraint, so retry with a re-read version instead of failing.
    let nextVersion = (automation.version ?? 1) + 1;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error: vErr } = await sbAny(supabase).from("workflow_versions").insert({
        workspace_id: automation.workspace_id,
        automation_id: automation.id,
        version: nextVersion,
        graph: automation.graph as any,
        trigger_type: automation.trigger_type,
        trigger_config: automation.trigger_config as any,
        created_by: userId,
      });
      if (!vErr) break;
      const isConflict = vErr.code === "23505";
      if (!isConflict || attempt === 2) throw new Error(vErr.message);
      const { data: latest } = await supabase
        .from("workflow_versions")
        .select("version")
        .eq("automation_id", automation.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      nextVersion = Math.max(nextVersion, (latest?.version ?? nextVersion)) + 1;
    }

    const { error: uErr } = await supabase
      .from("automations")
      .update({
        version: nextVersion,
        status: data.activate ? "active" : "paused",
      })
      .eq("id", automation.id);
    if (uErr) throw new Error(uErr.message);

    return { version: nextVersion, status: data.activate ? "active" : "paused" };
  });

/* -------------------------------- Unpublish ------------------------------- */

/**
 * Take a live workflow out of service without deleting it or its versions.
 * Queued jobs are cancelled so nothing fires after the operator pauses it.
 */
export const unpublishWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({ automationId: z.string().uuid(), cancelQueued: z.boolean().default(true) })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("automations")
      .update({ status: "paused" })
      .eq("id", data.automationId);
    if (error) throw new Error(error.message);

    let cancelled = 0;
    if (data.cancelQueued) {
      const { data: rows } = await supabase
        .from("workflow_queue")
        .update({ status: "cancelled" })
        .eq("automation_id", data.automationId)
        .eq("status", "queued")
        .select("id");
      cancelled = rows?.length ?? 0;
    }
    return { status: "paused" as const, cancelled };
  });

/* ------------------------------- Cancel job ------------------------------- */

export const cancelQueueJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ jobId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("workflow_queue")
      .update({ status: "cancelled" })
      .eq("id", data.jobId)
      .in("status", ["queued"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------- Retry job ------------------------------- */

export const retryQueueJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ jobId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("workflow_queue")
      .update({
        status: "queued",
        run_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", data.jobId)
      .in("status", ["failed", "retry", "cancelled"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------- Bulk retry all failed / retry jobs ------------------- */

export const bulkRetryFailedJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({ olderThanHours: z.number().int().min(0).max(720).optional() }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const cutoff = new Date(Date.now() - (data.olderThanHours ?? 168) * 3600_000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("workflow_queue")
      .update({ status: "queued", run_at: new Date().toISOString(), last_error: null })
      .in("status", ["failed", "retry"])
      .gte("updated_at", cutoff)
      .is("dead_lettered_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    return { requeued: rows?.length ?? 0 };
  });

/* ------------------- Dead-letter a job (stop retrying) -------------------- */

export const deadLetterJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ jobId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("workflow_queue")
      .update({ status: "failed", dead_lettered_at: new Date().toISOString() })
      .eq("id", data.jobId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* --------------- Recover runs stuck in `running` past a ceiling ---------- */

export const recoverStuckRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({ olderThanMinutes: z.number().int().min(1).max(1440).default(10) }).parse(v),
  )
  .handler(async ({ data, context }) => {
    const cutoff = new Date(Date.now() - data.olderThanMinutes * 60_000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("workflow_runs")
      .update({
        status: "failed",
        error: { message: `Run exceeded ${data.olderThanMinutes}m without completing` } as any,
        finished_at: new Date().toISOString(),
      })
      .eq("status", "running")
      .lt("started_at", cutoff)
      .select("id");
    if (error) throw new Error(error.message);
    return { recovered: rows?.length ?? 0 };
  });

/* --------------------------------- Test run ------------------------------- */



const TestRunInput = z.object({
  automationId: z.string().uuid(),
  graph: z.object({
    nodes: z.array(z.record(z.unknown())),
    edges: z.array(z.record(z.unknown())),
  }).optional(),
  input: z.record(z.unknown()).default({}),
});

/**
 * Dry-run the current in-editor graph without side effects. Uses the passed
 * graph (unsaved) if provided, otherwise the persisted graph. Never mutates
 * external state — AI nodes short-circuit and actions return { skipped: true }.
 */
export const testRunWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => TestRunInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: automation, error } = await supabase
      .from("automations")
      .select("id, workspace_id, version, runs_count, graph")
      .eq("id", data.automationId)
      .single();
    if (error || !automation) throw new Error("Automation not found");

    const graph = (data.graph as WorkflowGraph | undefined) ??
      ((automation.graph ?? { nodes: [], edges: [] }) as WorkflowGraph);

    const { executeAutomation } = await import("./engine.server");
    const result = await executeAutomation({
      supabase,
      automation: {
        id: automation.id,
        workspace_id: automation.workspace_id,
        version: automation.version,
        graph,
        runs_count: automation.runs_count,
      },
      triggerSource: "test",
      input: data.input,
      actorUserId: userId,
      dryRun: true,
    });

    const { data: steps } = await supabase
      .from("workflow_run_steps")
      .select("node_id, node_type, status, output, error, duration_ms, sort_order")
      .eq("run_id", result.runId)
      .order("sort_order", { ascending: true });

    return {
      runId: result.runId,
      status: result.status,
      error: result.error,
      durationMs: result.durationMs,
      steps: steps ?? [],
    };
  });
