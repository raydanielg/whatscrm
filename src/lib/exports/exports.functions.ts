// Server functions for the Export Center — client-safe module (no top-level server-only imports).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { RECURRENCE_CRON } from "./types";
import { sbAny } from "@/lib/supabase/untyped";

const uuid = z.string().uuid();

const createInput = z.object({
  workspaceId: uuid,
  name: z.string().min(1).max(160),
  description: z.string().max(500).optional(),
  dataset: z.enum(["report", "crm_contacts", "crm_companies", "crm_deals", "crm_leads", "campaigns", "conversations", "messages", "tasks", "activities"]),
  format: z.enum(["pdf", "excel", "csv", "json"]),
  reportId: uuid.optional().nullable(),
  filters: z.record(z.string(), z.unknown()).optional().default({}),
  columns: z.array(z.string()).optional().default([]),
  recurrence: z.enum(["once", "daily", "weekly", "monthly", "quarterly", "yearly"]).default("once"),
  visibility: z.enum(["private", "workspace"]).default("private"),
  runAt: z.string().datetime().optional().nullable(),
});

export const createExportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: z.input<typeof createInput>) => createInput.parse(d))
  .handler(async ({ data, context }) => {
    const cron = data.recurrence === "once" ? null : RECURRENCE_CRON[data.recurrence];
    const next_run_at = data.runAt ?? new Date().toISOString();
    const { data: row, error } = await sbAny(context.supabase).from("export_jobs").insert({
      workspace_id: data.workspaceId,
      created_by: context.userId,
      name: data.name,
      description: data.description ?? null,
      dataset: data.dataset,
      format: data.format,
      report_id: data.reportId ?? null,
      filters: (data.filters ?? {}) as never,
      columns: data.columns ?? [],
      recurrence: data.recurrence,
      cron,
      next_run_at,
      status: "queued",
      visibility: data.visibility,
    }).select("*").single();
    if (error) throw error;
    return row;
  });

export const listExportJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string; scope?: "all" | "scheduled" | "history" }) =>
    z.object({ workspaceId: uuid, scope: z.enum(["all", "scheduled", "history"]).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    let q = sbAny(context.supabase).from("export_jobs").select("*").eq("workspace_id", data.workspaceId).order("created_at", { ascending: false }).limit(200);
    if (data.scope === "scheduled") q = q.neq("recurrence", "once");
    if (data.scope === "history") q = q.eq("recurrence", "once");
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const cancelExportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase).from("export_jobs").update({ status: "cancelled", next_run_at: null }).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const retryExportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase).from("export_jobs").update({
      status: "queued", error: null, next_run_at: new Date().toISOString(), attempts: 0,
    }).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteExportJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await sbAny(context.supabase).from("export_jobs").select("file_path,file_bucket").eq("id", data.id).maybeSingle();
    if (row?.file_path && row.file_bucket) {
      await context.supabase.storage.from(row.file_bucket).remove([row.file_path]);
    }
    const { error } = await sbAny(context.supabase).from("export_jobs").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const getExportDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await sbAny(context.supabase).from("export_jobs").select("file_path,file_bucket,name,format").eq("id", data.id).maybeSingle();
    if (error) throw error;
    if (!row?.file_path || !row.file_bucket) throw new Error("File not ready");
    const { data: signed, error: sErr } = await context.supabase.storage.from(row.file_bucket).createSignedUrl(row.file_path, 60 * 10);
    if (sErr) throw sErr;
    return { url: signed.signedUrl, name: row.name, format: row.format };
  });

export const listReportOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: { workspaceId: string }) => z.object({ workspaceId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await sbAny(context.supabase).from("bi_reports").select("id,name").eq("workspace_id", data.workspaceId).order("name");
    if (error) throw error;
    return rows ?? [];
  });
