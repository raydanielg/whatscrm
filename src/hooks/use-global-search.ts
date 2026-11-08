import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  globalSearch,
  getRecentSearches,
  clearRecentSearches,
  listSavedSearches,
  saveSearch,
  updateSavedSearch,
  deleteSavedSearch,
  getSearchInsights,
  type SearchScope,
  type SavedSearch,
  type Json,
} from "@/lib/search/global-search.functions";

export function useGlobalSearch(workspaceId: string | undefined, query: string, scope: SearchScope = "all", enabled = true) {
  const fn = useServerFn(globalSearch);
  const q = query.trim();
  return useQuery({
    queryKey: ["global-search", workspaceId, q, scope],
    queryFn: () => fn({ data: { workspaceId: workspaceId!, query: q, scope } }),
    enabled: !!workspaceId && q.length >= 2 && enabled,
    staleTime: 15 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

export function useRecentSearches(workspaceId: string | undefined) {
  const fn = useServerFn(getRecentSearches);
  return useQuery({
    queryKey: ["recent-searches", workspaceId],
    queryFn: () => fn({ data: { workspaceId: workspaceId!, limit: 10 } }),
    enabled: !!workspaceId,
    staleTime: 30 * 1000,
  });
}

export function useClearRecentSearches(workspaceId: string | undefined) {
  const fn = useServerFn(clearRecentSearches);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => fn({ data: { workspaceId: workspaceId! } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recent-searches", workspaceId] }),
  });
}

export function useSavedSearches(workspaceId: string | undefined) {
  const fn = useServerFn(listSavedSearches);
  return useQuery({
    queryKey: ["saved-searches", workspaceId],
    queryFn: () => fn({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });
}

export function useSaveSearch(workspaceId: string | undefined) {
  const fn = useServerFn(saveSearch);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      query: string;
      scope?: string;
      filters?: Json;
      isShared?: boolean;
      isPinned?: boolean;
    }) =>
      fn({
        data: {
          workspaceId: workspaceId!,
          name: input.name,
          query: input.query,
          scope: input.scope,
          filters: (input.filters as Record<string, unknown> | undefined) ?? {},
          isShared: input.isShared,
          isPinned: input.isPinned,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-searches", workspaceId] }),
  });
}

export function useUpdateSavedSearch(workspaceId: string | undefined) {
  const fn = useServerFn(updateSavedSearch);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<Omit<SavedSearch, "workspaceId" | "userId" | "createdAt" | "updatedAt" | "lastUsedAt">> & { id: string }) =>
      fn({
        data: {
          id: input.id,
          name: input.name,
          query: input.query,
          scope: input.scope ?? undefined,
          filters: (input.filters as Record<string, unknown> | undefined) ?? undefined,
          isShared: input.isShared,
          isPinned: input.isPinned,
          color: input.color,
          icon: input.icon,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-searches", workspaceId] }),
  });
}

export function useDeleteSavedSearch(workspaceId: string | undefined) {
  const fn = useServerFn(deleteSavedSearch);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saved-searches", workspaceId] }),
  });
}

export function useSearchInsights(workspaceId: string | undefined) {
  const fn = useServerFn(getSearchInsights);
  return useQuery({
    queryKey: ["search-insights", workspaceId],
    queryFn: () => fn({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
  });
}
