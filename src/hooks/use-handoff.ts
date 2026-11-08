/**
 * Hooks for Human Handoff features. Wraps server functions with React Query
 * and adds Realtime invalidations so the inbox stays in sync.
 */
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useRealtimeSubscription } from "@/hooks/use-realtime-subscription";
import {
  listDepartments, upsertDepartment, deleteDepartment, setDepartmentMembers,
  listAgentAvailability, setMyAvailability, heartbeat,
  getBusinessHours, upsertBusinessHours, isWithinBusinessHours,
  transferToAgent, transferToDepartment, takeOver, resumeAi,
  listQueue, claimFromQueue, listHandoffHistory,
  type HandoffPriority, type AgentPresence,
} from "@/lib/handoff/handoff.functions";

// ==================== Departments ====================
export function useDepartments() {
  const { active } = useCurrentWorkspace();
  const fn = useServerFn(listDepartments);
  return useQuery({
    queryKey: ["handoff", "departments", active?.id],
    queryFn: () => fn({ data: { workspaceId: active!.id } }),
    enabled: !!active?.id,
    staleTime: 30_000,
  });
}

export function useUpsertDepartment() {
  const qc = useQueryClient();
  const fn = useServerFn(upsertDepartment);
  return useMutation({
    mutationFn: (input: {
      id?: string; workspaceId: string; name: string;
      description?: string | null; color?: string;
      fallbackAgentId?: string | null; isActive?: boolean;
    }) => fn({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["handoff", "departments"] });
      toast.success("Department saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
export function useDeleteDepartment() {
  const qc = useQueryClient();
  const fn = useServerFn(deleteDepartment);
  return useMutation({
    mutationFn: (id: string) => fn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["handoff", "departments"] });
      toast.success("Department deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
export function useSetDepartmentMembers() {
  const qc = useQueryClient();
  const fn = useServerFn(setDepartmentMembers);
  return useMutation({
    mutationFn: (input: { workspaceId: string; departmentId: string; userIds: string[] }) => fn({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["handoff", "departments"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

// ==================== Availability ====================
export function useAgentAvailability() {
  const { active } = useCurrentWorkspace();
  const fn = useServerFn(listAgentAvailability);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["handoff", "availability", active?.id],
    queryFn: () => fn({ data: { workspaceId: active!.id } }),
    enabled: !!active?.id,
    staleTime: 15_000,
  });

  useRealtimeSubscription({
    key: active?.id ? `handoff-availability:${active.id}` : null,
    bindings: [
      {
        event: "*",
        schema: "public",
        table: "agent_availability",
        filter: active?.id ? `workspace_id=eq.${active.id}` : undefined,
      },
    ],
    onChange: () =>
      qc.invalidateQueries({ queryKey: ["handoff", "availability", active?.id] }),
  });


  return q;
}

export function useSetMyAvailability() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  const fn = useServerFn(setMyAvailability);
  return useMutation({
    mutationFn: (input: { presence?: AgentPresence; statusMessage?: string | null; skills?: string[]; maxConcurrent?: number; autoAwayMinutes?: number; }) =>
      fn({ data: { workspaceId: active!.id, ...input } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["handoff", "availability"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Poll heartbeat every 60s to keep presence fresh. */
export function useAgentHeartbeat() {
  const { active } = useCurrentWorkspace();
  const fn = useServerFn(heartbeat);
  useEffect(() => {
    if (!active?.id) return;
    const tick = () => { fn({ data: { workspaceId: active.id } }).catch(() => {}); };
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, [active?.id, fn]);
}

// ==================== Business hours ====================
export function useBusinessHours() {
  const { active } = useCurrentWorkspace();
  const fn = useServerFn(getBusinessHours);
  return useQuery({
    queryKey: ["handoff", "business-hours", active?.id],
    queryFn: () => fn({ data: { workspaceId: active!.id } }),
    enabled: !!active?.id,
    staleTime: 60_000,
  });
}
export function useUpsertBusinessHours() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  const fn = useServerFn(upsertBusinessHours);
  return useMutation({
    mutationFn: (input: {
      timezone?: string;
      weeklySchedule?: Record<"mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun", { open: string; close: string; enabled: boolean }>;
      holidays?: Array<{ date: string; label: string }>;
      offlineMessage?: string;
    }) => fn({ data: { workspaceId: active!.id, ...input } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["handoff", "business-hours"] });
      toast.success("Business hours saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
export function useWithinBusinessHours() {
  const { active } = useCurrentWorkspace();
  const fn = useServerFn(isWithinBusinessHours);
  return useQuery({
    queryKey: ["handoff", "within-hours", active?.id],
    queryFn: () => fn({ data: { workspaceId: active!.id } }),
    enabled: !!active?.id,
    refetchInterval: 60_000,
  });
}

// ==================== Handoff actions ====================
function useInvalidateConversation(conversationId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["conversations"] });
    qc.invalidateQueries({ queryKey: ["conversation", conversationId] });
    qc.invalidateQueries({ queryKey: ["handoff", "history", conversationId] });
    qc.invalidateQueries({ queryKey: ["handoff", "queue"] });
  };
}

export function useTransferToAgent(conversationId: string) {
  const fn = useServerFn(transferToAgent);
  const invalidate = useInvalidateConversation(conversationId);
  return useMutation({
    mutationFn: (input: { toUserId: string; note?: string; reason?: string }) =>
      fn({ data: { conversationId, ...input } }),
    onSuccess: () => { invalidate(); toast.success("Transferred to agent"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useTransferToDepartment(conversationId: string) {
  const fn = useServerFn(transferToDepartment);
  const invalidate = useInvalidateConversation(conversationId);
  return useMutation({
    mutationFn: (input: { departmentId: string; priority?: HandoffPriority; requiredSkills?: string[]; reason?: string; note?: string }) =>
      fn({ data: { conversationId, ...input } }),
    onSuccess: (r) => {
      invalidate();
      toast.success(
        r.mode === "assigned" ? "Assigned to available agent"
        : r.mode === "fallback" ? "Assigned to fallback agent"
        : "Added to department queue"
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useTakeOver(conversationId: string) {
  const fn = useServerFn(takeOver);
  const invalidate = useInvalidateConversation(conversationId);
  return useMutation({
    mutationFn: () => fn({ data: { conversationId } }),
    onSuccess: () => { invalidate(); toast.success("You've taken over — AI paused"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useResumeAi(conversationId: string) {
  const fn = useServerFn(resumeAi);
  const invalidate = useInvalidateConversation(conversationId);
  return useMutation({
    mutationFn: (input?: { note?: string }) => fn({ data: { conversationId, ...(input ?? {}) } }),
    onSuccess: () => { invalidate(); toast.success("AI resumed"); },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ==================== Queue ====================
export function useHandoffQueue(status: "waiting"|"assigned"|"cancelled"|"expired" = "waiting") {
  const { active } = useCurrentWorkspace();
  const fn = useServerFn(listQueue);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["handoff", "queue", active?.id, status],
    queryFn: () => fn({ data: { workspaceId: active!.id, status } }),
    enabled: !!active?.id,
    staleTime: 5_000,
  });
  useRealtimeSubscription({
    key: active?.id ? `handoff-queue:${active.id}` : null,
    bindings: [
      {
        event: "*",
        schema: "public",
        table: "handoff_queue",
        filter: active?.id ? `workspace_id=eq.${active.id}` : undefined,
      },
    ],
    onChange: () =>
      qc.invalidateQueries({ queryKey: ["handoff", "queue", active?.id] }),
  });

  return q;
}

export function useClaimFromQueue() {
  const qc = useQueryClient();
  const fn = useServerFn(claimFromQueue);
  return useMutation({
    mutationFn: (queueId: string) => fn({ data: { queueId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["handoff", "queue"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Conversation claimed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// ==================== History ====================
export function useHandoffHistory(conversationId: string | undefined) {
  const fn = useServerFn(listHandoffHistory);
  return useQuery({
    queryKey: ["handoff", "history", conversationId],
    queryFn: () => fn({ data: { conversationId: conversationId! } }),
    enabled: !!conversationId,
    staleTime: 5_000,
  });
}
