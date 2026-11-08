/**
 * Shared Messenger / Instagram inbound health queries.
 *
 * `staleTime` is deliberately long: a run performs live Graph calls plus two
 * self-probes against our own webhook, and the signed POST probe leaves one
 * row in the delivery log. Five minutes keeps the panel useful on arrival —
 * which is the point, the misleading "Connected" badge is right next to it —
 * without probing on every re-render or tab focus.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import {
  runInstagramHealthChecks,
  runMessengerHealthChecks,
  type ChannelHealthReport,
} from "@/lib/messaging/meta-health.functions";

const STALE_MS = 5 * 60 * 1000;

export function messengerHealthKey(workspaceId: string | undefined) {
  return ["messenger-health", workspaceId ?? "none"] as const;
}

export function instagramHealthKey(workspaceId: string | undefined) {
  return ["instagram-health", workspaceId ?? "none"] as const;
}

export function useMessengerHealth(enabled = true) {
  const { data: workspace } = useCurrentWorkspace();
  const workspaceId = workspace?.id;
  const runFn = useServerFn(runMessengerHealthChecks);

  return useQuery<ChannelHealthReport>({
    queryKey: messengerHealthKey(workspaceId),
    queryFn: () => runFn({ data: { workspaceId: workspaceId! } }) as Promise<ChannelHealthReport>,
    enabled: enabled && Boolean(workspaceId),
    staleTime: STALE_MS,
    refetchOnWindowFocus: false,
  });
}

export function useInstagramHealth(enabled = true) {
  const { data: workspace } = useCurrentWorkspace();
  const workspaceId = workspace?.id;
  const runFn = useServerFn(runInstagramHealthChecks);

  return useQuery<ChannelHealthReport>({
    queryKey: instagramHealthKey(workspaceId),
    queryFn: () => runFn({ data: { workspaceId: workspaceId! } }) as Promise<ChannelHealthReport>,
    enabled: enabled && Boolean(workspaceId),
    staleTime: STALE_MS,
    refetchOnWindowFocus: false,
  });
}
