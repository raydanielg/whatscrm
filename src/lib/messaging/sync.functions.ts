/**
 * Server functions for synchronization services.
 *
 * All entry points are `.middleware([requireSupabaseAuth])` gated and require
 * the caller to be a workspace admin. The heavy lifting lives in
 * `sync.server.ts` (loaded via dynamic import — do not lift these imports
 * to the module scope: `.functions.ts` files are client-reachable, and only
 * handler bodies get stripped from client bundles).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sbAny } from "@/lib/supabase/untyped";

const SyncKindEnum = z.enum([
  "templates",
  "business_profile",
  "phone_numbers",
  "media_cleanup",
  "webhook_drain",
  "outbox_drain",
  "scheduled_messages",
  "contacts_reconcile",
  "conversations_reconcile",
  "status_reconcile",
  "account_health",
]);

async function assertWorkspaceAdmin(
  supabase: { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown }> },
  workspaceId: string,
  userId: string,
) {
  const { data } = await sbAny(supabase).rpc("has_workspace_role", {
    _workspace_id: workspaceId,
    _user_id: userId,
    _roles: ["owner", "admin"],
  });
  if (!data) throw new Error("Only workspace admins can trigger syncs");
}

// ---------------------------------------------------------------------------
// runSyncNow
// ---------------------------------------------------------------------------

export const runSyncNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        kind: SyncKindEnum,
        channelAccountId: z.string().uuid().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertWorkspaceAdmin(
      context.supabase as unknown as Parameters<typeof assertWorkspaceAdmin>[0],
      data.workspaceId,
      context.userId,
    );
    const { runSync } = await import("./sync.server");
    const res = await runSync({
      workspaceId: data.workspaceId,
      channelAccountId: data.channelAccountId ?? null,
      kind: data.kind,
      triggeredBy: context.userId,
      triggerSource: "manual",
    });
    return {
      jobId: res.jobId,
      status: res.status as string,
      processed: res.processed,
      succeeded: res.succeeded,
      failed: res.failed,
      durationMs: res.durationMs,
      error: res.error ?? null,
      metadataJson: JSON.stringify(res.metadata ?? {}),
    };
  });

// ---------------------------------------------------------------------------
// runAllSyncsForAccount — orchestrate the full stack for one account
// ---------------------------------------------------------------------------

export const runAllSyncsForAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ workspaceId: z.string().uuid(), channelAccountId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertWorkspaceAdmin(
      context.supabase as unknown as Parameters<typeof assertWorkspaceAdmin>[0],
      data.workspaceId,
      context.userId,
    );
    const { runSync } = await import("./sync.server");
    const kinds: Array<z.infer<typeof SyncKindEnum>> = [
      "account_health",
      "business_profile",
      "phone_numbers",
      "templates",
    ];
    const results = [] as Array<{ kind: string; jobId: string; status: string }>;
    for (const kind of kinds) {
      try {
        const r = await runSync({
          workspaceId: data.workspaceId,
          channelAccountId: data.channelAccountId,
          kind,
          triggeredBy: context.userId,
          triggerSource: "manual",
        });
        results.push({ kind, jobId: r.jobId, status: r.status });
      } catch (err) {
        results.push({ kind, jobId: "", status: "failed" });
        void err;
      }
    }
    return { results };
  });

// ---------------------------------------------------------------------------
// listSyncJobs
// ---------------------------------------------------------------------------

export const listSyncJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        limit: z.number().int().min(1).max(200).default(50),
        kind: SyncKindEnum.optional(),
        channelAccountId: z.string().uuid().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("sync_jobs" as never)
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("started_at", { ascending: false })
      .limit(data.limit);
    if (data.kind) q = q.eq("kind", data.kind);
    if (data.channelAccountId) q = q.eq("channel_account_id", data.channelAccountId);
    const { data: jobs, error } = await q;
    if (error) throw new Error(error.message);
    return { jobs: jobs ?? [] };
  });

// ---------------------------------------------------------------------------
// listSyncCursors
// ---------------------------------------------------------------------------

export const listSyncCursors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: cursors, error } = await context.supabase
      .from("sync_cursors" as never)
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { cursors: cursors ?? [] };
  });

// ---------------------------------------------------------------------------
// syncStatistics — aggregate summary for dashboard
// ---------------------------------------------------------------------------

export const syncStatistics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("sync_jobs" as never)
      .select("kind, status, duration_ms, items_processed, items_succeeded, items_failed")
      .eq("workspace_id", data.workspaceId)
      .gte("started_at", since);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<{
      kind: string;
      status: string;
      duration_ms: number | null;
      items_processed: number;
      items_succeeded: number;
      items_failed: number;
    }>;
    const summary: Record<string, {
      total: number; success: number; partial: number; failed: number;
      processed: number; succeeded: number; itemFailed: number; avgMs: number;
    }> = {};
    for (const r of list) {
      const s = (summary[r.kind] ??= {
        total: 0, success: 0, partial: 0, failed: 0,
        processed: 0, succeeded: 0, itemFailed: 0, avgMs: 0,
      });
      s.total += 1;
      if (r.status === "success") s.success += 1;
      else if (r.status === "partial") s.partial += 1;
      else if (r.status === "failed") s.failed += 1;
      s.processed += r.items_processed;
      s.succeeded += r.items_succeeded;
      s.itemFailed += r.items_failed;
      s.avgMs = (s.avgMs * (s.total - 1) + (r.duration_ms ?? 0)) / s.total;
    }
    return { window: "24h", byKind: summary, totalRuns: list.length };
  });
