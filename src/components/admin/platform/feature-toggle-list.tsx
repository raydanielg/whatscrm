import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { FEATURE_SUB_FEATURES } from "@/lib/admin/platform-features";

type FeatureFlag = { k: string; label: string; description: string; defaultOn: boolean };

export function FeatureToggleList({
  flags,
  values,
  onChange,
}: {
  flags: FeatureFlag[];
  values: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  return (
    <Accordion
      type="single"
      collapsible
      className="flex flex-col gap-2 motion-reduce:[&_[data-state]]:animate-none"
    >
      {flags.map((flag) => {
        const subs = FEATURE_SUB_FEATURES[flag.k] ?? [];
        const on = (values[flag.k] as boolean | undefined) ?? flag.defaultOn;
        const summary = (
          <span className={`flex min-w-0 flex-col gap-1 text-left ${subs.length ? "pr-12" : ""}`}>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-medium">{flag.label}</span>
              {subs.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground">
                  {subs.length} sub-features
                </span>
              )}
            </span>
            <span className="text-xs font-normal text-muted-foreground">{flag.description}</span>
          </span>
        );
        const toggle = (
          <Switch
            className={subs.length ? "absolute right-8 top-1/2 -translate-y-1/2" : undefined}
            aria-label={`Enable ${flag.label}`}
            checked={on}
            onCheckedChange={(enabled) => onChange({ [flag.k]: enabled })}
          />
        );

        if (subs.length === 0) {
          return (
            <div
              key={flag.k}
              className="flex items-center justify-between gap-4 rounded-control border p-3"
            >
              {summary}
              {toggle}
            </div>
          );
        }

        return (
          <AccordionItem key={flag.k} value={flag.k} className="rounded-control border px-3">
            <div className="relative flex items-center justify-between gap-4 [&>h3]:min-w-0 [&>h3]:flex-1">
              <AccordionTrigger className="min-w-0 gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {summary}
              </AccordionTrigger>
              {toggle}
            </div>
            <AccordionContent className="pb-3">
              <div className="grid gap-2 border-t pt-3 sm:grid-cols-2">
                {subs.map((sub) => (
                  <label
                    key={sub.k}
                    className="flex items-center justify-between gap-3 rounded-control border bg-muted/30 px-3 py-2 has-[:disabled]:opacity-50"
                  >
                    <span className="text-xs">{sub.label}</span>
                    <Switch
                      aria-label={`Enable ${sub.label}`}
                      checked={
                        on && ((values[`${flag.k}.${sub.k}`] as boolean | undefined) ?? true)
                      }
                      disabled={!on}
                      onCheckedChange={(enabled) => onChange({ [`${flag.k}.${sub.k}`]: enabled })}
                    />
                  </label>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
