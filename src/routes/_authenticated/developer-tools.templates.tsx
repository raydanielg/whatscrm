import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Download, Package } from "lucide-react";
import { toast } from "sonner";
import { createTemplates } from "@/lib/dev-tools/templates";
import { useBrandName } from "@/hooks/use-brand-name";

export const Route = createFileRoute("/_authenticated/developer-tools/templates")({
  staticData: { breadcrumb: "Package Templates" },
  head: () => ({ meta: [{ title: `Package Templates — ${BRAND_NAME} Developer Tools` }] }),
  component: TemplatesPage,
});

const CATEGORY_LABEL: Record<string, string> = {
  plugin: "Plugin", theme: "Theme", widget: "Widget", workflow: "Workflow",
  "ai-tool": "AI tool", integration: "Integration",
};

function TemplatesPage() {
  const brandName = useBrandName();
  const templates = useMemo(() => createTemplates(brandName), [brandName]);
  const [selectedId, setSelectedId] = useState(() => templates[0].id);
  const selected = templates.find((t) => t.id === selectedId) ?? templates[0];
  const [openFile, setOpenFile] = useState(selected.files[0].path);
  const file = selected.files.find((f) => f.path === openFile) ?? selected.files[0];

  function download() {
    const bundle = selected.files.map((f) => `// ==== ${f.path} ====\n${f.contents}\n`).join("\n");
    const blob = new Blob([bundle], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${selected.id}.wacrm-template.txt`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Template downloaded");
  }

  return (
    <div className="space-y-4">
      <header>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-accent/10 text-accent grid place-items-center">
            <Package className="w-4 h-4" aria-hidden />
          </div>
          <h2 className="font-display text-xl font-semibold">Package Templates</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">Starter kits for common plugin patterns. Skip boilerplate and ship faster.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => { setSelectedId(t.id); setOpenFile(t.files[0].path); }}
            aria-pressed={t.id === selectedId}
            className={`text-left rounded-control border p-4 transition-colors ${t.id === selectedId ? "border-accent bg-accent/5" : "border-border bg-surface hover:border-border-strong"}`}
          >
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium">{t.name}</h3>
              <Badge variant="secondary" className="text-[11px]">{CATEGORY_LABEL[t.category] ?? t.category}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{t.description}</p>
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">{selected.name}</CardTitle>
            <p className="text-xs text-muted-foreground">{selected.files.length} files</p>
          </div>
          <Button size="sm" onClick={download}><Download className="w-3.5 h-3.5 mr-1.5" />Download</Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="grid grid-cols-1 md:grid-cols-[200px_1fr]">
            <ul className="border-r border-border">
              {selected.files.map((f) => (
                <li key={f.path}>
                  <button
                    onClick={() => setOpenFile(f.path)}
                    className={`w-full text-left px-3 py-2 font-mono text-xs border-l-2 ${f.path === openFile ? "bg-accent/5 border-accent text-accent" : "border-transparent hover:bg-muted"}`}
                  >
                    {f.path}
                  </button>
                </li>
              ))}
            </ul>
            <div className="p-3">
              <div className="flex justify-end mb-2">
                <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(file.contents); toast.success("Copied"); }}>
                  <Copy className="w-3.5 h-3.5 mr-1.5" />Copy file
                </Button>
              </div>
              <pre className="rounded-control border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed max-h-[540px] overflow-auto">{file.contents}</pre>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
