import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  runSyncNow,
  runAllSyncsForAccount,
  listSyncJobs,
  listSyncCursors,
  syncStatistics,
} from "@/lib/messaging/sync.functions";

export type SyncKind =
  | "templates" | "business_profile" | "phone_numbers" | "media_cleanup"
  | "webhook_drain" | "outbox_drain" | "scheduled_messages"
  | "contacts_reconcile" | "conversations_reconcile" | "status_reconcile"
  | "account_health";

export interface SyncJobRow {
  id: string;
  workspace_id: string;
  channel_account_id: string | null;
  kind: SyncKind;
  status: "pending" | "running" | "success" | "partial" | "failed";
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  items_processed: number;
  items_succeeded: number;
  items_failed: number;
  attempt: number;
  next_retry_at: string | null;
  error: string | null;
  trigger_source: string;
  triggered_by: string | null;
  metadata: Record<string, unknown>;
}

export interface SyncCursorRow {
  id: string;
  workspace_id: string;
  channel_account_id: string | null;
  kind: SyncKind;
  last_synced_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_error: string | null;
  last_job_id: string | null;
}

export function useSyncJobs(workspaceId: string | undefined) {
  const qc = useQueryClient();
  const fn = useServerFn(listSyncJobs);

  useEffect(() => {
    if (!workspaceId) return;
    const ch = supabase
      .channel(`sync-jobs-${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sync_jobs", filter: `workspace_id=eq.${workspaceId}` },
        () => qc.invalidateQueries({ queryKey: ["sync-jobs", workspaceId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [workspaceId, qc]);

  return useQuery({
    queryKey: ["sync-jobs", workspaceId],
    queryFn: () => fn({ data: { workspaceId: workspaceId!, limit: 100 } }),
    enabled: !!workspaceId,
  });
}

export function useSyncCursors(workspaceId: string | undefined) {
  const qc = useQueryClient();
  const fn = useServerFn(listSyncCursors);

  useEffect(() => {
    if (!workspaceId) return;
    const ch = supabase
      .channel(`sync-cursors-${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sync_cursors", filter: `workspace_id=eq.${workspaceId}` },
        () => qc.invalidateQueries({ queryKey: ["sync-cursors", workspaceId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [workspaceId, qc]);

  return useQuery({
    queryKey: ["sync-cursors", workspaceId],
    queryFn: () => fn({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });
}

export function useSyncStatistics(workspaceId: string | undefined) {
  const fn = useServerFn(syncStatistics);
  return useQuery({
    queryKey: ["sync-statistics", workspaceId],
    queryFn: () => fn({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
    refetchInterval: 30_000,
  });
}

export function useRunSync(workspaceId: string | undefined) {
  const qc = useQueryClient();
  const fn = useServerFn(runSyncNow);
  return useMutation({
    mutationFn: (vars: { kind: SyncKind; channelAccountId?: string | null }) =>
      fn({ data: { workspaceId: workspaceId!, ...vars } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sync-jobs", workspaceId] });
      qc.invalidateQueries({ queryKey: ["sync-cursors", workspaceId] });
      qc.invalidateQueries({ queryKey: ["sync-statistics", workspaceId] });
    },
  });
}

export function useRunAllSyncs(workspaceId: string | undefined) {
  const qc = useQueryClient();
  const fn = useServerFn(runAllSyncsForAccount);
  return useMutation({
    mutationFn: (vars: { channelAccountId: string }) =>
      fn({ data: { workspaceId: workspaceId!, ...vars } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sync-jobs", workspaceId] });
      qc.invalidateQueries({ queryKey: ["sync-cursors", workspaceId] });
      qc.invalidateQueries({ queryKey: ["sync-statistics", workspaceId] });
      qc.invalidateQueries({ queryKey: ["channel-accounts", workspaceId] });
    },
  });
}
