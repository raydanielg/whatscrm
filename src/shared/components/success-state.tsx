import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type SuccessStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  secondary?: ReactNode;
  className?: string;
};

/**
 * Success confirmation surface per UI_STANDARDS §9. Reserved for multi-step
 * completions (post-onboarding, wizard finish). Everything smaller uses
 * inline "saved" checks or toasts.
 */
export function SuccessState({ title, description, action, secondary, className }: SuccessStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-14 px-6 text-center animate-scale-in",
        className,
      )}
    >
      <div className="grid h-14 w-14 place-items-center rounded-control bg-success-muted text-success shadow-glow">
        <CheckCircle2 className="h-7 w-7" aria-hidden />
      </div>
      <div className="max-w-sm space-y-1">
        <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
        {description && <p className="text-sm text-muted-foreground text-pretty">{description}</p>}
      </div>
      {(action || secondary) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondary}
        </div>
      )}
    </div>
  );
}
