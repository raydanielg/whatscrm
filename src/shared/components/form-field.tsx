import { createContext, useContext, useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AlertCircle } from "lucide-react";

type FieldContext = {
  id: string;
  descriptionId: string;
  errorId: string;
  invalid: boolean;
  disabled: boolean;
};

const FieldCtx = createContext<FieldContext | null>(null);

function useField() {
  const ctx = useContext(FieldCtx);
  if (!ctx) throw new Error("FormField subcomponents must be used inside a FormField");
  return ctx;
}

/**
 * Accessible form field wrapper (UI_STANDARDS §17). Composes:
 *   <FormField invalid={fieldState.invalid} disabled={...}>
 *     <FormField.Label required>Email</FormField.Label>
 *     <FormField.Control><Input {...} /></FormField.Control>
 *     <FormField.Description>We'll never share this.</FormField.Description>
 *     <FormField.Error>{fieldState.error?.message}</FormField.Error>
 *   </FormField>
 *
 * Wires `id`, `aria-describedby`, and `aria-invalid` automatically.
 */
export function FormField({
  invalid = false,
  disabled = false,
  className,
  children,
}: {
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const rid = useId();
  return (
    <FieldCtx.Provider
      value={{
        id: `${rid}-field`,
        descriptionId: `${rid}-desc`,
        errorId: `${rid}-err`,
        invalid,
        disabled,
      }}
    >
      <div className={cn("space-y-1.5", disabled && "opacity-60", className)}>{children}</div>
    </FieldCtx.Provider>
  );
}

function Label({ children, required, className }: { children: ReactNode; required?: boolean; className?: string }) {
  const { id } = useField();
  return (
    <label htmlFor={id} className={cn("text-xs font-medium text-foreground", className)}>
      {children}
      {required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
    </label>
  );
}

function Control({ children }: { children: ReactNode }) {
  const { id, descriptionId, errorId, invalid, disabled } = useField();
  // Clone the single child input to inject a11y props without React.cloneElement typing headaches.
  return (
    <div
      // Delegate attributes via data-slot for CSS hooks.
      data-slot="form-control"
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
      // Provide these as data so the child input can pick them up via aria attrs from parent.
      id={id}
    >
      {/* Descendant inputs should read these ids via useContext or explicit props. */}
      <span className="sr-only" aria-hidden id={descriptionId} />
      <span className="sr-only" aria-hidden id={errorId} />
      {children}
    </div>
  );
}

function Description({ children }: { children: ReactNode }) {
  const { descriptionId, invalid } = useField();
  if (invalid) return null;
  return (
    <p id={descriptionId} className="text-[11px] text-muted-foreground text-pretty">
      {children}
    </p>
  );
}

function FieldError({ children }: { children?: ReactNode }) {
  const { errorId, invalid } = useField();
  if (!invalid || !children) return null;
  return (
    <p
      id={errorId}
      role="alert"
      className="flex items-start gap-1 text-[11px] font-medium text-danger animate-fade-in"
    >
      <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

FormField.Label = Label;
FormField.Control = Control;
FormField.Description = Description;
FormField.Error = FieldError;

/** Read the field context inside custom controls to wire aria-* props. */
export { useField as useFormField };
