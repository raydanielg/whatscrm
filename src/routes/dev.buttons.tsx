import { createFileRoute } from "@tanstack/react-router";
import { Button, type buttonVariants } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";

/**
 * Hidden visual-regression fixture for the shared Button component.
 * Renders every variant × relevant size in a deterministic grid so
 * Playwright can capture per-button screenshots across themes/states.
 *
 * Not linked from anywhere. Safe to delete when the button API changes
 * meaningfully — regenerate baselines afterwards.
 */

type Variant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>;
type Size = NonNullable<VariantProps<typeof buttonVariants>["size"]>;

const CASES: Array<{ variant: Variant; size: Size; label: string }> = [
  { variant: "primary", size: "default", label: "primary" },
  { variant: "primary", size: "xl", label: "primary-xl" },
  { variant: "secondary", size: "default", label: "secondary" },
  { variant: "outline", size: "default", label: "outline" },
  { variant: "outline", size: "cta", label: "outline-cta" },
  { variant: "accent", size: "cta", label: "accent-cta" },
  { variant: "ghost", size: "default", label: "ghost" },
  { variant: "accent", size: "default", label: "accent" },
  { variant: "destructive", size: "default", label: "destructive" },
  { variant: "heroGhost", size: "default", label: "heroGhost" },
  { variant: "heroGhost", size: "xl", label: "heroGhost-xl" },
  { variant: "link", size: "default", label: "link" },
];

function ButtonsVisualFixture() {
  return (
    <main
      data-testid="buttons-visual-fixture"
      className="min-h-screen bg-background text-foreground p-10"
    >
      <h1 className="sr-only">Button visual regression fixture</h1>
      <div className="grid grid-cols-2 gap-8 max-w-3xl">
        {CASES.map(({ variant, size, label }) => {
          // heroGhost is designed for dark hero surfaces — render on a
          // dark tile so the baseline reflects real usage in both themes.
          const onHero = variant === "heroGhost";
          return (
            <div
              key={label}
              data-testid={`btn-cell-${label}`}
              className={
                "flex items-center justify-center rounded-control p-6 " +
                (onHero ? "bg-neutral-900" : "bg-transparent border border-border")
              }
            >
              <Button
                data-testid={`btn-${label}`}
                variant={variant}
                size={size}
              >
                {label}
              </Button>
            </div>
          );
        })}
      </div>
    </main>
  );
}

export const Route = createFileRoute("/dev/buttons")({
  head: () => ({
    meta: [
      { title: "Button visual fixture" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ButtonsVisualFixture,
});
