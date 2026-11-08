import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { toast } from "sonner";
import { sbAny } from "@/lib/supabase/untyped";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyFrom = (t: string) => sbAny(supabase).from(t as any) as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args: Record<string, unknown>) => (supabase.rpc as any)(name, args);

export type ConversationPriority = "low" | "normal" | "high" | "urgent";

export type SlaPolicy = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  inbox_ids: string[];
  priorities: ConversationPriority[];
  first_response_minutes: number | null;
  response_minutes: number | null;
  resolution_minutes: number | null;
  business_hours_only: boolean;
  is_active: boolean;
  priority_rank: number;
  created_at: string;
  updated_at: string;
};

export type ConversationSla = {
  id: string;
  workspace_id: string;
  conversation_id: string;
  policy_id: string | null;
  started_at: string;
  first_response_due_at: string | null;
  next_response_due_at: string | null;
  resolution_due_at: string | null;
  first_response_at: string | null;
  first_response_breached_at: string | null;
  response_breached_at: string | null;
  resolution_breached_at: string | null;
  is_paused: boolean;
  paused_at: string | null;
};

export type AssignmentRule = {
  id: string;
  workspace_id: string;
  inbox_id: string | null;
  strategy: "manual" | "round_robin" | "load_balanced";
  is_active: boolean;
  round_robin_cursor: number;
  max_open_per_agent: number | null;
};

/* ------------------------------ SLA Policies ------------------------------ */

export function useSlaPolicies() {
  const { active: workspace } = useCurrentWorkspace();
  const workspaceId = workspace?.id;
  const qc = useQueryClient();

  const query = useQuery<SlaPolicy[]>({
    queryKey: ["sla_policies", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await anyFrom("sla_policies")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("priority_rank", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SlaPolicy[];
    },
  });

  useEffect(() => {
    if (!workspaceId) return;
    const ch = supabase
      .channel(`sla-policies-${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sla_policies", filter: `workspace_id=eq.${workspaceId}` },
        () => qc.invalidateQueries({ queryKey: ["sla_policies", workspaceId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [workspaceId, qc]);

  return query;
}

export function useUpsertSlaPolicy() {
  const { active: workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: Partial<SlaPolicy> & { name: string }) => {
      if (!workspace) throw new Error("No workspace");
      const payload = { ...p, workspace_id: workspace.id };
      const { data, error } = p.id
        ? await anyFrom("sla_policies").update(payload).eq("id", p.id).select().single()
        : await anyFrom("sla_policies").insert(payload).select().single();
      if (error) throw error;
      return data as SlaPolicy;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sla_policies"] }),
  });
}

export function useDeleteSlaPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await anyFrom("sla_policies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sla_policies"] }),
  });
}

/* --------------------------- Conversation SLA ----------------------------- */

export function useConversationSla(conversationId: string | undefined) {
  const qc = useQueryClient();
  const query = useQuery<ConversationSla | null>({
    queryKey: ["conversation_sla", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const { data, error } = await anyFrom("conversation_sla")
        .select("*")
        .eq("conversation_id", conversationId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ConversationSla | null;
    },
  });

  useEffect(() => {
    if (!conversationId) return;
    const ch = supabase
      .channel(`conv-sla-${conversationId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_sla", filter: `conversation_id=eq.${conversationId}` },
        () => qc.invalidateQueries({ queryKey: ["conversation_sla", conversationId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [conversationId, qc]);

  return query;
}

export function useApplySla() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { data, error } = await rpc("apply_sla_to_conversation", { _conversation_id: conversationId });
      if (error) throw error;
      return data as string | null;
    },
    onSuccess: (_d, conversationId) =>
      qc.invalidateQueries({ queryKey: ["conversation_sla", conversationId] }),
  });
}

/* ------------------------------ Assignment ------------------------------- */

export function useAssignConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, userId }: { conversationId: string; userId: string | null }) => {
      const { error } = await rpc("assign_conversation", {
        _conversation_id: conversationId,
        _assignee: userId,
      });
      if (error) throw error;
      return userId;
    },
    onSuccess: (userId) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation"] });
      qc.invalidateQueries({ queryKey: ["conversation-counts"] });
      toast.success(userId ? "Conversation assigned" : "Moved back to the queue");
    },
    onError: (err: unknown) => {
      toast.error(`Could not assign: ${(err as Error).message}`);
    },
  });
}

export function useAutoAssign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { data, error } = await rpc("auto_assign_conversation", { _conversation_id: conversationId });
      if (error) throw error;
      return data as string | null;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useSetConversationPriority() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, priority }: { conversationId: string; priority: ConversationPriority }) => {
      const { error } = await anyFrom("conversations")
        .update({ priority })
        .eq("id", conversationId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

/* --------------------------- Assignment Rules ----------------------------- */

export function useAssignmentRules() {
  const { active: workspace } = useCurrentWorkspace();
  const workspaceId = workspace?.id;
  const qc = useQueryClient();
  const query = useQuery<AssignmentRule[]>({
    queryKey: ["assignment_rules", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await anyFrom("assignment_rules")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AssignmentRule[];
    },
  });

  useEffect(() => {
    if (!workspaceId) return;
    const ch = supabase
      .channel(`assignment-rules-${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "assignment_rules", filter: `workspace_id=eq.${workspaceId}` },
        () => qc.invalidateQueries({ queryKey: ["assignment_rules", workspaceId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [workspaceId, qc]);

  return query;
}

export function useUpsertAssignmentRule() {
  const { active: workspace } = useCurrentWorkspace();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (r: Partial<AssignmentRule>) => {
      if (!workspace) throw new Error("No workspace");
      const payload = { ...r, workspace_id: workspace.id };
      const { data, error } = r.id
        ? await anyFrom("assignment_rules").update(payload).eq("id", r.id).select().single()
        : await anyFrom("assignment_rules").insert(payload).select().single();
      if (error) throw error;
      return data as AssignmentRule;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assignment_rules"] }),
  });
}

/* ------------------------------ Agent load -------------------------------- */

export type AgentLoad = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  open_count: number;
  resolved_today: number;
};

export function useAgentPerformance() {
  const { active: workspace } = useCurrentWorkspace();
  const workspaceId = workspace?.id;
  return useQuery<AgentLoad[]>({
    queryKey: ["agent_performance", workspaceId],
    enabled: !!workspaceId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data: members, error: mErr } = await anyFrom("workspace_members")
        .select("user_id, profiles:profiles!inner(id, display_name, avatar_url)")
        .eq("workspace_id", workspaceId)
        .eq("status", "active");
      if (mErr) throw mErr;

      const { data: convs, error: cErr } = await anyFrom("conversations")
        .select("assigned_to, status, resolved_at")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null);
      if (cErr) throw cErr;

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (members as any[]).map((m) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mine = (convs as any[]).filter((c) => c.assigned_to === m.user_id);
        const open = mine.filter((c) => c.status === "open" || c.status === "pending").length;
        const resolvedToday = mine.filter(
          (c) => c.status === "resolved" && c.resolved_at && new Date(c.resolved_at) >= startOfDay,
        ).length;
        return {
          user_id: m.user_id,
          display_name: m.profiles?.display_name ?? null,
          avatar_url: m.profiles?.avatar_url ?? null,
          open_count: open,
          resolved_today: resolvedToday,
        };
      });
    },
  });
}

/* ------------------------------ SLA countdown ----------------------------- */

export function formatCountdown(target: string | null | undefined): {
  label: string;
  overdue: boolean;
  ms: number;
} {
  if (!target) return { label: "—", overdue: false, ms: 0 };
  const ms = new Date(target).getTime() - Date.now();
  const overdue = ms < 0;
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const s = Math.floor((abs % 60_000) / 1000);
  const parts = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  return { label: overdue ? `${parts} overdue` : `${parts} left`, overdue, ms };
}
