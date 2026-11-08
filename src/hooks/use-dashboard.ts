import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { sbAny } from "@/lib/supabase/untyped";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyFrom = (t: string) => sbAny(supabase).from(t as any) as any;

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};
const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
};
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

export type DashLead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company_name: string | null;
  status: string;
  score: number | null;
  rating: string | null;
  source: string | null;
  owner_id: string | null;
  created_at: string;
};
export type DashContact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  job_title: string | null;
  created_at: string;
};
export type DashCompany = {
  id: string;
  name: string;
  industry: string | null;
  logo_url: string | null;
  created_at: string;
};
export type DashTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
  assigned_to: string | null;
  entity_type: string | null;
  entity_id: string | null;
};
export type DashDeal = {
  id: string;
  title: string;
  amount: number;
  currency: string;
  status: string;
  stage_id: string | null;
  probability: number;
  expected_close_date: string | null;
  owner_id: string | null;
};
export type DashStage = {
  id: string;
  name: string;
  color: string | null;
  position: number;
  pipeline_id: string;
};
export type DashConversation = {
  id: string;
  contact_id: string;
  status: string;
  unread_count: number;
  last_message_at: string | null;
  ai_summary: string | null;
  contact?: { display_name: string | null; first_name: string | null; last_name: string | null; avatar_url: string | null };
};
export type DashActivity = {
  id: string;
  verb: string;
  summary: string | null;
  object_type: string | null;
  object_id: string | null;
  target_type: string | null;
  target_id: string | null;
  created_at: string;
  actor_id: string | null;
};

export function useDashboardData() {
  const { active } = useCurrentWorkspace();
  const { user } = useAuth();
  const workspaceId = active?.id;
  const userId = user?.id;
  const qc = useQueryClient();

  // Realtime invalidation for all dashboard tables
  useEffect(() => {
    if (!workspaceId) return;
    const ch = supabase
      .channel(`dashboard:${workspaceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts", filter: `workspace_id=eq.${workspaceId}` }, () => {
        qc.invalidateQueries({ queryKey: ["dash"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "leads", filter: `workspace_id=eq.${workspaceId}` }, () => {
        qc.invalidateQueries({ queryKey: ["dash"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "companies", filter: `workspace_id=eq.${workspaceId}` }, () => {
        qc.invalidateQueries({ queryKey: ["dash"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `workspace_id=eq.${workspaceId}` }, () => {
        qc.invalidateQueries({ queryKey: ["dash"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "deals", filter: `workspace_id=eq.${workspaceId}` }, () => {
        qc.invalidateQueries({ queryKey: ["dash"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `workspace_id=eq.${workspaceId}` }, () => {
        qc.invalidateQueries({ queryKey: ["dash"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "activities", filter: `workspace_id=eq.${workspaceId}` }, () => {
        qc.invalidateQueries({ queryKey: ["dash"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [workspaceId, qc]);

  const newLeads = useQuery<DashLead[]>({
    queryKey: ["dash", "new-leads", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await anyFrom("leads")
        .select("id, first_name, last_name, email, company_name, status, score, rating, source, owner_id, created_at")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .gte("created_at", daysAgo(7))
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as DashLead[];
    },
  });

  const newLeadsCount = useQuery<number>({
    queryKey: ["dash", "new-leads-count", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { count, error } = await anyFrom("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .gte("created_at", daysAgo(7));
      if (error) throw error;
      return count ?? 0;
    },
  });

  const assignedLeads = useQuery<DashLead[]>({
    queryKey: ["dash", "assigned-leads", workspaceId, userId],
    enabled: !!workspaceId && !!userId,
    queryFn: async () => {
      const { data, error } = await anyFrom("leads")
        .select("id, first_name, last_name, email, company_name, status, score, rating, source, owner_id, created_at")
        .eq("workspace_id", workspaceId)
        .eq("owner_id", userId)
        .is("deleted_at", null)
        .not("status", "in", "(converted,disqualified,unqualified)")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as DashLead[];
    },
  });

  const assignedLeadsCount = useQuery<number>({
    queryKey: ["dash", "assigned-leads-count", workspaceId, userId],
    enabled: !!workspaceId && !!userId,
    queryFn: async () => {
      const { count, error } = await anyFrom("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("owner_id", userId)
        .is("deleted_at", null)
        .not("status", "in", "(converted,disqualified,unqualified)");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const activeCustomers = useQuery<{ total: number; active: number; atRisk: number; churned: number; vip: number }>({
    queryKey: ["dash", "customers-summary", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const countCustomers = async (status?: string): Promise<number> => {
        let query = anyFrom("contacts")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .eq("lifecycle_stage", "customer")
          .is("deleted_at", null);
        if (status === "at_risk") {
          query = query.or("customer_status.eq.at_risk,customer_health_score.lt.40");
        } else if (status) {
          query = query.eq("customer_status", status);
        }
        const { count, error } = await query;
        if (error) throw error;
        return count ?? 0;
      };
      const [total, active, atRisk, churned, vip] = await Promise.all([
        countCustomers(),
        countCustomers("active"),
        countCustomers("at_risk"),
        countCustomers("churned"),
        countCustomers("vip"),
      ]);
      return { total, active, atRisk, churned, vip };
    },
  });

  const recentContacts = useQuery<DashContact[]>({
    queryKey: ["dash", "recent-contacts", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await anyFrom("contacts")
        .select("id, first_name, last_name, display_name, email, avatar_url, job_title, created_at")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data ?? []) as DashContact[];
    },
  });

  const recentCompanies = useQuery<DashCompany[]>({
    queryKey: ["dash", "recent-companies", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await anyFrom("companies")
        .select("id, name, industry, logo_url, created_at")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data ?? []) as DashCompany[];
    },
  });

  const todaysActivities = useQuery<DashActivity[]>({
    queryKey: ["dash", "activities-today", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await anyFrom("activities")
        .select("id, verb, summary, object_type, object_id, target_type, target_id, created_at, actor_id")
        .eq("workspace_id", workspaceId)
        .gte("created_at", startOfToday())
        .lte("created_at", endOfToday())
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as DashActivity[];
    },
  });

  const recentConversations = useQuery<DashConversation[]>({
    queryKey: ["dash", "recent-convos", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await anyFrom("conversations")
        .select("id, contact_id, status, unread_count, last_message_at, ai_summary, contact:contacts(display_name, first_name, last_name, avatar_url)")
        .eq("workspace_id", workspaceId)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(6);
      if (error) throw error;
      return (data ?? []) as DashConversation[];
    },
  });

  return {
    newLeads,
    newLeadsCount,
    assignedLeads,
    assignedLeadsCount,
    activeCustomers,
    recentContacts,
    recentCompanies,
    todaysActivities,
    recentConversations,
  };
}

/* ---------------- 360° Customer view extras ---------------- */

export function useCustomerDeals(customerId: string | undefined) {
  return useQuery<DashDeal[]>({
    queryKey: ["customer-deals", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data } = await anyFrom("deals")
        .select("id, title, amount, currency, status, stage_id, probability, expected_close_date, owner_id")
        .eq("contact_id", customerId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      return (data ?? []) as DashDeal[];
    },
  });
}

export function useCustomerTasks(customerId: string | undefined) {
  return useQuery<DashTask[]>({
    queryKey: ["customer-tasks", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data } = await anyFrom("tasks")
        .select("id, title, status, priority, due_at, assigned_to, entity_type, entity_id")
        .eq("entity_type", "contact")
        .eq("entity_id", customerId)
        .is("deleted_at", null)
        .order("due_at", { ascending: true, nullsFirst: false });
      return (data ?? []) as DashTask[];
    },
  });
}

export function useCustomerConversations(customerId: string | undefined) {
  return useQuery<DashConversation[]>({
    queryKey: ["customer-conversations", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data } = await anyFrom("conversations")
        .select("id, contact_id, status, unread_count, last_message_at, ai_summary")
        .eq("contact_id", customerId)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      return (data ?? []) as DashConversation[];
    },
  });
}

export function useCustomerNotes(customerId: string | undefined) {
  return useQuery<Array<{ id: string; body: string; is_pinned: boolean; created_at: string; author_id: string | null }>>({
    queryKey: ["customer-notes", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data } = await anyFrom("notes")
        .select("id, body, is_pinned, created_at, author_id")
        .eq("entity_type", "contact")
        .eq("entity_id", customerId)
        .is("deleted_at", null)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });
}

export function useCustomerCampaigns(customerId: string | undefined) {
  return useQuery<Array<{ id: string; name: string; status: string; created_at: string }>>({
    queryKey: ["customer-campaigns", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      // Best-effort: campaigns referencing the contact via communications table
      const { data } = await anyFrom("communications")
        .select("campaign_id, campaigns:campaign_id(id, name, status, created_at)")
        .eq("contact_id", customerId)
        .not("campaign_id", "is", null)
        .limit(50);
      const seen = new Set<string>();
      const out: Array<{ id: string; name: string; status: string; created_at: string }> = [];
      for (const r of (data ?? []) as Array<{ campaigns?: { id: string; name: string; status: string; created_at: string } | null }>) {
        const c = r.campaigns;
        if (c && !seen.has(c.id)) {
          seen.add(c.id);
          out.push(c);
        }
      }
      return out;
    },
  });
}

export function useRelatedContacts(customerId: string | undefined, companyId: string | null | undefined) {
  return useQuery<DashContact[]>({
    queryKey: ["related-contacts", companyId, customerId],
    enabled: !!companyId && !!customerId,
    queryFn: async () => {
      const { data } = await anyFrom("contacts")
        .select("id, first_name, last_name, display_name, email, avatar_url, job_title, created_at")
        .eq("company_id", companyId)
        .neq("id", customerId)
        .is("deleted_at", null)
        .limit(10);
      return (data ?? []) as DashContact[];
    },
  });
}
