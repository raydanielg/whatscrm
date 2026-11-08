// Server-only: claim queued export jobs, generate the file, upload to storage, mark done.
// Runs from a public webhook triggered by pg_cron. Uses supabaseAdmin (RLS bypass) because
// the pg_cron caller has no user session; scope every query by workspace_id from the job row.
import { RECURRENCE_CRON, type ExportFormat, type ExportRecurrence } from "./types";
import { fetchDataset } from "./data-fetchers.server";
import { generate } from "./generators.server";
import { sbAny } from "@/lib/supabase/untyped";

function nextRunFromRecurrence(recurrence: ExportRecurrence, from: Date = new Date()): Date | null {
  if (recurrence === "once") return null;
  const d = new Date(from);
  switch (recurrence) {
    case "daily": d.setUTCDate(d.getUTCDate() + 1); break;
    case "weekly": d.setUTCDate(d.getUTCDate() + 7); break;
    case "monthly": d.setUTCMonth(d.getUTCMonth() + 1); break;
    case "quarterly": d.setUTCMonth(d.getUTCMonth() + 3); break;
    case "yearly": d.setUTCFullYear(d.getUTCFullYear() + 1); break;
  }
  d.setUTCHours(8, 0, 0, 0);
  return d;
}

interface JobRow {
  id: string;
  workspace_id: string;
  created_by: string;
  name: string;
  dataset: string;
  format: ExportFormat;
  report_id: string | null;
  filters: Record<string, unknown> | null;
  recurrence: ExportRecurrence;
  attempts: number;
}

export async function processExportBatch(limit = 3): Promise<{ processed: number; errors: number }> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const worker = `worker-${Math.random().toString(36).slice(2, 8)}`;
  const { data: claimed, error: claimErr } = await sbAny(supabaseAdmin).rpc("export_jobs_claim_batch", {
    _worker: worker, _limit: limit,
  });
  if (claimErr) throw claimErr;
  const jobs = (claimed ?? []) as unknown as JobRow[];
  let processed = 0, errors = 0;
  for (const job of jobs) {
    const started = Date.now();
    try {
      const wsResp = await sbAny(supabaseAdmin).from("workspaces").select("name").eq("id", job.workspace_id).maybeSingle();
      const profileResp = await sbAny(supabaseAdmin).from("profiles").select("full_name,email").eq("id", job.created_by).maybeSingle();

      const result = await fetchDataset(
        supabaseAdmin as unknown as Parameters<typeof fetchDataset>[0],
        job.workspace_id,
        job.dataset as Parameters<typeof fetchDataset>[2],
        (job.filters ?? {}) as Parameters<typeof fetchDataset>[3],
        job.report_id,
      );
      const file = await generate(result, job.format, {
        workspaceName: wsResp.data?.name ?? undefined,
        generatedBy: profileResp.data?.full_name ?? profileResp.data?.email ?? undefined,
      });

      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const safeName = job.name.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60) || "export";
      const path = `${job.workspace_id}/${job.id}/${stamp}-${safeName}.${file.extension}`;
      const { error: upErr } = await supabaseAdmin.storage.from("exports").upload(path, file.bytes, {
        contentType: file.contentType, upsert: true,
      });
      if (upErr) throw upErr;

      const next = nextRunFromRecurrence(job.recurrence);
      const isRecurring = job.recurrence !== "once";
      await sbAny(supabaseAdmin).from("export_jobs").update({
        status: isRecurring ? "queued" : "success",
        file_path: path,
        file_bucket: "exports",
        file_size: file.bytes.byteLength,
        row_count: result.rows.length,
        duration_ms: Date.now() - started,
        finished_at: new Date().toISOString(),
        last_run_at: new Date().toISOString(),
        next_run_at: next ? next.toISOString() : null,
        cron: isRecurring ? RECURRENCE_CRON[job.recurrence as Exclude<ExportRecurrence, "once">] : null,
        error: null,
        locked_at: null, locked_by: null,
      }).eq("id", job.id);

      if (isRecurring) {
        await sbAny(supabaseAdmin).from("export_jobs").insert({
          workspace_id: job.workspace_id,
          created_by: job.created_by,
          name: `${job.name} — ${new Date().toLocaleDateString()}`,
          dataset: job.dataset as JobRow["dataset"] as never,
          format: job.format,
          report_id: job.report_id,
          filters: (job.filters ?? {}) as never,
          status: "success",
          recurrence: "once",
          file_path: path,
          file_bucket: "exports",
          file_size: file.bytes.byteLength,
          row_count: result.rows.length,
          duration_ms: Date.now() - started,
          finished_at: new Date().toISOString(),
          started_at: new Date(started).toISOString(),
          visibility: "workspace",
        });
      }
      processed++;
    } catch (err) {
      errors++;
      const shouldRetry = job.attempts < 3;
      await sbAny(supabaseAdmin).from("export_jobs").update({
        status: shouldRetry ? "queued" : "failed",
        error: (err as Error)?.message?.slice(0, 500) ?? "Unknown error",
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - started,
        locked_at: null, locked_by: null,
        next_run_at: shouldRetry ? new Date(Date.now() + 60_000 * Math.pow(2, job.attempts)).toISOString() : null,
      }).eq("id", job.id);
    }
  }
  return { processed, errors };
}
