import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

type Props = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * Password input with an accessible show/hide toggle.
 *
 * - Toggle is a real `<button type="button">` so it never submits the form.
 * - `aria-label` + `aria-pressed` announce the current state to screen readers.
 * - `autoComplete` is inherited from the caller (`current-password` /
 *   `new-password`) so browser password managers keep working.
 */
export const PasswordInput = forwardRef<HTMLInputElement, Props>(function PasswordInput(
  { className = "", ...props },
  ref,
) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        {...props}
        ref={ref}
        type={visible ? "text" : "password"}
        className={
          "w-full h-10 pl-3 pr-10 rounded-control border border-input bg-surface text-sm placeholder:text-muted-foreground/60 " +
          className
        }
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        tabIndex={0}
        className="absolute inset-y-0 right-0 grid place-items-center w-10 text-muted-foreground hover:text-foreground transition-colors rounded-r-md"
      >
        {visible ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
      </button>
    </div>
  );
});
