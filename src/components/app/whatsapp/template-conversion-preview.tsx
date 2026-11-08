/**
 * Detailed preview of a named → numbered placeholder conversion.
 *
 * Shows the complete mapping (grouped per component, in final numbered order)
 * and a before/after view of every field that changes, so the operator can
 * confirm the result before the template is saved.
 */

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  buildConversionSections,
  type ConvertibleDraft,
  type TemplateConversionPlan,
} from "@/lib/messaging/template-import-convert";


type Props = {
  draft: ConvertibleDraft;
  plan: TemplateConversionPlan;
};

/** Highlights {{...}} tokens inside a preview string. */
function TokenText({ text, tone }: { text: string; tone: "before" | "after" }) {
  const parts = text.split(/(\{\{[^{}]*\}\})/g);
  return (
    <p className="[overflow-wrap:anywhere] whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
      {parts.map((part, i) =>
        /^\{\{[^{}]*\}\}$/.test(part) ? (
          <span
            key={i}
            className={cn(
              "rounded px-1 py-0.5",
              tone === "after"
                ? "bg-primary/15 text-primary"
                : "bg-muted-foreground/15 text-muted-foreground",
            )}
          >
            {part}
          </span>
        ) : (
          <span key={i} className={tone === "before" ? "text-muted-foreground" : undefined}>
            {part}
          </span>
        ),
      )}
    </p>
  );
}

export function TemplateConversionPreview({ draft, plan }: Props) {
  const [open, setOpen] = useState(false);
  const sections = useMemo(() => buildConversionSections(draft), [draft]);

  if (!plan.changed) return null;

  const changedCount = sections.filter((s) => s.changed).length;

  return (
    <Collapsible open={open} onOpenChange={setOpen} data-testid="wa-template-convert-preview">
      <CollapsibleTrigger asChild>
        <Button type="button" size="sm" variant="ghost" className="h-8 gap-1 px-2 text-xs">
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          {open ? "Hide" : "Review"} full mapping ({plan.renames.length} variable
          {plan.renames.length > 1 ? "s" : ""} across {changedCount} of {sections.length} section
          {sections.length > 1 ? "s" : ""})
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent className="space-y-3 pt-3">
        <p className="text-muted-foreground">
          WhatsApp numbers variables separately for each location, so Header, Body, Footer and every URL button each
          restart at {"{{1}}"}.
        </p>

        {sections.map((section) => (
          <div
            key={section.label}
            data-testid={`wa-convert-section-${section.scope}${section.buttonIndex ?? ""}`}
            className="rounded-control border border-border bg-background p-2 space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium">{section.label}</p>
              <Badge variant={section.changed ? "secondary" : "outline"} className="text-[11px]">
                {section.changed
                  ? `${section.tokens.filter((t) => !t.unchanged).length} renumbered`
                  : "already numbered"}
              </Badge>
            </div>

            <div className="flex flex-wrap gap-1">
              {section.tokens.map((token) => (
                <Badge
                  key={`${section.label}-${token.to}`}
                  variant={token.unchanged ? "outline" : "secondary"}
                  className="font-mono text-[11px]"
                >
                  {token.unchanged ? `{{${token.to}}}` : `{{${token.from}}} → {{${token.to}}}`}
                </Badge>
              ))}
            </div>

            {section.changed && (
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-[11px] uppercase text-muted-foreground">Current</p>
                  <TokenText text={section.current} tone="before" />
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] uppercase text-muted-foreground">After conversion</p>
                  <TokenText text={section.next} tone="after" />
                </div>
              </div>
            )}
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

