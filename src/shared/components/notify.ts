import { toast as sonner, type ExternalToast } from "sonner";
import type { ReactNode } from "react";

/**
 * notify — enterprise toast facade over sonner.
 * Standardizes intent (info / success / warning / error / loading) and
 * exposes `promise` for async flows. All variants respect the light/dark
 * theme via sonner's built-in surface tokens.
 */
export const notify = {
  info: (title: ReactNode, opts?: ExternalToast) => sonner(title, opts),
  success: (title: ReactNode, opts?: ExternalToast) => sonner.success(title, opts),
  warning: (title: ReactNode, opts?: ExternalToast) => sonner.warning(title, opts),
  error: (title: ReactNode, opts?: ExternalToast) => sonner.error(title, opts),
  loading: (title: ReactNode, opts?: ExternalToast) => sonner.loading(title, opts),
  message: (title: ReactNode, opts?: ExternalToast) => sonner.message(title, opts),
  dismiss: (id?: string | number) => sonner.dismiss(id),
  /**
   * Wraps a promise with loading / success / error states.
   *
   *   notify.promise(saveUser(), {
   *     loading: "Saving",
   *     success: (u) => `Saved ${u.name}`,
   *     error: (err) => err.message ?? "Failed to save",
   *   });
   */
  promise: sonner.promise,
};

export type { ExternalToast };
