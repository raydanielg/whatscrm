import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";

import { cn } from "@/lib/utils";

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, checked, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    checked={checked}
    className={cn(
      "peer relative inline-grid h-4 w-4 shrink-0 place-content-center rounded-[4px] border border-input bg-background shadow-sm outline-none transition-[background-color,border-color,box-shadow] duration-150 ease-out cursor-pointer",
      "hover:border-primary/70 hover:bg-primary/5",
      "focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:border-primary",
      "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-background disabled:hover:border-input",
      "data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground data-[state=checked]:shadow-[0_1px_2px_0_hsl(var(--primary)/0.25)]",
      "data-[state=indeterminate]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:text-primary-foreground",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn(
        "grid place-content-center text-current",
        "animate-in fade-in-0 zoom-in-75 duration-150",
      )}
    >
      {checked === "indeterminate" ? (
        <Minus className="h-3 w-3 stroke-[3]" />
      ) : (
        <Check className="h-3 w-3 stroke-[3]" />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
