import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Code2 } from "lucide-react";
import { toast } from "sonner";
import { CODE_EXAMPLES } from "@/lib/dev-tools/templates";

export const Route = createFileRoute("/_authenticated/developer-tools/examples")({
  staticData: { breadcrumb: "Code Examples" },
  head: () => ({ meta: [{ title: `Code Examples — ${BRAND_NAME} Developer Tools` }] }),
  component: ExamplesPage,
});

function ExamplesPage() {
  return (
    <div className="space-y-4">
      <header>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-accent/10 text-accent grid place-items-center">
            <Code2 className="w-4 h-4" aria-hidden />
          </div>
          <h2 className="font-display text-xl font-semibold">Code Examples</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">Copy-paste snippets for every extension point.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {CODE_EXAMPLES.map((ex) => (
          <Card key={ex.title}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-2">
              <div className="min-w-0">
                <CardTitle className="text-sm">{ex.title}</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">{ex.description}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(ex.code); toast.success("Copied"); }}>
                <Copy className="w-3.5 h-3.5" />
              </Button>
            </CardHeader>
            <CardContent>
              <pre className="rounded-control border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed overflow-x-auto">{ex.code}</pre>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
