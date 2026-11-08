import { CloudUpload, WifiOff } from "lucide-react";
import { useRealtimeMessaging } from "@/hooks/use-realtime-messaging";

/**
 * Inline banner shown above the conversation window when the client is
 * offline or has messages waiting to flush. `RealtimeMessagingProvider`
 * owns the queue and flushes it automatically on reconnect.
 */
export function OfflineQueueBanner() {
  const { connectionState, pendingOfflineCount } = useRealtimeMessaging();
  const offline = connectionState === "offline";
  const hasQueue = pendingOfflineCount > 0;
  if (!offline && !hasQueue) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-900 dark:text-amber-200"
    >
      {offline ? (
        <>
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          <span>
            You're offline. New messages will be sent automatically when the
            connection returns.
          </span>
        </>
      ) : (
        <>
          <CloudUpload className="h-3.5 w-3.5 shrink-0 animate-pulse" />
          <span>
            {pendingOfflineCount} message
            {pendingOfflineCount === 1 ? "" : "s"} queued — retrying
          </span>
        </>
      )}
    </div>
  );
}
