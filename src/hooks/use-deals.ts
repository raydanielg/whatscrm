import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { sbAny } from "@/lib/supabase/untyped";
import { useTenantCurrency } from "@/hooks/use-currency";

/* --------------------------------- Types --------------------------------- */

export type DealStatus = "open" | "won" | "lost" | "abandoned";
export type DealPriority = "low" | "normal" | "high" | "urgent";

export type DealRow = {
  id: string;
  workspace_id: string;
  organization_id: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  owner_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  title: string;
  description: string | null;
  amount: number;
  currency: string;
  probability: number;
  expected_close_date: string | null;
  actual_close_date: string | null;
  status: DealStatus;
  loss_reason: string | null;
  source: string | null;
  priority: DealPriority;
  tags: string[];
  custom_fields: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type DealPipelineRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  position: number;
};

export type DealStageRow = {
  id: string;
  workspace_id: string;
  pipeline_id: string;
  name: string;
  position: number;
  probability: number;
  is_won: boolean;
  is_lost: boolean;
  color: string | null;
};

export type DealInput = Partial<
  Omit<DealRow, "id" | "workspace_id" | "created_at" | "updated_at" | "deleted_at">
>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyFrom = (t: string) => sbAny(supabase).from(t as any) as any;

export const DEAL_PRIORITIES: DealPriority[] = ["low", "normal", "high", "urgent"];
export const DEAL_STATUSES: DealStatus[] = ["open", "won", "lost", "abandoned"];
export const CURRENCIES = ["USD", "EUR", "GBP", "NOK", "SEK", "DKK", "INR", "AUD", "CAD", "AED"];

/* ------------------------------ Pipelines ------------------------------ */

export function usePipelines() {
  const { active } = useCurrentWorkspace();
  const wsId = active?.id;
  return useQuery({
    queryKey: ["deal_pipelines", wsId],
    enabled: !!wsId,
    queryFn: async (): Promise<DealPipelineRow[]> => {
      const { data, error } = await anyFrom("deal_pipelines")
        .select("*")
        .eq("workspace_id", wsId)
        .is("deleted_at", null)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DealPipelineRow[];
    },
  });
}

export function useStages(pipelineId: string | null | undefined) {
  return useQuery({
    queryKey: ["deal_stages", pipelineId],
    enabled: !!pipelineId,
    queryFn: async (): Promise<DealStageRow[]> => {
      const { data, error } = await anyFrom("deal_stages")
        .select("*")
        .eq("pipeline_id", pipelineId)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DealStageRow[];
    },
  });
}

/** Create a default pipeline with a standard 5-stage flow. */
export function useCreateDefaultPipeline() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async () => {
      if (!active?.id) throw new Error("No workspace selected");
      const { data: pipe, error: pErr } = await anyFrom("deal_pipelines")
        .insert({ workspace_id: active.id, name: "Sales Pipeline", is_default: true, position: 0 })
        .select()
        .single();
      if (pErr) throw pErr;
      const stages = [
        { name: "New", position: 0, probability: 10, color: "#94a3b8" },
        { name: "Qualified", position: 1, probability: 30, color: "#3b82f6" },
        { name: "Proposal", position: 2, probability: 55, color: "#8b5cf6" },
        { name: "Negotiation", position: 3, probability: 75, color: "#f59e0b" },
        { name: "Closed Won", position: 4, probability: 100, is_won: true, color: "#10b981" },
        { name: "Closed Lost", position: 5, probability: 0, is_lost: true, color: "#ef4444" },
      ].map((s) => ({ ...s, workspace_id: active.id, pipeline_id: pipe.id }));
      const { error: sErr } = await anyFrom("deal_stages").insert(stages);
      if (sErr) throw sErr;
      return pipe as DealPipelineRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deal_pipelines"] });
      qc.invalidateQueries({ queryKey: ["deal_stages"] });
      qc.invalidateQueries({ queryKey: ["dash", "pipeline-summary"] });
    },
  });
}

/* ------------------------------ Deals ------------------------------ */

export type DealFilters = {
  search?: string;
  pipelineId?: string;
  stageId?: string;
  ownerId?: string;
  status?: DealStatus;
  priority?: DealPriority;
  tags?: string[];
  companyId?: string;
  contactId?: string;
  showDeleted?: boolean;
};

export function useDeals(filters: DealFilters = {}) {
  const { active } = useCurrentWorkspace();
  const wsId = active?.id;
  return useQuery({
    queryKey: ["deals", wsId, filters],
    enabled: !!wsId,
    queryFn: async (): Promise<DealRow[]> => {
      let q = anyFrom("deals").select("*").eq("workspace_id", wsId);
      if (!filters.showDeleted) q = q.is("deleted_at", null);
      if (filters.pipelineId) q = q.eq("pipeline_id", filters.pipelineId);
      if (filters.stageId) q = q.eq("stage_id", filters.stageId);
      if (filters.ownerId) q = q.eq("owner_id", filters.ownerId);
      if (filters.status) q = q.eq("status", filters.status);
      if (filters.priority) q = q.eq("priority", filters.priority);
      if (filters.companyId) q = q.eq("company_id", filters.companyId);
      if (filters.contactId) q = q.eq("contact_id", filters.contactId);
      if (filters.tags?.length) q = q.overlaps("tags", filters.tags);
      if (filters.search?.trim()) {
        const s = filters.search.trim().replace(/[%,]/g, " ");
        q = q.or([`title.ilike.%${sanitizeSearchTerm(s)}%`, `description.ilike.%${sanitizeSearchTerm(s)}%`].join(","));
      }
      const { data, error } = await q
        .order("updated_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as DealRow[];
    },
  });
}

export function useDeal(id: string | undefined) {
  return useQuery({
    queryKey: ["deal", id],
    enabled: !!id,
    queryFn: async (): Promise<DealRow | null> => {
      const { data, error } = await anyFrom("deals").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data ?? null) as DealRow | null;
    },
  });
}

/* ------------------------------ Mutations ------------------------------ */

export function useCreateDeal() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  // A deal created without an explicit currency takes the tenant's, not USD:
  // the value is written into the row, so a wrong default here is permanent.
  const tenantCurrency = useTenantCurrency();
  return useMutation({
    mutationFn: async (input: DealInput): Promise<DealRow> => {
      if (!active?.id) throw new Error("No workspace selected");
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      const payload = {
        workspace_id: active.id,
        organization_id: active.organization_id ?? null,
        pipeline_id: input.pipeline_id ?? null,
        stage_id: input.stage_id ?? null,
        owner_id: input.owner_id ?? uid,
        contact_id: input.contact_id ?? null,
        company_id: input.company_id ?? null,
        title: input.title ?? "Untitled deal",
        description: input.description ?? null,
        amount: input.amount ?? 0,
        currency: input.currency ?? tenantCurrency,
        probability: input.probability ?? 0,
        expected_close_date: input.expected_close_date ?? null,
        status: input.status ?? "open",
        source: input.source ?? null,
        priority: input.priority ?? "normal",
        tags: input.tags ?? [],
        custom_fields: input.custom_fields ?? {},
        created_by: uid,
      };
      const { data, error } = await anyFrom("deals").insert(payload).select().single();
      if (error) throw error;
      return data as DealRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["dash", "pipeline-summary"] });
    },
  });
}

export function useUpdateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: DealInput }) => {
      const p: Record<string, unknown> = { ...patch };
      // Auto-close date when moving to won/lost
      if (patch.status === "won" || patch.status === "lost") {
        p.actual_close_date = p.actual_close_date ?? new Date().toISOString().slice(0, 10);
      }
      const { error } = await anyFrom("deals").update(p).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["deal", v.id] });
      qc.invalidateQueries({ queryKey: ["dash", "pipeline-summary"] });
    },
  });
}

export function useDeleteDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, hard = false }: { id: string; hard?: boolean }) => {
      if (hard) {
        const { error } = await anyFrom("deals").delete().eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await anyFrom("deals")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["dash", "pipeline-summary"] });
    },
  });
}

export function useDuplicateDeal() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (id: string): Promise<DealRow> => {
      if (!active?.id) throw new Error("No workspace selected");
      const { data: src, error: sErr } = await anyFrom("deals").select("*").eq("id", id).single();
      if (sErr) throw sErr;
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      const s = src as DealRow;
      const payload = {
        workspace_id: s.workspace_id,
        organization_id: s.organization_id,
        pipeline_id: s.pipeline_id,
        stage_id: s.stage_id,
        owner_id: s.owner_id ?? uid,
        contact_id: s.contact_id,
        company_id: s.company_id,
        title: `${s.title} (copy)`,
        description: s.description,
        amount: s.amount,
        currency: s.currency,
        probability: s.probability,
        expected_close_date: s.expected_close_date,
        status: "open" as DealStatus,
        source: s.source,
        priority: s.priority,
        tags: s.tags,
        custom_fields: s.custom_fields,
        created_by: uid,
      };
      const { data, error } = await anyFrom("deals").insert(payload).select().single();
      if (error) throw error;
      return data as DealRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["dash", "pipeline-summary"] });
    },
  });
}

/* --------------------------- Related lookups --------------------------- */

export function useContactsLite() {
  const { active } = useCurrentWorkspace();
  const wsId = active?.id;
  return useQuery({
    queryKey: ["contacts_lite", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await anyFrom("contacts")
        .select("id, full_name, first_name, last_name, email, phone")
        .eq("workspace_id", wsId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        full_name: string | null;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        phone: string | null;
      }[];
    },
  });
}

export function useCompaniesLite() {
  const { active } = useCurrentWorkspace();
  const wsId = active?.id;
  return useQuery({
    queryKey: ["companies_lite", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await anyFrom("companies")
        .select("id, name, industry")
        .eq("workspace_id", wsId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; industry: string | null }[];
    },
  });
}

export function useCampaignsLite() {
  const { active } = useCurrentWorkspace();
  const wsId = active?.id;
  return useQuery({
    queryKey: ["campaigns_lite", wsId],
    enabled: !!wsId,
    queryFn: async () => {
      const { data, error } = await anyFrom("campaigns")
        .select("id, name, status")
        .eq("workspace_id", wsId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; status: string }[];
    },
  });
}

export function useConversationsLite(contactId?: string | null) {
  const { active } = useCurrentWorkspace();
  const wsId = active?.id;
  return useQuery({
    queryKey: ["conversations_lite", wsId, contactId],
    enabled: !!wsId,
    queryFn: async () => {
      let q = anyFrom("conversations")
        .select("id, subject, status, last_message_preview, last_message_at, contact_id")
        .eq("workspace_id", wsId)
        .is("deleted_at", null);
      if (contactId) q = q.eq("contact_id", contactId);
      const { data, error } = await q.order("last_message_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        subject: string | null;
        status: string;
        last_message_preview: string | null;
        last_message_at: string | null;
        contact_id: string | null;
      }[];
    },
  });
}

/** Tasks scoped to a deal */
export function useDealTasks(dealId: string | undefined) {
  return useQuery({
    queryKey: ["deal_tasks", dealId],
    enabled: !!dealId,
    queryFn: async () => {
      const { data, error } = await anyFrom("tasks")
        .select("*")
        .eq("entity_type", "deal")
        .eq("entity_id", dealId)
        .is("deleted_at", null)
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        title: string;
        status: string;
        priority: string;
        due_at: string | null;
        completed_at: string | null;
        assigned_to: string | null;
        description: string | null;
      }[];
    },
  });
}

export function useCreateDealTask() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: {
      dealId: string;
      title: string;
      due_at?: string | null;
      assigned_to?: string | null;
      priority?: string;
    }) => {
      if (!active?.id) throw new Error("No workspace selected");
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      const { error } = await anyFrom("tasks").insert({
        workspace_id: active.id,
        organization_id: active.organization_id ?? null,
        owner_id: uid,
        assigned_to: input.assigned_to ?? uid,
        title: input.title,
        priority: input.priority ?? "normal",
        due_at: input.due_at ?? null,
        entity_type: "deal",
        entity_id: input.dealId,
        status: "open",
        created_by: uid,
      });
      if (error) throw error;
    },
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["deal_tasks", v.dealId] });
      qc.invalidateQueries({ queryKey: ["dash", "task-summary"] });
    },
  });
}

export function useToggleDealTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done, dealId }: { id: string; done: boolean; dealId: string }) => {
      const patch: Record<string, unknown> = done
        ? { status: "completed", completed_at: new Date().toISOString() }
        : { status: "open", completed_at: null };
      const { error } = await anyFrom("tasks").update(patch).eq("id", id);
      if (error) throw error;
      return dealId;
    },
    onSuccess: (dealId) => {
      qc.invalidateQueries({ queryKey: ["deal_tasks", dealId] });
      qc.invalidateQueries({ queryKey: ["dash", "task-summary"] });
    },
  });
}

export function useDeleteDealTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dealId }: { id: string; dealId: string }) => {
      const { error } = await anyFrom("tasks")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return dealId;
    },
    onSuccess: (dealId) => {
      qc.invalidateQueries({ queryKey: ["deal_tasks", dealId] });
      qc.invalidateQueries({ queryKey: ["dash", "task-summary"] });
    },
  });
}

/* ------------------------------ Realtime ------------------------------ */

/** `currency` is required on purpose: an omitted one used to silently mean USD. */
export function formatMoney(n: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${Math.round(n).toLocaleString()}`;
  }
}
