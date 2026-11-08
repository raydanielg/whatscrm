/**
 * Backup Management — enterprise backup, restore & scheduling engine.
 * Workspace-scoped, RLS enforced. Pluggable destinations (local,
 * S3, GCS, Azure Blob, R2, Wasabi, Backblaze, local) for future cloud
 * provider expansion.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sbAny } from "@/lib/supabase/untyped";
import { BACKUP_ENGINE, requireBackupEngine } from "./engine";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

/* -------------------------------------------------- types */

export type BackupScope = "database" | "storage" | "media" | "config" | "full";
export type BackupType = "full" | "incremental";
export type BackupDestination =
  | "lovable_cloud" | "s3" | "gcs" | "azure_blob" | "r2" | "wasabi" | "backblaze" | "local";
export type BackupStatus =
  | "queued" | "running" | "completed" | "failed" | "verifying" | "verified"
  | "restoring" | "restored" | "cancelled";

export type BackupJob = {
  id: string;
  workspace_id: string;
  schedule_id: string | null;
  parent_backup_id: string | null;
  scope: BackupScope;
  backup_type: BackupType;
  status: BackupStatus;
  trigger: string;
  destination: BackupDestination;
  destination_config: Record<string, any>;
  storage_path: string | null;
  size_bytes: number;
  compressed_size_bytes: number;
  is_encrypted: boolean;
  encryption_algorithm: string;
  encryption_key_id: string | null;
  checksum: string | null;
  verified: boolean;
  verified_at: string | null;
  verification_details: Record<string, any>;
  restore_point_lsn: string | null;
  point_in_time: string | null;
  manifest: Record<string, any>;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  created_at: string;
};

export type BackupSchedule = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  scope: BackupScope;
  backup_type: BackupType;
  cron_expression: string;
  timezone: string;
  retention_days: number;
  keep_last_n: number;
  destination: BackupDestination;
  destination_config: Record<string, any>;
  is_encrypted: boolean;
  notify_on_success: boolean;
  notify_on_failure: boolean;
  notify_emails: string[];
  is_active: boolean;
  last_run_at: string | null;
  last_status: BackupStatus | null;
  next_run_at: string | null;
  created_at: string;
};

export type RestoreOperation = {
  id: string;
  workspace_id: string;
  backup_id: string | null;
  restore_mode: "preview" | "in_place" | "new_workspace" | "point_in_time";
  point_in_time: string | null;
  status: BackupStatus;
  preview_summary: Record<string, any>;
  affected_tables: string[];
  restored_rows: number;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type BackupOverview = {
  generated_at: string;
  health_score: number;
  posture: "healthy" | "at-risk" | "critical";
  metrics: {
    total_backups: number;
    successful_last_30d: number;
    failed_last_30d: number;
    verified_backups: number;
    encrypted_backups: number;
    total_size_bytes: number;
    active_schedules: number;
    last_successful_at: string | null;
    hours_since_last_backup: number | null;
    restore_operations_30d: number;
  };
  scope_breakdown: Array<{ scope: BackupScope; count: number; total_size: number }>;
  destination_breakdown: Array<{ destination: BackupDestination; count: number }>;
  recent_jobs: BackupJob[];
  /** Whether anything on this deployment can actually produce / verify / restore a backup. */
  engine: { available: boolean; reason: string };
};

/* -------------------------------------------------- helpers */

async function getWorkspaceId(supabase: SB, userId: string): Promise<string | null> {
  // The workspace the caller is viewing — not an arbitrary membership row.
  const { resolveActiveWorkspaceId } = await import("@/lib/auth/active-workspace.server");
  return resolveActiveWorkspaceId(supabase, userId);
}

function computeHealth(m: BackupOverview["metrics"]): { score: number; posture: BackupOverview["posture"] } {
  let score = 100;
  if (m.total_backups === 0) return { score: 0, posture: "critical" };
  if (m.failed_last_30d > 0) score -= Math.min(30, m.failed_last_30d * 5);
  if (m.hours_since_last_backup !== null) {
    if (m.hours_since_last_backup > 72) score -= 30;
    else if (m.hours_since_last_backup > 48) score -= 15;
    else if (m.hours_since_last_backup > 24) score -= 5;
  }
  if (m.active_schedules === 0) score -= 20;
  const encRatio = m.total_backups > 0 ? m.encrypted_backups / m.total_backups : 1;
  if (encRatio < 0.9) score -= 15;
  const verRatio = m.total_backups > 0 ? m.verified_backups / m.total_backups : 0;
  if (verRatio < 0.5) score -= 10;
  score = Math.max(0, Math.min(100, score));
  const posture: BackupOverview["posture"] =
    score >= 80 ? "healthy" : score >= 50 ? "at-risk" : "critical";
  return { score, posture };
}

function nextRunAtFromCron(cron: string): string {
  // Simple heuristic: default to +24h for display when parsing not available server-side.
  // Real scheduler will overwrite this on actual dispatch.
  void cron;
  return new Date(Date.now() + 24 * 3600_000).toISOString();
}

/* -------------------------------------------------- overview */

export const getBackupOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BackupOverview> => {
    const { supabase, userId } = context;
    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * 24 * 3600_000).toISOString();
    const workspaceId = await getWorkspaceId(supabase, userId);
    const empty: BackupOverview = {
      generated_at: now.toISOString(),
      health_score: 0,
      posture: "critical",
      metrics: {
        total_backups: 0, successful_last_30d: 0, failed_last_30d: 0,
        verified_backups: 0, encrypted_backups: 0, total_size_bytes: 0,
        active_schedules: 0, last_successful_at: null,
        hours_since_last_backup: null, restore_operations_30d: 0,
      },
      scope_breakdown: [], destination_breakdown: [], recent_jobs: [],
      engine: BACKUP_ENGINE,
    };
    if (!workspaceId) return empty;

    const { data: jobsData } = await supabase
      .from("backup_jobs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(200);
    const jobs: BackupJob[] = (jobsData ?? []) as BackupJob[];

    const jobs30 = jobs.filter((j) => j.created_at >= d30);
    const success = jobs30.filter((j) => ["completed", "verified"].includes(j.status));
    const failed = jobs30.filter((j) => j.status === "failed");
    const verified = jobs.filter((j) => j.verified);
    const encrypted = jobs.filter((j) => j.is_encrypted);
    const totalSize = jobs.reduce((n, j) => n + (j.size_bytes ?? 0), 0);
    const lastSuccess = jobs.find((j) => ["completed", "verified"].includes(j.status));
    const hoursSince = lastSuccess?.completed_at
      ? Math.round((now.getTime() - new Date(lastSuccess.completed_at).getTime()) / 3600_000)
      : null;

    const { count: schedCount } = await supabase
      .from("backup_schedules").select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId).eq("is_active", true);
    const { count: restoreCount } = await supabase
      .from("backup_restore_operations").select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId).gte("created_at", d30);

    const scopeMap = new Map<BackupScope, { count: number; total_size: number }>();
    const destMap = new Map<BackupDestination, number>();
    for (const j of jobs) {
      const s = scopeMap.get(j.scope) ?? { count: 0, total_size: 0 };
      s.count += 1; s.total_size += j.size_bytes ?? 0;
      scopeMap.set(j.scope, s);
      destMap.set(j.destination, (destMap.get(j.destination) ?? 0) + 1);
    }

    const metrics = {
      total_backups: jobs.length,
      successful_last_30d: success.length,
      failed_last_30d: failed.length,
      verified_backups: verified.length,
      encrypted_backups: encrypted.length,
      total_size_bytes: totalSize,
      active_schedules: schedCount ?? 0,
      last_successful_at: lastSuccess?.completed_at ?? null,
      hours_since_last_backup: hoursSince,
      restore_operations_30d: restoreCount ?? 0,
    };
    const { score, posture } = computeHealth(metrics);

    return {
      generated_at: now.toISOString(),
      health_score: score,
      posture,
      metrics,
      scope_breakdown: Array.from(scopeMap.entries()).map(([scope, v]) => ({ scope, ...v })),
      destination_breakdown: Array.from(destMap.entries()).map(([destination, count]) => ({ destination, count })),
      recent_jobs: jobs.slice(0, 25),
      engine: BACKUP_ENGINE,
    };
  });

/* -------------------------------------------------- jobs */

export const listBackupJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BackupJob[]> => {
    const { supabase } = context;
    const { data } = await supabase
      .from("backup_jobs").select("*")
      .order("created_at", { ascending: false }).limit(200);
    return (data ?? []) as BackupJob[];
  });

const CreateBackupInput = z.object({
  scope: z.enum(["database", "storage", "media", "config", "full"]),
  backup_type: z.enum(["full", "incremental"]).default("full"),
  destination: z.enum(["s3", "gcs", "azure_blob", "r2", "wasabi", "backblaze", "local"]).default("local"),
  destination_config: z.record(z.string(), z.any()).default({}),
  is_encrypted: z.boolean().default(true),
  encryption_algorithm: z.string().default("AES-256-GCM"),
  parent_backup_id: z.string().uuid().nullable().optional(),
  schedule_id: z.string().uuid().nullable().optional(),
  trigger: z.string().default("manual"),
});

export const createBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => CreateBackupInput.parse(v))
  .handler(async ({ data, context }): Promise<BackupJob> => {
    requireBackupEngine("Creating a backup");
    const { supabase, userId } = context;
    const workspaceId = await getWorkspaceId(supabase, userId);
    if (!workspaceId) throw new Error("No workspace");
    const now = new Date().toISOString();
    const { data: row, error } = await supabase
      .from("backup_jobs")
      .insert({
        workspace_id: workspaceId,
        scope: data.scope,
        backup_type: data.backup_type,
        destination: data.destination,
        destination_config: data.destination_config,
        is_encrypted: data.is_encrypted,
        encryption_algorithm: data.encryption_algorithm,
        parent_backup_id: data.parent_backup_id ?? null,
        schedule_id: data.schedule_id ?? null,
        trigger: data.trigger,
        status: "queued",
        started_at: now,
        created_by: userId,
        manifest: { requested_at: now, scope: data.scope, type: data.backup_type },
      })
      .select("*").single();
    if (error) throw new Error(error.message);
    return row as BackupJob;
  });

export const cancelBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("backup_jobs")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("id", data.id).in("status", ["queued", "running"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase).from("backup_jobs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const verifyBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }): Promise<BackupJob> => {
    // This used to write checksum_ok / manifest_ok / restorable = true without
    // reading a single byte. Verification must inspect a stored file, and no
    // engine produces one — so refuse instead of vouching for a backup.
    requireBackupEngine("Verifying a backup");
    const now = new Date().toISOString();
    const details = {
      checksum_ok: true,
      manifest_ok: true,
      restorable: true,
      verified_at: now,
    };
    const { data: row, error } = await context.supabase
      .from("backup_jobs")
      .update({
        verified: true,
        verified_at: now,
        status: "verified",
        verification_details: details,
      })
      .eq("id", data.id).select("*").single();
    if (error) throw new Error(error.message);
    return row as BackupJob;
  });

/* -------------------------------------------------- schedules */

export const listBackupSchedules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BackupSchedule[]> => {
    const { data } = await context.supabase
      .from("backup_schedules").select("*")
      .order("created_at", { ascending: false });
    return (data ?? []) as BackupSchedule[];
  });

const UpsertScheduleInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
  scope: z.enum(["database", "storage", "media", "config", "full"]),
  backup_type: z.enum(["full", "incremental"]).default("full"),
  cron_expression: z.string().min(9).max(120),
  timezone: z.string().default("UTC"),
  retention_days: z.number().int().min(1).max(3650).default(30),
  keep_last_n: z.number().int().min(1).max(1000).default(30),
  destination: z.enum(["s3", "gcs", "azure_blob", "r2", "wasabi", "backblaze", "local"]).default("local"),
  destination_config: z.record(z.string(), z.any()).default({}),
  is_encrypted: z.boolean().default(true),
  notify_on_success: z.boolean().default(false),
  notify_on_failure: z.boolean().default(true),
  notify_emails: z.array(z.string().email()).default([]),
  is_active: z.boolean().default(true),
});

export const upsertBackupSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => UpsertScheduleInput.parse(v))
  .handler(async ({ data, context }): Promise<BackupSchedule> => {
    // Nothing runs schedules, and `destination_config` would store cloud
    // credentials in a plaintext column for a job that never executes.
    requireBackupEngine("Saving a backup schedule");
    const { supabase, userId } = context;
    const workspaceId = await getWorkspaceId(supabase, userId);
    if (!workspaceId) throw new Error("No workspace");
    const { id, ...fields } = data;
    const payload: any = {
      workspace_id: workspaceId,
      created_by: userId,
      next_run_at: nextRunAtFromCron(data.cron_expression),
      ...fields,
    };
    if (id) {
      const { data: row, error } = await supabase
        .from("backup_schedules").update(payload).eq("id", id).select("*").single();
      if (error) throw new Error(error.message);
      return row as BackupSchedule;
    }
    const { data: row, error } = await supabase
      .from("backup_schedules").insert(payload).select("*").single();
    if (error) throw new Error(error.message);
    return row as BackupSchedule;
  });

export const deleteBackupSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { error } = await sbAny(context.supabase).from("backup_schedules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleBackupSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(v))
  .handler(async ({ data, context }) => {
    // Pausing is always safe; ACTIVATING a schedule that nothing will run is not.
    if (data.is_active) requireBackupEngine("Activating a backup schedule");
    const { error } = await context.supabase
      .from("backup_schedules").update({ is_active: data.is_active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------------------------- restore */

export const listRestoreOperations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RestoreOperation[]> => {
    const { data } = await context.supabase
      .from("backup_restore_operations").select("*")
      .order("created_at", { ascending: false }).limit(100);
    return (data ?? []) as RestoreOperation[];
  });

const RestoreInput = z.object({
  backup_id: z.string().uuid().nullable().optional(),
  restore_mode: z.enum(["preview", "in_place", "new_workspace", "point_in_time"]),
  point_in_time: z.string().datetime().nullable().optional(),
});

export const previewRestore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => RestoreInput.parse(v))
  .handler(async ({ data, context }): Promise<RestoreOperation> => {
    // The preview below lists a hard-coded set of tables and estimates a duration
    // from a size that is always 0; it does not inspect any backup.
    requireBackupEngine("Previewing a restore");
    const { supabase, userId } = context;
    const workspaceId = await getWorkspaceId(supabase, userId);
    if (!workspaceId) throw new Error("No workspace");

    let manifest: Record<string, any> = {};
    let size = 0;
    if (data.backup_id) {
      const { data: backup } = await supabase
        .from("backup_jobs").select("manifest, size_bytes, scope, backup_type, created_at")
        .eq("id", data.backup_id).maybeSingle();
      manifest = (backup?.manifest as Record<string, any>) ?? {};
      size = (backup?.size_bytes as number) ?? 0;
    }

    const summary = {
      backup_id: data.backup_id,
      point_in_time: data.point_in_time,
      estimated_size_bytes: size,
      estimated_duration_minutes: Math.max(1, Math.round(size / (1024 * 1024 * 20))),
      tables_to_restore: [
        "conversations", "messages", "contacts", "deals", "invoices",
        "campaigns", "workflow_runs", "settings",
      ],
      warnings: [
        data.restore_mode === "in_place"
          ? "In-place restore will overwrite current workspace data."
          : "Restoring into a new isolated workspace.",
      ],
      manifest,
    };

    const { data: op, error } = await supabase
      .from("backup_restore_operations")
      .insert({
        workspace_id: workspaceId,
        backup_id: data.backup_id ?? null,
        restore_mode: data.restore_mode,
        point_in_time: data.point_in_time ?? null,
        status: "queued",
        preview_summary: summary,
        affected_tables: summary.tables_to_restore,
        created_by: userId,
      })
      .select("*").single();
    if (error) throw new Error(error.message);
    return op as RestoreOperation;
  });

export const executeRestore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => z.object({ operation_id: z.string().uuid(), confirm: z.literal(true) }).parse(v))
  .handler(async ({ data, context }): Promise<RestoreOperation> => {
    // It used to mark the operation "restoring" and do nothing further.
    requireBackupEngine("Restoring a backup");
    const now = new Date().toISOString();
    const { data: op, error } = await context.supabase
      .from("backup_restore_operations")
      .update({
        status: "restoring",
        started_at: now,
      })
      .eq("id", data.operation_id).select("*").single();
    if (error) throw new Error(error.message);
    return op as RestoreOperation;
  });

/* -------------------------------------------------- notifications */

export const listBackupNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("backup_notifications").select("*")
      .order("created_at", { ascending: false }).limit(50);
    return (data ?? []);
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    await sbAny(context.supabase).from("backup_notifications").update({ is_read: true }).eq("id", data.id);
    return { ok: true };
  });
