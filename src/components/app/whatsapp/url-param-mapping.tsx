/**
 * Shows how each part of a URL-button link maps to a template variable.
 *
 * Meta only substitutes the trailing `{{n}}` of a URL button, but that suffix
 * can live in a path segment, a query parameter or a fragment. Admins need to
 * see *which* key receives the value before they submit, so this renders one
 * row per param: key → {{n}} (or the static value it always sends).
 */

import { Link2, Variable } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  analyzeTemplateButtonUrl,
  describeTemplateUrlParam,
  type TemplateUrlParamLocation,
} from "@/lib/messaging/template-url-validation";

const LOCATION_LABEL: Record<TemplateUrlParamLocation, string> = {
  path: "Path",
  query: "Query",
  fragment: "Fragment",
};

export function UrlParamMapping({ url }: { url: string | undefined | null }) {
  const analysis = analyzeTemplateButtonUrl(url);
  if (!analysis.url || analysis.params.length === 0) return null;

  return (
    <div className="rounded-control border border-border bg-muted/30 p-2 space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        <Link2 className="h-3 w-3" />
        Parameter mapping
      </div>
      <ul className="space-y-1">
        {analysis.params.map((param, index) => (
          <li
            key={`${param.location}-${param.key}-${index}`}
            className="flex flex-wrap items-center gap-1.5 text-xs"
            title={describeTemplateUrlParam(param)}
          >
            <Badge variant="outline" className="h-5 px-1.5 text-[11px] font-normal">
              {LOCATION_LABEL[param.location]}
            </Badge>
            <code className="rounded bg-background px-1 py-0.5 font-mono text-[11px]">{param.key}</code>
            <span className="text-muted-foreground">→</span>
            {param.variable ? (
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-primary">
                <Variable className="h-3 w-3" />
                {`{{${param.variable}}}`}
              </span>
            ) : (
              <span className="font-mono text-[11px] text-muted-foreground">
                {param.value === "" ? "(empty)" : param.value}
              </span>
            )}
            {param.encoded && (
              <span className="text-[11px] text-muted-foreground">(decoded from %7B%7B%7D%7D)</span>
            )}
          </li>
        ))}
      </ul>
      {analysis.variable ? (
        <p className="text-[11px] text-muted-foreground">
          Meta fills <code className="font-mono">{`{{${analysis.variable}}}`}</code> into{" "}
          <code className="font-mono">{analysis.variableKey}</code> at send time — everything else is sent as
          written.
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Static link — no variable. Add one at the end, e.g. <code className="font-mono">?order_id={"{{1}}"}</code>.
        </p>
      )}
    </div>
  );
}
