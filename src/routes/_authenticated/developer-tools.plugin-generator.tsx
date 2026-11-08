import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Download, Sparkles, Copy } from "lucide-react";
import { toast } from "sonner";
import { createTemplates } from "@/lib/dev-tools/templates";
import { useBrandName } from "@/hooks/use-brand-name";

export const Route = createFileRoute("/_authenticated/developer-tools/plugin-generator")({
  staticData: { breadcrumb: "Plugin Generator" },
  head: () => ({ meta: [{ title: `Plugin Generator — ${BRAND_NAME} Developer Tools` }] }),
  component: PluginGenerator,
});

const EXT_POINTS = [
  "dashboard-widget", "sidebar-menu", "workflow-node", "ai-tool",
  "api-endpoint", "background-job", "report", "integration",
];
const PERMISSIONS = [
  "contacts:read", "contacts:write", "messages:read", "messages:write",
  "deals:read", "deals:write", "campaigns:read", "campaigns:write",
  "ai:invoke", "storage:kv",
];

function PluginGenerator() {
  const brandName = useBrandName();
  const templates = useMemo(() => createTemplates(brandName), [brandName]);
  const [slug, setSlug] = useState("my-plugin");
  const [name, setName] = useState("My Plugin");
  const [desc, setDesc] = useState(() => `A ${brandName} plugin`);
  const [author, setAuthor] = useState("");
  const [templateId, setTemplateId] = useState<string>(() => templates[0].id);
  const [points, setPoints] = useState<string[]>(["dashboard-widget", "sidebar-menu"]);
  const [perms, setPerms] = useState<string[]>(["contacts:read"]);

  const manifest = useMemo(() => {
    return JSON.stringify({
      slug, name, version: "1.0.0", description: desc, author: author || "Your Name",
      license: "MIT", entry: "dist/index.js",
      permissions: perms, extensionPoints: points,
      engines: { wacrm: ">=1.0.0" },
    }, null, 2);
  }, [slug, name, desc, author, points, perms]);

  const entry = useMemo(() => {
    const builders = points.map((p) => {
      if (p === "sidebar-menu") return `    ctx.builders.menu.add({ id: "${slug}-menu", label: "${name}", icon: "sparkles", to: "/plugins/${slug}" });`;
      if (p === "dashboard-widget") return `    ctx.builders.widget.add({ id: "${slug}-widget", region: "dashboard.top", component: () => import("./widgets/Hello") });`;
      if (p === "workflow-node") return `    ctx.builders.workflowNode.add({ id: "${slug}.node", label: "${name} node", inputs: {}, run: async () => ({ ok: true }) });`;
      if (p === "ai-tool") return `    ctx.builders.aiTool.add({ id: "${slug}.tool", description: "Describe your tool", inputSchema: z.object({}), execute: async () => ({}) });`;
      if (p === "api-endpoint") return `    ctx.builders.api.add({ method: "GET", path: "/hello", handler: async () => Response.json({ ok: true }) });`;
      if (p === "background-job") return `    ctx.builders.job.add({ id: "${slug}.hourly", cron: "0 * * * *", handler: async () => {} });`;
      if (p === "report") return `    ctx.builders.report.add({ id: "${slug}.report", title: "${name} report", query: "select 1", viz: "table" });`;
      if (p === "integration") return `    ctx.builders.integration.add({ id: "${slug}.integration", auth: { type: "apiKey" }, onEvent: async () => {} });`;
      return "";
    }).filter(Boolean).join("\n");
    const usesZod = points.includes("ai-tool");
    return `import { definePlugin } from "@wacrm/sdk";
${usesZod ? `import { z } from "zod";\n` : ""}
export default definePlugin({
  slug: "${slug}",
  onActivate(ctx) {
    ctx.logger.info("${name} activated");
${builders}
  },
  onDeactivate(ctx) {
    ctx.logger.info("${name} deactivated");
  },
});
`;
  }, [slug, name, points]);

  function togglePoint(p: string) {
    setPoints((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  }
  function togglePerm(p: string) {
    setPerms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  }

  function download() {
    const files: Record<string, string> = {
      "manifest.json": manifest,
      "src/index.ts": entry,
      "README.md": `# ${name}\n\n${desc}\n`,
      "package.json": JSON.stringify({
        name: `@plugins/${slug}`, version: "1.0.0", private: true,
        scripts: { dev: "wacrm dev", build: "wacrm build", publish: "wacrm publish" },
      }, null, 2),
    };
    const blob = new Blob([Object.entries(files).map(([p, c]) => `// ==== ${p} ====\n${c}\n`).join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${slug}.wacrm-plugin.txt`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Plugin package downloaded");
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-accent/10 text-accent grid place-items-center">
            <Sparkles className="w-4 h-4" aria-hidden />
          </div>
          <h2 className="font-display text-xl font-semibold">Plugin Generator</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Configure your plugin's manifest, choose extension points, and download a ready-to-hack starter.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Metadata</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Field label="Slug"><Input value={slug} onChange={(e) => setSlug(e.target.value.replace(/[^a-z0-9-]/g, "-"))} /></Field>
            <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Description"><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} /></Field>
            <Field label="Author"><Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Your Name" /></Field>
            <div>
              <Label className="text-xs">Starter template</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {templates.filter((t) => t.category !== "theme").map((t) => (
                  <button key={t.id}
                    type="button"
                    onClick={() => setTemplateId(t.id)}
                    aria-pressed={templateId === t.id}
                    className={`text-[11px] px-2 py-1 rounded-control border transition-colors ${templateId === t.id ? "bg-accent text-accent-foreground border-accent" : "border-border hover:bg-muted"}`}>
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Capabilities</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Extension points</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {EXT_POINTS.map((p) => {
                  const on = points.includes(p);
                  return (
                    <button key={p} type="button" onClick={() => togglePoint(p)} aria-pressed={on}
                      className={`text-[11px] px-2 py-1 rounded-control border transition-colors ${on ? "bg-accent text-accent-foreground border-accent" : "border-border hover:bg-muted"}`}>
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label className="text-xs">Permissions</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {PERMISSIONS.map((p) => {
                  const on = perms.includes(p);
                  return (
                    <button key={p} type="button" onClick={() => togglePerm(p)} aria-pressed={on}
                      className={`text-[11px] px-2 py-1 rounded-control border transition-colors ${on ? "bg-accent text-accent-foreground border-accent" : "border-border hover:bg-muted"}`}>
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={download}><Download className="w-3.5 h-3.5 mr-1.5" />Download package</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PreviewCard title="manifest.json" body={manifest} />
        <PreviewCard title="src/index.ts" body={entry} />
      </div>

      <div className="text-xs text-muted-foreground">
        <Badge variant="secondary" className="mr-2 text-[11px]">Tip</Badge>
        Run <code>wacrm init {slug}</code> in your terminal to scaffold this configuration on disk.
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function PreviewCard({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xs font-mono">{title}</CardTitle>
        <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(body); toast.success("Copied"); }}>
          <Copy className="w-3.5 h-3.5" />
        </Button>
      </CardHeader>
      <CardContent>
        <pre className="rounded-control border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-80">{body}</pre>
      </CardContent>
    </Card>
  );
}
