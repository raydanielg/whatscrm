import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { getSalesOverview } from '@/lib/sales/sales.functions';

export function useSalesOverview(workspaceId: string | null | undefined) {
  const fn = useServerFn(getSalesOverview);
  return useQuery({
    queryKey: ['sales', 'overview', workspaceId],
    enabled: !!workspaceId,
    queryFn: () => fn({ data: { workspaceId: workspaceId as string } }),
    staleTime: 30_000,
  });
}
