/**
 * Compliance Center — enterprise privacy & data-governance aggregator.
 * Backs GDPR/CCPA readiness dashboard, privacy request workflows,
 * retention policies, consent tracking, and admin-configurable settings.
 * All queries run under RLS as the caller (workspace-scoped).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sbAny } from "@/lib/supabase/untyped";

/* -------------------------------------------------- types */

export type PrivacyRequest = {
  id: string;
  request_type: "export" | "erasure" | "restriction" | "rectification" | "portability";
  status: "pending" | "processing" | "completed" | "rejected" | "failed";
  subject_type: "contact" | "user";
  subject_identifier: string | null;
  requested_at: string;
  due_at: string;
  completed_at: string | null;
  reason: string | null;
};

export type RetentionPolicy = {
  id: string;
  resource: string;
  retention_days: number;
  is_active: boolean;
  last_run_at: string | null;
  last_deleted_count: number;
};

export type ComplianceSettings = {
  dpo_name: string;
  dpo_email: string;
  controller_name: string;
  controller_address: string;
  privacy_policy_url: string;
  terms_url: string;
  cookie_banner_enabled: boolean;
  cookie_banner_message: string;
  cookie_categories: {
    essential: boolean;
    analytics: boolean;
    marketing: boolean;
    functional: boolean;
  };
  gdpr_enabled: boolean;
  ccpa_enabled: boolean;
  request_response_days: number;
  data_processing_notes: string;
};

export type ComplianceOverview = {
  generated_at: string;
  compliance_score: number;
  posture: "compliant" | "action-needed" | "non-compliant";
  metrics: {
    open_requests: number;
    overdue_requests: number;
    completed_requests_30d: number;
    total_requests_30d: number;
    consented_contacts: number;
    revoked_contacts: number;
    retention_policies: number;
    active_retention_policies: number;
    /** True when at least one active policy ran in the last 7 days. Policies that never run purge nothing. */
    retention_enforced: boolean;
    audit_events_30d: number;
    breach_events_30d: number;
  };
  request_breakdown: Array<{ type: string; count: number }>;
  consent_by_purpose: Array<{ purpose: string; opted_in: number; revoked: number }>;
  data_processing_records: Array<{
    resource: string;
    retention_days: number;
    last_run_at: string | null;
    deleted: number;
  }>;
  settings: ComplianceSettings;
};

const DEFAULT_SETTINGS: ComplianceSettings = {
  dpo_name: "",
  dpo_email: "",
  controller_name: "",
  controller_address: "",
  privacy_policy_url: "",
  terms_url: "",
  cookie_banner_enabled: true,
  cookie_banner_message:
    "We use cookies to improve your experience. You can manage preferences at any time.",
  cookie_categories: { essential: true, analytics: false, marketing: false, functional: true },
  gdpr_enabled: true,
  ccpa_enabled: true,
  request_response_days: 30,
  data_processing_notes: "",
};

/* -------------------------------------------------- helpers */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWorkspaceId(supabase: any, userId: string): Promise<string | null> {
  // The workspace the caller is viewing — not an arbitrary membership row.
  const { resolveActiveWorkspaceId } = await import("@/lib/auth/active-workspace.server");
  return resolveActiveWorkspaceId(supabase, userId);
}

/* -------------------------------------------------- overview */

export const getComplianceOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ComplianceOverview> => {
    const { supabase, userId } = context;
    const now = new Date();
    const d30 = new Date(now.getTime() - 30 * 24 * 3600_000).toISOString();
    const workspaceId = await getWorkspaceId(supabase, userId);
    if (!workspaceId) {
      return {
        generated_at: now.toISOString(),
        compliance_score: 0,
        posture: "non-compliant",
        metrics: {
          open_requests: 0,
          overdue_requests: 0,
          completed_requests_30d: 0,
          total_requests_30d: 0,
          consented_contacts: 0,
          revoked_contacts: 0,
          retention_policies: 0,
          active_retention_policies: 0,
          retention_enforced: false,
          audit_events_30d: 0,
          breach_events_30d: 0,
        },
        request_breakdown: [],
        consent_by_purpose: [],
        data_processing_records: [],
        settings: DEFAULT_SETTINGS,
      };
    }

    // Privacy requests
    const { data: reqsData } = await supabase
      .from("gdpr_requests")
      .select("id, request_type, status, requested_at, due_at, completed_at")
      .eq("workspace_id", workspaceId)
      .gte("requested_at", d30);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reqs: any[] = reqsData ?? [];
    const openReqs = reqs.filter((r) => ["pending", "processing"].includes(r.status));
    const overdue = reqs.filter(
      (r) => ["pending", "processing"].includes(r.status) && new Date(r.due_at) < now,
    );
    const completed = reqs.filter((r) => r.status === "completed");
    const breakdownMap = new Map<string, number>();
    for (const r of reqs)
      breakdownMap.set(r.request_type, (breakdownMap.get(r.request_type) ?? 0) + 1);

    // Consent
    const { data: consentsData } = await supabase
      .from("consent_records")
      .select("purpose, status")
      .eq("workspace_id", workspaceId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const consents: any[] = consentsData ?? [];
    const consentMap = new Map<string, { opted_in: number; revoked: number }>();
    let optedIn = 0,
      revoked = 0;
    for (const c of consents) {
      const cur = consentMap.get(c.purpose) ?? { opted_in: 0, revoked: 0 };
      if (c.status === "opted_in") {
        cur.opted_in += 1;
        optedIn += 1;
      } else if (c.status === "revoked" || c.status === "opted_out") {
        cur.revoked += 1;
        revoked += 1;
      }
      consentMap.set(c.purpose, cur);
    }

    // Retention policies
    const { data: policiesData } = await supabase
      .from("data_retention_policies")
      .select("resource, retention_days, is_active, last_run_at, last_deleted_count")
      .eq("workspace_id", workspaceId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const policies: any[] = policiesData ?? [];
    const activePolicies = policies.filter((p) => p.is_active);
    // Defining a retention policy purges nothing by itself: public.run_retention_policies()
    // must be run (it stamps last_run_at). Credit the policy only if it has run recently.
    const enforcedSince = new Date(now.getTime() - 7 * 24 * 3600_000);
    const retentionEnforced = activePolicies.some(
      (p) => p.last_run_at && new Date(p.last_run_at) >= enforcedSince,
    );

    // Audit / breach
    const { count: auditCount = 0 } = await supabase
      .from("audit_logs")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("created_at", d30);
    const { count: breachCount = 0 } = await supabase
      .from("security_events")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("created_at", d30)
      .in("severity", ["high", "critical"]);

    // Settings
    const settings = await loadSettings(supabase, workspaceId);

    // Score
    let score = 100;
    if (!settings.privacy_policy_url) score -= 10;
    if (!settings.terms_url) score -= 5;
    if (!settings.dpo_email) score -= 5;
    if (!settings.cookie_banner_enabled) score -= 5;
    if (activePolicies.length === 0) score -= 15;
    else if (!retentionEnforced) score -= 10; // defined, but nothing is applying it
    if (overdue.length > 0) score -= Math.min(25, overdue.length * 5);
    if (openReqs.length > 10) score -= 5;
    if (!settings.gdpr_enabled && !settings.ccpa_enabled) score -= 10;
    score = Math.max(0, Math.min(100, score));
    const posture: ComplianceOverview["posture"] =
      score >= 85 ? "compliant" : score >= 65 ? "action-needed" : "non-compliant";

    return {
      generated_at: now.toISOString(),
      compliance_score: score,
      posture,
      metrics: {
        open_requests: openReqs.length,
        overdue_requests: overdue.length,
        completed_requests_30d: completed.length,
        total_requests_30d: reqs.length,
        consented_contacts: optedIn,
        revoked_contacts: revoked,
        retention_policies: policies.length,
        active_retention_policies: activePolicies.length,
        retention_enforced: retentionEnforced,
        audit_events_30d: auditCount ?? 0,
        breach_events_30d: breachCount ?? 0,
      },
      request_breakdown: [...breakdownMap.entries()].map(([type, count]) => ({ type, count })),
      consent_by_purpose: [...consentMap.entries()].map(([purpose, v]) => ({ purpose, ...v })),
      data_processing_records: (policies as unknown as RetentionPolicy[]).map((p) => ({
        resource: p.resource,
        retention_days: p.retention_days,
        last_run_at: p.last_run_at,
        deleted: p.last_deleted_count,
      })),
      settings,
    };
  });

/* -------------------------------------------------- settings */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadSettings(supabase: any, workspaceId: string): Promise<ComplianceSettings> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("scope", "workspace")
    .eq("workspace_id", workspaceId)
    .eq("key", "compliance")
    .maybeSingle();
  const v = (data?.value ?? {}) as Partial<ComplianceSettings>;
  return {
    ...DEFAULT_SETTINGS,
    ...v,
    cookie_categories: { ...DEFAULT_SETTINGS.cookie_categories, ...(v.cookie_categories ?? {}) },
  };
}

const settingsSchema = z.object({
  dpo_name: z.string().max(200).default(""),
  dpo_email: z.string().max(320).default(""),
  controller_name: z.string().max(200).default(""),
  controller_address: z.string().max(500).default(""),
  privacy_policy_url: z.string().max(500).default(""),
  terms_url: z.string().max(500).default(""),
  cookie_banner_enabled: z.boolean(),
  cookie_banner_message: z.string().max(1000),
  cookie_categories: z.object({
    essential: z.boolean(),
    analytics: z.boolean(),
    marketing: z.boolean(),
    functional: z.boolean(),
  }),
  gdpr_enabled: z.boolean(),
  ccpa_enabled: z.boolean(),
  request_response_days: z.number().int().min(1).max(365),
  data_processing_notes: z.string().max(4000).default(""),
});

export const saveComplianceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => settingsSchema.parse(d))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    const workspaceId = await getWorkspaceId(supabase, userId);
    if (!workspaceId) throw new Error("No workspace");
    // Only active workspace owners/admins may change compliance settings. This
    // mirrors the `settings` RLS write policy for scope='workspace'
    // (has_workspace_role owner/admin, status active) so callers get a clear
    // error instead of a raw "violates row-level security policy".
    const { data: member } = await supabase
      .from("workspace_members")
      .select("role, status")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    const m = member as { role?: string; status?: string } | null;
    if (!m || m.status !== "active" || !["owner", "admin"].includes(m.role ?? "")) {
      throw new Error("Only workspace owners and admins can change compliance settings");
    }
    // organization_id / user_id are written as explicit NULLs so the row matches
    // the NULLS NOT DISTINCT unique key and the upsert updates in place.
    const { error } = await sbAny(supabase).from("settings").upsert(
      {
        scope: "workspace",
        organization_id: null,
        workspace_id: workspaceId,
        user_id: null,
        key: "compliance",
        value: data,
      },
      { onConflict: "scope,organization_id,workspace_id,user_id,key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------------------------- privacy requests */

export const listPrivacyRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PrivacyRequest[]> => {
    const { supabase, userId } = context;
    const workspaceId = await getWorkspaceId(supabase, userId);
    if (!workspaceId) return [];
    const { data } = await supabase
      .from("gdpr_requests")
      .select(
        "id, request_type, status, subject_type, subject_identifier, requested_at, due_at, completed_at, reason",
      )
      .eq("workspace_id", workspaceId)
      .order("requested_at", { ascending: false })
      .limit(200);
    return (data ?? []) as PrivacyRequest[];
  });

const createRequestSchema = z.object({
  request_type: z.enum(["export", "erasure", "restriction", "rectification", "portability"]),
  subject_type: z.enum(["contact", "user"]),
  subject_identifier: z.string().min(1).max(320),
  reason: z.string().max(2000).optional(),
});

export const createPrivacyRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => createRequestSchema.parse(d))
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    const { supabase, userId } = context;
    const workspaceId = await getWorkspaceId(supabase, userId);
    if (!workspaceId) throw new Error("No workspace");

    // Try to resolve subject_id from identifier
    let subjectId: string | null = null;
    if (data.subject_type === "contact") {
      const { data: c } = await supabase
        .from("contacts")
        .select("id")
        .eq("workspace_id", workspaceId)
        .or(`email.eq.${data.subject_identifier},phone.eq.${data.subject_identifier}`)
        .limit(1)
        .maybeSingle();
      subjectId = (c?.id as string) ?? null;
    }
    // Fallback: derive placeholder — the row requires uuid.
    if (!subjectId) subjectId = crypto.randomUUID();

    const { data: inserted, error } = await sbAny(supabase)
      .from("gdpr_requests")
      .insert({
        workspace_id: workspaceId,
        subject_type: data.subject_type,
        subject_id: subjectId,
        subject_identifier: data.subject_identifier,
        request_type: data.request_type,
        requested_by: userId,
        reason: data.reason ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id as string };
  });

const updateRequestSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["pending", "processing", "completed", "rejected", "failed"]),
  notes: z.string().max(4000).optional(),
});

export const updatePrivacyRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => updateRequestSchema.parse(d))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { supabase } = context;
    const patch: {
      status: typeof data.status;
      updated_at: string;
      notes?: string;
      completed_at?: string;
    } = {
      status: data.status,
      updated_at: new Date().toISOString(),
    };
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.status === "completed") patch.completed_at = new Date().toISOString();
    const { error } = await sbAny(supabase).from("gdpr_requests").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------------------------- retention policies */

const RESOURCES = [
  "messages",
  "conversations",
  "media",
  "audit_logs",
  "webhook_events",
  "login_history",
  "activities",
  "notifications",
  "error_logs",
] as const;
export type RetentionResource = (typeof RESOURCES)[number];

export const listRetentionPolicies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RetentionPolicy[]> => {
    const { supabase, userId } = context;
    const workspaceId = await getWorkspaceId(supabase, userId);
    if (!workspaceId) return [];
    const { data } = await supabase
      .from("data_retention_policies")
      .select("id, resource, retention_days, is_active, last_run_at, last_deleted_count")
      .eq("workspace_id", workspaceId)
      .order("resource");
    return (data ?? []) as RetentionPolicy[];
  });

const upsertRetentionSchema = z.object({
  resource: z.enum(RESOURCES),
  retention_days: z.number().int().min(1).max(3650),
  is_active: z.boolean(),
});

export const upsertRetentionPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => upsertRetentionSchema.parse(d))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { supabase, userId } = context;
    const workspaceId = await getWorkspaceId(supabase, userId);
    if (!workspaceId) throw new Error("No workspace");
    const { error } = await sbAny(supabase).from("data_retention_policies").upsert(
      {
        workspace_id: workspaceId,
        resource: data.resource,
        retention_days: data.retention_days,
        is_active: data.is_active,
      },
      { onConflict: "workspace_id,resource" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteRetentionPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<{ ok: true }> => {
    const { supabase } = context;
    const { error } = await sbAny(supabase)
      .from("data_retention_policies")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------------------------------- compliance report */

export type ComplianceReport = {
  workspace_id: string;
  generated_at: string;
  period: { from: string; to: string };
  overview: ComplianceOverview;
  requests: PrivacyRequest[];
  policies: RetentionPolicy[];
};

export const generateComplianceReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ days: z.number().int().min(1).max(365).default(30) }).parse(d),
  )
  .handler(async ({ context, data }): Promise<ComplianceReport> => {
    const { supabase, userId } = context;
    const workspaceId = await getWorkspaceId(supabase, userId);
    if (!workspaceId) throw new Error("No workspace");
    const now = new Date();
    const from = new Date(now.getTime() - data.days * 24 * 3600_000);

    const overview = await getComplianceOverview();
    const { data: reqs } = await supabase
      .from("gdpr_requests")
      .select(
        "id, request_type, status, subject_type, subject_identifier, requested_at, due_at, completed_at, reason",
      )
      .eq("workspace_id", workspaceId)
      .gte("requested_at", from.toISOString())
      .order("requested_at", { ascending: false });
    const { data: policies } = await supabase
      .from("data_retention_policies")
      .select("id, resource, retention_days, is_active, last_run_at, last_deleted_count")
      .eq("workspace_id", workspaceId)
      .order("resource");

    return {
      workspace_id: workspaceId,
      generated_at: now.toISOString(),
      period: { from: from.toISOString(), to: now.toISOString() },
      overview,
      requests: (reqs ?? []) as PrivacyRequest[],
      policies: (policies ?? []) as RetentionPolicy[],
    };
  });
