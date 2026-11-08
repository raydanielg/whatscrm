import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listContactRematchJobs,
  startContactRematchJob,
  type ContactRematchJob,
} from "@/lib/messaging/contact-rematch.functions";

export type { ContactRematchJob };

export function useContactRematchJobs(workspaceId: string | undefined) {
  const fn = useServerFn(listContactRematchJobs);
  return useQuery({
    queryKey: ["contact-rematch-jobs", workspaceId],
    queryFn: () => fn({ data: { workspaceId: workspaceId! } }),
    enabled: !!workspaceId,
    refetchInterval: (query) => {
      const data = query.state.data as ContactRematchJob[] | undefined;
      return data?.some((j) => j.status === "running" || j.status === "queued") ? 2500 : false;
    },
  });
}

export interface StartRematchInput {
  workspaceId: string;
  scope: "whatsapp" | "all";
  unlinkedOnly: boolean;
  since: string | null;
  maxConversations: number;
}

export function useStartContactRematch(workspaceId: string | undefined) {
  const fn = useServerFn(startContactRematchJob);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StartRematchInput) => fn({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact-rematch-jobs", workspaceId] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}
