import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getUnifiedTimeline } from "@/lib/timeline/timeline.functions";

export function useUnifiedTimeline(params: {
  workspaceId: string | null | undefined;
  contactId: string | null | undefined;
  limit?: number;
}) {
  const fetchTimeline = useServerFn(getUnifiedTimeline);
  return useQuery({
    queryKey: ["timeline", params.workspaceId, params.contactId, params.limit ?? 200],
    enabled: !!params.workspaceId && !!params.contactId,
    queryFn: () =>
      fetchTimeline({
        data: {
          workspaceId: params.workspaceId as string,
          contactId: params.contactId as string,
          limit: params.limit ?? 200,
        },
      }),
    staleTime: 15_000,
  });
}
