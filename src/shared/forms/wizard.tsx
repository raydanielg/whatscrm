"use client";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

/* --------------------------------- Types --------------------------------- */

export type WizardStep = {
  id: string;
  title: string;
  description?: string;
  optional?: boolean;
};

type WizardContextValue = {
  steps: WizardStep[];
  index: number;
  activeId: string;
  isFirst: boolean;
  isLast: boolean;
  goTo: (id: string | number) => void;
  next: () => void;
  back: () => void;
  markComplete: (id: string, complete?: boolean) => void;
  completed: Record<string, boolean>;
};

const WizardCtx = createContext<WizardContextValue | null>(null);

export function useWizard() {
  const ctx = useContext(WizardCtx);
  if (!ctx) throw new Error("useWizard must be used inside <Wizard>");
  return ctx;
}

/* ------------------------------ Root Wizard ------------------------------ */

export function Wizard({
  steps,
  defaultStepId,
  onStepChange,
  className,
  children,
}: {
  steps: WizardStep[];
  defaultStepId?: string;
  onStepChange?: (id: string, index: number) => void;
  className?: string;
  children: ReactNode;
}) {
  const [activeId, setActiveId] = useState(defaultStepId ?? steps[0]?.id ?? "");
  const [completed, setCompleted] = useState<Record<string, boolean>>({});

  const index = Math.max(
    0,
    steps.findIndex((s) => s.id === activeId),
  );

  const goTo = useCallback(
    (target: string | number) => {
      const next =
        typeof target === "number" ? steps[Math.max(0, Math.min(steps.length - 1, target))]?.id : target;
      if (!next) return;
      setActiveId(next);
      const i = steps.findIndex((s) => s.id === next);
      onStepChange?.(next, i);
    },
    [steps, onStepChange],
  );

  const next = useCallback(() => {
    if (index < steps.length - 1) goTo(index + 1);
  }, [goTo, index, steps.length]);

  const back = useCallback(() => {
    if (index > 0) goTo(index - 1);
  }, [goTo, index]);

  const markComplete = useCallback((id: string, complete = true) => {
    setCompleted((c) => ({ ...c, [id]: complete }));
  }, []);

  const value = useMemo<WizardContextValue>(
    () => ({
      steps,
      index,
      activeId,
      isFirst: index === 0,
      isLast: index === steps.length - 1,
      goTo,
      next,
      back,
      markComplete,
      completed,
    }),
    [steps, index, activeId, goTo, next, back, markComplete, completed],
  );

  return (
    <WizardCtx.Provider value={value}>
      <div className={cn("flex flex-col gap-6", className)}>{children}</div>
    </WizardCtx.Provider>
  );
}

/* ------------------------------ Step Header ------------------------------ */

export function WizardSteps({
  className,
  orientation = "horizontal",
}: {
  className?: string;
  orientation?: "horizontal" | "vertical";
}) {
  const { steps, index, completed, goTo } = useWizard();
  return (
    <ol
      className={cn(
        "flex gap-2",
        orientation === "horizontal" ? "items-center" : "flex-col items-stretch",
        className,
      )}
      aria-label="Progress"
    >
      {steps.map((step, i) => {
        const state = i < index || completed[step.id] ? "complete" : i === index ? "current" : "upcoming";
        const clickable = i <= index || completed[step.id];
        return (
          <li key={step.id} className={cn("flex items-center gap-2", orientation === "horizontal" && "flex-1 min-w-0")}>
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && goTo(step.id)}
              aria-current={state === "current" ? "step" : undefined}
              className={cn(
                "group flex min-w-0 flex-1 items-center gap-3 rounded-control border px-3 py-2 text-left transition-all duration-normal ease-emphasized",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                state === "current" && "border-accent bg-accent-muted/40",
                state === "complete" && "border-border bg-surface",
                state === "upcoming" && "border-dashed border-border bg-surface-sunken/40 opacity-70",
                !clickable && "cursor-not-allowed",
              )}
            >
              <span
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ",
                  state === "complete" && "bg-success text-success-foreground",
                  state === "current" && "bg-accent text-accent-foreground",
                  state === "upcoming" && "bg-muted text-muted-foreground",
                )}
              >
                {state === "complete" ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">
                  {step.title}
                  {step.optional && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>
                  )}
                </span>
                {step.description && (
                  <span className="block truncate text-xs text-muted-foreground">{step.description}</span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------ Step Panel ------------------------------ */

export function WizardStep({ id, children }: { id: string; children: ReactNode }) {
  const { activeId } = useWizard();
  if (activeId !== id) return null;
  return <div className="animate-fade-in">{children}</div>;
}

/* ------------------------------ Nav Buttons ------------------------------ */

export function WizardNav({
  onFinish,
  finishLabel = "Finish",
  nextLabel = "Continue",
  backLabel = "Back",
  disableNext,
  loading,
  className,
}: {
  onFinish?: () => void | Promise<void>;
  finishLabel?: string;
  nextLabel?: string;
  backLabel?: string;
  disableNext?: boolean;
  loading?: boolean;
  className?: string;
}) {
  const { isFirst, isLast, back, next } = useWizard();
  return (
    <div className={cn("flex items-center justify-between gap-3 pt-4", className)}>
      <Button type="button" variant="ghost" onClick={back} disabled={isFirst || loading}>
        {backLabel}
      </Button>
      <Button
        type="button"
        onClick={() => (isLast ? onFinish?.() : next())}
        disabled={disableNext || loading}
      >
        {isLast ? finishLabel : nextLabel}
      </Button>
    </div>
  );
}

/* ---------------------------- Progress (thin) ---------------------------- */

export function WizardProgress({ className }: { className?: string }) {
  const { index, steps } = useWizard();
  const pct = ((index + 1) / steps.length) * 100;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={steps.length}
      aria-valuenow={index + 1}
      className={cn("h-1 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div
        className="h-full bg-accent transition-[width] duration-normal ease-emphasized"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
