import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen, Terminal, Sparkles, Palette, FlaskConical, Play,
  Compass, Webhook, Code2, Package, Rocket, GitBranch, ExternalLink,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/developer-tools/")({
  staticData: { breadcrumb: "Dashboard" },
  head: () => ({
    meta: [
      { title: "Developer Dashboard" },
      { name: "description", content: `Overview of ${BRAND_NAME} plugin developer tools.` },
    ],
  }),
  component: DevDashboard,
});

const TILES = [
  { to: "/developer-tools/sdk", title: "SDK Documentation", desc: "Every builder, hook, and API surface — with examples.", icon: BookOpen, badge: "v1.4" },
  { to: "/developer-tools/cli", title: "CLI Tool", desc: "Scaffold, run, and publish plugins from your terminal.", icon: Terminal },
  { to: "/developer-tools/plugin-generator", title: "Plugin Generator", desc: "Answer a few questions, download a ready-to-hack repo.", icon: Sparkles },
  { to: "/developer-tools/theme-generator", title: "Theme Generator", desc: "Preview and export a fully-tokenised theme package.", icon: Palette },
  { to: "/developer-tools/sandbox", title: "Testing Sandbox", desc: "Isolated workspace with seeded data. Reset any time.", icon: FlaskConical, badge: "New" },
  { to: "/developer-tools/playground", title: "Playground", desc: "Live-edit and hot-reload against your sandbox.", icon: Play },
  { to: "/developer-tools/api-explorer", title: "API Explorer", desc: "Send authenticated requests to every REST endpoint.", icon: Compass },
  { to: "/developer-tools/webhook-tester", title: "Webhook Tester", desc: "Sign, replay, and inspect webhook deliveries.", icon: Webhook },
  { to: "/developer-tools/examples", title: "Code Examples", desc: "Copy-paste snippets for every extension point.", icon: Code2 },
  { to: "/developer-tools/templates", title: "Package Templates", desc: "Starter kits for plugins, themes, and integrations.", icon: Package },
  { to: "/developer-tools/publishing", title: "Publishing Guide", desc: "From dist/ to Marketplace — step by step.", icon: Rocket },
  { to: "/developer-tools/versioning", title: "Versioning Guide", desc: "Semver, changelogs, and safe upgrades.", icon: GitBranch },
];

function DevDashboard() {
  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Stat label="Active plugins" value="12" />
        <Stat label="Published today" value="3" />
        <Stat label="Sandbox uptime" value="99.9%" />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {TILES.map((t) => (
          <Link
            key={t.to}
            to={t.to as unknown as "/developer-tools"}
            className="group rounded-control border border-border bg-surface p-4 hover:border-border-strong hover:bg-muted transition-colors"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-accent/10 text-accent grid place-items-center shrink-0">
                <t.icon className="w-4 h-4" aria-hidden />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{t.title}</h3>
                  {t.badge && <Badge variant="secondary" className="text-[11px]">{t.badge}</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{t.desc}</p>
              </div>
              <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden />
            </div>
          </Link>
        ))}
      </section>

      <Card>
        <CardHeader><CardTitle className="text-base">Quick start</CardTitle></CardHeader>
        <CardContent>
          <ol className="text-sm space-y-1.5 list-decimal ml-5 text-muted-foreground">
            <li>Install the CLI: <code className="text-foreground">npm i -g @wacrm/cli</code></li>
            <li>Scaffold: <code className="text-foreground">wacrm init my-plugin</code></li>
            <li>Develop: <code className="text-foreground">wacrm dev</code> — hot-reloads against your sandbox.</li>
            <li>Publish: <code className="text-foreground">wacrm publish</code>.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control border border-border bg-surface p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold">{value}</div>
    </div>
  );
}
