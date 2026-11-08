import { cn } from "@/lib/utils";
import { useRealtimeMessaging } from "@/hooks/use-realtime-messaging";

/**
 * Small colored dot placed at the corner of a teammate's avatar to reflect
 * live workspace presence. Uses the shared realtime presence state so every
 * consumer stays in sync.
 */
export function PresenceDot({
  userId,
  className,
}: {
  userId: string | null | undefined;
  className?: string;
}) {
  const { isUserOnline } = useRealtimeMessaging();
  const online = isUserOnline(userId);
  return (
    <span
      aria-hidden
      className={cn(
        "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-background",
        online ? "bg-emerald-500" : "bg-muted-foreground/40",
        className,
      )}
    />
  );
}
