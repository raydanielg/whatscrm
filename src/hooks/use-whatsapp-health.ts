/**
 * Shared WhatsApp health-check query.
 *
 * Both the compact integration status panel and the detailed health-check
 * list read from this single query key, so the Graph API probes run once per
 * workspace instead of once per component.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { runWhatsAppHealthChecks, type HealthReport } from "@/lib/messaging/health.functions";

export function whatsappHealthKey(workspaceId: string | undefined) {
  return ["whatsapp-health", workspaceId ?? "none"] as const;
}

export function useWhatsAppHealth(enabled = true) {
  const { data: workspace } = useCurrentWorkspace();
  const workspaceId = workspace?.id;
  const runFn = useServerFn(runWhatsAppHealthChecks);

  return useQuery<HealthReport>({
    queryKey: whatsappHealthKey(workspaceId),
    queryFn: () => runFn({ data: { workspaceId: workspaceId! } }) as Promise<HealthReport>,
    enabled: enabled && Boolean(workspaceId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
