import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  getMonitoringOverview,
  listOutboxJobs,
  listWebhookEvents,
  listProviderLogs,
  listApiKeyUsage,
  retryOutboxJob,
  retryWebhookEvent,
} from "@/lib/messaging/monitoring.functions";

export function useMonitoringOverview(workspaceId: string | undefined) {
  const qc = useQueryClient();
  const fn = useServerFn(getMonitoringOverview);

  useEffect(() => {
    if (!workspaceId) return;
    const key = ["monitoring", "overview", workspaceId];
    const channelName = `monitoring-${workspaceId}`;
    // Remove any pre-existing channel with this name to avoid "callbacks after subscribe" error.
    const existing = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`);
    if (existing) void supabase.removeChannel(existing);
    const ch = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_outbox",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => qc.invalidateQueries({ queryKey: key }),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "webhook_events",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => qc.invalidateQueries({ queryKey: key }),
      )
      // channel_accounts is intentionally NOT subscribed: it holds encrypted
      // credentials and is excluded from the realtime publication. The 30s
      // refetch below keeps account status fresh.
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [workspaceId, qc]);

  return useQuery({
    queryKey: ["monitoring", "overview", workspaceId],
    queryFn: () => fn({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
    refetchInterval: 30_000,
  });
}

export function useOutboxJobs(workspaceId: string | undefined, status?: string) {
  const fn = useServerFn(listOutboxJobs);
  return useQuery({
    queryKey: ["monitoring", "outbox", workspaceId, status ?? "all"],
    queryFn: () => fn({ data: { workspaceId: workspaceId!, status: status as never, limit: 100 } }),
    enabled: !!workspaceId,
    refetchInterval: 15_000,
  });
}

export function useWebhookEvents(workspaceId: string | undefined, onlyFailures?: boolean) {
  const fn = useServerFn(listWebhookEvents);
  return useQuery({
    queryKey: ["monitoring", "webhooks", workspaceId, onlyFailures ? "fail" : "all"],
    queryFn: () => fn({ data: { workspaceId: workspaceId!, onlyFailures, limit: 100 } }),
    enabled: !!workspaceId,
    refetchInterval: 15_000,
  });
}

export function useProviderLogs(workspaceId: string | undefined, level?: string) {
  const fn = useServerFn(listProviderLogs);
  return useQuery({
    queryKey: ["monitoring", "logs", workspaceId, level ?? "all"],
    queryFn: () => fn({ data: { workspaceId: workspaceId!, level: level as never, limit: 200 } }),
    enabled: !!workspaceId,
    refetchInterval: 20_000,
  });
}

export function useApiKeyUsage(workspaceId: string | undefined) {
  const fn = useServerFn(listApiKeyUsage);
  return useQuery({
    queryKey: ["monitoring", "apikeys", workspaceId],
    queryFn: () => fn({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });
}

export function useRetryOutbox(workspaceId: string | undefined) {
  const qc = useQueryClient();
  const fn = useServerFn(retryOutboxJob);
  return useMutation({
    mutationFn: (id: string) => fn({ data: { workspaceId: workspaceId!, id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["monitoring", "outbox", workspaceId] });
      qc.invalidateQueries({ queryKey: ["monitoring", "overview", workspaceId] });
    },
  });
}

export function useRetryWebhook(workspaceId: string | undefined) {
  const qc = useQueryClient();
  const fn = useServerFn(retryWebhookEvent);
  return useMutation({
    mutationFn: (id: string) => fn({ data: { workspaceId: workspaceId!, id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["monitoring", "webhooks", workspaceId] });
      qc.invalidateQueries({ queryKey: ["monitoring", "overview", workspaceId] });
    },
  });
}
