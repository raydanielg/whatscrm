/**
 * Branding token verification page.
 *
 * Renders every branded design token with a live swatch and computed value,
 * then probes a list of app routes in hidden same-origin iframes and compares
 * their computed token values against this page. Any drift is reported per
 * route and per token, so a branding change can be confirmed to apply
 * consistently everywhere.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, RefreshCcw, Loader2 } from "lucide-react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePlatformBranding } from "@/hooks/use-platform-branding";
import { useTenantAccent } from "@/lib/themes/tenant-accent";

export const Route = createFileRoute("/_authenticated/branding-check")({
  staticData: { breadcrumb: "Branding Check" },
  head: () => ({
    meta: [
      { title: "Branding Token Check" },
      { name: "description", content: "Verify that every branding token resolves consistently across all application routes." },
      { property: "og:title", content: "Branding Token Check" },
      { property: "og:description", content: "Verify that every branding token resolves consistently across all application routes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BrandingCheckPage,
});

/** Tokens that must be identical on every route. */
const TOKENS = [
  { name: "--primary", label: "Primary" },
  { name: "--primary-foreground", label: "Primary text" },
  { name: "--secondary", label: "Secondary" },
  { name: "--secondary-foreground", label: "Secondary text" },
  { name: "--accent", label: "Accent" },
  { name: "--accent-foreground", label: "Accent text" },
  { name: "--background", label: "Background" },
  { name: "--foreground", label: "Text" },
  { name: "--muted", label: "Muted" },
  { name: "--muted-foreground", label: "Muted text" },
  { name: "--border", label: "Border" },
  { name: "--ring", label: "Ring" },
] as const;

/** Representative routes covering the main layouts of the app. */
const ROUTES = [
  "/dashboard",
  "/inbox",
  "/contacts",
  "/automations",
  "/analytics",
  "/settings/branding",
  "/admin/settings",
] as const;

type TokenMap = Record<string, string>;
type RouteResult = {
  route: string;
  status: "pending" | "ok" | "drift" | "error";
  diffs: { token: string; expected: string; actual: string }[];
  error?: string;
};

function readTokens(doc: Document): TokenMap {
  const styles = getComputedStyle(doc.documentElement);
  const out: TokenMap = {};
  for (const t of TOKENS) out[t.name] = styles.getPropertyValue(t.name).trim();
  return out;
}

function swatch(value: string) {
  // Tokens are raw colour values (hex or HSL triplets) used inside hsl().
  return value.startsWith("#") || value.includes("(") ? value : `hsl(${value})`;
}

function BrandingCheckPage() {
  const branding = usePlatformBranding();
  const { accent, savedAccent, isPreviewing } = useTenantAccent();
  const [local, setLocal] = useState<TokenMap>({});
  const [results, setResults] = useState<RouteResult[]>([]);
  const [running, setRunning] = useState(false);

  const refreshLocal = useCallback(() => {
    if (typeof document !== "undefined") setLocal(readTokens(document));
  }, []);

  useEffect(() => {
    refreshLocal();
  }, [refreshLocal, accent, branding.primaryColor, branding.accentColor]);

  const probe = useCallback((route: string, expected: TokenMap): Promise<RouteResult> => {
    return new Promise((resolve) => {
      const frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.style.cssText = "position:fixed;width:1024px;height:768px;left:-10000px;top:0;border:0;";
      frame.src = route;

      const finish = (result: RouteResult) => {
        clearTimeout(timer);
        frame.remove();
        resolve(result);
      };

      const timer = window.setTimeout(
        () => finish({ route, status: "error", diffs: [], error: "Timed out after 15s" }),
        15_000,
      );

      frame.onload = () => {
        // Give the accent/branding providers a frame to apply tokens.
        window.setTimeout(() => {
          try {
            const doc = frame.contentDocument;
            if (!doc) return finish({ route, status: "error", diffs: [], error: "No document" });
            const actual = readTokens(doc);
            const diffs = TOKENS.filter((t) => actual[t.name] !== expected[t.name]).map((t) => ({
              token: t.name,
              expected: expected[t.name] ?? "",
              actual: actual[t.name] ?? "",
            }));
            finish({ route, status: diffs.length ? "drift" : "ok", diffs });
          } catch (e) {
            finish({ route, status: "error", diffs: [], error: (e as Error).message });
          }
        }, 1200);
      };

      frame.onerror = () => finish({ route, status: "error", diffs: [], error: "Failed to load" });
      document.body.appendChild(frame);
    });
  }, []);

  const runCheck = useCallback(async () => {
    setRunning(true);
    const expected = readTokens(document);
    setLocal(expected);
    setResults(ROUTES.map((route) => ({ route, status: "pending", diffs: [] })));
    for (const route of ROUTES) {
      const result = await probe(route, expected);
      setResults((prev) => prev.map((r) => (r.route === route ? result : r)));
    }
    setRunning(false);
  }, [probe]);

  const checked = results.filter((r) => r.status !== "pending");
  const failing = checked.filter((r) => r.status !== "ok");
  const allOk = checked.length === ROUTES.length && failing.length === 0;

  return (
    <>
      <AppTopbar
        title="Branding check"
        subtitle="Verify every branding token resolves identically on every route"
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Live token values</CardTitle>
              <CardDescription>
                Resolved on this page from platform branding, workspace white-label and the active accent.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={refreshLocal} className="h-8 px-2 text-xs">
              <RefreshCcw className="h-3.5 w-3.5 " /> Refresh
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">Platform primary: {branding.primaryColor ?? "—"}</Badge>
              <Badge variant="secondary">Platform accent: {branding.accentColor ?? "—"}</Badge>
              <Badge variant="secondary">Saved accent: {savedAccent}</Badge>
              {isPreviewing ? <Badge variant="outline">Previewing {accent}</Badge> : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TOKENS.map((t) => (
                <div key={t.name} className="flex items-center gap-3 rounded-control border p-3 min-w-0">
                  <span
                    className="h-8 w-8 shrink-0 rounded-control border"
                    style={{ background: swatch(local[t.name] ?? "") }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{t.label}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {t.name}: {local[t.name] || "unset"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Cross-route consistency</CardTitle>
              <CardDescription>
                Loads each route in a hidden frame and compares its computed tokens with this page.
              </CardDescription>
            </div>
            <Button size="sm" onClick={runCheck} disabled={running} className="h-8 px-3 text-xs">
              {running ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
              {running ? "Checking" : "Run check"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {results.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Run the check to verify {ROUTES.length} routes.
              </p>
            ) : (
              <>
                {allOk ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    All tokens match on every checked route.
                  </div>
                ) : null}
                <ul className="space-y-2">
                  {results.map((r) => (
                    <li key={r.route} className="rounded-control border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3 min-w-0">
                        <span className="text-sm font-medium truncate">{r.route}</span>
                        {r.status === "pending" ? (
                          <Badge variant="outline" className="shrink-0">Pending</Badge>
                        ) : r.status === "ok" ? (
                          <Badge className="shrink-0 gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Match
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="shrink-0 gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {r.status === "error" ? "Error" : `${r.diffs.length} drift`}
                          </Badge>
                        )}
                      </div>
                      {r.error ? (
                        <p className="text-xs text-muted-foreground">{r.error}</p>
                      ) : null}
                      {r.diffs.length ? (
                        <ul className="space-y-1 text-xs text-muted-foreground">
                          {r.diffs.map((d) => (
                            <li key={d.token} className="break-words">
                              <code>{d.token}</code>: expected <code>{d.expected || "unset"}</code>, got{" "}
                              <code>{d.actual || "unset"}</code>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
