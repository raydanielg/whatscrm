import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef } from "react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { AppTopbar } from "@/components/app/app-topbar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Search,
  User,
  Building2,
  Target,
  DollarSign,
  CheckSquare,
  MessageSquare,
  Megaphone,
  BookOpen,
  X,
  Sparkles,
  Clock,
  Bookmark,
  BookmarkPlus,
  Loader2,
  TrendingUp,
  Lightbulb,
  AlertTriangle,
  Pin,
  Share2,
  Trash2,
  ArrowRight,
} from "lucide-react";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import {
  useGlobalSearch,
  useRecentSearches,
  useClearRecentSearches,
  useSavedSearches,
  useSaveSearch,
  useDeleteSavedSearch,
  useUpdateSavedSearch,
  useSearchInsights,
} from "@/hooks/use-global-search";
import type { SearchScope, SearchHit } from "@/lib/search/global-search.functions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  scope: fallback(z.string(), "all").default("all"),
  tab: fallback(z.string(), "results").default("results"),
});

type ScopeDef = {
  id: SearchScope;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};
const SCOPES: ScopeDef[] = [
  { id: "all", label: "All", icon: Sparkles },
  { id: "contact", label: "Contacts", icon: User },
  { id: "company", label: "Companies", icon: Building2 },
  { id: "lead", label: "Leads", icon: Target },
  { id: "deal", label: "Deals", icon: DollarSign },
  { id: "task", label: "Tasks", icon: CheckSquare },
  { id: "conversation", label: "Conversations", icon: MessageSquare },
  { id: "campaign", label: "Campaigns", icon: Megaphone },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
];

const ENTITY_ICON: Record<
  Exclude<SearchScope, "all">,
  React.ComponentType<{ className?: string }>
> = {
  contact: User,
  company: Building2,
  lead: Target,
  deal: DollarSign,
  task: CheckSquare,
  conversation: MessageSquare,
  campaign: Megaphone,
  knowledge: BookOpen,
};

export const Route = createFileRoute("/_authenticated/search")({
  staticData: { breadcrumb: "Search" },
  head: () => ({
    meta: [
      { title: "AI Search" },
      {
        name: "description",
        content:
          "Natural language search across every contact, deal, conversation and knowledge article.",
      },
    ],
  }),
  validateSearch: zodValidator(searchSchema),
  component: SearchPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">Search failed: {(error as Error).message}</div>
  ),
  notFoundComponent: () => <div className="p-8">Not found.</div>,
});

function SearchPage() {
  const { q, scope, tab } = Route.useSearch();
  const navigate = useNavigate({ from: "/search" });
  const ws = useCurrentWorkspace();
  const workspaceId = ws.data?.id;

  const [input, setInput] = useState(q);
  const [committed, setCommitted] = useState(q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeScope = (SCOPES.find((s) => s.id === scope)?.id ?? "all") as SearchScope;

  // Debounce input -> committed query -> URL
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setCommitted(input);
      navigate({
        search: (prev: { q: string; scope: string; tab: string }) =>
          ({ ...prev, q: input }) as never,
        replace: true,
      });
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  const { data: results, isFetching } = useGlobalSearch(workspaceId, committed, activeScope);
  const recent = useRecentSearches(workspaceId);
  const saved = useSavedSearches(workspaceId);
  const clearRecent = useClearRecentSearches(workspaceId);
  const insights = useSearchInsights(workspaceId);
  const deleteSaved = useDeleteSavedSearch(workspaceId);
  const updateSaved = useUpdateSavedSearch(workspaceId);

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  const totalHits = results?.totalHits ?? 0;
  const hasQuery = committed.trim().length >= 2;

  function setScope(s: SearchScope) {
    navigate({
      search: (prev: { q: string; scope: string; tab: string }) => ({ ...prev, scope: s }) as never,
      replace: true,
    });
  }

  function setTab(t: string) {
    navigate({
      search: (prev: { q: string; scope: string; tab: string }) => ({ ...prev, tab: t }) as never,
      replace: true,
    });
  }

  function runQuery(v: string) {
    setInput(v);
    setCommitted(v);
    navigate({
      search: (prev: { q: string; scope: string; tab: string }) =>
        ({ ...prev, q: v, tab: "results" }) as never,
      replace: true,
    });
  }

  const visibleGroups = useMemo(() => {
    if (!results) return [] as { scope: Exclude<SearchScope, "all">; hits: SearchHit[] }[];
    const scopes: Exclude<SearchScope, "all">[] = [
      "contact",
      "company",
      "lead",
      "deal",
      "task",
      "conversation",
      "campaign",
      "knowledge",
    ];
    return scopes
      .filter((s) => activeScope === "all" || activeScope === s)
      .map((s) => ({ scope: s, hits: results.groups[s] ?? [] }))
      .filter((g) => g.hits.length > 0);
  }, [results, activeScope]);

  return (
    <>
      <AppTopbar
        title="AI Search"
        subtitle={
          hasQuery
            ? `Results for "${committed}"`
            : "Search across your entire workspace with natural language"
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="rounded-control border border-border bg-surface p-4 mb-4 shadow-sm">
          <div className="relative">
            <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-accent" />
            <Input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runQuery(input);
              }}
              placeholder='Try "VIP deals closing this month" or "unread messages from Acme"'
              className="pl-10 pr-24 h-12 text-base"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {input && (
                <button
                  onClick={() => runQuery("")}
                  className="text-muted-foreground hover:text-foreground p-1"
                  aria-label="Clear"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {hasQuery && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSaveDialogOpen(true)}
                  className="h-9 gap-1.5"
                >
                  <BookmarkPlus className="h-3.5 w-3.5" /> Save
                </Button>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {SCOPES.map((s) => {
              const isActive = s.id === activeScope;
              const Icon = s.icon;
              const count =
                results && s.id !== "all" ? (results.groups[s.id]?.length ?? 0) : undefined;
              return (
                <button
                  key={s.id}
                  onClick={() => setScope(s.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-control border px-2.5 py-1 text-xs transition-colors",
                    isActive
                      ? "border-accent bg-accent/10 text-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" /> {s.label}
                  {count !== undefined && count > 0 && (
                    <span className="opacity-60">({count})</span>
                  )}
                </button>
              );
            })}
          </div>

          {results?.suggestions && results.suggestions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 items-center">
              <Lightbulb className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground ">Try:</span>
              {results.suggestions.map((sg, i) => (
                <button
                  key={i}
                  onClick={() => runQuery(sg)}
                  className="text-xs rounded-control border border-dashed border-border px-2 py-0.5 hover:bg-muted"
                >
                  {sg}
                </button>
              ))}
            </div>
          )}
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="results">
              Results{hasQuery && totalHits > 0 && ` (${totalHits})`}
            </TabsTrigger>
            <TabsTrigger value="saved">
              Saved{saved.data?.length ? ` (${saved.data.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
          </TabsList>

          {/* ============== RESULTS TAB ============== */}
          <TabsContent value="results" className="mt-4 space-y-4">
            {!hasQuery && (
              <>
                {(recent.data?.length ?? 0) > 0 && (
                  <section className="rounded-control border border-border bg-surface p-4">
                    <header className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" /> Recent searches
                      </h3>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => clearRecent.mutate()}
                        disabled={clearRecent.isPending}
                      >
                        Clear all
                      </Button>
                    </header>
                    <ul className="flex flex-wrap gap-1.5">
                      {recent.data!.map((r) => (
                        <li key={r.id}>
                          <button
                            onClick={() => runQuery(r.query)}
                            className="inline-flex items-center gap-1.5 rounded-control border border-border bg-background px-2.5 py-1 text-xs hover:bg-muted"
                          >
                            <Clock className="h-3 w-3 text-muted-foreground" /> {r.query}
                            {r.resultCount > 0 && (
                              <span className="text-muted-foreground">· {r.resultCount}</span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {(saved.data?.length ?? 0) > 0 && (
                  <section className="rounded-control border border-border bg-surface p-4">
                    <header className="flex items-center gap-2 mb-3">
                      <Bookmark className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-medium">Saved searches</h3>
                    </header>
                    <ul className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                      {saved.data!.map((s) => (
                        <li
                          key={s.id}
                          className="group rounded-control border border-border bg-background p-3 hover:border-border-strong transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <button
                              className="text-left flex-1 min-w-0"
                              onClick={() => runQuery(s.query)}
                            >
                              <div className="flex items-center gap-1.5">
                                {s.isPinned && <Pin className="h-3 w-3 text-accent" />}
                                {s.isShared && <Share2 className="h-3 w-3 text-muted-foreground" />}
                                <p className="text-sm font-medium truncate">{s.name}</p>
                              </div>
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {s.query}
                              </p>
                            </button>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                              <button
                                title={s.isPinned ? "Unpin" : "Pin"}
                                onClick={() =>
                                  updateSaved.mutate({ id: s.id, isPinned: !s.isPinned })
                                }
                                className="p-1 rounded hover:bg-muted"
                              >
                                <Pin
                                  className={cn("h-3 w-3", s.isPinned && "text-accent fill-accent")}
                                />
                              </button>
                              <button
                                title="Delete"
                                onClick={() => deleteSaved.mutate(s.id)}
                                className="p-1 rounded hover:bg-muted text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <div className="rounded-control border border-dashed border-border bg-surface/40 p-10 text-center">
                  <Sparkles className="w-8 h-8 mx-auto mb-2 text-accent" />
                  <p className="text-sm font-medium">AI-powered global search</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                    Type at least 2 characters. Try natural questions like "customers who never
                    replied" or "deals over 5000 EUR".
                    <br />
                    Press{" "}
                    <kbd className="mx-1 rounded border border-border bg-background px-1 py-0.5 text-[11px] font-mono">
                      ⌘K
                    </kbd>{" "}
                    anywhere for instant search.
                  </p>
                </div>
              </>
            )}

            {hasQuery && (
              <>
                {results?.aiSummary && (
                  <div className="rounded-control border border-accent/30 bg-accent/5 p-4 flex gap-3">
                    <Sparkles className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs font-medium text-accent mb-0.5">AI summary</p>
                      <p className="text-sm">{results.aiSummary}</p>
                    </div>
                  </div>
                )}

                {isFetching && !results && (
                  <div className="rounded-control border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
                    <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin" /> Searching across your
                    workspace
                  </div>
                )}

                {!isFetching && totalHits === 0 && (
                  <div className="rounded-control border border-border bg-surface p-10 text-center">
                    <Search className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p className="text-sm font-medium">No results for "{committed}"</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Try broader terms or a different scope.
                    </p>
                  </div>
                )}

                {activeScope === "all" && (results?.groups.all.length ?? 0) > 0 && (
                  <section className="rounded-control border border-border bg-surface overflow-hidden">
                    <header className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30">
                      <Sparkles className="w-4 h-4 text-accent" />
                      <h3 className="font-medium text-sm">Suggested results</h3>
                      <Badge variant="outline" className="text-[11px]">
                        {results!.groups.all.length}
                      </Badge>
                    </header>
                    <ul>
                      {results!.groups.all.map((h) => (
                        <HitRow
                          key={`sug-${h.entity}-${h.id}`}
                          hit={h}
                          query={committed}
                          navigate={navigate}
                        />
                      ))}
                    </ul>
                  </section>
                )}

                {visibleGroups.map((g) => {
                  const Icon = ENTITY_ICON[g.scope];
                  const label = SCOPES.find((s) => s.id === g.scope)?.label ?? g.scope;
                  return (
                    <section
                      key={g.scope}
                      className="rounded-control border border-border bg-surface overflow-hidden"
                    >
                      <header className="flex items-center gap-2 px-4 py-2 border-b border-border">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                        <h3 className="font-medium text-sm">{label}</h3>
                        <Badge variant="outline" className="text-[11px]">
                          {g.hits.length}
                        </Badge>
                      </header>
                      <ul>
                        {g.hits.map((h) => (
                          <HitRow
                            key={`${g.scope}-${h.id}`}
                            hit={h}
                            query={committed}
                            navigate={navigate}
                          />
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </>
            )}
          </TabsContent>

          {/* ============== SAVED TAB ============== */}
          <TabsContent value="saved" className="mt-4">
            <SavedSearchesPanel
              items={saved.data ?? []}
              onRun={runQuery}
              onDelete={(id) => deleteSaved.mutate(id)}
              onTogglePin={(s) => updateSaved.mutate({ id: s.id, isPinned: !s.isPinned })}
              onToggleShare={(s) => updateSaved.mutate({ id: s.id, isShared: !s.isShared })}
            />
          </TabsContent>

          {/* ============== INSIGHTS TAB ============== */}
          <TabsContent value="insights" className="mt-4 space-y-4">
            <InsightsDashboard data={insights.data} loading={insights.isLoading} />
          </TabsContent>
        </Tabs>
      </main>

      <SaveSearchDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        workspaceId={workspaceId}
        query={committed}
        scope={activeScope}
      />
    </>
  );
}

// ==================== Sub-components ====================

function HitRow({
  hit,
  query,
  navigate,
}: {
  hit: SearchHit;
  query: string;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const Icon = ENTITY_ICON[hit.entity as Exclude<SearchScope, "all">] ?? Sparkles;
  return (
    <li>
      <button
        onClick={() => navigate({ to: hit.href as string, replace: false } as never)}
        className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-muted/40 text-left border-b border-border/60 last:border-b-0"
      >
        <div className="w-9 h-9 shrink-0 rounded-control bg-accent/10 text-accent flex items-center justify-center">
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{highlight(hit.title, query)}</p>
          {(hit.subtitle || hit.extra) && (
            <p className="text-xs text-muted-foreground truncate">
              {[hit.subtitle, hit.extra].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-2" />
      </button>
    </li>
  );
}

function SavedSearchesPanel({
  items,
  onRun,
  onDelete,
  onTogglePin,
  onToggleShare,
}: {
  items: import("@/lib/search/global-search.functions").SavedSearch[];
  onRun: (q: string) => void;
  onDelete: (id: string) => void;
  onTogglePin: (s: import("@/lib/search/global-search.functions").SavedSearch) => void;
  onToggleShare: (s: import("@/lib/search/global-search.functions").SavedSearch) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-control border border-dashed border-border bg-surface p-10 text-center">
        <Bookmark className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
        <p className="text-sm font-medium">No saved searches yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Run a search and click Save to keep it handy.
        </p>
      </div>
    );
  }
  return (
    <ul className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
      {items.map((s) => (
        <li
          key={s.id}
          className="group rounded-control border border-border bg-surface p-3 hover:border-border-strong transition-colors"
        >
          <div className="flex items-start justify-between gap-2">
            <button className="text-left flex-1 min-w-0" onClick={() => onRun(s.query)}>
              <div className="flex items-center gap-1.5">
                {s.isPinned && <Pin className="h-3 w-3 text-accent" />}
                {s.isShared && <Share2 className="h-3 w-3 text-muted-foreground" />}
                <p className="text-sm font-medium truncate">{s.name}</p>
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">"{s.query}"</p>
              {s.scope && s.scope !== "all" && (
                <Badge variant="outline" className="text-[11px] mt-1.5">
                  {s.scope}
                </Badge>
              )}
            </button>
            <div className="flex flex-col gap-0.5">
              <button
                title={s.isPinned ? "Unpin" : "Pin"}
                onClick={() => onTogglePin(s)}
                className="p-1 rounded hover:bg-muted"
              >
                <Pin className={cn("h-3 w-3", s.isPinned && "text-accent fill-accent")} />
              </button>
              <button
                title={s.isShared ? "Make private" : "Share with team"}
                onClick={() => onToggleShare(s)}
                className="p-1 rounded hover:bg-muted"
              >
                <Share2 className={cn("h-3 w-3", s.isShared && "text-accent")} />
              </button>
              <button
                title="Delete"
                onClick={() => onDelete(s.id)}
                className="p-1 rounded hover:bg-muted text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function InsightsDashboard({
  data,
  loading,
}: {
  data: import("@/lib/search/global-search.functions").SearchInsightsResult | undefined;
  loading: boolean;
}) {
  const formatZoned = useZonedDateFormatter();
  if (loading || !data) {
    return (
      <div className="rounded-control border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
        <Loader2 className="w-5 h-5 mx-auto mb-2 animate-spin" /> Generating insights
      </div>
    );
  }
  const t = data.totals;
  const stat = (
    label: string,
    value: number,
    Icon: React.ComponentType<{ className?: string }>,
  ) => (
    <div key={label} className="rounded-control border border-border bg-surface p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="text-2xl font-semibold mt-1">{value.toLocaleString()}</p>
    </div>
  );
  return (
    <>
      <section>
        <h3 className="text-sm font-medium mb-2">Workspace totals</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {stat("Contacts", t.contacts, User)}
          {stat("Companies", t.companies, Building2)}
          {stat("Leads", t.leads, Target)}
          {stat("Deals", t.deals, DollarSign)}
          {stat("Tasks", t.tasks, CheckSquare)}
          {stat("Conversations", t.conversations, MessageSquare)}
          {stat("Campaigns", t.campaigns, Megaphone)}
          {stat("Knowledge", t.knowledge, BookOpen)}
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-control border border-border bg-surface p-4">
          <header className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-medium">Trend detection</h3>
          </header>
          {data.trends.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Not enough activity to detect trends yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {data.trends.map((t, i) => (
                <li key={i} className="border-l-2 border-accent/60 pl-3">
                  <p className="text-sm font-medium">{t.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-control border border-border bg-surface p-4">
          <header className="flex items-center gap-2 mb-3">
            <Lightbulb className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-medium">Business insights</h3>
          </header>
          {data.businessInsights.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Insights will appear as your workspace fills with data.
            </p>
          ) : (
            <ul className="space-y-3">
              {data.businessInsights.map((t, i) => {
                const Icon =
                  t.kind === "risk"
                    ? AlertTriangle
                    : t.kind === "opportunity"
                      ? TrendingUp
                      : Lightbulb;
                const color =
                  t.kind === "risk"
                    ? "text-destructive"
                    : t.kind === "opportunity"
                      ? "text-emerald-500"
                      : "text-accent";
                return (
                  <li key={i} className="flex gap-2">
                    <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", color)} />
                    <div>
                      <p className="text-sm font-medium">{t.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.detail}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {data.topQueries.length > 0 && (
        <section className="rounded-control border border-border bg-surface p-4">
          <header className="flex items-center gap-2 mb-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Your top queries · last 30 days</h3>
          </header>
          <ul className="flex flex-wrap gap-1.5">
            {data.topQueries.map((q) => (
              <li
                key={q.query}
                className="inline-flex items-center gap-1.5 rounded-control border border-border bg-background px-2.5 py-1 text-xs"
              >
                {q.query}
                <span className="text-muted-foreground">· {q.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[11px] text-muted-foreground text-right">
        Generated{" "}
        {formatZoned(new Date(data.generatedAt), { dateStyle: "medium", timeStyle: "short" })}
      </p>
    </>
  );
}

function SaveSearchDialog({
  open,
  onOpenChange,
  workspaceId,
  query,
  scope,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string | undefined;
  query: string;
  scope: SearchScope;
}) {
  const save = useSaveSearch(workspaceId);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (open) {
      setName(query.slice(0, 60));
      setShared(false);
      setPinned(false);
    }
  }, [open, query]);

  async function submit() {
    if (!name.trim() || !query.trim()) return;
    try {
      await save.mutateAsync({
        name: name.trim(),
        query,
        scope,
        isShared: shared,
        isPinned: pinned,
      });
      toast.success("Search saved");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save search");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save search</DialogTitle>
          <DialogDescription>Bookmark this query to run it instantly later.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="ss-name">Name</Label>
            <Input
              id="ss-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Hot leads this week"
            />
          </div>
          <div className="rounded-control border border-border bg-muted/30 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Query:</span> "{query}"
            {scope !== "all" && (
              <>
                {" "}
                · <span className="text-muted-foreground">Scope:</span> {scope}
              </>
            )}
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="ss-pin" className="cursor-pointer">
              Pin to top
            </Label>
            <Switch id="ss-pin" checked={pinned} onCheckedChange={setPinned} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="ss-share" className="cursor-pointer">
              Share with team
            </Label>
            <Switch id="ss-share" checked={shared} onCheckedChange={setShared} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!name.trim() || save.isPending}>
            {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function highlight(text: string, q: string) {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-accent/25 text-foreground rounded px-0.5">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}
