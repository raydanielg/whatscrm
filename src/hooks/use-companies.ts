import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { sbAny } from "@/lib/supabase/untyped";
import { useTenantCurrency } from "@/hooks/use-currency";

export type CompanyAddress = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
};

export type CompanyRow = {
  id: string;
  workspace_id: string;
  organization_id: string | null;
  owner_id: string | null;
  assigned_team_id: string | null;
  name: string;
  legal_name: string | null;
  domain: string | null;
  website: string | null;
  industry: string | null;
  business_type: string | null;
  company_size: string | null;
  annual_revenue: number | null;
  currency: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  about: string | null;
  logo_url: string | null;
  linkedin_url: string | null;
  twitter_handle: string | null;
  status: string;
  source: string | null;
  tags: string[];
  address: CompanyAddress;
  country: string | null;
  timezone: string | null;
  custom_fields: Record<string, unknown>;
  is_favorite: boolean;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CompanyFilters = {
  search?: string;
  favorite?: boolean;
  archived?: boolean;
  status?: string;
  industry?: string;
  ownerId?: string;
  tags?: string[];
  showDeleted?: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyFrom = (t: string) => sbAny(supabase).from(t as any) as any;

export function companyInitials(c: Partial<CompanyRow>): string {
  const n = (c.name ?? "").trim() || "?";
  return n
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/* ------------------------------ Queries ------------------------------ */

export function useCompanies(filters: CompanyFilters = {}) {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  return useQuery({
    queryKey: ["companies", workspaceId, filters],
    enabled: !!workspaceId,
    queryFn: async (): Promise<CompanyRow[]> => {
      let q = anyFrom("companies").select("*").eq("workspace_id", workspaceId);
      if (!filters.showDeleted) q = q.is("deleted_at", null);
      if (filters.archived === true) q = q.eq("is_archived", true);
      else if (filters.archived === false) q = q.eq("is_archived", false);
      if (filters.favorite === true) q = q.eq("is_favorite", true);
      if (filters.status) q = q.eq("status", filters.status);
      if (filters.industry) q = q.eq("industry", filters.industry);
      if (filters.ownerId) q = q.eq("owner_id", filters.ownerId);
      if (filters.tags && filters.tags.length) q = q.overlaps("tags", filters.tags);
      if (filters.search && filters.search.trim()) {
        const s = filters.search.trim().replace(/[%,]/g, " ");
        q = q.or(
          [
            `name.ilike.%${sanitizeSearchTerm(s)}%`,
            `legal_name.ilike.%${sanitizeSearchTerm(s)}%`,
            `domain.ilike.%${sanitizeSearchTerm(s)}%`,
            `website.ilike.%${sanitizeSearchTerm(s)}%`,
            `email.ilike.%${sanitizeSearchTerm(s)}%`,
            `industry.ilike.%${sanitizeSearchTerm(s)}%`,
          ].join(","),
        );
      }
      const { data, error } = await q.order("updated_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as CompanyRow[];
    },
  });
}

export function useCompany(companyId: string | undefined) {
  return useQuery({
    queryKey: ["company", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<CompanyRow | null> => {
      const { data, error } = await anyFrom("companies").select("*").eq("id", companyId).maybeSingle();
      if (error) throw error;
      return (data ?? null) as CompanyRow | null;
    },
  });
}

export function useCompanyContacts(companyId: string | undefined) {
  return useQuery({
    queryKey: ["company-contacts", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await anyFrom("contacts")
        .select("id, first_name, last_name, display_name, name, email, phone, job_title, avatar_url, lifecycle_stage")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; first_name: string | null; last_name: string | null; display_name: string | null;
        name: string | null; email: string | null; phone: string | null; job_title: string | null;
        avatar_url: string | null; lifecycle_stage: string | null;
      }>;
    },
  });
}

export function useCompanyDeals(companyId: string | undefined) {
  return useQuery({
    queryKey: ["company-deals", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await anyFrom("deals")
        .select("id, title, amount, currency, status, stage_id, probability, expected_close_date, updated_at")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
    },
  });
}

export function useCompanyTasks(companyId: string | undefined) {
  return useQuery({
    queryKey: ["company-tasks", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await anyFrom("tasks")
        .select("id, title, status, priority, due_at, assigned_to, updated_at")
        .eq("entity_type", "company")
        .eq("entity_id", companyId)
        .is("deleted_at", null)
        .order("due_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
    },
  });
}

export function useCompanyNotes(companyId: string | undefined) {
  return useQuery({
    queryKey: ["company-notes", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await anyFrom("notes")
        .select("id, body, is_pinned, author_id, created_at, updated_at")
        .eq("entity_type", "company")
        .eq("entity_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; body: string; is_pinned: boolean; author_id: string | null; created_at: string; updated_at: string }>;
    },
  });
}

export function useCompanyAttachments(companyId: string | undefined) {
  return useQuery({
    queryKey: ["company-attachments", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await anyFrom("attachments")
        .select("id, file_id, attached_by, created_at, files(id, name, mime_type, size_bytes, bucket, path, is_public)")
        .eq("entity_type", "company")
        .eq("entity_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
    },
  });
}

export function useCompanyConversations(companyId: string | undefined) {
  // Conversations are linked via contact_id — find via company contacts.
  return useQuery({
    queryKey: ["company-conversations", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data: contacts } = await anyFrom("contacts").select("id").eq("company_id", companyId).is("deleted_at", null);
      const ids = (contacts ?? []).map((c: { id: string }) => c.id);
      if (!ids.length) return [] as Array<Record<string, unknown>>;
      const { data, error } = await anyFrom("conversations")
        .select("id, contact_id, status, last_message_at, unread_count, ai_summary, updated_at")
        .in("contact_id", ids)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
    },
  });
}

export function useCompanyCampaigns(companyId: string | undefined) {
  return useQuery({
    queryKey: ["company-campaigns", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      // Company doesn't link directly to campaigns; return campaigns that share tags with the company.
      const { data: comp } = await anyFrom("companies").select("tags, workspace_id").eq("id", companyId).maybeSingle();
      const tags: string[] = (comp?.tags ?? []) as string[];
      if (!tags.length) return [] as Array<Record<string, unknown>>;
      const { data, error } = await anyFrom("campaigns")
        .select("id, name, status, scheduled_at, sent_count, delivered_count, read_count, audience_tags, updated_at")
        .eq("workspace_id", comp!.workspace_id)
        .overlaps("audience_tags", tags)
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Array<Record<string, unknown>>;
    },
  });
}

export function useCompanyTimeline(companyId: string | undefined) {
  return useQuery({
    queryKey: ["company-timeline", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await anyFrom("audit_logs")
        .select("id, action, actor_id, changes, resource_type, resource_id, created_at")
        .eq("resource_type", "company")
        .eq("resource_id", companyId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; action: string; actor_id: string | null; changes: Record<string, unknown>; created_at: string }>;
    },
  });
}

/* ------------------------------ Mutations ------------------------------ */

export type CompanyInput = Partial<Omit<CompanyRow, "id" | "workspace_id" | "created_at" | "updated_at" | "deleted_at">>;

export function useCreateCompany() {
  const tenantCurrency = useTenantCurrency();
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  return useMutation({
    mutationFn: async (input: CompanyInput): Promise<CompanyRow> => {
      if (!workspaceId) throw new Error("No workspace selected");
      if (!input.name?.trim()) throw new Error("Company name is required");
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      const payload = {
        workspace_id: workspaceId,
        organization_id: active?.organization_id ?? null,
        owner_id: input.owner_id ?? uid,
        assigned_team_id: input.assigned_team_id ?? null,
        name: input.name.trim(),
        legal_name: input.legal_name ?? null,
        domain: input.domain ?? null,
        website: input.website ?? null,
        industry: input.industry ?? null,
        business_type: input.business_type ?? null,
        company_size: input.company_size ?? null,
        annual_revenue: input.annual_revenue ?? null,
        currency: input.currency ?? tenantCurrency,
        phone: input.phone ?? null,
        email: input.email ?? null,
        description: input.description ?? null,
        about: input.about ?? null,
        logo_url: input.logo_url ?? null,
        linkedin_url: input.linkedin_url ?? null,
        twitter_handle: input.twitter_handle ?? null,
        status: input.status ?? "active",
        source: input.source ?? "manual",
        tags: input.tags ?? [],
        address: input.address ?? {},
        country: input.country ?? input.address?.country ?? null,
        timezone: input.timezone ?? null,
        custom_fields: input.custom_fields ?? {},
        is_favorite: input.is_favorite ?? false,
        is_archived: input.is_archived ?? false,
        created_by: uid,
      };
      const { data, error } = await anyFrom("companies").insert(payload).select().single();
      if (error) throw error;
      return data as CompanyRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["companies"] }),
  });
}

export function useUpdateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: CompanyInput }) => {
      const p = { ...patch } as Record<string, unknown>;
      if (patch.address && patch.country === undefined) p.country = patch.address.country ?? null;
      const { error } = await anyFrom("companies").update(p).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      qc.invalidateQueries({ queryKey: ["company", v.id] });
    },
  });
}

export function useDeleteCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, hard = false }: { id: string; hard?: boolean }) => {
      if (hard) {
        const { error } = await anyFrom("companies").delete().eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await anyFrom("companies").update({ deleted_at: new Date().toISOString() }).eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["companies"] }),
  });
}

export function useBulkUpdateCompanies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[]; patch: CompanyInput }) => {
      if (!ids.length) return;
      const { error } = await anyFrom("companies").update(patch).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["companies"] }),
  });
}

export function useAddCompanyNote() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async ({ companyId, body }: { companyId: string; body: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await anyFrom("notes").insert({
        workspace_id: active?.id,
        author_id: userData.user?.id ?? null,
        entity_type: "company",
        entity_id: companyId,
        body,
      });
      if (error) throw error;
    },
    onSuccess: (_r, v) => qc.invalidateQueries({ queryKey: ["company-notes", v.companyId] }),
  });
}

export function useDeleteCompanyNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; companyId: string }) => {
      const { error } = await anyFrom("notes").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_r, v) => qc.invalidateQueries({ queryKey: ["company-notes", v.companyId] }),
  });
}

/* ------------------------------ Realtime ------------------------------ */

export function useCompaniesRealtime() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  useEffect(() => {
    if (!workspaceId || typeof window === "undefined") return;
    const channel = supabase
      .channel(`companies:${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "companies", filter: `workspace_id=eq.${workspaceId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["companies"] });
          qc.invalidateQueries({ queryKey: ["company"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, qc]);
}

export function useCompanyDetailRealtime(companyId: string | undefined) {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  useEffect(() => {
    if (!workspaceId || !companyId || typeof window === "undefined") return;
    const channel = supabase
      .channel(`company-detail:${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts", filter: `workspace_id=eq.${workspaceId}` }, () => {
        qc.invalidateQueries({ queryKey: ["company-contacts", companyId] });
        qc.invalidateQueries({ queryKey: ["company-conversations", companyId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "deals", filter: `workspace_id=eq.${workspaceId}` }, () => {
        qc.invalidateQueries({ queryKey: ["company-deals", companyId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `workspace_id=eq.${workspaceId}` }, () => {
        qc.invalidateQueries({ queryKey: ["company-tasks", companyId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "notes", filter: `workspace_id=eq.${workspaceId}` }, () => {
        qc.invalidateQueries({ queryKey: ["company-notes", companyId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `workspace_id=eq.${workspaceId}` }, () => {
        qc.invalidateQueries({ queryKey: ["company-conversations", companyId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "campaigns", filter: `workspace_id=eq.${workspaceId}` }, () => {
        qc.invalidateQueries({ queryKey: ["company-campaigns", companyId] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "companies", filter: `id=eq.${companyId}` }, () => {
        qc.invalidateQueries({ queryKey: ["company", companyId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, companyId, qc]);
}

/* ------------------------------ CSV import/export ------------------------------ */

export function companiesToCsv(rows: CompanyRow[]): string {
  const headers = [
    "name","legal_name","domain","website","industry","business_type","company_size",
    "annual_revenue","currency","phone","email","country","timezone","status","tags",
  ];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.name, r.legal_name, r.domain, r.website, r.industry, r.business_type, r.company_size,
      r.annual_revenue, r.currency, r.phone, r.email, r.country, r.timezone, r.status,
      (r.tags ?? []).join("|"),
    ].map(esc).join(","));
  }
  return lines.join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
