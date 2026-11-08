/**
 * API Security server functions.
 *
 * Backs the /developer/api-security page. Aligns with OWASP API Security
 * Top 10 (2023):
 *  - API1 Broken Object Level Authorization — enforced by RLS + org scoping.
 *  - API2 Broken Authentication — key rotation, revocation, expiry surfaced here.
 *  - API4 Unrestricted Resource Consumption — rate limits, quotas, abuse detection.
 *  - API7 SSRF & API8 Security Misconfiguration — CORS + IP rules configuration.
 *  - API9 Improper Inventory Management — audit + security events feed.
 *  - API10 Unsafe Consumption — webhook signing + signature verification tools.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertOrgRole } from "@/lib/rbac-org";
import { sbAny } from "@/lib/supabase/untyped";

const CorsSchema = z.object({
  allowed_origins: z.array(z.string()).max(50).default(["*"]),
  allowed_methods: z.array(z.string()).max(15).default(["GET", "POST", "PATCH", "DELETE", "OPTIONS"]),
  allowed_headers: z.array(z.string()).max(50).default(["Authorization", "Content-Type", "Idempotency-Key"]),
  allow_credentials: z.boolean().default(false),
  max_age_seconds: z.number().int().min(0).max(86400).default(86400),
});
export type CorsConfig = z.infer<typeof CorsSchema>;

const IpRuleSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().min(1).max(120),
  cidr: z.string().min(1).max(80),
  applies_to: z.enum(["allow", "deny", "api", "admin"]).default("allow"),
  is_active: z.boolean().default(true),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getScope(supabase: any, userId: string) {
  // Use the caller's active workspace (canonical resolver) and derive the org
  // from it, rather than arbitrary LIMIT 1 membership rows.
  const { resolveActiveWorkspaceId } = await import("@/lib/auth/active-workspace.server");
  const workspaceId = await resolveActiveWorkspaceId(supabase, userId);
  let organizationId: string | null = null;
  if (workspaceId) {
    const { data: ws } = await supabase
      .from("workspaces")
      .select("organization_id")
      .eq("id", workspaceId)
      .maybeSingle();
    organizationId = (ws?.organization_id as string | null) ?? null;
  }
  return { organizationId, workspaceId };
}

/**
 * Security-config mutations (IP rules, CORS, key rotation) are admin-only.
 * Resolves the caller's organization from their memberships and asserts an
 * elevated org role before any write.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertSecurityAdmin(supabase: any, userId: string) {
  const { organizationId } = await getScope(supabase, userId);
  if (!organizationId) throw new Error("No organization");
  await assertOrgRole(supabase, userId, organizationId);
}

// -------- Overview --------

export const getSecurityOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const scope = await getScope(supabase, userId);
    if (!scope.organizationId && !scope.workspaceId) return emptyOverview();

    const since24h = new Date(Date.now() - 86400_000).toISOString();
    const since7d = new Date(Date.now() - 7 * 86400_000).toISOString();

    const [keysRes, ipRes, alertsRes, gatewayRes, quotasRes, webhooksRes] = await Promise.all([
      scope.organizationId
        ? supabase
            .from("api_keys")
            .select("id, revoked_at, expires_at, last_used_at, rotated_from")
            .eq("organization_id", scope.organizationId)
        : Promise.resolve({ data: [] }),
      scope.workspaceId
        ? sbAny(supabase).from("ip_allowlists").select("id, applies_to, is_active").eq("workspace_id", scope.workspaceId)
        : Promise.resolve({ data: [] }),
      scope.workspaceId
        ? supabase
            .from("security_events")
            .select("id, severity, created_at")
            .eq("workspace_id", scope.workspaceId)
            .gte("created_at", since7d)
        : Promise.resolve({ data: [] }),
      scope.organizationId
        ? supabase
            .from("api_gateway_logs")
            .select("status_code, ip, api_key_id, path, created_at")
            .eq("organization_id", scope.organizationId)
            .gte("created_at", since24h)
            .limit(5000)
        : Promise.resolve({ data: [] }),
      scope.organizationId
        ? supabase
            .from("tenant_quotas")
            .select("meter_code, used, included, hard_limit, period_end")
            .eq("organization_id", scope.organizationId)
        : Promise.resolve({ data: [] }),
      scope.organizationId
        ? sbAny(supabase).from("webhook_endpoints").select("id, is_active").eq("organization_id", scope.organizationId)
        : Promise.resolve({ data: [] }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const keys: any[] = keysRes.data ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ip: any[] = ipRes.data ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const alerts: any[] = alertsRes.data ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gateway: any[] = gatewayRes.data ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quotas: any[] = quotasRes.data ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const webhooks: any[] = webhooksRes.data ?? [];

    const now = Date.now();
    const expiringSoon = keys.filter((k) => k.expires_at && !k.revoked_at && new Date(k.expires_at).getTime() - now < 14 * 86400_000).length;
    const active = keys.filter((k) => !k.revoked_at).length;
    const stale = keys.filter((k) => !k.revoked_at && (!k.last_used_at || now - new Date(k.last_used_at).getTime() > 90 * 86400_000)).length;
    const rotated = keys.filter((k) => k.rotated_from).length;

    return {
      keys: { total: keys.length, active, expiring_soon: expiringSoon, stale, rotated },
      ip_rules: {
        total: ip.length,
        allow: ip.filter((r) => r.applies_to === "allow" || r.applies_to === "api" || r.applies_to === "admin").filter((r) => r.is_active).length,
        deny: ip.filter((r) => r.applies_to === "deny").filter((r) => r.is_active).length,
      },
      alerts: {
        total_7d: alerts.length,
        critical: alerts.filter((a) => a.severity === "critical").length,
        high: alerts.filter((a) => a.severity === "high").length,
      },
      abuse: computeAbuse(gateway),
      quotas: quotas.map((q) => ({
        meter: q.meter_code as string,
        used: Number(q.used ?? 0),
        included: Number(q.included ?? 0),
        hard_limit: q.hard_limit == null ? null : Number(q.hard_limit),
        pct: q.included ? Math.min(100, Math.round((Number(q.used ?? 0) / Number(q.included)) * 100)) : 0,
        period_end: q.period_end as string | null,
      })),
      webhooks: { total: webhooks.length, active: webhooks.filter((w) => w.is_active).length },
    };
  });

// -------- IP Allow/Deny rules --------

export const listIpRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { workspaceId } = await getScope(supabase, userId);
    if (!workspaceId) return [];
    const { data } = await supabase
      .from("ip_allowlists")
      .select("id, label, cidr, applies_to, is_active, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    return (data ?? []) as Array<{
      id: string;
      label: string;
      cidr: string;
      applies_to: string;
      is_active: boolean;
      created_at: string;
    }>;
  });

export const upsertIpRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => IpRuleSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { workspaceId } = await getScope(supabase, userId);
    if (!workspaceId) throw new Error("No workspace");
    await assertSecurityAdmin(supabase, userId);
    if (!isValidCidr(data.cidr)) throw new Error("Invalid CIDR/IP");
    const payload = {
      workspace_id: workspaceId,
      label: data.label,
      cidr: data.cidr,
      applies_to: data.applies_to,
      is_active: data.is_active,
      created_by: userId,
    };
    if (data.id) {
      const { error } = await sbAny(supabase).from("ip_allowlists").update(payload).eq("id", data.id).eq("workspace_id", workspaceId);
      if (error) throw error;
      await logAudit(supabase, workspaceId, userId, "ip_rule.update", "ip_allowlist", data.id, payload);
      return { id: data.id };
    }
    const { data: created, error } = await sbAny(supabase).from("ip_allowlists").insert(payload).select("id").maybeSingle();
    if (error) throw error;
    await logAudit(supabase, workspaceId, userId, "ip_rule.create", "ip_allowlist", created?.id ?? null, payload);
    return { id: created?.id as string };
  });

export const deleteIpRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { workspaceId } = await getScope(supabase, userId);
    if (!workspaceId) throw new Error("No workspace");
    await assertSecurityAdmin(supabase, userId);
    const { error } = await sbAny(supabase).from("ip_allowlists").delete().eq("id", data.id).eq("workspace_id", workspaceId);
    if (error) throw error;
    await logAudit(supabase, workspaceId, userId, "ip_rule.delete", "ip_allowlist", data.id, null);
    return { ok: true };
  });

// -------- CORS config (stored in settings) --------

export const getCorsConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { organizationId } = await getScope(supabase, userId);
    if (!organizationId) return CorsSchema.parse({});
    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("scope", "organization")
      .eq("organization_id", organizationId)
      .eq("key", "api.cors")
      .maybeSingle();
    return CorsSchema.parse(data?.value ?? {});
  });

export const saveCorsConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => CorsSchema.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { organizationId, workspaceId } = await getScope(supabase, userId);
    if (!organizationId) throw new Error("No organization");
    await assertOrgRole(supabase, userId, organizationId);
    // Reject wildcard origin with credentials — CORS spec violation
    if (data.allow_credentials && data.allowed_origins.includes("*")) {
      throw new Error("Cannot use '*' origin with allow_credentials=true");
    }
    const { data: existing } = await supabase
      .from("settings")
      .select("id")
      .eq("scope", "organization")
      .eq("organization_id", organizationId)
      .eq("key", "api.cors")
      .is("workspace_id", null)
      .is("user_id", null)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await supabase
        .from("settings")
        .update({ value: data, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await sbAny(supabase).from("settings").insert({
        scope: "organization",
        organization_id: organizationId,
        key: "api.cors",
        value: data,
      });
      if (error) throw error;
    }
    if (workspaceId) await logAudit(supabase, workspaceId, userId, "cors.update", "settings", null, data);
    return { ok: true };
  });

// -------- Security Events & Audit --------

export type SecurityEventRow = {
  id: string;
  severity: string | null;
  event_type: string | null;
  ip_address: string | null;
  resource_type: string | null;
  resource_id: string | null;
  data_json: string | null;
  created_at: string;
};

export const listSecurityEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z.object({ severity: z.string().optional(), limit: z.number().int().min(1).max(200).default(100) }).parse(v),
  )
  .handler(async ({ data, context }): Promise<SecurityEventRow[]> => {
    const { supabase, userId } = context;
    const { workspaceId } = await getScope(supabase, userId);
    if (!workspaceId) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase
      .from("security_events")
      .select("id, severity, event_type, ip_address, resource_type, resource_id, data, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.severity) q = q.eq("severity", data.severity);
    const { data: rows } = await q;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((rows ?? []) as any[]).map((r) => ({
      id: String(r.id),
      severity: r.severity ?? null,
      event_type: r.event_type ?? null,
      ip_address: r.ip_address == null ? null : String(r.ip_address),
      resource_type: r.resource_type ?? null,
      resource_id: r.resource_id ?? null,
      data_json: r.data == null ? null : JSON.stringify(r.data),
      created_at: r.created_at,
    }));
  });

export type AuditLogRow = {
  id: string;
  action: string | null;
  resource_type: string | null;
  resource_id: string | null;
  actor_id: string | null;
  ip_address: string | null;
  created_at: string;
  metadata_json: string | null;
};

export const listAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ limit: z.number().int().min(1).max(200).default(100) }).parse(v))
  .handler(async ({ data, context }): Promise<AuditLogRow[]> => {
    const { supabase, userId } = context;
    const { workspaceId, organizationId } = await getScope(supabase, userId);
    if (!workspaceId && !organizationId) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase
      .from("audit_logs")
      .select("id, action, resource_type, resource_id, actor_id, ip_address, created_at, metadata")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (workspaceId) q = q.eq("workspace_id", workspaceId);
    else if (organizationId) q = q.eq("organization_id", organizationId);
    const { data: rows } = await q;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((rows ?? []) as any[]).map((r) => ({
      id: String(r.id),
      action: r.action ?? null,
      resource_type: r.resource_type ?? null,
      resource_id: r.resource_id ?? null,
      actor_id: r.actor_id ?? null,
      ip_address: r.ip_address == null ? null : String(r.ip_address),
      created_at: r.created_at,
      metadata_json: r.metadata == null ? null : JSON.stringify(r.metadata),
    }));
  });


// -------- API key rotation --------

export const rotateApiKeySecurity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ id: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { organizationId, workspaceId } = await getScope(supabase, userId);
    if (!organizationId) throw new Error("No organization");
    await assertOrgRole(supabase, userId, organizationId);

    const { data: existing, error: exErr } = await supabase
      .from("api_keys")
      .select("id, name, scopes, ip_allowlist, description, organization_id")
      .eq("id", data.id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (exErr || !existing) throw new Error("Key not found");

    const raw = generateSecret(32);
    const prefix = raw.slice(0, 8);
    const hashed = await sha256Hex(raw);

    const { data: created, error } = await supabase
      .from("api_keys")
      .insert({
        organization_id: organizationId,
        created_by: userId,
        name: `${existing.name} (rotated)`,
        prefix,
        hashed_key: hashed,
        scopes: existing.scopes ?? [],
        ip_allowlist: existing.ip_allowlist ?? [],
        description: existing.description,
        rotated_from: existing.id,
      })
      .select("id, prefix")
      .maybeSingle();
    if (error) throw error;

    // Retire the old key after a short grace by setting expires_at 24h out.
    await supabase
      .from("api_keys")
      .update({ expires_at: new Date(Date.now() + 24 * 3600_000).toISOString() })
      .eq("id", existing.id);

    if (workspaceId) {
      await logAudit(supabase, workspaceId, userId, "api_key.rotate", "api_key", existing.id, {
        new_key_id: created?.id,
      });
    }

    return { id: created?.id as string, prefix, secret: `sk_${raw}` };
  });

// -------- Abuse detection ranked view --------

export const listAbuseSignals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { organizationId } = await getScope(supabase, userId);
    if (!organizationId) return { top_ips: [], top_paths: [], top_keys: [] };
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data } = await supabase
      .from("api_gateway_logs")
      .select("ip, path, status_code, api_key_id")
      .eq("organization_id", organizationId)
      .gte("created_at", since)
      .limit(5000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = (data ?? []).map((r: any) => ({ ...r, ip: r.ip == null ? null : String(r.ip) }));
    const badRows = rows.filter((r) => (r.status_code ?? 0) === 429 || (r.status_code ?? 0) >= 400);
    return {
      top_ips: rankBy(badRows, (r) => r.ip ?? "unknown").slice(0, 10),
      top_paths: rankBy(badRows, (r) => r.path ?? "/").slice(0, 10),
      top_keys: rankBy(badRows.filter((r) => r.api_key_id), (r) => r.api_key_id as string).slice(0, 10),
    };
  });

// -------- helpers --------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeAbuse(rows: any[]) {
  const total = rows.length;
  const errors = rows.filter((r) => (r.status_code ?? 0) >= 400).length;
  const rate429 = rows.filter((r) => r.status_code === 429).length;
  const unique_ips = new Set(rows.map((r) => r.ip).filter(Boolean)).size;
  return { total, errors, rate_limited: rate429, unique_ips };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rankBy(rows: any[], key: (r: any) => string): Array<{ key: string; count: number }> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m.entries())
    .map(([k, count]) => ({ key: k, count }))
    .sort((a, b) => b.count - a.count);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logAudit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  workspaceId: string,
  userId: string,
  action: string,
  resourceType: string,
  resourceId: string | null,
  metadata: unknown,
) {
  // audit_logs has no INSERT policy, so the user-scoped client is always
  // rejected. workspaceId/userId are derived server-side by every caller
  // (getScope + auth middleware), so the guarded service-role client is safe.
  void supabase;
  try {
    const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
    const { error } = await sbAny(supabaseAdmin).from("audit_logs").insert({
      workspace_id: workspaceId,
      actor_id: userId,
      // audit_logs.action is the audit_action enum (create/update/delete/...);
      // map the dotted event name onto it and keep the full name in metadata.
      action: toAuditAction(action),
      resource_type: resourceType,
      resource_id: resourceId,
      metadata: {
        event: action,
        ...(metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {}),
      },
    });
    if (error) console.error("[audit_logs] insert failed", { action, error: error.message });
  } catch (e) {
    // audit failures never break the calling operation
    console.error("[audit_logs] insert threw", { action, error: (e as Error)?.message });
  }
}

const AUDIT_ACTIONS = new Set([
  "create",
  "update",
  "delete",
  "login",
  "logout",
  "invite",
  "revoke",
  "export",
  "access",
]);
function toAuditAction(event: string): string {
  const verb = event.split(".").pop() ?? "";
  if (AUDIT_ACTIONS.has(verb)) return verb;
  return "update";
}

function isValidCidr(cidr: string): boolean {
  // Accept single IPv4/IPv6 or with /mask suffix
  const [addr, mask] = cidr.split("/");
  if (mask !== undefined) {
    const n = Number(mask);
    if (!Number.isInteger(n) || n < 0 || n > 128) return false;
  }
  const v4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const v6 = /^[0-9a-fA-F:]+$/;
  return v4.test(addr) || v6.test(addr);
}

function generateSecret(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function emptyOverview() {
  return {
    keys: { total: 0, active: 0, expiring_soon: 0, stale: 0, rotated: 0 },
    ip_rules: { total: 0, allow: 0, deny: 0 },
    alerts: { total_7d: 0, critical: 0, high: 0 },
    abuse: { total: 0, errors: 0, rate_limited: 0, unique_ips: 0 },
    quotas: [] as Array<{ meter: string; used: number; included: number; hard_limit: number | null; pct: number; period_end: string | null }>,
    webhooks: { total: 0, active: 0 },
  };
}
