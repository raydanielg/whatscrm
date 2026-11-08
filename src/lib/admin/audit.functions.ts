/**
 * Security & Audit aggregator for the Super Admin console.
 *
 * Unified, searchable access to every log surface across the platform:
 *  - System / tenant audit logs (audit_logs)
 *  - Authentication logs (login_history)
 *  - Security events + suspicious activity (security_events)
 *  - Billing & payment logs (billing_events, billing_payment_attempts)
 *  - API keys usage (api_keys)
 *  - Webhook logs (webhook_events)
 *  - AI logs (ai_request_logs)
 *  - Workflow logs (workflow_run_steps)
 *  - Provider logs (provider_logs)
 *  - IP / device tracking (sessions, login_history)
 *  - Retention policies (data_retention_policies)
 *
 * All queries execute under an authenticated RLS context after asserting the
 * caller is platform staff — never via `supabaseAdmin`.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireTenantAccess } from "@/lib/auth/tenant-auth";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { sbAny } from "@/lib/supabase/untyped";
import type { Json } from "@/integrations/supabase/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertPlatformStaff(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["superadmin", "support"]);
  if (error) throw new Error("Unable to verify platform role");
  if (!data || data.length === 0) throw new Error("Forbidden: platform staff only");
}

export type LogSource =
  | "audit"
  | "auth"
  | "security"
  | "billing"
  | "payment"
  | "api"
  | "webhook"
  | "ai"
  | "workflow"
  | "provider";

export interface LogEntry {
  id: string;
  source: LogSource;
  timestamp: string;
  severity: "info" | "success" | "warn" | "error" | "critical";
  actor: string | null;
  workspace_id: string | null;
  organization_id: string | null;
  action: string;
  resource: string | null;
  ip: string | null;
  user_agent: string | null;
  message: string | null;
  meta: Record<string, unknown>;
}

export interface LogQueryInput {
  source: LogSource;
  q?: string;
  workspace_id?: string;
  organization_id?: string;
  actor_id?: string;
  severity?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

function normalizeLimit(n: number | undefined) {
  const v = Math.max(1, Math.min(500, n ?? 100));
  return v;
}

function severityFromLevel(level: string | null | undefined): LogEntry["severity"] {
  const l = (level ?? "").toLowerCase();
  if (["critical", "fatal"].includes(l)) return "critical";
  if (["error", "err", "high"].includes(l)) return "error";
  if (["warn", "warning", "medium"].includes(l)) return "warn";
  if (["success", "ok"].includes(l)) return "success";
  return "info";
}

export const queryLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((input: LogQueryInput) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPlatformStaff(supabase, userId);

    const { queryLogsInternal } = await import("./server/audit.server");
    return queryLogsInternal(data);
  });

export interface DeviceTrackingRow {
  session_id: string;
  user_id: string;
  device: string | null;
  user_agent: string | null;
  ip: string | null;
  location: string | null;
  last_seen_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

export const listActiveDevices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((input: { q?: string; limit?: number }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPlatformStaff(supabase, userId);
    const q = (data.q ?? "").trim();
    let query = sbAny(supabase)
      .from("sessions")
      .select("*")
      .is("revoked_at", null)
      .order("last_seen_at", { ascending: false });
    if (q)
      query = query.or(
        `device.ilike.%${sanitizeSearchTerm(q)}%,user_agent.ilike.%${sanitizeSearchTerm(q)}%,location.ilike.%${sanitizeSearchTerm(q)}%`,
      );
    query = query.limit(normalizeLimit(data.limit));
    const { data: r, error } = await query;
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (Array.isArray(r) ? r : []).map((x: any) => ({
      session_id: x.id,
      user_id: x.user_id,
      device: x.device,
      user_agent: x.user_agent,
      ip: x.ip_address,
      location: x.location,
      last_seen_at: x.last_seen_at,
      created_at: x.created_at,
      revoked_at: x.revoked_at,
    })) as DeviceTrackingRow[];
  });

export interface IpTrackingRow {
  ip: string;
  count: number;
  last_seen: string;
  distinct_users: number;
}

export const listTopIps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((input: { hours?: number; limit?: number }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPlatformStaff(supabase, userId);
    const hours = Math.max(1, Math.min(720, data.hours ?? 24));
    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    const { data: r, error } = await supabase
      .from("login_history")
      .select("ip_address, user_id, created_at")
      .gte("created_at", since)
      .not("ip_address", "is", null)
      .limit(5000);
    if (error) throw new Error(error.message);
    const map = new Map<string, { count: number; users: Set<string>; last: string }>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of (Array.isArray(r) ? r : []) as any[]) {
      const ip = String(row.ip_address);
      const cur = map.get(ip) ?? { count: 0, users: new Set<string>(), last: row.created_at };
      cur.count += 1;
      if (row.user_id) cur.users.add(String(row.user_id));
      if (row.created_at > cur.last) cur.last = row.created_at;
      map.set(ip, cur);
    }
    const rows: IpTrackingRow[] = Array.from(map.entries())
      .map(([ip, v]) => ({ ip, count: v.count, last_seen: v.last, distinct_users: v.users.size }))
      .sort((a, b) => b.count - a.count)
      .slice(0, normalizeLimit(data.limit));
    return rows;
  });

export interface SuspiciousActivityRow {
  id: string;
  timestamp: string;
  kind: string;
  severity: "warn" | "error" | "critical";
  actor: string | null;
  ip: string | null;
  detail: string;
}

export const listSuspiciousActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((input: { hours?: number; limit?: number }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPlatformStaff(supabase, userId);
    const hours = Math.max(1, Math.min(168, data.hours ?? 24));
    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

    const [{ data: sec }, { data: fails }, { data: lockouts }] = await Promise.all([
      sbAny(supabase)
        .from("security_events")
        .select("*")
        .in("severity", ["warning", "error", "critical", "high", "medium"])
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200),
      sbAny(supabase)
        .from("login_history")
        .select("*")
        .eq("event", "failed")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200),
      sbAny(supabase)
        .from("account_lockouts")
        .select("*")
        .order("last_failed_at", { ascending: false })
        .limit(50),
    ]);

    const rows: SuspiciousActivityRow[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const x of (Array.isArray(sec) ? sec : []) as any[]) {
      rows.push({
        id: `sec-${x.id}`,
        timestamp: x.created_at,
        kind: x.event_type,
        severity:
          severityFromLevel(x.severity) === "critical"
            ? "critical"
            : severityFromLevel(x.severity) === "error"
              ? "error"
              : "warn",
        actor: x.actor_id,
        ip: x.ip_address ? String(x.ip_address) : null,
        detail: x.resource_type ? `${x.resource_type}:${x.resource_id ?? ""}` : "security event",
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const x of (Array.isArray(fails) ? fails : []) as any[]) {
      rows.push({
        id: `login-${x.id}`,
        timestamp: x.created_at,
        kind: "login.failed",
        severity: "warn",
        actor: x.user_id,
        ip: x.ip_address ? String(x.ip_address) : null,
        detail: x.failure_reason ?? "failed login",
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const x of (Array.isArray(lockouts) ? lockouts : []) as any[]) {
      if (x.failed_attempts >= 3) {
        rows.push({
          id: `lock-${x.user_id}`,
          timestamp: x.last_failed_at ?? new Date().toISOString(),
          kind: "account.lockout_risk",
          severity: x.failed_attempts >= 5 ? "critical" : "error",
          actor: x.user_id,
          ip: null,
          detail: `${x.failed_attempts} failed attempts${x.locked_until ? ` · locked until ${new Date(x.locked_until).toLocaleString()}` : ""}`,
        });
      }
    }
    return rows
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
      .slice(0, normalizeLimit(data.limit));
  });

export interface PermissionChangeRow {
  id: string;
  timestamp: string;
  actor: string | null;
  action: string;
  resource: string;
  target: string | null;
  // `unknown` is rejected by the server-function serializer; a jsonb column is Json.
  changes: Record<string, Json>;
}

export const listPermissionChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((input: { q?: string; limit?: number }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPlatformStaff(supabase, userId);
    const q = (data.q ?? "").trim();
    let query = supabase
      .from("audit_logs")
      .select("*")
      .in("resource_type", [
        "role",
        "permission",
        "user_role",
        "workspace_member",
        "organization_member",
        "user_role_assignment",
        "role_permission",
      ])
      .order("created_at", { ascending: false });
    if (q)
      query = query.or(
        `action.ilike.%${sanitizeSearchTerm(q)}%,resource_type.ilike.%${sanitizeSearchTerm(q)}%,resource_id.ilike.%${sanitizeSearchTerm(q)}%`,
      );
    query = query.limit(normalizeLimit(data.limit));
    const { data: r, error } = await query;
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (Array.isArray(r) ? r : []).map((x: any) => ({
      id: x.id,
      timestamp: x.created_at,
      actor: x.actor_id,
      action: x.action,
      resource: x.resource_type,
      target: x.resource_id,
      changes: x.changes ?? {},
    })) as PermissionChangeRow[];
  });

export interface RetentionPolicyRow {
  id: string;
  workspace_id: string;
  resource: string;
  retention_days: number;
  is_active: boolean;
  last_run_at: string | null;
  last_deleted_count: number | null;
}

export const listRetentionPolicies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertPlatformStaff(supabase, userId);
    const { data: r, error } = await supabase
      .from("data_retention_policies")
      .select("*")
      .order("resource", { ascending: true });
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (Array.isArray(r) ? r : []).map((x: any) => ({
      id: x.id,
      workspace_id: x.workspace_id,
      resource: x.resource,
      retention_days: x.retention_days,
      is_active: x.is_active,
      last_run_at: x.last_run_at,
      last_deleted_count: x.last_deleted_count,
    })) as RetentionPolicyRow[];
  });

export const upsertRetentionPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator(
    (input: {
      id?: string;
      workspace_id: string;
      resource: string;
      retention_days: number;
      is_active: boolean;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPlatformStaff(supabase, userId);
    if (data.id) {
      const { error } = await supabase
        .from("data_retention_policies")
        .update({
          retention_days: data.retention_days,
          is_active: data.is_active,
          resource: data.resource,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: r, error } = await supabase
      .from("data_retention_policies")
      .insert({
        workspace_id: data.workspace_id,
        resource: data.resource,
        retention_days: data.retention_days,
        is_active: data.is_active,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: String(r?.id ?? "") };
  });

export const deleteRetentionPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireTenantAccess])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPlatformStaff(supabase, userId);
    const { error } = await supabase.from("data_retention_policies").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
