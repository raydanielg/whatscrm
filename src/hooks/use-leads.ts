import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invalidateContactCaches, resolveDisplayName } from "@/lib/crm/contact-identity";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { sbAny } from "@/lib/supabase/untyped";
import { useTenantCurrency } from "@/hooks/use-currency";

export type LeadRow = {
  id: string;
  workspace_id: string;
  organization_id: string | null;
  owner_id: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  job_title: string | null;
  source: string | null;
  status: string;
  score: number;
  rating: string | null;
  notes: string | null;
  tags: string[];
  custom_fields: Record<string, unknown>;
  converted_contact_id: string | null;
  converted_company_id: string | null;
  converted_deal_id: string | null;
  converted_at: string | null;
  qualified_at: string | null;
  disqualified_at: string | null;
  disqualify_reason: string | null;
  last_activity_at: string | null;
  next_follow_up_at: string | null;
  score_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type LeadFilters = {
  search?: string;
  createdAfter?: string;
  status?: string;
  source?: string;
  ownerId?: string;
  rating?: string;
  tags?: string[];
  minScore?: number;
  converted?: boolean;
  showDeleted?: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyFrom = (t: string) => sbAny(supabase).from(t as any) as any;

export const LEAD_STATUSES = ["new", "contacted", "working", "qualified", "unqualified", "disqualified", "nurturing", "converted"] as const;
export const LEAD_RATINGS = ["hot", "warm", "cold"] as const;
export const LEAD_SOURCES = ["website", "referral", "cold_outbound", "event", "advertising", "social", "partner", "import", "manual", "other"] as const;

export function leadDisplayName(l: Partial<LeadRow>): string {
  return resolveDisplayName(l as never, "Unnamed lead");
}

export function leadInitials(l: Partial<LeadRow>): string {
  return leadDisplayName(l).split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

/* ------------------------------ Queries ------------------------------ */

export function useLeads(filters: LeadFilters = {}) {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  return useQuery({
    queryKey: ["leads", workspaceId, filters],
    enabled: !!workspaceId,
    queryFn: async (): Promise<LeadRow[]> => {
      let q = anyFrom("leads").select("*").eq("workspace_id", workspaceId);
      if (!filters.showDeleted) q = q.is("deleted_at", null);
      if (filters.createdAfter) q = q.gte("created_at", filters.createdAfter);
      if (filters.status) q = q.eq("status", filters.status);
      if (filters.source) q = q.eq("source", filters.source);
      if (filters.rating) q = q.eq("rating", filters.rating);
      if (filters.ownerId) q = q.eq("owner_id", filters.ownerId);
      if (filters.tags?.length) q = q.overlaps("tags", filters.tags);
      if (typeof filters.minScore === "number") q = q.gte("score", filters.minScore);
      if (filters.converted === true) q = q.not("converted_at", "is", null);
      else if (filters.converted === false) q = q.is("converted_at", null);
      if (filters.search?.trim()) {
        const s = filters.search.trim().replace(/[%,]/g, " ");
        q = q.or([
          `full_name.ilike.%${sanitizeSearchTerm(s)}%`,
          `first_name.ilike.%${sanitizeSearchTerm(s)}%`,
          `last_name.ilike.%${sanitizeSearchTerm(s)}%`,
          `email.ilike.%${sanitizeSearchTerm(s)}%`,
          `phone.ilike.%${sanitizeSearchTerm(s)}%`,
          `company_name.ilike.%${sanitizeSearchTerm(s)}%`,
          `job_title.ilike.%${sanitizeSearchTerm(s)}%`,
        ].join(","));
      }
      const { data, error } = await q.order("score", { ascending: false }).order("updated_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as LeadRow[];
    },
  });
}

/** Exact total for the dashboard's seven-day destination filter. */
export function useRecentLeadsCount(since: string | undefined) {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  return useQuery<number>({
    queryKey: ["leads", "recent-count", workspaceId, since],
    enabled: !!workspaceId && !!since,
    queryFn: async () => {
      const { count, error } = await anyFrom("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .gte("created_at", since);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: ["lead", id],
    enabled: !!id,
    queryFn: async (): Promise<LeadRow | null> => {
      const { data, error } = await anyFrom("leads").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data ?? null) as LeadRow | null;
    },
  });
}

/* ------------------------------ Mutations ------------------------------ */

export type LeadInput = Partial<Omit<LeadRow, "id" | "workspace_id" | "created_at" | "updated_at" | "deleted_at">>;

export function useCreateLead() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: LeadInput): Promise<LeadRow> => {
      if (!active?.id) throw new Error("No workspace selected");
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      const full = input.full_name ?? ([input.first_name, input.last_name].filter(Boolean).join(" ") || null);
      const payload = {
        workspace_id: active.id,
        organization_id: active.organization_id ?? null,
        owner_id: input.owner_id ?? uid,
        first_name: input.first_name ?? null,
        last_name: input.last_name ?? null,
        full_name: full,
        email: input.email ?? null,
        phone: input.phone ?? null,
        company_name: input.company_name ?? null,
        job_title: input.job_title ?? null,
        source: input.source ?? "manual",
        status: input.status ?? "new",
        score: input.score ?? 0,
        rating: input.rating ?? null,
        notes: input.notes ?? null,
        tags: input.tags ?? [],
        custom_fields: input.custom_fields ?? {},
        score_reason: input.score_reason ?? null,
        next_follow_up_at: input.next_follow_up_at ?? null,
        created_by: uid,
      };
      const { data, error } = await anyFrom("leads").insert(payload).select().single();
      if (error) throw error;
      return data as LeadRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: LeadInput }) => {
      const p = { ...patch } as Record<string, unknown>;
      if (patch.first_name !== undefined || patch.last_name !== undefined) {
        p.full_name = patch.full_name ?? ([patch.first_name, patch.last_name].filter(Boolean).join(" ") || null);
      }
      const { error } = await anyFrom("leads").update(p).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead", v.id] });
    },
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, hard = false }: { id: string; hard?: boolean }) => {
      if (hard) {
        const { error } = await anyFrom("leads").delete().eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await anyFrom("leads").update({ deleted_at: new Date().toISOString() }).eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}

export function useBulkUpdateLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[]; patch: LeadInput }) => {
      if (!ids.length) return;
      const { error } = await anyFrom("leads").update(patch).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}

export function useBulkDeleteLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, hard = false }: { ids: string[]; hard?: boolean }) => {
      if (!ids.length) return;
      if (hard) {
        const { error } = await anyFrom("leads").delete().in("id", ids);
        if (error) throw error;
      } else {
        const { error } = await anyFrom("leads")
          .update({ deleted_at: new Date().toISOString() }).in("id", ids);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}

/* ------------------------------ Convert lead ------------------------------ */

export type ConvertLeadInput = {
  leadId: string;
  createContact?: boolean;
  createCompany?: boolean;
  createDeal?: boolean;
  contactOverrides?: Record<string, unknown>;
  companyOverrides?: Record<string, unknown>;
  deal?: { title: string; amount?: number | null; currency?: string; stage_id?: string | null; probability?: number | null };
};

export function useConvertLead() {
  const tenantCurrency = useTenantCurrency();
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: ConvertLeadInput) => {
      if (!active?.id) throw new Error("No workspace selected");
      const { data: leadData, error: lErr } = await anyFrom("leads").select("*").eq("id", input.leadId).maybeSingle();
      if (lErr) throw lErr;
      const lead = leadData as LeadRow | null;
      if (!lead) throw new Error("Lead not found");
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;

      let companyId: string | null = lead.converted_company_id;
      if (input.createCompany && !companyId && lead.company_name) {
        const companyPayload = {
          workspace_id: active.id,
          organization_id: active.organization_id ?? null,
          owner_id: lead.owner_id ?? uid,
          name: lead.company_name,
          source: lead.source ?? "lead",
          status: "prospect",
          created_by: uid,
          ...(input.companyOverrides ?? {}),
        };
        const { data: comp, error: cErr } = await anyFrom("companies").insert(companyPayload).select("id").single();
        if (cErr) throw cErr;
        companyId = comp.id as string;
      }

      let contactId: string | null = lead.converted_contact_id;
      if (input.createContact !== false && !contactId) {
        const full = lead.full_name ?? ([lead.first_name, lead.last_name].filter(Boolean).join(" ") || null);
        const contactPayload = {
          workspace_id: active.id,
          organization_id: active.organization_id ?? null,
          owner_id: lead.owner_id ?? uid,
          company_id: companyId,
          first_name: lead.first_name,
          last_name: lead.last_name,
          display_name: full,
          name: full,
          email: lead.email,
          emails: lead.email ? [{ email: lead.email, is_primary: true }] : [],
          phone: lead.phone,
          phones: lead.phone ? [{ number: lead.phone, is_primary: true }] : [],
          job_title: lead.job_title,
          tags: lead.tags ?? [],
          lifecycle_stage: "customer",
          customer_status: "active",
          source: lead.source ?? "lead",
          converted_from_lead_id: lead.id,
          first_customer_at: new Date().toISOString(),
          custom_fields: lead.custom_fields ?? {},
          ...(input.contactOverrides ?? {}),
        };
        const { data: c, error: cErr } = await anyFrom("contacts").insert(contactPayload).select("id").single();
        if (cErr) throw cErr;
        contactId = c.id as string;
      }

      let dealId: string | null = lead.converted_deal_id;
      if (input.createDeal && input.deal?.title && !dealId) {
        const dealPayload = {
          workspace_id: active.id,
          organization_id: active.organization_id ?? null,
          owner_id: lead.owner_id ?? uid,
          contact_id: contactId,
          company_id: companyId,
          title: input.deal.title,
          amount: input.deal.amount ?? null,
          currency: input.deal.currency ?? tenantCurrency,
          stage_id: input.deal.stage_id ?? null,
          probability: input.deal.probability ?? null,
          status: "open",
          source: lead.source ?? "lead",
          created_by: uid,
        };
        const { data: d, error: dErr } = await anyFrom("deals").insert(dealPayload).select("id").single();
        if (dErr) throw dErr;
        dealId = d.id as string;
      }

      const { error: uErr } = await anyFrom("leads").update({
        status: "converted",
        converted_at: new Date().toISOString(),
        converted_contact_id: contactId,
        converted_company_id: companyId,
        converted_deal_id: dealId,
      }).eq("id", lead.id);
      if (uErr) throw uErr;

      return { contactId, companyId, dealId };
    },
    onSuccess: () => {
      invalidateContactCaches(qc);
      qc.invalidateQueries({ queryKey: ["companies"] });
      qc.invalidateQueries({ queryKey: ["deals"] });
    },
  });
}

/* ------------------------------ Realtime ------------------------------ */

export function useLeadsRealtime() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  useEffect(() => {
    if (!workspaceId || typeof window === "undefined") return;
    const channel = supabase
      .channel(`leads:${workspaceId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "leads", filter: `workspace_id=eq.${workspaceId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["leads"] });
          qc.invalidateQueries({ queryKey: ["lead"] });
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [workspaceId, qc]);
}

/* ------------------------------ CSV ------------------------------ */

export function leadsToCsv(rows: LeadRow[]): string {
  const headers = ["first_name","last_name","email","phone","company_name","job_title","source","status","score","rating","tags","notes"];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([r.first_name, r.last_name, r.email, r.phone, r.company_name, r.job_title, r.source, r.status, r.score, r.rating, (r.tags ?? []).join("|"), r.notes].map(esc).join(","));
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
