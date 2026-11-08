import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Shared typography system.
 *
 * Every text component in the app renders through this file. It maps
 * semantic roles (display / heading / body / label / caption / eyebrow /
 * code / kbd) to the preset utilities defined in `src/styles.css`
 * (@utility text-display-*, text-heading-*, text-body-*, text-label-*,
 * text-caption, text-eyebrow, text-button-*).
 *
 * The presets bundle font-family, size, line-height, letter-spacing, and
 * weight in one class — components should NEVER stack ad-hoc typography
 * utilities (`text-4xl font-bold tracking-tight`). Instead use:
 *
 *   <Heading level={1}>Title</Heading>
 *   <Text variant="body-sm" muted>Subtitle</Text>
 *   <Eyebrow>Featured</Eyebrow>
 *   <Code>npm run build</Code>
 *
 * All variants render the correct semantic HTML element by default and
 * accept `asChild` (Radix Slot) for composition.
 */

/* -------------------------------------------------------------------------- */
/*  Heading                                                                    */
/* -------------------------------------------------------------------------- */

const headingVariants = cva("", {
  variants: {
    level: {
      1: "text-heading-h1",
      2: "text-heading-h2",
      3: "text-heading-h3",
      4: "text-heading-h4",
      5: "text-heading-h5",
      6: "text-heading-h6",
    },
    tone: {
      default: "text-foreground",
      muted: "text-muted-foreground",
      primary: "text-primary",
      hero: "text-hero-foreground",
      inverse: "text-background",
    },
  },
  defaultVariants: { level: 2, tone: "default" },
});

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface HeadingProps
  extends Omit<React.HTMLAttributes<HTMLHeadingElement>, "color">,
    VariantProps<typeof headingVariants> {
  as?: `h${HeadingLevel}`;
  asChild?: boolean;
}

export const Heading = React.forwardRef<HTMLHeadingElement, HeadingProps>(
  ({ className, level = 2, tone, as, asChild, ...props }, ref) => {
    const Tag = (asChild ? Slot : (as ?? (`h${level ?? 2}` as `h${HeadingLevel}`))) as React.ElementType;
    return (
      <Tag
        ref={ref}
        className={cn(headingVariants({ level, tone }), className)}
        {...props}
      />
    );
  },
);
Heading.displayName = "Heading";

/* -------------------------------------------------------------------------- */
/*  Display — marketing / hero                                                 */
/* -------------------------------------------------------------------------- */

const displayVariants = cva("", {
  variants: {
    size: {
      sm: "text-display-sm",
      md: "text-display-md",
      lg: "text-display-lg",
      xl: "text-display-xl",
      "2xl": "text-display-2xl",
    },
    tone: {
      default: "text-foreground",
      muted: "text-muted-foreground",
      primary: "text-primary",
      hero: "text-hero-foreground",
    },
  },
  defaultVariants: { size: "lg", tone: "default" },
});

export interface DisplayProps
  extends Omit<React.HTMLAttributes<HTMLHeadingElement>, "color">,
    VariantProps<typeof displayVariants> {
  as?: "h1" | "h2" | "p" | "span" | "div";
  asChild?: boolean;
}

export const Display = React.forwardRef<HTMLHeadingElement, DisplayProps>(
  ({ className, size, tone, as = "h1", asChild, ...props }, ref) => {
    const Tag = (asChild ? Slot : as) as React.ElementType;
    return (
      <Tag
        ref={ref}
        className={cn(displayVariants({ size, tone }), className)}
        {...props}
      />
    );
  },
);
Display.displayName = "Display";

/* -------------------------------------------------------------------------- */
/*  Text — body copy                                                           */
/* -------------------------------------------------------------------------- */

const textVariants = cva("", {
  variants: {
    variant: {
      "body-lg": "text-body-lg",
      "body-md": "text-body-md",
      "body-sm": "text-body-sm",
      "body-xs": "text-body-xs",
      "label-lg": "text-label-lg",
      "label-md": "text-label-md",
      "label-sm": "text-label-sm",
    },
    tone: {
      default: "text-foreground",
      muted: "text-muted-foreground",
      primary: "text-primary",
      success: "text-success",
      warning: "text-warning",
      danger: "text-danger",
      hero: "text-hero-foreground",
      "hero-muted": "text-hero-foreground-muted",
      inverse: "text-background",
    },
    align: {
      left: "text-left",
      center: "text-center",
      right: "text-right",
    },
    weight: {
      regular: "font-normal",
      medium: "font-medium",
      semibold: "font-semibold",
      bold: "font-bold",
    },
    italic: { true: "italic", false: "" },
  },
  defaultVariants: { variant: "body-md", tone: "default" },
});

export interface TextProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "color">,
    VariantProps<typeof textVariants> {
  as?: "p" | "span" | "div" | "li" | "small" | "strong" | "em" | "label";
  asChild?: boolean;
  muted?: boolean;
}

export const Text = React.forwardRef<HTMLElement, TextProps>(
  (
    { className, variant, tone, align, weight, italic, as = "p", asChild, muted, ...props },
    ref,
  ) => {
    const Tag = (asChild ? Slot : as) as React.ElementType;
    const resolvedTone = muted ? "muted" : tone;
    return (
      <Tag
        ref={ref as never}
        className={cn(
          textVariants({ variant, tone: resolvedTone, align, weight, italic }),
          className,
        )}
        {...props}
      />
    );
  },
);
Text.displayName = "Text";

/* -------------------------------------------------------------------------- */
/*  Label — form controls                                                      */
/* -------------------------------------------------------------------------- */

const labelVariants = cva("inline-flex items-center gap-1", {
  variants: {
    size: {
      lg: "text-label-lg",
      md: "text-label-md",
      sm: "text-label-sm",
    },
    tone: {
      default: "text-foreground",
      muted: "text-muted-foreground",
      danger: "text-danger",
    },
  },
  defaultVariants: { size: "md", tone: "default" },
});

export interface LabelProps
  extends React.LabelHTMLAttributes<HTMLLabelElement>,
    VariantProps<typeof labelVariants> {
  asChild?: boolean;
}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, size, tone, asChild, ...props }, ref) => {
    const Tag = (asChild ? Slot : "label") as React.ElementType;
    return (
      <Tag ref={ref} className={cn(labelVariants({ size, tone }), className)} {...props} />
    );
  },
);
Label.displayName = "Label";

/* -------------------------------------------------------------------------- */
/*  Caption + Eyebrow                                                          */
/* -------------------------------------------------------------------------- */

export interface CaptionProps extends React.HTMLAttributes<HTMLElement> {
  size?: "md" | "sm";
  as?: "p" | "span" | "small" | "div";
  asChild?: boolean;
}

export const Caption = React.forwardRef<HTMLElement, CaptionProps>(
  ({ className, size = "md", as = "small", asChild, ...props }, ref) => {
    const Tag = (asChild ? Slot : as) as React.ElementType;
    return (
      <Tag
        ref={ref as never}
        className={cn(size === "sm" ? "text-caption-sm" : "text-caption", className)}
        {...props}
      />
    );
  },
);
Caption.displayName = "Caption";

export interface EyebrowProps extends React.HTMLAttributes<HTMLElement> {
  as?: "p" | "span" | "div";
  asChild?: boolean;
}

export const Eyebrow = React.forwardRef<HTMLElement, EyebrowProps>(
  ({ className, as = "span", asChild, ...props }, ref) => {
    const Tag = (asChild ? Slot : as) as React.ElementType;
    return <Tag ref={ref as never} className={cn("text-eyebrow", className)} {...props} />;
  },
);
Eyebrow.displayName = "Eyebrow";

/* -------------------------------------------------------------------------- */
/*  Code + Kbd                                                                 */
/* -------------------------------------------------------------------------- */

export interface CodeProps extends React.HTMLAttributes<HTMLElement> {
  block?: boolean;
  asChild?: boolean;
}

export const Code = React.forwardRef<HTMLElement, CodeProps>(
  ({ className, block, asChild, ...props }, ref) => {
    const Tag = (asChild ? Slot : block ? "pre" : "code") as React.ElementType;
    return (
      <Tag
        ref={ref as never}
        className={cn(
          "font-mono text-body-sm rounded-control bg-muted text-foreground",
          block ? "block p-4 leading-relaxed overflow-x-auto" : "inline-block px-1.5 py-0.5",
          className,
        )}
        {...props}
      />
    );
  },
);
Code.displayName = "Code";

export interface KbdProps extends React.HTMLAttributes<HTMLElement> {
  asChild?: boolean;
}

export const Kbd = React.forwardRef<HTMLElement, KbdProps>(
  ({ className, asChild, ...props }, ref) => {
    const Tag = (asChild ? Slot : "kbd") as React.ElementType;
    return (
      <Tag
        ref={ref as never}
        className={cn(
          "inline-flex items-center rounded-xs border border-border bg-muted text-foreground font-mono text-body-xs px-1.5 py-0.5",
          className,
        )}
        {...props}
      />
    );
  },
);
Kbd.displayName = "Kbd";

/* -------------------------------------------------------------------------- */
/*  Prose — long-form containers (blog posts, docs)                            */
/* -------------------------------------------------------------------------- */

/**
 * Wrap long-form markdown/HTML with `<Prose>` to inherit the typography
 * presets on native tags. Individual headings inside can still opt into
 * the exact preset via <Heading>. Prose only styles nested h1-h6, p, ul,
 * ol, blockquote, code, pre.
 */
export const Prose = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "max-w-[65ch]",
        "[&>h1]:text-heading-h1 [&>h1]:mt-8 [&>h1]:mb-4",
        "[&>h2]:text-heading-h2 [&>h2]:mt-8 [&>h2]:mb-3",
        "[&>h3]:text-heading-h3 [&>h3]:mt-6 [&>h3]:mb-2",
        "[&>h4]:text-heading-h4 [&>h4]:mt-4 [&>h4]:mb-2",
        "[&>h5]:text-heading-h5 [&>h5]:mt-4 [&>h5]:mb-2",
        "[&>h6]:text-heading-h6 [&>h6]:mt-4 [&>h6]:mb-2",
        "[&>p]:text-body-md [&>p]:mb-4",
        "[&>ul]:text-body-md [&>ul]:list-disc [&>ul]:pl-6 [&>ul]:mb-4",
        "[&>ol]:text-body-md [&>ol]:list-decimal [&>ol]:pl-6 [&>ol]:mb-4",
        "[&>blockquote]:border-l-4 [&>blockquote]:border-border [&>blockquote]:pl-4 [&>blockquote]:italic [&>blockquote]:text-muted-foreground",
        "[&>code]:font-mono [&>code]:text-body-sm [&>code]:rounded-control [&>code]:bg-muted [&>code]:px-1.5 [&>code]:py-0.5",
        "[&>pre]:font-mono [&>pre]:text-body-sm [&>pre]:bg-muted [&>pre]:rounded-surface [&>pre]:p-4 [&>pre]:overflow-x-auto",
        className,
      )}
      {...props}
    />
  ),
);
Prose.displayName = "Prose";

export {
  headingVariants,
  displayVariants,
  textVariants,
  labelVariants,
};
