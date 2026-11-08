import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Terminal as TerminalIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/developer-tools/cli")({
  staticData: { breadcrumb: "CLI Tool" },
  head: () => ({ meta: [{ title: `CLI Tool — ${BRAND_NAME} Developer Tools` }] }),
  component: CliPage,
});

const COMMANDS = [
  { cmd: "wacrm init <name>",       desc: "Scaffold a new plugin from a template." },
  { cmd: "wacrm dev",               desc: "Hot-reload against your sandbox workspace." },
  { cmd: "wacrm build",             desc: "Type-check and bundle to dist/." },
  { cmd: "wacrm test [--watch]",    desc: "Run unit and integration tests." },
  { cmd: "wacrm lint",              desc: `Lint manifest.json + source with the ${BRAND_NAME} ruleset.` },
  { cmd: "wacrm login",             desc: `Authenticate the CLI with your ${BRAND_NAME} account.` },
  { cmd: "wacrm link <workspace>",  desc: "Bind the CLI to a workspace and sandbox." },
  { cmd: "wacrm publish",           desc: "Publish a new version to the Marketplace." },
  { cmd: "wacrm versions",          desc: "List published versions for the current plugin." },
  { cmd: "wacrm rollback <ver>",    desc: "Roll a published plugin back to a prior version." },
  { cmd: "wacrm logs [--tail]",     desc: "Stream logs from an installed plugin." },
  { cmd: "wacrm invoke <api>",      desc: "Invoke a REST endpoint against the API base URL." },
  { cmd: "wacrm webhook replay",    desc: "Replay a captured webhook against your local plugin." },
  { cmd: "wacrm theme <slug>",      desc: "Scaffold or preview a theme package." },
];

function CliPage() {
  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-accent/10 text-accent grid place-items-center">
            <TerminalIcon className="w-4 h-4" aria-hidden />
          </div>
          <h2 className="font-display text-xl font-semibold">CLI Tool</h2>
          <Badge variant="secondary" className="text-[11px]">@wacrm/cli · v1.4.0</Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          One tool for the whole plugin lifecycle — scaffold, run, test, publish, and roll back.
        </p>
      </header>

      <Card>
        <CardHeader><CardTitle className="text-base">Install</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { label: "npm",  code: "npm i -g @wacrm/cli" },
            { label: "pnpm", code: "pnpm add -g @wacrm/cli" },
            { label: "bun",  code: "bun add -g @wacrm/cli" },
          ].map((i) => (
            <div key={i.label}>
              <div className="text-xs text-muted-foreground mb-1">{i.label}</div>
              <CopyRow code={i.code} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Commands</CardTitle></CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {COMMANDS.map((c) => (
              <li key={c.cmd} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <code className="font-mono text-xs text-accent">{c.cmd}</code>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.desc}</p>
                </div>
                <CopyBtn text={c.cmd} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Configuration</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">
            Store per-project configuration in <code>wacrm.config.json</code>:
          </p>
          <pre className="rounded-control border border-border bg-muted/40 p-3 font-mono text-xs overflow-x-auto">{`{
  "workspace": "acme",
  "sandbox": "sbx_dev",
  "entry": "src/index.ts",
  "output": "dist/",
  "envFile": ".env.local"
}`}</pre>
        </CardContent>
      </Card>
    </div>
  );
}

function CopyRow({ code }: { code: string }) {
  return (
    <div className="flex items-center gap-2 rounded-control border border-border bg-muted/40 px-2.5 py-1.5">
      <code className="font-mono text-xs flex-1 truncate">{code}</code>
      <CopyBtn text={code} />
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  return (
    <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(text); toast.success("Copied"); }} aria-label="Copy">
      <Copy className="w-3.5 h-3.5" />
    </Button>
  );
}
