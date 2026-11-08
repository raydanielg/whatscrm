import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  omnichannelSearch,
  type OmniSearchFilters,
} from "@/lib/search/omnichannel-search.functions";

export function useOmnichannelSearch(
  workspaceId: string | undefined,
  query: string,
  category: string = "all",
  filters: OmniSearchFilters = {},
  page = 1,
  enabled = true,
) {
  const fn = useServerFn(omnichannelSearch);
  const q = query.trim();
  return useQuery({
    queryKey: ["omni-search", workspaceId, q, category, filters, page],
    queryFn: () => fn({ data: { workspaceId: workspaceId!, query: q, category, filters, page } }),
    enabled: !!workspaceId && q.length >= 2 && enabled,
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}
