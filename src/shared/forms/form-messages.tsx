import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, XCircle } from "lucide-react";
import type { ReactNode } from "react";

export type MessageTone = "info" | "success" | "warning" | "danger";

const toneMap: Record<MessageTone, { cls: string; Icon: typeof Info }> = {
  info: {
    cls: "border-info/30 bg-info-muted text-info",
    Icon: Info,
  },
  success: {
    cls: "border-success/30 bg-success-muted text-success",
    Icon: CheckCircle2,
  },
  warning: {
    cls: "border-warning/30 bg-warning-muted text-warning",
    Icon: TriangleAlert,
  },
  danger: {
    cls: "border-danger/30 bg-danger-muted text-danger",
    Icon: XCircle,
  },
};

/**
 * Full-width banner for form-level messages (submit success, top-of-form errors).
 * Field-level messages should use `<FormField.Error>` / `<FormField.Description>`.
 */
export function FormBanner({
  tone = "info",
  title,
  children,
  className,
  actions,
}: {
  tone?: MessageTone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  const { cls, Icon } = toneMap[tone];
  const isAlert = tone === "danger" || tone === "warning";
  return (
    <div
      role={isAlert ? "alert" : "status"}
      aria-live={isAlert ? "assertive" : "polite"}
      className={cn(
        "flex items-start gap-3 rounded-control border px-4 py-3 text-sm",
        cls,
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={cn(title && "mt-0.5 opacity-90")}>{children}</div>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}

/**
 * Inline field message shown when validation fails on blur / change. Prefer the
 * `<FormField.Error>` slot when inside a `FormField` — this component is for
 * standalone controls.
 */
export function InlineFieldMessage({
  tone = "danger",
  children,
  id,
  className,
}: {
  tone?: MessageTone;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  const isError = tone === "danger";
  const { Icon } = toneMap[tone];
  const color =
    tone === "danger"
      ? "text-danger"
      : tone === "warning"
        ? "text-warning"
        : tone === "success"
          ? "text-success"
          : "text-info";
  return (
    <p
      id={id}
      role={isError ? "alert" : undefined}
      className={cn("mt-1.5 flex items-center gap-1.5 text-xs font-medium", color, className)}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

export { AlertCircle };
