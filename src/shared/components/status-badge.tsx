import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";
type Size = "sm" | "md";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  info: "bg-info-muted text-info border-info/20",
  success: "bg-success-muted text-success border-success/20",
  warning: "bg-warning-muted text-warning-foreground border-warning/30",
  danger: "bg-danger-muted text-danger border-danger/20",
  accent: "bg-accent-muted text-accent border-accent/20",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-5 gap-1 px-1.5 text-[11px]",
  md: "h-6 gap-1.5 px-2 text-xs",
};

/**
 * Compact status pill. Use for row/list state, plan tier, environment,
 * conversation status, etc. Always pair the color with an icon or text —
 * never rely on color alone (UI_STANDARDS §2).
 */
export function StatusBadge({
  tone = "neutral",
  size = "md",
  icon,
  children,
  className,
}: {
  tone?: Tone;
  size?: Size;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border font-medium tracking-tight whitespace-nowrap",
        TONE_CLASSES[tone],
        SIZE_CLASSES[size],
        className,
      )}
    >
      {icon}
      <span>{children}</span>
    </span>
  );
}
