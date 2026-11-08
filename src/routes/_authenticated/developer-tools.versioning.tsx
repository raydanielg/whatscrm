import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GitBranch, AlertTriangle, Info, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/developer-tools/versioning")({
  staticData: { breadcrumb: "Versioning Guide" },
  head: () => ({ meta: [{ title: `Versioning Guide — ${BRAND_NAME} Developer Tools` }] }),
  component: VersioningGuide,
});

const BUMPS = [
  { label: "MAJOR", desc: "Breaking API or manifest changes. Existing installs need explicit upgrade.", color: "bg-red-500/10 text-red-600" },
  { label: "MINOR", desc: "New capabilities, backwards-compatible. Auto-upgrade eligible.", color: "bg-blue-500/10 text-blue-600" },
  { label: "PATCH", desc: "Bug fixes and internal improvements. Ships silently to all installs.", color: "bg-emerald-500/10 text-emerald-600" },
];

function VersioningGuide() {
  return (
    <div className="space-y-4">
      <header>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-accent/10 text-accent grid place-items-center">
            <GitBranch className="w-4 h-4" aria-hidden />
          </div>
          <h2 className="font-display text-xl font-semibold">Versioning Guide</h2>
          <Badge variant="secondary" className="text-[11px]">semver 2.0</Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Ship confidently: predictable versions, safe upgrades, one-click rollback.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {BUMPS.map((b) => (
          <Card key={b.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm">{b.label}</CardTitle>
              <Badge className={`${b.color} hover:${b.color} font-mono text-[11px]`}>1.X.Y</Badge>
            </CardHeader>
            <CardContent><p className="text-xs text-muted-foreground">{b.desc}</p></CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Breaking changes</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Line icon={AlertTriangle} tone="warn" text="Removed permission, extension point, or API — bump MAJOR." />
          <Line icon={AlertTriangle} tone="warn" text="Renamed a manifest field or storage key — bump MAJOR and ship a migration." />
          <Line icon={Info} tone="info" text="Added a new optional capability — bump MINOR." />
          <Line icon={CheckCircle2} tone="ok" text="Internal refactor, dependency bump, log fix — bump PATCH." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Changelog format</CardTitle></CardHeader>
        <CardContent>
          <pre className="rounded-control border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed overflow-x-auto">{`# Changelog

## [1.4.0] — 2026-07-15
### Added
- Workflow node "Send Slack message".
### Changed
- Faster inbox widget render (<200ms).
### Fixed
- Correct locale for date formatter.

## [1.3.2] — 2026-06-30
### Fixed
- Regression in webhook signature verification.
`}</pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Compatibility ranges</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1.5">
          <p><code>engines.wacrm: "^1.4.0"</code> — accepts 1.4.x through &lt; 2.0.0.</p>
          <p><code>engines.wacrm: "~1.4.0"</code> — accepts 1.4.x only.</p>
          <p><code>engines.wacrm: "&gt;=1.4.0 &lt;1.6.0"</code> — explicit window.</p>
          <p>The Marketplace refuses installs that do not satisfy the range.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Rollback</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Every published version stores a signed bundle. Roll back with:</p>
          <pre className="rounded-control border border-border bg-muted/40 p-3 font-mono text-xs">wacrm rollback 1.3.2</pre>
          <p>Or use one-click rollback in <em>Settings → Plugin Management</em>.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Line({ icon: Icon, tone, text }: { icon: typeof Info; tone: "info" | "warn" | "ok"; text: string }) {
  const color = tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-emerald-600" : "text-blue-600";
  return (
    <div className="flex items-start gap-2">
      <Icon className={`w-4 h-4 mt-0.5 ${color}`} aria-hidden />
      <p>{text}</p>
    </div>
  );
}
