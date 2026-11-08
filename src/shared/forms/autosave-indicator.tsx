import { cn } from "@/lib/utils";
import { AlertCircle, Check, CloudOff, Loader2 } from "lucide-react";
import type { AutosaveStatus } from "./use-autosave";
import { formatRelativeTime } from "@/shared/widgets";

export function AutosaveIndicator({
  status,
  savedAt,
  error,
  className,
}: {
  status: AutosaveStatus;
  savedAt?: Date | null;
  error?: Error | null;
  className?: string;
}) {
  const map: Record<AutosaveStatus, { icon: React.ReactNode; label: string; tone: string }> = {
    idle: { icon: null, label: "", tone: "text-muted-foreground" },
    pending: {
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />,
      label: "Unsaved changes",
      tone: "text-muted-foreground",
    },
    saving: {
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />,
      label: "Saving",
      tone: "text-muted-foreground",
    },
    saved: {
      icon: <Check className="h-3.5 w-3.5" aria-hidden />,
      label: savedAt ? `Saved ${formatRelativeTime(savedAt)}` : "Saved",
      tone: "text-success",
    },
    error: {
      icon: <AlertCircle className="h-3.5 w-3.5" aria-hidden />,
      label: error?.message ?? "Save failed",
      tone: "text-danger",
    },
  };
  const s = map[status];
  if (!s.label) return null;
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("inline-flex items-center gap-1.5 text-xs font-medium", s.tone, className)}
    >
      {s.icon ?? <CloudOff className="h-3.5 w-3.5" aria-hidden />}
      {s.label}
    </span>
  );
}
