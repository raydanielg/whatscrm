import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";

export type ConsentStatus = "opted_in" | "opted_out" | "pending" | "unsubscribed";
export type ConsentChannel = "whatsapp" | "email" | "sms" | "voice" | "push";
export type ConsentPurpose = "marketing" | "transactional" | "utility" | "authentication" | "service";

export type ConsentRecord = {
  id: string;
  workspace_id: string;
  contact_id: string;
  channel: ConsentChannel | string;
  purpose: ConsentPurpose | string;
  status: ConsentStatus;
  source: string | null;
  ip_address: string | null;
  user_agent: string | null;
  proof_url: string | null;
  notes: string | null;
  effective_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contact?: any;
};

export function useConsentRecords(opts?: {
  status?: ConsentStatus;
  channel?: string;
  purpose?: string;
  contactId?: string;
  search?: string;
  limit?: number;
}) {
  const { active } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["consent-records", active?.id, opts],
    enabled: !!active?.id,
    queryFn: async () => {
      let q = supabase
        .from("consent_records")
        .select(
          "*, contact:contacts(id, first_name, last_name, phone_number:phone, email)"
        )
        .eq("workspace_id", active!.id)
        .order("effective_at", { ascending: false })
        .limit(opts?.limit ?? 500);
      if (opts?.status) q = q.eq("status", opts.status);
      if (opts?.channel) q = q.eq("channel", opts.channel);
      if (opts?.purpose) q = q.eq("purpose", opts.purpose);
      if (opts?.contactId) q = q.eq("contact_id", opts.contactId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ConsentRecord[];
    },
  });
}

export function useConsentStats() {
  const { active } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["consent-stats", active?.id],
    enabled: !!active?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("consent_records")
        .select("status,channel,purpose,expires_at,effective_at")
        .eq("workspace_id", active!.id)
        .limit(10000);
      if (error) throw error;
      const rows = data ?? [];
      const now = Date.now();
      const in30 = now + 30 * 86400_000;
      const stats = {
        total: rows.length,
        optedIn: 0,
        optedOut: 0,
        pending: 0,
        unsubscribed: 0,
        expiringSoon: 0,
        expired: 0,
        byChannel: {} as Record<string, number>,
        byPurpose: {} as Record<string, number>,
      };
      for (const r of rows) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row = r as any;
        if (row.status === "opted_in") stats.optedIn++;
        else if (row.status === "opted_out") stats.optedOut++;
        else if (row.status === "pending") stats.pending++;
        else if (row.status === "unsubscribed") stats.unsubscribed++;
        if (row.expires_at) {
          const t = new Date(row.expires_at).getTime();
          if (t < now) stats.expired++;
          else if (t < in30) stats.expiringSoon++;
        }
        stats.byChannel[row.channel] = (stats.byChannel[row.channel] ?? 0) + 1;
        stats.byPurpose[row.purpose] = (stats.byPurpose[row.purpose] ?? 0) + 1;
      }
      const complianceScore =
        stats.total === 0
          ? 100
          : Math.round(((stats.optedIn) / Math.max(stats.total, 1)) * 100);
      return { ...stats, complianceScore };
    },
  });
}

export function useSuppressionList() {
  const { active } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["consent-suppression", active?.id],
    enabled: !!active?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("consent_records")
        .select(
          "*, contact:contacts(id, first_name, last_name, phone_number:phone, email)"
        )
        .eq("workspace_id", active!.id)
        .in("status", ["opted_out", "unsubscribed"])
        .order("effective_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as ConsentRecord[];
    },
  });
}

export function useRecordConsent() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: {
      contact_id: string;
      channel: string;
      purpose: string;
      status: ConsentStatus;
      source?: string;
      notes?: string;
      expires_at?: string | null;
      proof_url?: string | null;
    }) => {
      const payload = {
        ...input,
        workspace_id: active!.id,
        effective_at: new Date().toISOString(),
        revoked_at:
          input.status === "opted_out" || input.status === "unsubscribed"
            ? new Date().toISOString()
            : null,
        user_agent:
          typeof navigator !== "undefined" ? navigator.userAgent : null,
      };
      const { data, error } = await supabase
        .from("consent_records")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(payload as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as ConsentRecord;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["consent-records"] });
      qc.invalidateQueries({ queryKey: ["consent-stats"] });
      qc.invalidateQueries({ queryKey: ["consent-suppression"] });
    },
  });
}

export function useConfirmDoubleOptIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("consent_records")
        .update({
          status: "opted_in",
          effective_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "pending")
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["consent-records"] });
      qc.invalidateQueries({ queryKey: ["consent-stats"] });
    },
  });
}

export function useGdprRequests() {
  const { active } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["gdpr-requests", active?.id],
    enabled: !!active?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gdpr_requests")
        .select("*")
        .eq("workspace_id", active!.id)
        .order("requested_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateGdprRequest() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: {
      subject_type: string;
      subject_id: string;
      subject_identifier?: string;
      request_type:
        | "export"
        | "erasure"
        | "restriction"
        | "rectification"
        | "portability";
      reason?: string;
    }) => {
      const { data, error } = await supabase
        .from("gdpr_requests")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({ ...input, workspace_id: active!.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["gdpr-requests"] }),
  });
}

export function useConsentAuditLogs() {
  const { active } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["consent-audit", active?.id],
    enabled: !!active?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("workspace_id", active!.id)
        .in("resource_type", ["consent_record", "gdpr_request", "contact"])
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useConsentRealtime() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  useEffect(() => {
    if (!active?.id) return;
    const ch = supabase
      .channel(`consent-${active.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "consent_records" },
        () => {
          qc.invalidateQueries({ queryKey: ["consent-records"] });
          qc.invalidateQueries({ queryKey: ["consent-stats"] });
          qc.invalidateQueries({ queryKey: ["consent-suppression"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gdpr_requests" },
        () => qc.invalidateQueries({ queryKey: ["gdpr-requests"] })
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [active?.id, qc]);
}

export function useContactConsentSummary(contactId: string | undefined) {
  const { data } = useConsentRecords({ contactId, limit: 100 });
  return useMemo(() => {
    if (!data || !contactId) return null;
    const latestByKey = new Map<string, ConsentRecord>();
    for (const r of data) {
      const k = `${r.channel}:${r.purpose}`;
      const existing = latestByKey.get(k);
      if (!existing || new Date(r.effective_at) > new Date(existing.effective_at)) {
        latestByKey.set(k, r);
      }
    }
    return {
      history: data,
      current: Array.from(latestByKey.values()),
      hasMarketingConsent: Array.from(latestByKey.values()).some(
        (r) => r.purpose === "marketing" && r.status === "opted_in"
      ),
    };
  }, [data, contactId]);
}
