import { cn } from "@/lib/utils";

/**
 * Deterministic initials-based avatar for providers. Renders a consistent
 * accent-toned square derived from the provider ID so cards get visual
 * identity without requiring per-provider logo assets.
 */
const PALETTE = [
  "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  "bg-rose-500/15 text-rose-600 dark:text-rose-400",
  "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400",
] as const;

function hash(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function ProviderAvatar({
  id,
  name,
  size = "md",
  className,
}: {
  id: string;
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const swatch = PALETTE[hash(id) % PALETTE.length];
  const sizeClasses = {
    sm: "h-8 w-8 text-[11px]",
    md: "h-10 w-10 text-xs",
    lg: "h-14 w-14 text-sm",
  }[size];
  return (
    <div
      aria-hidden
      className={cn(
        "rounded-control grid place-items-center font-bold shrink-0 border border-border/50",
        swatch,
        sizeClasses,
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}
