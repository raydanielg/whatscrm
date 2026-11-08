import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "./use-workspace";
import { sbAny } from "@/lib/supabase/untyped";

// The tables land after `types.ts` regeneration; use a loose client until then.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// ---------- Types ----------
export type IPAllowlistRow = {
  id: string;
  workspace_id: string;
  label: string;
  cidr: string;
  applies_to: "api" | "ui" | "all";
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type RetentionResource =
  | "messages" | "conversations" | "media" | "audit_logs"
  | "webhook_events" | "login_history" | "activities"
  | "notifications" | "error_logs";

export type RetentionPolicyRow = {
  id: string;
  workspace_id: string;
  resource: RetentionResource;
  retention_days: number;
  is_active: boolean;
  last_run_at: string | null;
  last_deleted_count: number;
  updated_at: string;
};

export type GdprRequestRow = {
  id: string;
  workspace_id: string;
  subject_type: "contact" | "user";
  subject_id: string;
  subject_identifier: string | null;
  request_type: "export" | "erasure" | "restriction" | "rectification" | "portability";
  status: "pending" | "processing" | "completed" | "rejected" | "failed";
  requested_at: string;
  due_at: string;
  completed_at: string | null;
  notes: string | null;
};

export type SecurityEventRow = {
  id: string;
  workspace_id: string | null;
  actor_id: string | null;
  severity: "info" | "warning" | "critical";
  event_type: string;
  resource_type: string | null;
  resource_id: string | null;
  ip_address: string | null;
  data: Record<string, unknown>;
  created_at: string;
};

// ---------- IP Allowlists ----------
export function useIPAllowlists() {
  const { data: ws } = useCurrentWorkspace();
  return useQuery({
    enabled: !!ws?.id,
    queryKey: ["ip-allowlists", ws?.id],
    queryFn: async (): Promise<IPAllowlistRow[]> => {
      const { data, error } = await db
        .from("ip_allowlists")
        .select("*")
        .eq("workspace_id", ws!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as IPAllowlistRow[];
    },
  });
}

export function useUpsertIPAllowlist() {
  const qc = useQueryClient();
  const { data: ws } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (row: Partial<IPAllowlistRow> & { label: string; cidr: string }) => {
      const payload = { ...row, workspace_id: ws!.id };
      const { data, error } = await sbAny(db).from("ip_allowlists").upsert(payload).select().single();
      if (error) throw error;
      return data as IPAllowlistRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ip-allowlists"] }),
  });
}

export function useDeleteIPAllowlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sbAny(db).from("ip_allowlists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ip-allowlists"] }),
  });
}

// ---------- Retention Policies ----------
export function useRetentionPolicies() {
  const { data: ws } = useCurrentWorkspace();
  return useQuery({
    enabled: !!ws?.id,
    queryKey: ["retention-policies", ws?.id],
    queryFn: async (): Promise<RetentionPolicyRow[]> => {
      const { data, error } = await db
        .from("data_retention_policies")
        .select("*")
        .eq("workspace_id", ws!.id)
        .order("resource");
      if (error) throw error;
      return (data ?? []) as RetentionPolicyRow[];
    },
  });
}

export function useUpsertRetentionPolicy() {
  const qc = useQueryClient();
  const { data: ws } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (row: { resource: RetentionResource; retention_days: number; is_active?: boolean }) => {
      const { data, error } = await db
        .from("data_retention_policies")
        .upsert({ ...row, workspace_id: ws!.id }, { onConflict: "workspace_id,resource" })
        .select()
        .single();
      if (error) throw error;
      return data as RetentionPolicyRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["retention-policies"] }),
  });
}

// ---------- GDPR ----------
export function useGdprRequests() {
  const { data: ws } = useCurrentWorkspace();
  return useQuery({
    enabled: !!ws?.id,
    queryKey: ["gdpr-requests", ws?.id],
    queryFn: async (): Promise<GdprRequestRow[]> => {
      const { data, error } = await db
        .from("gdpr_requests")
        .select("*")
        .eq("workspace_id", ws!.id)
        .order("requested_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as GdprRequestRow[];
    },
  });
}

export function useCreateGdprRequest() {
  const qc = useQueryClient();
  const { data: ws } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (row: {
      subject_type: "contact" | "user";
      subject_id: string;
      subject_identifier?: string;
      request_type: GdprRequestRow["request_type"];
      notes?: string;
    }) => {
      const { data, error } = await db
        .from("gdpr_requests")
        .insert({ ...row, workspace_id: ws!.id })
        .select()
        .single();
      if (error) throw error;
      return data as GdprRequestRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gdpr-requests"] }),
  });
}

export function useUpdateGdprRequestStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { id: string; status: GdprRequestRow["status"]; notes?: string }) => {
      const patch: Record<string, unknown> = { status: params.status };
      if (params.notes !== undefined) patch.notes = params.notes;
      if (params.status === "completed") patch.completed_at = new Date().toISOString();
      const { error } = await sbAny(db).from("gdpr_requests").update(patch).eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gdpr-requests"] }),
  });
}

// ---------- Security Events ----------
export function useSecurityEvents(limit = 100) {
  const { data: ws } = useCurrentWorkspace();
  return useQuery({
    enabled: !!ws?.id,
    queryKey: ["security-events", ws?.id, limit],
    queryFn: async (): Promise<SecurityEventRow[]> => {
      const { data, error } = await db
        .from("security_events")
        .select("*")
        .eq("workspace_id", ws!.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as SecurityEventRow[];
    },
    refetchInterval: 30_000,
  });
}

export async function logSecurityEvent(params: {
  workspaceId?: string | null;
  eventType: string;
  severity?: "info" | "warning" | "critical";
  resourceType?: string;
  resourceId?: string;
  data?: Record<string, unknown>;
}) {
  await db.rpc("log_security_event", {
    _workspace_id: params.workspaceId ?? null,
    _event_type: params.eventType,
    _severity: params.severity ?? "info",
    _resource_type: params.resourceType ?? null,
    _resource_id: params.resourceId ?? null,
    _data: params.data ?? {},
  });
}

// ---------- Rate Limit (client-side gate; server enforces canonically) ----------
export async function checkRateLimit(bucketKey: string, limit: number, windowSeconds = 60) {
  const { data, error } = await db.rpc("enforce_rate_limit", {
    _bucket_key: bucketKey,
    _limit: limit,
    _window_seconds: windowSeconds,
    _workspace_id: null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row as { allowed: boolean; remaining: number; reset_at: string };
}

// ---------- Webhook Signing Rotation ----------
export function useWebhookSigningSecrets() {
  const { data: ws } = useCurrentWorkspace();
  return useQuery({
    enabled: !!ws?.id,
    queryKey: ["webhook-signing-secrets", ws?.id],
    queryFn: async () => {
      const { data, error } = await db
        .from("webhook_signing_secrets")
        .select("id, secret_prefix, is_primary, activated_at, retired_at, created_at")
        .eq("workspace_id", ws!.id)
        .order("activated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; secret_prefix: string; is_primary: boolean;
        activated_at: string; retired_at: string | null; created_at: string;
      }>;
    },
  });
}

export function useRotateWebhookSecret() {
  const qc = useQueryClient();
  const { data: ws } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async () => {
      // Generate a fresh 32-byte hex secret client-side; only the hash + prefix persist.
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      const secret = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
      const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");

      // Retire previous primaries.
      await db
        .from("webhook_signing_secrets")
        .update({ is_primary: false, retired_at: new Date().toISOString() })
        .eq("workspace_id", ws!.id)
        .eq("is_primary", true);

      const { error } = await sbAny(db).from("webhook_signing_secrets").insert({
        workspace_id: ws!.id,
        secret_hash: hash,
        secret_prefix: secret.slice(0, 8),
        is_primary: true,
      });
      if (error) throw error;
      await logSecurityEvent({
        workspaceId: ws!.id,
        eventType: "webhook.signing_secret.rotated",
        severity: "warning",
      });
      // The plaintext is returned once — the caller must display and discard it.
      return { secret };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["webhook-signing-secrets"] }),
  });
}
