import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listAIProviders, listSupportedProviderKinds, upsertAIProvider, deleteAIProvider,
  testAIProvider, listProviderModelsRemote, upsertAIModel, deleteAIModel,
  upsertAIFeatureConfig, upsertAIPrompt, getAIUsageSummary, getAIRecentLogs,
  type UpsertAIProviderInput, type UpsertAIModelInput,
  type UpsertAIFeatureConfigInput, type UpsertAIPromptInput,
} from "@/lib/ai/config.functions";

export function useAIProviders() {
  const fn = useServerFn(listAIProviders);
  return useQuery({ queryKey: ["ai", "providers"], queryFn: () => fn() });
}

export function useSupportedProviderKinds() {
  const fn = useServerFn(listSupportedProviderKinds);
  return useQuery({ queryKey: ["ai", "kinds"], queryFn: () => fn(), staleTime: 60_000 * 60 });
}

export function useUpsertAIProvider() {
  const qc = useQueryClient();
  const fn = useServerFn(upsertAIProvider);
  return useMutation({
    mutationFn: (data: UpsertAIProviderInput) => fn({ data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai", "providers"] }),
  });
}

export function useDeleteAIProvider() {
  const qc = useQueryClient();
  const fn = useServerFn(deleteAIProvider);
  return useMutation({
    mutationFn: (id: string) => fn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai", "providers"] }),
  });
}

export function useTestAIProvider() {
  const qc = useQueryClient();
  const fn = useServerFn(testAIProvider);
  return useMutation({
    mutationFn: (id: string) => fn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai", "providers"] }),
  });
}

export function useDiscoverModels() {
  const fn = useServerFn(listProviderModelsRemote);
  return useMutation({ mutationFn: (id: string) => fn({ data: { id } }) });
}

export function useUpsertAIModel() {
  const qc = useQueryClient();
  const fn = useServerFn(upsertAIModel);
  return useMutation({
    mutationFn: (data: UpsertAIModelInput) => fn({ data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai", "providers"] }),
  });
}

export function useDeleteAIModel() {
  const qc = useQueryClient();
  const fn = useServerFn(deleteAIModel);
  return useMutation({
    mutationFn: (id: string) => fn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai", "providers"] }),
  });
}

export function useUpsertAIFeatureConfig() {
  const qc = useQueryClient();
  const fn = useServerFn(upsertAIFeatureConfig);
  return useMutation({
    mutationFn: (data: UpsertAIFeatureConfigInput) => fn({ data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai"] }),
  });
}

export function useUpsertAIPrompt() {
  const qc = useQueryClient();
  const fn = useServerFn(upsertAIPrompt);
  return useMutation({
    mutationFn: (data: UpsertAIPromptInput) => fn({ data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai", "prompts"] }),
  });
}

export function useAIUsageSummary() {
  const fn = useServerFn(getAIUsageSummary);
  return useQuery({ queryKey: ["ai", "usage"], queryFn: () => fn() });
}

export function useAIRecentLogs(filters: { limit?: number; status?: string; providerId?: string } = {}) {
  const fn = useServerFn(getAIRecentLogs);
  return useQuery({
    queryKey: ["ai", "logs", filters],
    queryFn: () => fn({ data: { limit: filters.limit ?? 100, status: filters.status as never, providerId: filters.providerId } }),
  });
}
