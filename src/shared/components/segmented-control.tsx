import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedControlOption<T>[];
  size?: "sm" | "md";
  fullWidth?: boolean;
  ariaLabel: string;
  className?: string;
}

/**
 * Segmented control (radiogroup). Use for 2–5 mutually exclusive views
 * (List/Board, Day/Week/Month). For binary settings prefer `Switch`.
 * Keyboard: arrows move focus/selection, Home/End jump to ends.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = "md",
  fullWidth,
  ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  const heights = size === "sm" ? "h-9 text-xs" : "h-9 text-sm";

  const onKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const enabled = options
      .map((o, i) => ({ o, i }))
      .filter(({ o }) => !o.disabled);
    const currentEnabledIdx = enabled.findIndex(({ i }) => i === index);
    let nextIdx = currentEnabledIdx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      nextIdx = (currentEnabledIdx + 1) % enabled.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      nextIdx = (currentEnabledIdx - 1 + enabled.length) % enabled.length;
    } else if (e.key === "Home") {
      nextIdx = 0;
    } else if (e.key === "End") {
      nextIdx = enabled.length - 1;
    } else {
      return;
    }
    e.preventDefault();
    onChange(enabled[nextIdx].o.value);
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center rounded-control border border-border bg-muted/40 p-0.5",
        fullWidth && "w-full",
        className,
      )}
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            disabled={opt.disabled}
            onClick={() => !opt.disabled && onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-1.5 rounded-control px-3 font-medium transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              heights,
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
              opt.disabled && "cursor-not-allowed opacity-50",
            )}
          >
            {opt.icon}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
