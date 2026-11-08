import * as React from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Loader2, Wifi, WifiOff } from "lucide-react";

type Status = "idle" | "syncing" | "connected" | "disconnected";

/**
 * Small pill shown near the organization switcher that reflects whether the
 * frontend has finished syncing CRM data for the currently active org and
 * whether the realtime channel is live.
 *
 * States:
 *  - "Syncing"       — an org switch is in progress OR TanStack Query is
 *                        still fetching/mutating (initial hydration).
 *  - "Realtime connected" — realtime channel for the active org is SUBSCRIBED
 *                            and no in-flight queries remain.
 *  - "Realtime offline"  — realtime channel closed / errored.
 */
export function RealtimeStatusIndicator({
  activeOrgId,
  switching,
  collapsed = false,
  className,
}: {
  activeOrgId: string | null;
  switching: boolean;
  collapsed?: boolean;
  className?: string;
}) {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const [channelStatus, setChannelStatus] = React.useState<Status>("idle");

  // Re-subscribe a lightweight presence channel whenever the active org
  // changes. This mirrors the connection state of the app's other realtime
  // subscriptions so we can surface a single status pill.
  React.useEffect(() => {
    if (!activeOrgId) {
      setChannelStatus("idle");
      return;
    }
    setChannelStatus("syncing");
    const ch = supabase.channel(`org-status:${activeOrgId}`, {
      config: { broadcast: { self: false } },
    });
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") setChannelStatus("connected");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setChannelStatus("disconnected");
      }
    });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [activeOrgId]);

  const isSyncing = switching || fetching > 0 || mutating > 0 || channelStatus === "syncing";

  let status: Status;
  if (isSyncing) status = "syncing";
  else if (channelStatus === "disconnected") status = "disconnected";
  else if (channelStatus === "connected") status = "connected";
  else status = "idle";

  const label =
    status === "syncing"
      ? "Syncing"
      : status === "connected"
        ? "Realtime connected"
        : status === "disconnected"
          ? "Realtime offline"
          : "Idle";

  const dotClass =
    status === "connected"
      ? "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]"
      : status === "disconnected"
        ? "bg-destructive"
        : "bg-amber-500";

  const Icon =
    status === "syncing" ? Loader2 : status === "disconnected" ? WifiOff : Wifi;

  if (collapsed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center px-1.5 py-1",
          className,
        )}
        role="status"
        aria-live="polite"
        aria-label={label}
        title={label}
      >
        <span className={cn("size-2 rounded-full", dotClass)} aria-hidden />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-control border border-border/60 bg-muted/40 px-2 py-1 text-xs text-muted-foreground",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <Icon
        className={cn(
          "size-3",
          status === "syncing" && "animate-spin",
          status === "connected" && "text-emerald-600 dark:text-emerald-400",
          status === "disconnected" && "text-destructive",
        )}
        aria-hidden
      />
      <span className={cn("size-1.5 rounded-full", dotClass)} aria-hidden />
      <span className="font-medium tracking-tight">{label}</span>
    </div>
  );
}
