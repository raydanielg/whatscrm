import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listMatchingRules,
  upsertMatchingRule,
  deleteMatchingRule,
  previewMatching,
  type MatchStrategy,
} from "@/lib/messaging/contact-matching.functions";

export interface RuleInputData {
  id?: string;
  workspaceId: string;
  priority: number;
  strategy: MatchStrategy;
  default_country_code?: string | null;
  digits_to_match?: number | null;
  enabled: boolean;
  label?: string | null;
}

export function useMatchingRules(workspaceId: string | undefined) {
  const fn = useServerFn(listMatchingRules);
  return useQuery({
    queryKey: ["contact-matching-rules", workspaceId],
    queryFn: () => fn({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
  });
}

export function useUpsertMatchingRule(workspaceId: string | undefined) {
  const fn = useServerFn(upsertMatchingRule);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RuleInputData) => fn({ data: input }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["contact-matching-rules", workspaceId] }),
  });
}

export function useDeleteMatchingRule(workspaceId: string | undefined) {
  const fn = useServerFn(deleteMatchingRule);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fn({ data: { id } }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["contact-matching-rules", workspaceId] }),
  });
}

export function usePreviewMatching() {
  const fn = useServerFn(previewMatching);
  return useMutation({
    mutationFn: (input: { workspaceId: string; rawPhone: string }) =>
      fn({ data: input }),
  });
}
