import { Bell, BellOff, CircleDot, WifiOff, RefreshCcw, CloudUpload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useRealtimeMessaging } from "@/hooks/use-realtime-messaging";

export function RealtimeStatusIndicator({ className }: { className?: string }) {
  const {
    connectionState,
    onlineUsers,
    notificationsPermission,
    requestDesktopNotifications,
    pendingOfflineCount,
  } = useRealtimeMessaging();

  const onlineCount = Object.keys(onlineUsers).length;

  const dot =
    connectionState === "connected"
      ? "bg-emerald-500"
      : connectionState === "reconnecting"
      ? "bg-amber-500 animate-pulse"
      : connectionState === "offline"
      ? "bg-destructive"
      : connectionState === "paused"
      ? "bg-muted-foreground"
      : "bg-muted-foreground animate-pulse";

  const label =
    connectionState === "connected"
      ? "Live"
      : connectionState === "reconnecting"
      ? "Reconnecting"
      : connectionState === "offline"
      ? "Offline"
      : connectionState === "paused"
      ? "Realtime off"
      : "Connecting";

  const Icon =
    connectionState === "offline" || connectionState === "paused"
      ? WifiOff
      : connectionState === "reconnecting"
      ? RefreshCcw
      : CircleDot;

  return (
    <TooltipProvider delayDuration={200}>
      <div className={cn("flex items-center gap-1.5", className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 rounded-control border border-border bg-background/60 px-2 py-1 text-xs font-medium">
              <span className={cn("relative flex h-2 w-2")}>
                <span
                  className={cn(
                    "absolute inset-0 rounded-full opacity-60",
                    dot,
                  )}
                />
                <span className={cn("relative rounded-full h-2 w-2", dot)} />
              </span>
              <Icon className="h-3 w-3 text-muted-foreground" />
              <span className="hidden sm:inline">{label}</span>
              {onlineCount > 0 && connectionState === "connected" && (
                <span className="text-muted-foreground">· {onlineCount}</span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            <div className="font-medium">{label}</div>
            <div className="text-white/80">
              {onlineCount} teammate{onlineCount === 1 ? "" : "s"} online
            </div>
          </TooltipContent>
        </Tooltip>

        {pendingOfflineCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 rounded-control border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                <CloudUpload className="h-3 w-3" />
                {pendingOfflineCount}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {pendingOfflineCount} queued for retry
            </TooltipContent>
          </Tooltip>
        )}

        {notificationsPermission !== "unsupported" &&
          notificationsPermission !== "granted" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => void requestDesktopNotifications()}
                  aria-label="Enable desktop notifications"
                >
                  {notificationsPermission === "denied" ? (
                    <BellOff className="h-3.5 w-3.5" />
                  ) : (
                    <Bell className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {notificationsPermission === "denied"
                  ? "Notifications blocked in browser"
                  : "Enable desktop notifications"}
              </TooltipContent>
            </Tooltip>
          )}
      </div>
    </TooltipProvider>
  );
}
