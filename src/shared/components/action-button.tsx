import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * ActionButton — Button + built-in loading state with icon slots.
 * Preserves layout while loading (leading icon swaps to spinner) so buttons
 * don't jump. Disables interaction and announces busy state to screen readers.
 * Does not support `asChild` — use `Button` directly for that case.
 */
export interface ActionButtonProps extends Omit<ButtonProps, "asChild"> {
  loading?: boolean;
  loadingText?: string;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

export const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  (
    { loading, loadingText, leadingIcon, trailingIcon, disabled, children, className, ...rest },
    ref,
  ) => {
    const showLeading = loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : leadingIcon;
    const label = loading && loadingText ? loadingText : children;
    return (
      <Button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(className)}
        {...rest}
      >
        {showLeading}
        {label}
        {!loading && trailingIcon}
      </Button>
    );
  },
);
ActionButton.displayName = "ActionButton";
