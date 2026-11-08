import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { fetchContactAttachments } from "@/lib/crm/contact-attachments";
import { invalidateContactCaches, resolveDisplayName, resolveInitials } from "@/lib/crm/contact-identity";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { sbAny } from "@/lib/supabase/untyped";

export type CustomerRow = {
  id: string;
  workspace_id: string;
  owner_id: string | null;
  company_id: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  job_title: string | null;
  lifecycle_stage: string;
  customer_status: string | null;
  customer_lifetime_value: number | null;
  customer_health_score: number | null;
  segments: string[];
  preferences: Record<string, unknown>;
  tags: string[];
  first_customer_at: string | null;
  converted_from_lead_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerFilters = {
  search?: string;
  segment?: string;
  customerStatus?: string;
  ownerId?: string;
  minHealth?: number;
  minLtv?: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyFrom = (t: string) => sbAny(supabase).from(t as any) as any;

export const CUSTOMER_STATUSES = ["prospect", "active", "at_risk", "churned", "vip"] as const;

export function customerDisplayName(c: Partial<CustomerRow>): string {
  return resolveDisplayName(c as never, "Unnamed customer");
}

export function customerInitials(c: Partial<CustomerRow>): string {
  return resolveInitials(c as never, "Unnamed customer");
}

/* ------------------------------ Queries ------------------------------ */

export function useCustomers(filters: CustomerFilters = {}) {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  return useQuery({
    queryKey: ["customers", workspaceId, filters],
    enabled: !!workspaceId,
    queryFn: async (): Promise<CustomerRow[]> => {
      let q = anyFrom("contacts")
        .select("id, workspace_id, owner_id, company_id, first_name, last_name, display_name, name, email, phone, avatar_url, job_title, lifecycle_stage, customer_status, customer_lifetime_value, customer_health_score, segments, preferences, tags, first_customer_at, converted_from_lead_id, created_at, updated_at")
        .eq("workspace_id", workspaceId)
        .eq("lifecycle_stage", "customer")
        .is("deleted_at", null);
      if (filters.customerStatus) q = q.eq("customer_status", filters.customerStatus);
      if (filters.ownerId) q = q.eq("owner_id", filters.ownerId);
      if (filters.segment) q = q.contains("segments", [filters.segment]);
      if (typeof filters.minHealth === "number") q = q.gte("customer_health_score", filters.minHealth);
      if (typeof filters.minLtv === "number") q = q.gte("customer_lifetime_value", filters.minLtv);
      if (filters.search?.trim()) {
        const s = filters.search.trim().replace(/[%,]/g, " ");
        q = q.or([
          `display_name.ilike.%${sanitizeSearchTerm(s)}%`,
          `first_name.ilike.%${sanitizeSearchTerm(s)}%`,
          `last_name.ilike.%${sanitizeSearchTerm(s)}%`,
          `email.ilike.%${sanitizeSearchTerm(s)}%`,
          `phone.ilike.%${sanitizeSearchTerm(s)}%`,
        ].join(","));
      }
      const { data, error } = await q.order("customer_lifetime_value", { ascending: false, nullsFirst: false }).order("updated_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as CustomerRow[];
    },
  });
}

/** Exact total for the dashboard's active-customer destination filter. */
export function useActiveCustomerCount(enabled: boolean) {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  return useQuery<number>({
    queryKey: ["customers", "active-count", workspaceId],
    enabled: enabled && !!workspaceId,
    queryFn: async () => {
      const { count, error } = await anyFrom("contacts")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("lifecycle_stage", "customer")
        .eq("customer_status", "active")
        .is("deleted_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useCustomer(id: string | undefined) {
  return useQuery({
    queryKey: ["customer", id],
    enabled: !!id,
    queryFn: async (): Promise<CustomerRow | null> => {
      const { data, error } = await anyFrom("contacts").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data ?? null) as CustomerRow | null;
    },
  });
}

export function useCustomerTimeline(customerId: string | undefined) {
  return useQuery({
    queryKey: ["customer-timeline", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await anyFrom("audit_logs")
        .select("id, action, actor_id, changes, resource_type, resource_id, created_at")
        .eq("resource_type", "contact")
        .eq("resource_id", customerId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; action: string; actor_id: string | null; changes: Record<string, unknown>; created_at: string }>;
    },
  });
}

export function useCustomerActivities(customerId: string | undefined) {
  return useQuery({
    queryKey: ["customer-activities", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await anyFrom("activities")
        .select("id, verb, object_type, object_id, summary, actor_id, data, created_at")
        .or(`object_id.eq.${customerId},target_id.eq.${customerId}`)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
    },
  });
}

export function useCustomerAttachments(customerId: string | undefined) {
  const { active } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["customer-attachments", active?.id, customerId],
    enabled: !!customerId && !!active?.id,
    queryFn: () => fetchContactAttachments(active!.id, customerId!),
  });
}

/* ------------------------------ Mutations ------------------------------ */

export type CustomerPatch = {
  customer_status?: string | null;
  customer_lifetime_value?: number | null;
  customer_health_score?: number | null;
  segments?: string[];
  preferences?: Record<string, unknown>;
  owner_id?: string | null;
  lifecycle_stage?: string;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  phone?: string | null;
  email?: string | null;
  job_title?: string | null;
};


export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: CustomerPatch }) => {
      const { error } = await anyFrom("contacts").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_r, v) => {
      invalidateContactCaches(qc, v.id);
    },
  });
}

export function useBulkUpdateCustomers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[]; patch: CustomerPatch }) => {
      if (!ids.length) return;
      const { error } = await anyFrom("contacts").update(patch).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateContactCaches(qc);
    },
  });
}

/* ------------------------------ Realtime ------------------------------ */

export function useCustomersRealtime() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  useEffect(() => {
    if (!workspaceId || typeof window === "undefined") return;
    const channel = supabase
      .channel(`customers:${workspaceId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "contacts", filter: `workspace_id=eq.${workspaceId}` },
        () => {
          invalidateContactCaches(qc);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [workspaceId, qc]);
}
