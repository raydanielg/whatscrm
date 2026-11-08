import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getAiSettings,
  updateAiSettings,
  getAiQuotaUsage,
  listAiAuditLogs,
  listAiProviderOptions,
  getAiBusinessContext,
  saveAiBusinessContext,
  saveTenantAiProvider,
  deleteTenantAiProvider,
  type AiSettings,
  type AiSettingsQuotaUsage,
  type AiAuditLogEntry,
  type AiSettingsOption,
  type AiBusinessContext,
} from "@/lib/ai/settings.functions";
import { toast } from "sonner";

export type {
  AiSettings,
  AiSettingsQuotaUsage,
  AiAuditLogEntry,
  AiSettingsOption,
  AiBusinessContext,
};

export function useAiSettings(workspaceId: string | undefined) {
  const fn = useServerFn(getAiSettings);
  return useQuery({
    queryKey: ["ai-settings", workspaceId],
    queryFn: () => fn({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });
}

export function useAiSettingsMutation(workspaceId: string | undefined) {
  const fn = useServerFn(updateAiSettings);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<AiSettings>) =>
      fn({ data: { workspaceId: workspaceId!, patch: patch as any } }),
    onSuccess: (data) => {
      qc.setQueryData(["ai-settings", workspaceId], data);
      qc.invalidateQueries({ queryKey: ["ai-audit-logs", workspaceId] });
      toast.success("AI settings saved");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });
}

export function useAiQuotaUsage(workspaceId: string | undefined) {
  const fn = useServerFn(getAiQuotaUsage);
  return useQuery({
    queryKey: ["ai-quota-usage", workspaceId],
    queryFn: () => fn({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
    refetchInterval: 60_000,
  });
}

export function useAiAuditLogs(workspaceId: string | undefined) {
  const fn = useServerFn(listAiAuditLogs);
  return useQuery({
    queryKey: ["ai-audit-logs", workspaceId],
    queryFn: () => fn({ data: { workspaceId: workspaceId!, limit: 100 } }),
    enabled: !!workspaceId,
  });
}

/**
 * Business context for the AI reply assistant. The server resolves the active
 * workspace itself; `workspaceId` only keys the cache so switching workspaces
 * refetches.
 */
export function useAiBusinessContext(workspaceId: string | undefined) {
  const fn = useServerFn(getAiBusinessContext);
  return useQuery({
    queryKey: ["ai-business-context", workspaceId],
    queryFn: () => fn(),
    enabled: !!workspaceId,
  });
}

export function useSaveAiBusinessContext(workspaceId: string | undefined) {
  const fn = useServerFn(saveAiBusinessContext);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => fn({ data: { text } }),
    onSuccess: (data) => {
      qc.setQueryData(["ai-business-context", workspaceId], data);
      toast.success("Business context saved");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });
}

export function useAiProviderOptions(workspaceId: string | undefined) {
  const fn = useServerFn(listAiProviderOptions);
  return useQuery({
    queryKey: ["ai-provider-options", workspaceId],
    queryFn: () => fn({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });
}

export function useSaveTenantAiProvider(workspaceId: string | undefined) {
  const fn = useServerFn(saveTenantAiProvider);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { kind: "openai" | "gemini"; apiKey: string; organizationId?: string }) =>
      fn({ data: { workspaceId: workspaceId!, ...input } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-provider-options", workspaceId] });
      qc.invalidateQueries({ queryKey: ["ai-audit-logs", workspaceId] });
      toast.success("Tenant API key encrypted and saved");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to save tenant API key"),
  });
}

export function useDeleteTenantAiProvider(workspaceId: string | undefined) {
  const fn = useServerFn(deleteTenantAiProvider);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (providerId: string) => fn({ data: { workspaceId: workspaceId!, providerId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-provider-options", workspaceId] });
      qc.invalidateQueries({ queryKey: ["ai-settings", workspaceId] });
      toast.success("Tenant API key removed");
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Failed to remove tenant API key"),
  });
}
