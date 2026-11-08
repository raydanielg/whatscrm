import { Brand } from "@/components/brand";
import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Rocket, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/developer-tools/publishing")({
  staticData: { breadcrumb: "Publishing Guide" },
  head: () => ({ meta: [{ title: `Publishing Guide — ${BRAND_NAME} Developer Tools` }] }),
  component: PublishingGuide,
});

const STEPS: { title: string; body: string; code?: string }[] = [
  { title: "1. Lint the manifest", body: "Ensure required fields (slug, name, version, permissions) are correct.", code: "wacrm lint" },
  { title: "2. Bundle a production build", body: "Produce a tree-shaken, minified dist/ folder.", code: "wacrm build --minify" },
  { title: "3. Run the review suite", body: "Automated checks for security, permissions, and compatibility.", code: "wacrm review" },
  { title: "4. Bump the version", body: "Follow semver. Breaking → major, feature → minor, fix → patch.", code: "wacrm version minor" },
  { title: "5. Publish", body: "Upload to the Marketplace. The first release is draft until you promote it.", code: "wacrm publish" },
  { title: "6. Promote", body: "Move the release from draft to public, or invite beta testers.", code: "wacrm promote --stable" },
];

const CHECKLIST = [
  "Manifest slug is unique and permanent",
  "Version follows semver",
  "Requested permissions match code usage",
  "Screenshots (1280×800) attached to listing",
  "README covers install, config, and troubleshooting",
  "License field present (MIT/Apache-2.0/Proprietary)",
  "Icon uploaded (SVG or PNG 512×512)",
  "Changelog entry for this version",
  "Sandbox smoke test passes",
  "No secrets committed to the repo",
];

function PublishingGuide() {
  return (
    <div className="space-y-4">
      <header>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-accent/10 text-accent grid place-items-center">
            <Rocket className="w-4 h-4" aria-hidden />
          </div>
          <h2 className="font-display text-xl font-semibold">Publishing Guide</h2>
          <Badge variant="secondary" className="text-[11px]">6 steps</Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          From <code>dist/</code> to the Marketplace — with review, promote, and rollback covered.
        </p>
      </header>

      <p className="text-sm text-muted-foreground">
        In My Plugins, save the listing first, then use Add code release to enter the HTTPS URL of your built JavaScript bundle. The bundle must export <code>activate(api)</code> through CommonJS <code>module.exports</code>. A reviewer must approve the first release before it appears in the Marketplace.
      </p>

      <pre className="rounded-control border border-border bg-muted/40 p-3 font-mono text-xs overflow-x-auto">{`module.exports = {
  activate(api) {
    api.log('info', 'Plugin activated');
    api.hooks.on('contact.created', (contact) => api.log('info', contact.id));
  },
};`}</pre>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {STEPS.map((s) => (
          <Card key={s.title}>
            <CardHeader><CardTitle className="text-sm">{s.title}</CardTitle></CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{s.body}</p>
              {s.code && (
                <pre className="mt-2 rounded-control border border-border bg-muted/40 p-2.5 font-mono text-xs">{s.code}</pre>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Pre-flight checklist</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-1.5">
            {CHECKLIST.map((item) => (
              <li key={item} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Review criteria</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p><strong className="text-foreground">Security:</strong> No hardcoded credentials, respects declared permissions, all outbound URLs allowlisted.</p>
          <p><strong className="text-foreground">Performance:</strong> First render under 300 ms, no unnecessary polling, memory ≤ 50 MB.</p>
          <p><strong className="text-foreground">Quality:</strong> Handles error states, respects accessibility, follows <Brand /> design tokens.</p>
          <p><strong className="text-foreground">Compatibility:</strong> Declares the correct <code>engines.wacrm</code> range.</p>
        </CardContent>
      </Card>
    </div>
  );
}
