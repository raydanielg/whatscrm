/**
 * Live access watch for an open workflow builder.
 *
 * The route guard only runs on navigation. A membership downgraded *while the
 * builder is open* (active → suspended / pending / removed) would otherwise
 * leave a fully mounted editor polling tenant data until the next navigation.
 *
 * This hook re-checks the membership on an interval and on window focus,
 * listens for an instant realtime downgrade, and — the moment access is gone —
 * cancels and drops every workflow query so nothing keeps fetching in the
 * background. The caller unmounts the builder on `revoked`.
 *
 * Failing open is deliberate on *errors*: a flaky probe must not eject a
 * legitimate owner (see the degraded-notice flow). Only a definitive
 * non-active answer revokes.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Query key roots that hold workflow/tenant data fetched by the builder. */
const WORKFLOW_QUERY_ROOTS = [
  "workflow",
  "workflows",
  "workflow-permissions",
  "workflow-runs",
  "workflow-versions",
  "workflow-variables",
  "workflow-queue",
] as const;

export type WorkflowAccessWatch = {
  /** True once the backend confirmed the membership is no longer active. */
  revoked: boolean;
  /** The status that caused the revocation, for the denial panel/audit. */
  status: string | null;
};

export function useWorkflowAccessWatch(
  workspaceId: string | null | undefined,
  options: { pollMs?: number } = {},
): WorkflowAccessWatch {
  const queryClient = useQueryClient();
  const [revoked, setRevoked] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const pollMs = options.pollMs ?? 15_000;

  /** Stop every in-flight and future workflow fetch, then unmount upstream. */
  const revoke = React.useCallback(
    (nextStatus: string | null) => {
      setStatus(nextStatus);
      setRevoked(true);
      const predicate = (query: { queryKey: readonly unknown[] }) =>
        typeof query.queryKey[0] === "string" &&
        (WORKFLOW_QUERY_ROOTS as readonly string[]).includes(query.queryKey[0]);
      void queryClient.cancelQueries({ predicate });
      queryClient.removeQueries({ predicate });
    },
    [queryClient],
  );

  const { data } = useQuery({
    queryKey: ["workflow-access-watch", workspaceId],
    // Once revoked we stop polling too — the answer cannot change back
    // without a navigation, which re-runs the route guard.
    enabled: Boolean(workspaceId) && !revoked,
    refetchInterval: revoked ? false : pollMs,
    refetchOnWindowFocus: true,
    staleTime: 0,
    // A transient failure must not eject the user; keep the last good answer.
    retry: false,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getSession();
      const userId = auth.session?.user?.id;
      if (!userId || !workspaceId) return { status: null as string | null, known: false };
      const { data: member, error } = await supabase
        .from("workspace_members")
        .select("status")
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .maybeSingle();
      // Errors are inconclusive — report "unknown" rather than "revoked".
      if (error) return { status: null as string | null, known: false };
      return { status: (member?.status as string | undefined) ?? null, known: true };
    },
  });

  React.useEffect(() => {
    if (!data?.known || revoked) return;
    if (data.status !== "active") revoke(data.status);
  }, [data, revoke, revoked]);

  // Instant downgrade: react to the membership row changing under us.
  React.useEffect(() => {
    if (!workspaceId || revoked) return;
    const channelApi = (supabase as { channel?: (name: string) => any }).channel;
    if (typeof channelApi !== "function") return;

    const channel = supabase
      .channel(`workflow-access:${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "workspace_members", filter: `workspace_id=eq.${workspaceId}` },
        (payload: { new?: { status?: string } }) => {
          const next = payload?.new?.status ?? null;
          if (next && next !== "active") revoke(next);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel?.(channel);
    };
  }, [workspaceId, revoke, revoked]);

  return { revoked, status };
}
