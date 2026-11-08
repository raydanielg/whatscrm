/**
 * Calendar Management — server functions for personal / team / organization
 * calendar entries: working hours, break time, vacation, holidays, blocked
 * dates, recurring availability / unavailability.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";

async function getWorkspaceId(userId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  // Canonical active-workspace resolution (header hint verified against
  // membership, deterministic fallback) instead of an arbitrary membership row.
  const { resolveActiveWorkspaceId } = await import("@/lib/auth/active-workspace.server");
  const workspaceId = await resolveActiveWorkspaceId(supabaseAdmin, userId);
  if (!workspaceId) throw new Error("No workspace found");
  return workspaceId;
}

const entrySchema = z.object({
  id: z.string().uuid().optional(),
  scope: z.enum(["personal", "team", "organization"]).default("personal"),
  owner_id: z.string().uuid().nullable().optional(),
  team_id: z.string().uuid().nullable().optional(),
  kind: z.enum([
    "working_hours", "break", "vacation", "holiday",
    "blocked", "custom", "recurring_available", "recurring_unavailable",
  ]),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  color: z.string().max(16).nullable().optional(),
  start_at: z.string(),
  end_at: z.string(),
  all_day: z.boolean().default(false),
  timezone: z.string().max(64).default("UTC"),
  rrule: z.string().max(500).nullable().optional(),
  is_blocking: z.boolean().default(true),
  metadata: z.record(z.any()).default({}),
});

export const listCalendarEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { start?: string; end?: string; scope?: string; kind?: string }) => data)
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    let query = context.supabase
      .from("calendar_entries")
      .select("*")
      .eq("workspace_id", workspaceId);

    if (data.start) query = query.gte("end_at", data.start);
    if (data.end) query = query.lte("start_at", data.end);
    if (data.scope) query = query.eq("scope", data.scope as "personal" | "team" | "organization");
    if (data.kind) query = query.eq("kind", data.kind as "working_hours" | "break" | "vacation" | "holiday" | "blocked" | "custom" | "recurring_available" | "recurring_unavailable");

    const { data: rows, error } = await query.order("start_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const searchCalendarEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { query: string }) => data)
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const q = data.query.trim();
    if (!q) return [];
    const { data: rows, error } = await context.supabase
      .from("calendar_entries")
      .select("*")
      .eq("workspace_id", workspaceId)
      .or(`title.ilike.%${sanitizeSearchTerm(q)}%,description.ilike.%${sanitizeSearchTerm(q)}%`)
      .order("start_at", { ascending: true })
      .limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertCalendarEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw: unknown) => entrySchema.parse(raw))
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const payload = {
      ...data,
      workspace_id: workspaceId,
      owner_id: data.scope === "personal" ? (data.owner_id ?? context.userId) : data.owner_id ?? null,
      created_by: context.userId,
    };
    const { data: row, error } = data.id
      ? await context.supabase
          .from("calendar_entries")
          .update(payload)
          .eq("id", data.id)
          .select("*")
          .maybeSingle()
      : await context.supabase
          .from("calendar_entries")
          .insert(payload)
          .select("*")
          .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteCalendarEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("calendar_entries")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Detect conflicts between a candidate time range and existing blocking entries
 * (vacation, holiday, blocked, break, recurring_unavailable) plus appointments.
 */
export const detectCalendarConflicts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { start_at: string; end_at: string; owner_id?: string | null }) => data)
  .handler(async ({ data, context }) => {
    const workspaceId = await getWorkspaceId(context.userId);
    const conflicts: Array<{ kind: string; title: string; start_at: string; end_at: string; source: "entry" | "appointment" }> = [];

    const { data: entries } = await context.supabase
      .from("calendar_entries")
      .select("kind,title,start_at,end_at,is_blocking,owner_id,scope")
      .eq("workspace_id", workspaceId)
      .eq("is_blocking", true)
      .lt("start_at", data.end_at)
      .gt("end_at", data.start_at);

    for (const e of entries ?? []) {
      if (data.owner_id && e.scope === "personal" && e.owner_id && e.owner_id !== data.owner_id) continue;
      conflicts.push({ kind: e.kind, title: e.title, start_at: e.start_at, end_at: e.end_at, source: "entry" });
    }

    const { data: appts } = await context.supabase
      .from("booking_appointments")
      .select("customer_name,start_at,end_at,host_id")
      .eq("workspace_id", workspaceId)
      .lt("start_at", data.end_at)
      .gt("end_at", data.start_at);

    for (const a of (appts ?? []) as Array<{ customer_name: string | null; start_at: string; end_at: string; host_id: string | null }>) {
      if (data.owner_id && a.host_id && a.host_id !== data.owner_id) continue;
      conflicts.push({
        kind: "appointment",
        title: a.customer_name ?? "Appointment",
        start_at: a.start_at,
        end_at: a.end_at,
        source: "appointment",
      });
    }

    return conflicts;
  });
