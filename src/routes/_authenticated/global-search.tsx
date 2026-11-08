import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { AppTopbar } from "@/components/app/app-topbar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Search,
  MessageSquare,
  User,
  Phone,
  Mail,
  DollarSign,
  FileText,
  CheckSquare,
  Megaphone,
  BookOpen,
  Paperclip,
  Image as ImageIcon,
  Mic,
  File,
  Loader2,
  X,
  Sparkles,
  SlidersHorizontal,
  ChevronRight,
  ChevronLeft,
  Check,
} from "lucide-react";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useOmnichannelSearch } from "@/hooks/use-omnichannel-search";
import type {
  OmniCategory,
  OmniHit,
  OmniSearchFilters,
} from "@/lib/search/omnichannel-search.functions";
import { cn } from "@/lib/utils";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  cat: fallback(z.string(), "all").default("all"),
});

export const Route = createFileRoute("/_authenticated/global-search")({
  staticData: { breadcrumb: "Global Search" },
  head: () => ({
    meta: [
      { title: "Global Omnichannel Search" },
      {
        name: "description",
        content:
          "Instantly search messages, customers, deals, invoices, tasks, campaigns, attachments and more across every channel.",
      },
    ],
  }),
  validateSearch: zodValidator(searchSchema),
  component: GlobalSearchPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">Search failed: {(error as Error).message}</div>
  ),
  notFoundComponent: () => <div className="p-8">Not found.</div>,
});

type CatDef = {
  id: OmniCategory | "all";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};
const CATEGORIES: CatDef[] = [
  { id: "all", label: "All", icon: Sparkles },
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "customers", label: "Customers", icon: User },
  { id: "phone_numbers", label: "Phone", icon: Phone },
  { id: "emails", label: "Emails", icon: Mail },
  { id: "deals", label: "Deals / Orders", icon: DollarSign },
  { id: "invoices", label: "Invoices", icon: FileText },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "campaigns", label: "Campaigns", icon: Megaphone },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
  { id: "attachments", label: "Attachments", icon: Paperclip },
  { id: "media", label: "Media", icon: ImageIcon },
  { id: "voice_notes", label: "Voice notes", icon: Mic },
  { id: "documents", label: "Documents", icon: File },
];

const ICON: Record<OmniCategory, React.ComponentType<{ className?: string }>> = {
  messages: MessageSquare,
  customers: User,
  phone_numbers: Phone,
  emails: Mail,
  deals: DollarSign,
  invoices: FileText,
  tasks: CheckSquare,
  campaigns: Megaphone,
  knowledge: BookOpen,
  attachments: Paperclip,
  media: ImageIcon,
  voice_notes: Mic,
  documents: File,
};

const CHANNELS = ["whatsapp", "instagram", "messenger", "telegram", "email", "sms", "live_chat"];
const STATUSES = [
  "open",
  "pending",
  "resolved",
  "closed",
  "active",
  "paused",
  "sent",
  "draft",
  "failed",
];
const PRIORITIES = ["low", "medium", "high", "urgent"];
const LANGUAGES = ["en", "no", "es", "fr", "de", "pt", "it", "ar"];

function GlobalSearchPage() {
  const { q, cat } = Route.useSearch();
  const navigate = Route.useNavigate();
  const ws = useCurrentWorkspace();
  const workspaceId = ws.data?.id;

  const [input, setInput] = useState(q);
  const [debounced, setDebounced] = useState(q);
  const [filters, setFilters] = useState<OmniSearchFilters>({});
  const [page, setPage] = useState(1);

  // Debounce input
  useEffect(() => {
    const t = setTimeout(() => setDebounced(input), 200);
    return () => clearTimeout(t);
  }, [input]);

  // Sync url on debounced commit
  useEffect(() => {
    if (debounced !== q) {
      navigate({
        search: (prev: { q: string; cat: string }) => ({ ...prev, q: debounced }),
        replace: true,
      });
    }
  }, [debounced, q, navigate]);

  const activeCat = (CATEGORIES.find((c) => c.id === cat)?.id ?? "all") as OmniCategory | "all";

  // Reset to page 1 whenever the query, category, or filters change.
  useEffect(() => {
    setPage(1);
  }, [debounced, activeCat, filters]);

  const { data, isFetching, isError } = useOmnichannelSearch(
    workspaceId,
    debounced,
    activeCat,
    filters,
    page,
  );

  const hasQuery = debounced.trim().length >= 2;
  const groups = data?.groups;
  const groupList = useMemo<OmniCategory[]>(
    () => [
      "messages",
      "customers",
      "phone_numbers",
      "emails",
      "deals",
      "invoices",
      "tasks",
      "campaigns",
      "knowledge",
      "attachments",
      "media",
      "voice_notes",
      "documents",
    ],
    [],
  );

  const setFilter = (k: keyof OmniSearchFilters, v: string | null) => {
    setFilters((prev) => ({ ...prev, [k]: v || null }));
  };
  const clearFilters = () => setFilters({});
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="flex h-full flex-col">
      <AppTopbar title="Global Omnichannel Search" />

      <div className="border-b bg-background px-4 py-2">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 shrink-0 sm:min-w-[320px] md:min-w-[480px] lg:min-w-[660px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search messages, customers, phone, emails, deals, invoices, tasks, campaigns, attachments"
              className="h-9 pl-9 pr-16 text-sm"
              autoFocus
            />
            {isFetching && (
              <Loader2 className="absolute right-9 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
            {input && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 h-7 -translate-y-1/2"
                onClick={() => setInput("")}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <FiltersMenu filters={filters} setFilter={setFilter} />
          <CategoryMenu
            activeCat={activeCat}
            counts={{
              all: data?.totalHits ?? 0,
              ...(groups
                ? Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length]))
                : {}),
            }}
            hasQuery={hasQuery}
            onSelect={(v) =>
              navigate({
                search: (prev: { q: string; cat: string }) => ({ ...prev, cat: v }),
                replace: true,
              })
            }
          />
          {activeFilterCount > 0 && (
            <Button variant="outline" size="sm" onClick={clearFilters} className="ml-auto h-9">
              <X className="mr-1 h-3.5 w-3.5" /> Clear {activeFilterCount}
            </Button>
          )}
        </div>
        {(activeFilterCount > 0 || data) && (
          <div className="mx-auto mt-2 flex max-w-7xl flex-wrap items-center gap-2 border-t border-dashed pt-2">
            <ActiveFilterChips filters={filters} setFilter={setFilter} />
            {data && (
              <span className="ml-auto text-xs text-muted-foreground">
                {data.totalHits} results · {data.tookMs}ms
              </span>
            )}
          </div>
        )}
      </div>

      <Tabs
        value={activeCat}
        onValueChange={(v) =>
          navigate({
            search: (prev: { q: string; cat: string }) => ({ ...prev, cat: v }),
            replace: true,
          })
        }
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="flex-1 overflow-auto">
          <div className="mx-auto max-w-7xl p-4">
            {!hasQuery ? (
              <EmptyState />
            ) : isError ? (
              <div className="p-6 text-sm text-destructive">Search failed. Try again.</div>
            ) : !data ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Searching
              </div>
            ) : (
              <TabsContent value={activeCat} className="mt-0 space-y-6">
                {activeCat === "all" ? (
                  groupList.map((g) => (
                    <ResultGroup key={g} category={g} hits={groups?.[g] ?? []} />
                  ))
                ) : (
                  <ResultGroup category={activeCat} hits={groups?.[activeCat] ?? []} expanded />
                )}
                {data.totalHits === 0 && (
                  <div className="rounded-control border border-dashed p-8 text-center text-sm text-muted-foreground">
                    No results for "{data.query}"
                  </div>
                )}
                {activeCat !== "all" && data.totalHits > 0 && (page > 1 || data.hasMore) && (
                  <div className="flex items-center justify-between border-t pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="mr-1 h-3.5 w-3.5" /> Previous
                    </Button>
                    <span className="text-xs text-muted-foreground">Page {page}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!data.hasMore}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next <ChevronRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </TabsContent>
            )}
          </div>
        </div>
      </Tabs>
    </div>
  );
}

type CatId = OmniCategory | "all";

const CATEGORY_GROUPS: { label: string; items: CatId[] }[] = [
  { label: "Conversations", items: ["messages", "phone_numbers", "emails"] },
  { label: "CRM", items: ["customers", "deals", "invoices", "tasks"] },
  { label: "Marketing", items: ["campaigns", "knowledge"] },
  { label: "Files", items: ["attachments", "media", "voice_notes", "documents"] },
];

function CategoryMenu({
  activeCat,
  counts,
  hasQuery,
  onSelect,
}: {
  activeCat: CatId;
  counts: Record<string, number>;
  hasQuery: boolean;
  onSelect: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<(typeof CATEGORY_GROUPS)[number] | null>(null);

  useEffect(() => {
    if (!open) setGroup(null);
  }, [open]);

  const current = CATEGORIES.find((c) => c.id === activeCat) ?? CATEGORIES[0];
  const CurrentIcon = current.icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          <CurrentIcon className="h-3.5 w-3.5" />
          {current.label}
          {hasQuery && counts[activeCat] > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[11px]">
              {counts[activeCat]}
            </Badge>
          )}
          <ChevronRight className="h-3.5 w-3.5 rotate-90 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        {!group ? (
          <ul className="py-1">
            <li>
              <button
                type="button"
                onClick={() => {
                  onSelect("all");
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-control px-2 py-1.5 text-sm hover:bg-muted",
                  activeCat === "all" && "bg-muted",
                )}
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                  All
                </span>
                {hasQuery && counts.all > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
                    {counts.all}
                  </Badge>
                )}
              </button>
            </li>
            {CATEGORY_GROUPS.map((g) => {
              const total = g.items.reduce((sum, id) => sum + (counts[id] ?? 0), 0);
              const containsActive = g.items.includes(activeCat as OmniCategory);
              return (
                <li key={g.label}>
                  <button
                    type="button"
                    onClick={() => setGroup(g)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-control px-2 py-1.5 text-sm hover:bg-muted",
                      containsActive && "bg-muted",
                    )}
                  >
                    <span>{g.label}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      {hasQuery && total > 0 ? total : null}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div>
            <div className="mb-1 flex items-center gap-1 border-b px-1 pb-1">
              <button
                type="button"
                onClick={() => setGroup(null)}
                className="flex items-center gap-1 rounded-control px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </button>
              <span className="text-sm font-medium">{group.label}</span>
            </div>
            <ul className="max-h-72 overflow-auto py-1">
              {group.items.map((id) => {
                const def = CATEGORIES.find((c) => c.id === id)!;
                const Icon = def.icon;
                const selected = activeCat === id;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(id);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-control px-2 py-1.5 text-sm hover:bg-muted",
                        selected && "bg-muted",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        {def.label}
                      </span>
                      <span className="flex items-center gap-1">
                        {hasQuery && counts[id] > 0 && (
                          <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
                            {counts[id]}
                          </Badge>
                        )}
                        {selected && <Check className="h-3.5 w-3.5" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

type FilterKey = keyof OmniSearchFilters;

type FilterDef =
  | { key: FilterKey; label: string; type: "select"; options: string[] }
  | { key: FilterKey; label: string; type: "text"; placeholder?: string }
  | { key: FilterKey; label: string; type: "date" };

const FILTER_DEFS: FilterDef[] = [
  { key: "channel", label: "Channel", type: "select", options: CHANNELS },
  { key: "status", label: "Status", type: "select", options: STATUSES },
  { key: "priority", label: "Priority", type: "select", options: PRIORITIES },
  { key: "language", label: "Language", type: "select", options: LANGUAGES },
  { key: "tag", label: "Tag", type: "text", placeholder: "Enter tag" },
  { key: "agentId", label: "Agent ID", type: "text", placeholder: "Agent ID" },
  { key: "dateFrom", label: "Date from", type: "date" },
  { key: "dateTo", label: "Date to", type: "date" },
];

function FiltersMenu({
  filters,
  setFilter,
}: {
  filters: OmniSearchFilters;
  setFilter: (k: FilterKey, v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<FilterDef | null>(null);
  const activeCount = Object.values(filters).filter(Boolean).length;

  useEffect(() => {
    if (!open) setActive(null);
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[11px]">
              {activeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        {!active ? (
          <ul className="py-1">
            {FILTER_DEFS.map((f) => {
              const val = filters[f.key];
              return (
                <li key={f.key}>
                  <button
                    type="button"
                    onClick={() => setActive(f)}
                    className="flex w-full items-center justify-between rounded-control px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <span>{f.label}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      {val ? (
                        <span className="max-w-[100px] truncate capitalize">
                          {String(val).replace(/_/g, " ")}
                        </span>
                      ) : null}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div>
            <div className="mb-1 flex items-center gap-1 border-b px-1 pb-1">
              <button
                type="button"
                onClick={() => setActive(null)}
                className="flex items-center gap-1 rounded-control px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Back
              </button>
              <span className="text-sm font-medium">{active.label}</span>
              {filters[active.key] && (
                <button
                  type="button"
                  onClick={() => setFilter(active.key, null)}
                  className="ml-auto rounded-control px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                >
                  Clear
                </button>
              )}
            </div>
            {active.type === "select" ? (
              <ul className="max-h-64 overflow-auto py-1">
                {active.options.map((o) => {
                  const selected = filters[active.key] === o;
                  return (
                    <li key={o}>
                      <button
                        type="button"
                        onClick={() => {
                          setFilter(active.key, selected ? null : o);
                          setActive(null);
                        }}
                        className="flex w-full items-center justify-between rounded-control px-2 py-1.5 text-sm capitalize hover:bg-muted"
                      >
                        <span>{o.replace(/_/g, " ")}</span>
                        {selected && <Check className="h-3.5 w-3.5" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="p-2">
                <Input
                  type={active.type === "date" ? "date" : "text"}
                  placeholder={active.type === "text" ? active.placeholder : undefined}
                  value={(filters[active.key] as string) ?? ""}
                  onChange={(e) => setFilter(active.key, e.target.value || null)}
                  className="h-9"
                  autoFocus
                />
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ActiveFilterChips({
  filters,
  setFilter,
}: {
  filters: OmniSearchFilters;
  setFilter: (k: FilterKey, v: string | null) => void;
}) {
  const active = FILTER_DEFS.filter((f) => filters[f.key]);
  if (!active.length) return null;
  return (
    <>
      {active.map((f) => (
        <Badge key={f.key} variant="secondary" className="h-7 gap-1 px-2 text-xs">
          <span className="text-muted-foreground">{f.label}:</span>
          <span className="capitalize">{String(filters[f.key]).replace(/_/g, " ")}</span>
          <button
            type="button"
            onClick={() => setFilter(f.key, null)}
            className="ml-0.5 text-muted-foreground hover:text-foreground"
            aria-label={`Remove ${f.label}`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
    </>
  );
}

function ResultGroup({
  category,
  hits,
  expanded,
}: {
  category: OmniCategory;
  hits: OmniHit[];
  expanded?: boolean;
}) {
  if (!hits.length && !expanded) return null;
  const Icon = ICON[category];
  const label = CATEGORIES.find((c) => c.id === category)?.label ?? category;
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span>{label}</span>
        <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
          {hits.length}
        </Badge>
      </div>
      {hits.length === 0 ? (
        <div className="rounded-control border border-dashed p-4 text-xs text-muted-foreground">
          No {label.toLowerCase()} match this query.
        </div>
      ) : (
        <ul className="divide-y rounded-control border">
          {hits.map((h) => (
            <HitRow key={`${h.category}-${h.id}`} hit={h} />
          ))}
        </ul>
      )}
    </section>
  );
}

function HitRow({ hit }: { hit: OmniHit }) {
  const Icon = ICON[hit.category];
  const formatZoned = useZonedDateFormatter();
  return (
    <li>
      <Link
        to={hit.href}
        className={cn("flex items-start gap-3 p-3 transition-colors hover:bg-muted/60")}
      >
        <span className="mt-0.5 rounded-control border bg-background p-1.5">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{hit.title}</div>
          {hit.subtitle && (
            <div className="truncate text-xs text-muted-foreground">{hit.subtitle}</div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {hit.meta.channel && (
              <Badge variant="outline" className="h-4 px-1 text-[11px] capitalize">
                {hit.meta.channel}
              </Badge>
            )}
            {hit.meta.status && (
              <Badge variant="outline" className="h-4 px-1 text-[11px] capitalize">
                {hit.meta.status}
              </Badge>
            )}
            {hit.meta.priority && (
              <Badge variant="outline" className="h-4 px-1 text-[11px] capitalize">
                {hit.meta.priority}
              </Badge>
            )}
            {hit.meta.language && (
              <Badge variant="outline" className="h-4 px-1 text-[11px] uppercase">
                {hit.meta.language}
              </Badge>
            )}
            {hit.meta.mimeType && (
              <Badge variant="outline" className="h-4 px-1 text-[11px]">
                {hit.meta.mimeType}
              </Badge>
            )}
            {hit.extra && <span className="text-[11px] text-muted-foreground">{hit.extra}</span>}
          </div>
        </div>
        {hit.createdAt && (
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {formatZoned(new Date(hit.createdAt), { dateStyle: "medium" })}
          </span>
        )}
      </Link>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Search className="h-6 w-6 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">Search everything</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Instantly find messages, customers, phone numbers, emails, deals, invoices, tasks,
        campaigns, knowledge and attachments — filtered by channel, agent, priority, tag, language
        or date.
      </p>
    </div>
  );
}
