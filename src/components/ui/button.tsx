import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "control-focus control-motion inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-sm font-medium cursor-pointer disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary",
        // Marketing primary: brand-accent fill that swaps to primary on hover — used across landing CTAs.
        primary:
          "bg-accent-strong text-accent-foreground hover:bg-primary hover:text-primary-foreground active:bg-primary active:text-primary-foreground",
        // Marketing accent: solid primary fill (used for highlighted pricing plans).
        accent:
          "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive",
        outline:
          "control-border control-hover bg-transparent text-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80 active:bg-secondary border border-input",
        ghost: "control-hover bg-transparent text-foreground",
        // Ghost outline for use on the dark hero / gradient surface.
        heroGhost: "btn-hero-ghost",
        // WhatsApp channel action (click-to-chat CTAs).
        whatsapp:
          "bg-whatsapp text-whatsapp-foreground hover:bg-whatsapp/90 active:bg-whatsapp",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-9 rounded-control px-3 text-xs",
        lg: "h-10 rounded-control px-5 py-3",
        xl: "h-12 rounded-control px-6 py-3 text-base",
        // Full-width CTA sized for card footers (pricing tiers, feature cards).
        cta: "h-auto w-full px-4 py-3",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);


export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
