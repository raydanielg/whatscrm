import { createFileRoute, Link, stripSearchParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ALL_PROVIDERS } from "@/lib/integrations/providers";
import { ProviderAvatar } from "@/components/integrations/provider-avatar";
import { useInstalledIntegrations } from "@/lib/integrations/installed-store";
import {
  CheckCircle2,
  ExternalLink,
  Plug,
  Search,
  Sparkles,
  ShieldCheck,
  Info,
  X,
} from "lucide-react";
import { ProviderDetailsSheet } from "@/components/integrations/provider-details-sheet";
import type { IntegrationProvider } from "@/lib/integrations/core";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  cat: fallback(z.string(), "All").default("All"),
  auth: fallback(z.string(), "all").default("all"),
  state: fallback(z.string(), "all").default("all"),
  sort: fallback(z.string(), "featured").default("featured"),
});

const FILTER_DEFAULTS = { q: "", cat: "All", auth: "all", state: "all", sort: "featured" };

export const Route = createFileRoute("/_authenticated/integrations/marketplace/")({
  staticData: { breadcrumb: "Marketplace" },
  validateSearch: zodValidator(searchSchema),
  component: MarketplacePage,
  head: () => ({
    meta: [
      { title: "Integrations Marketplace" },
      {
        name: "description",
        content:
          "Search and filter providers by name, category, authorization type, and install state.",
      },
    ],
  }),
});

type SortKey = "featured" | "name" | "newest";
const SORTS: SortKey[] = ["featured", "name", "newest"];
const AUTH_TYPES = ["oauth2", "api_key", "webhook_url", "signed_request", "none"] as const;
const STATES = ["all", "installed", "available"] as const;

const authLabel = (a: string) => a.replace("_", " ");

function MarketplacePage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const setSearch = (patch: Partial<typeof search>) =>
    navigate({ to: ".", search: { ...search, ...patch }, replace: true });

  const q = search.q.slice(0, 100);
  const sort: SortKey = SORTS.includes(search.sort as SortKey)
    ? (search.sort as SortKey)
    : "featured";
  const auth = search.auth;
  const state = STATES.includes(search.state as (typeof STATES)[number]) ? search.state : "all";

  const [details, setDetails] = useState<IntegrationProvider | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const openDetails = (p: IntegrationProvider) => {
    setDetails(p);
    setDetailsOpen(true);
  };
  const { items: installedList } = useInstalledIntegrations();
  const installedIds = useMemo(
    () => new Set(installedList.map((i) => i.providerId)),
    [installedList],
  );

  // Categories are derived from the manifests so a new provider category never
  // becomes unreachable through the filter strip.
  const CATEGORIES = useMemo(
    () => ["All", ...Array.from(new Set(ALL_PROVIDERS.map((p) => p.category))).sort()],
    [],
  );
  const cat = CATEGORIES.includes(search.cat) ? search.cat : "All";

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: ALL_PROVIDERS.length };
    for (const p of ALL_PROVIDERS) counts[p.category] = (counts[p.category] ?? 0) + 1;
    return counts;
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = ALL_PROVIDERS.filter((p) => {
      if (cat !== "All" && p.category !== cat) return false;
      if (auth !== "all" && p.authType !== auth) return false;
      if (state === "installed" && !installedIds.has(p.id)) return false;
      if (state === "available" && installedIds.has(p.id)) return false;
      if (!query) return true;
      return [p.name, p.tagline, p.vendor, p.category, ...p.capabilities.map((c) => c.label)].some(
        (s) => s.toLowerCase().includes(query),
      );
    });
    if (sort === "name") return [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "newest") return [...list].sort((a, b) => b.version.localeCompare(a.version));
    return [...list].sort((a, b) => Number(!!b.featured) - Number(!!a.featured));
  }, [q, cat, auth, state, sort, installedIds]);

  const featured = ALL_PROVIDERS.filter((p) => p.featured);
  const filtersActive =
    q !== "" || cat !== "All" || auth !== "all" || state !== "all" || sort !== "featured";
  const resetFilters = () =>
    setSearch({ q: "", cat: "All", auth: "all", state: "all", sort: "featured" });

  return (
    <>
      {/* The parent `/integrations` layout already renders a single
          <AppTopbar> for every tab (see its header-ownership comment) — a
          second one here stacked a duplicate topbar + breadcrumb under it. */}
      <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setSearch({ q: e.target.value.slice(0, 100) })}
              placeholder="Search by name, vendor, or capability"
              className="pl-9 pr-9 h-9"
              aria-label="Search integrations"
            />
            {q && (
              <button
                type="button"
                onClick={() => setSearch({ q: "" })}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={auth} onValueChange={(v) => setSearch({ auth: v })}>
              <SelectTrigger className="h-9 w-[160px]" aria-label="Filter by authorization">
                <SelectValue placeholder="Auth type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any auth type</SelectItem>
                {AUTH_TYPES.map((a) => (
                  <SelectItem key={a} value={a} className="capitalize">
                    {authLabel(a)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={state} onValueChange={(v) => setSearch({ state: v })}>
              <SelectTrigger className="h-9 w-[140px]" aria-label="Filter by install state">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All states</SelectItem>
                <SelectItem value="installed">Installed</SelectItem>
                <SelectItem value="available">Not installed</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground hidden sm:inline">Sort by</span>
            <Select value={sort} onValueChange={(v) => setSearch({ sort: v })}>
              <SelectTrigger className="h-9 w-[150px]" aria-label="Sort integrations">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="featured">Featured</SelectItem>
                <SelectItem value="name">Name (A–Z)</SelectItem>
                <SelectItem value="newest">Newest version</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            {filtered.length} of {ALL_PROVIDERS.length} integrations
          </span>
          {filtersActive && (
            <>
              {q && (
                <Badge variant="secondary" className="font-normal">
                  “{q}”
                </Badge>
              )}
              {cat !== "All" && (
                <Badge variant="secondary" className="font-normal">
                  {cat}
                </Badge>
              )}
              {auth !== "all" && (
                <Badge variant="secondary" className="font-normal capitalize">
                  {authLabel(auth)}
                </Badge>
              )}
              {state !== "all" && (
                <Badge variant="secondary" className="font-normal capitalize">
                  {state}
                </Badge>
              )}
              <Button size="sm" variant="ghost" className="h-6 px-2" onClick={resetFilters}>
                Clear all
              </Button>
            </>
          )}
        </div>

        {featured.length > 0 && !filtersActive && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-medium uppercase text-muted-foreground">
                Featured
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {featured.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openDetails(p)}
                  className="block group text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                >
                  <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent group-hover:shadow-md transition-shadow h-full">
                    <CardHeader className="pb-2">
                      <div className="flex items-start gap-3">
                        <ProviderAvatar id={p.id} name={p.name} />
                        <div className="min-w-0 flex-1">
                          <CardTitle className="text-base flex items-center justify-between gap-2">
                            <span className="truncate">{p.name}</span>
                            {installedIds.has(p.id) && (
                              <Badge variant="secondary" className="text-[11px] shrink-0">
                                Installed
                              </Badge>
                            )}
                          </CardTitle>
                          <CardDescription className="text-xs mt-0.5">{p.category}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-xs text-muted-foreground line-clamp-2 min-h-9">
                        {p.tagline}
                      </p>
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          </section>
        )}

        <Tabs value={cat} onValueChange={(v) => setSearch({ cat: v })}>
          <TabsList className="flex-wrap h-auto">
            {CATEGORIES.map((c) => (
              <TabsTrigger key={c} value={c} className="gap-1.5">
                {c}
                <span className="text-[11px] text-muted-foreground rounded bg-muted px-1.5 py-0.5">
                  {categoryCounts[c] ?? 0}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const isInstalled = installedIds.has(p.id);
            return (
              <Card key={p.id} className="hover:shadow-md transition-shadow flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    <ProviderAvatar id={p.id} name={p.name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => openDetails(p)}
                          className="hover:text-primary min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                        >
                          <CardTitle className="text-base truncate">{p.name}</CardTitle>
                        </button>
                        <Badge variant="outline" className="shrink-0">
                          {p.category}
                        </Badge>
                      </div>
                      <CardDescription className="text-xs mt-0.5">
                        {p.vendor} · v{p.version}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 flex-1 flex flex-col">
                  <p className="text-sm text-muted-foreground line-clamp-2">{p.tagline}</p>

                  <div className="flex flex-wrap gap-1">
                    {p.capabilities.slice(0, 3).map((c) => (
                      <Badge key={c.id} variant="secondary" className="text-[11px] gap-1">
                        {c.kind === "trigger" ? "⚡" : <CheckCircle2 className="h-3 w-3" />}
                        {c.label}
                      </Badge>
                    ))}
                    {p.capabilities.length > 3 && (
                      <Badge variant="secondary" className="text-[11px]">
                        +{p.capabilities.length - 3}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t mt-auto">
                    <span className="text-[11px] uppercase text-muted-foreground inline-flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" />
                      {p.authType.replace("_", " ")}
                    </span>
                    <div className="flex gap-1">
                      {p.docsUrl && (
                        <Button size="sm" variant="ghost" asChild>
                          <a
                            href={p.docsUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`${p.name} docs`}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openDetails(p)}
                        aria-label={`${p.name} details`}
                      >
                        <Info className="h-3.5 w-3.5" />
                      </Button>
                      {isInstalled ? (
                        <Button size="sm" variant="secondary" asChild>
                          <Link to="/integrations/installed">Manage</Link>
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" asChild>
                          <Link
                            to="/integrations/marketplace/$providerId/install"
                            params={{ providerId: p.id }}
                          >
                            <Plug className="h-3.5 w-3.5 mr-1.5" /> Connect
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <Card>
            <CardContent className="py-12 flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-muted grid place-items-center">
                <Search className="h-5 w-5 text-muted-foreground" />
              </div>
              <h3 className="font-medium">No integrations match your search</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                Try a different keyword or clear your category filter.
              </p>
              <Button variant="outline" size="sm" onClick={resetFilters}>
                Reset filters
              </Button>
            </CardContent>
          </Card>
        )}

        <ProviderDetailsSheet provider={details} open={detailsOpen} onOpenChange={setDetailsOpen} />
      </div>
    </>
  );
}
