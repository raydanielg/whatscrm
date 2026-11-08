import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppTopbar } from "@/components/app/app-topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  Bot,
  Search,
  Star,
  Copy,
  Download,
  Upload,
  Share2,
  MoreHorizontal,
  Trash2,
  Sparkles,
  Rocket,
  Loader2,
  History,
  Eye,
  ArrowUpDown,
  Users,
  TrendingUp,
  Package,
  ShieldCheck,
  Languages,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Database,
  Lock,
} from "lucide-react";

import {
  listChatbotTemplates,
  toggleChatbotTemplateFavorite,
  cloneChatbotTemplate,
  deleteChatbotTemplate,
  importChatbotTemplate,
  ensureChatbotTemplateShareSlug,
  setChatbotTemplateFeatured,
  getChatbotTemplate,
  restoreChatbotTemplateVersion,
  CHATBOT_TEMPLATE_CATEGORIES,
} from "@/lib/chatbots/marketplace.functions";
import { InstallTemplateDialog } from "@/components/app/chatbots/install-template-dialog";

export const Route = createFileRoute("/_authenticated/chatbots/marketplace")({
  validateSearch: (s: Record<string, unknown>) => ({
    share: typeof s.share === "string" ? s.share : undefined,
    preview: typeof s.preview === "string" ? s.preview : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Chatbot Template Marketplace" },
      {
        name: "description",
        content:
          "Discover, clone, share and version reusable AI chatbot templates across Sales, Support, Healthcare and more.",
      },
    ],
  }),
  component: ChatbotMarketplacePage,
});

type SortKey = "popular" | "newest" | "name";

type Template = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  icon: string;
  tags: string[];
  is_featured: boolean;
  is_community: boolean;
  is_favorite: boolean;
  share_slug: string | null;
  version: number;
  usage_count: number;
  owner_user_id: string;
  updated_at: string;
};

function ChatbotMarketplacePage() {
  const qc = useQueryClient();

  const urlSearch = useSearch({ from: "/_authenticated/chatbots/marketplace" });
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [tab, setTab] = useState<"all" | "featured" | "favorites" | "community" | "mine">("all");
  const [sort, setSort] = useState<SortKey>("popular");
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [previewFor, setPreviewFor] = useState<string | null>(urlSearch.preview ?? null);
  const [installFor, setInstallFor] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const q = useQuery({
    queryKey: ["chatbot-templates"],
    queryFn: () => listChatbotTemplates(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["chatbot-templates"] });

  const favMut = useMutation({
    mutationFn: (v: { id: string; favorite: boolean }) =>
      toggleChatbotTemplateFavorite({ data: { templateId: v.id, favorite: v.favorite } }),
    onSuccess: invalidate,
  });

  const dupTemplate = useMutation({
    mutationFn: (id: string) => cloneChatbotTemplate({ data: { templateId: id } }),
    onSuccess: () => {
      toast.success("Template duplicated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delTemplate = useMutation({
    mutationFn: (id: string) => deleteChatbotTemplate({ data: { id } }),
    onSuccess: () => {
      toast.success("Template deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const featureMut = useMutation({
    mutationFn: (v: { id: string; featured: boolean }) => setChatbotTemplateFeatured({ data: v }),
    onSuccess: () => {
      toast.success("Updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const shareMut = useMutation({
    mutationFn: (id: string) => ensureChatbotTemplateShareSlug({ data: { id } }),
    onSuccess: ({ slug }) => {
      const url = `${window.location.origin}/chatbots/marketplace?share=${slug}`;
      navigator.clipboard.writeText(url).catch(() => null);
      toast.success("Share link copied");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importMut = useMutation({
    mutationFn: (json: unknown) => importChatbotTemplate({ data: { json: json as never } }),
    onSuccess: () => {
      toast.success("Template imported");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const templates = (q.data?.templates ?? []) as Template[];

  // Auto-open a template when arriving via ?share=<slug> or ?preview=<id>
  useEffect(() => {
    if (urlSearch.preview) {
      setPreviewFor(urlSearch.preview);
      return;
    }
    if (urlSearch.share && templates.length) {
      const hit = templates.find((t) => t.share_slug === urlSearch.share);
      if (hit) setPreviewFor(hit.id);
    }
  }, [urlSearch.share, urlSearch.preview, templates]);

  const tabCounts = useMemo(
    () => ({
      all: templates.length,
      featured: templates.filter((t) => t.is_featured).length,
      favorites: templates.filter((t) => t.is_favorite).length,
      community: templates.filter((t) => t.is_community).length,
      mine: templates.filter((t) => !t.is_community).length,
    }),
    [templates],
  );

  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of templates) map.set(t.category, (map.get(t.category) ?? 0) + 1);
    return map;
  }, [templates]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const rows = templates.filter((t) => {
      if (category !== "All" && t.category !== category) return false;
      if (tab === "featured" && !t.is_featured) return false;
      if (tab === "favorites" && !t.is_favorite) return false;
      if (tab === "community" && !t.is_community) return false;
      if (tab === "mine" && t.is_community) return false;
      if (s) {
        const hay = `${t.name} ${t.description ?? ""} ${t.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
    const sorted = [...rows];
    if (sort === "popular") sorted.sort((a, b) => b.usage_count - a.usage_count);
    else if (sort === "newest")
      sorted.sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
    else sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }, [templates, search, category, tab, sort]);

  const featured = useMemo(
    () =>
      [...templates.filter((t) => t.is_featured)]
        .sort((a, b) => b.usage_count - a.usage_count)
        .slice(0, 4),
    [templates],
  );

  const stats = useMemo(
    () => ({
      total: templates.length,
      community: templates.filter((t) => t.is_community).length,
      clones: templates.reduce((s, t) => s + (t.usage_count ?? 0), 0),
      featured: templates.filter((t) => t.is_featured).length,
    }),
    [templates],
  );

  async function handleExport(id: string) {
    try {
      const { template } = await getChatbotTemplate({ data: { id } });
      const t = template as unknown as Template & { config: unknown };
      const payload = {
        name: t.name,
        description: t.description,
        category: t.category,
        icon: t.icon,
        tags: t.tags,
        config: t.config,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${t.name.replace(/[^a-z0-9-_]+/gi, "_")}.chatbot-template.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function onImportPick(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        importMut.mutate(parsed);
      } catch {
        toast.error("Invalid JSON file");
      }
    };
    reader.readAsText(file);
  }

  return (
    <>
      <AppTopbar
        title="Chatbot Template Marketplace"
        subtitle="Discover, clone and share reusable AI chatbot templates"
        actions={
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImportPick(f);
                e.target.value = "";
              }}
            />
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 " /> Import
            </Button>
            <Link to="/chatbots">
              <Button size="sm" variant="ghost">
                <Bot className="h-4 w-4 " /> My chatbots
              </Button>
            </Link>
          </div>
        }
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {/* Hero + stats */}
        <div className="rounded-control border border-border bg-gradient-to-br from-primary/10 via-surface to-surface p-6">
          <div className="flex items-center gap-2 text-xs uppercase   text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Marketplace
          </div>
          <h2 className="mt-2 text-2xl font-semibold">Launch chatbots in minutes</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Battle-tested templates across Sales, Support, Healthcare, Real Estate, E-commerce and
            more. Clone, customize, version and share.
          </p>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatTile
              icon={<Package className="h-4 w-4" />}
              label="Templates"
              value={stats.total}
            />
            <StatTile icon={<Star className="h-4 w-4" />} label="Featured" value={stats.featured} />
            <StatTile
              icon={<Users className="h-4 w-4" />}
              label="Community"
              value={stats.community}
            />
            <StatTile
              icon={<TrendingUp className="h-4 w-4" />}
              label="Total clones"
              value={stats.clones}
            />
          </div>
        </div>

        {/* Featured strip */}
        {featured.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <Star className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-medium">Featured</h3>
            </div>
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {featured.map((t) => (
                <TemplateCard
                  key={t.id}
                  t={t}
                  compact
                  onOpen={() => setPreviewFor(t.id)}
                  onClone={() => setInstallFor(t.id)}
                  onFavorite={() => favMut.mutate({ id: t.id, favorite: !t.is_favorite })}
                  onDuplicate={() => dupTemplate.mutate(t.id)}
                  onDelete={() => delTemplate.mutate(t.id)}
                  onExport={() => handleExport(t.id)}
                  onShare={() => shareMut.mutate(t.id)}
                  onFeature={() => featureMut.mutate({ id: t.id, featured: !t.is_featured })}
                  onHistory={() => setHistoryFor(t.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Search + tabs + sort */}
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates, tags, categories"
              className="pl-9"
            />
          </div>
          <div className="min-w-0 rounded-control border border-border p-1 bg-surface">
            <ScrollArea orientation="horizontal" type="hover" className="w-full">
              <div className="flex w-max items-center gap-1">
                {(["all", "featured", "favorites", "community", "mine"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setTab(k)}
                    className={`text-xs px-3 h-9 rounded-control whitespace-nowrap inline-flex items-center gap-1.5 ${
                      tab === k ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                    }`}
                  >
                    {k[0].toUpperCase() + k.slice(1)}
                    <span
                      className={`text-[11px] px-1.5 py-0.5 rounded ${
                        tab === k ? "bg-primary-foreground/20" : "bg-muted"
                      } `}
                    >
                      {tabCounts[k]}
                    </span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="whitespace-nowrap">
                <ArrowUpDown className="h-3.5 w-3.5 " />
                Sort: {sort === "popular" ? "Popular" : sort === "newest" ? "Newest" : "Name"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => setSort("popular")}>Most popular</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSort("newest")}>
                Recently updated
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSort("name")}>Name (A–Z)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {(["All", ...CHATBOT_TEMPLATE_CATEGORIES] as const).map((c) => {
            const count = c === "All" ? templates.length : (categoryCounts.get(c) ?? 0);
            return (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`text-xs px-3 h-9 rounded-control border transition inline-flex items-center gap-1.5 ${
                  category === c
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-muted"
                }`}
              >
                {c}
                <span
                  className={`text-[11px] px-1.5 py-0.5 rounded  ${
                    category === c ? "bg-primary-foreground/20" : "bg-muted"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Grid */}
        {q.isLoading ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="rounded-control border border-border bg-surface p-4 animate-pulse h-48"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-control border border-dashed border-border p-10 text-center text-sm text-muted-foreground space-y-2">
            <div>No templates match your filters.</div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSearch("");
                setCategory("All");
                setTab("all");
              }}
            >
              Reset filters
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((t) => (
              <TemplateCard
                key={t.id}
                t={t}
                onOpen={() => setPreviewFor(t.id)}
                onClone={() => setInstallFor(t.id)}
                onFavorite={() => favMut.mutate({ id: t.id, favorite: !t.is_favorite })}
                onDuplicate={() => dupTemplate.mutate(t.id)}
                onDelete={() => delTemplate.mutate(t.id)}
                onExport={() => handleExport(t.id)}
                onShare={() => shareMut.mutate(t.id)}
                onFeature={() => featureMut.mutate({ id: t.id, featured: !t.is_featured })}
                onHistory={() => setHistoryFor(t.id)}
              />
            ))}
          </div>
        )}
      </main>

      <VersionsDialog
        templateId={historyFor}
        onClose={() => setHistoryFor(null)}
        onRestored={invalidate}
      />
      <PreviewDialog
        templateId={previewFor}
        onClose={() => setPreviewFor(null)}
        onClone={(id) => setInstallFor(id)}
        onShare={(id) => shareMut.mutate(id)}
      />
      <InstallTemplateDialog templateId={installFor} onClose={() => setInstallFor(null)} />
    </>
  );
}

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-control border border-border bg-surface/80 backdrop-blur p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-1 text-xl font-semibold ">{value.toLocaleString()}</div>
    </div>
  );
}

function TemplateCard({
  t,
  compact,
  onOpen,
  onClone,
  onFavorite,
  onDuplicate,
  onDelete,
  onExport,
  onShare,
  onFeature,
  onHistory,
}: {
  t: Template;
  compact?: boolean;
  onOpen: () => void;
  onClone: () => void;
  onFavorite: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExport: () => void;
  onShare: () => void;
  onFeature: () => void;
  onHistory: () => void;
}) {
  const fmtZoned = useZonedDateFormatter();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group rounded-control border border-border bg-surface p-4 flex flex-col gap-3 hover:border-primary/40 hover:shadow-md transition cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-9 w-9 rounded-control bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate">{t.name}</div>
            <div className="text-xs text-muted-foreground truncate">{t.category}</div>
          </div>
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onFavorite}
            className="p-1.5 rounded-control hover:bg-muted"
            aria-label="Toggle favorite"
          >
            <Star
              className={`h-4 w-4 ${
                t.is_favorite ? "fill-primary text-primary" : "text-muted-foreground"
              }`}
            />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1.5 rounded-control hover:bg-muted" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={onOpen}>
                <Eye className="h-4 w-4 mr-2" /> Preview
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="h-4 w-4 mr-2" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onExport}>
                <Download className="h-4 w-4 mr-2" /> Export JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onShare}>
                <Share2 className="h-4 w-4 mr-2" /> Copy share link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onHistory}>
                <History className="h-4 w-4 mr-2" /> Version history
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onFeature}>
                <Star className="h-4 w-4 mr-2" />
                {t.is_featured ? "Unfeature" : "Feature"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {!compact && t.description && (
        <p className="text-xs text-muted-foreground line-clamp-3">{t.description}</p>
      )}

      <div className="flex items-center gap-1 flex-wrap">
        {t.is_featured && (
          <Badge variant="secondary" className="gap-1">
            <Star className="h-3 w-3" /> Featured
          </Badge>
        )}
        {t.is_community && <Badge variant="outline">Community</Badge>}
        <Badge variant="outline">v{t.version}</Badge>
        {t.tags.slice(0, 3).map((tag) => (
          <Badge key={tag} variant="outline" className="text-[11px]">
            {tag}
          </Badge>
        ))}
      </div>

      <div
        className="flex items-center justify-between mt-auto pt-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[11px] text-muted-foreground">
          {t.usage_count} clone{t.usage_count === 1 ? "" : "s"}
        </div>
        <Button size="sm" onClick={onClone}>
          <Rocket className="h-3.5 w-3.5 " /> Use
        </Button>
      </div>
    </div>
  );
}

function PreviewDialog({
  templateId,
  onClose,
  onClone,
  onShare,
}: {
  templateId: string | null;
  onClose: () => void;
  onClone: (id: string) => void;
  onShare: (id: string) => void;
}) {
  const fmtZoned = useZonedDateFormatter();
  const enabled = !!templateId;
  const q = useQuery({
    queryKey: ["chatbot-template-preview", templateId],
    enabled,
    queryFn: () => getChatbotTemplate({ data: { id: templateId! } }),
  });
  const t = (q.data?.template ?? null) as (Template & { config?: unknown }) | null;

  return (
    <Dialog open={enabled} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            {t?.name ?? "Template"}
          </DialogTitle>
          <DialogDescription>{t?.category}</DialogDescription>
        </DialogHeader>
        {q.isLoading || !t ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading template
          </div>
        ) : (
          <div className="space-y-4">
            {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
            <div className="flex flex-wrap items-center gap-1">
              {t.is_featured && (
                <Badge variant="secondary" className="gap-1">
                  <Star className="h-3 w-3" /> Featured
                </Badge>
              )}
              {t.is_community && <Badge variant="outline">Community</Badge>}
              <Badge variant="outline">v{t.version}</Badge>
              {t.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-[11px]">
                  {tag}
                </Badge>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-control border border-border p-3">
                <div className="text-[11px] text-muted-foreground">Clones</div>
                <div className="text-lg font-semibold ">
                  {t.usage_count.toLocaleString()}
                </div>
              </div>
              <div className="rounded-control border border-border p-3">
                <div className="text-[11px] text-muted-foreground">Version</div>
                <div className="text-lg font-semibold ">v{t.version}</div>
              </div>
              <div className="rounded-control border border-border p-3">
                <div className="text-[11px] text-muted-foreground">Updated</div>
                <div className="text-xs font-medium mt-1">
                  {fmtZoned(new Date(t.updated_at), { dateStyle: "medium" })}
                </div>
              </div>
            </div>
            <CompatibilityPanel config={t.config} />
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" size="sm" disabled={!t} onClick={() => t && onShare(t.id)}>
            <Share2 className="h-4 w-4 " /> Share
          </Button>
          <Button
            size="sm"
            disabled={!t}
            onClick={() => {
              if (t) {
                onClone(t.id);
                onClose();
              }
            }}
          >
            <Rocket className="h-4 w-4 " /> Use this template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const LANG_LABEL: Record<string, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  it: "Italian",
  nl: "Dutch",
  ar: "Arabic",
  hi: "Hindi",
  id: "Indonesian",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  ru: "Russian",
  tr: "Turkish",
  no: "Norwegian",
  sv: "Swedish",
  da: "Danish",
};

function CompatibilityPanel({ config }: { config: unknown }) {
  const cfg = (config ?? {}) as Record<string, unknown>;
  const req = (cfg.requirements ?? {}) as Record<string, unknown>;
  const compat = (cfg.compatibility ?? {}) as Record<string, unknown>;
  const data = (cfg.data_policy ?? cfg.dataPolicy ?? {}) as Record<string, unknown>;

  const waPlans = (
    (compat.wa_plans ??
      compat.waPlans ??
      req.wa_plans ?? ["Business", "Business Premium", "Enterprise"]) as string[]
  ).filter(Boolean);

  const languages = ((compat.languages ?? cfg.languages ?? ["en"]) as string[]).filter(Boolean);
  const channels = ((compat.channels ?? ["whatsapp"]) as string[]).filter(Boolean);

  const features = {
    "Knowledge Base (RAG)": Boolean(cfg.rag_enabled ?? cfg.useKnowledgeBase),
    "Human Handoff": Boolean(cfg.handoff_enabled ?? cfg.allowHandoff ?? true),
    "Media messages": Boolean(cfg.media_enabled ?? true),
    "Interactive replies": Boolean(cfg.interactive_enabled ?? true),
  };

  const policies = {
    "GDPR compliant": Boolean(data.gdpr ?? true),
    "PII redaction": Boolean(data.pii_redaction ?? data.piiRedaction ?? true),
    "EU data residency": Boolean(data.eu_residency ?? data.euResidency ?? false),
    "Encrypted at rest": Boolean(data.encrypted_at_rest ?? true),
  };
  const retention = (data.retention_days ?? data.retentionDays) as number | undefined;

  return (
    <div className="space-y-3 rounded-control border border-border p-3 bg-muted/30">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        Requirements & Compatibility
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium mb-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-primary" /> WhatsApp plans
          </div>
          <div className="flex flex-wrap gap-1">
            {waPlans.map((p) => (
              <Badge key={p} variant="secondary" className="text-[11px]">
                {p}
              </Badge>
            ))}
            {channels
              .filter((c) => c !== "whatsapp")
              .map((c) => (
                <Badge key={c} variant="outline" className="text-[11px] capitalize">
                  {c}
                </Badge>
              ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium mb-1.5">
            <Languages className="h-3.5 w-3.5 text-primary" /> Languages
          </div>
          <div className="flex flex-wrap gap-1">
            {languages.map((l) => (
              <Badge key={l} variant="outline" className="text-[11px]">
                {LANG_LABEL[l] ?? l.toUpperCase()}
              </Badge>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium mb-1.5">
            <Package className="h-3.5 w-3.5 text-primary" /> Features required
          </div>
          <ul className="space-y-0.5">
            {Object.entries(features).map(([label, on]) => (
              <li key={label} className="flex items-center gap-1.5 text-[12px]">
                {on ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className={on ? "" : "text-muted-foreground line-through"}>{label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium mb-1.5">
            <Lock className="h-3.5 w-3.5 text-primary" /> Data policies
          </div>
          <ul className="space-y-0.5">
            {Object.entries(policies).map(([label, on]) => (
              <li key={label} className="flex items-center gap-1.5 text-[12px]">
                {on ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className={on ? "" : "text-muted-foreground"}>{label}</span>
              </li>
            ))}
            {typeof retention === "number" && (
              <li className="flex items-center gap-1.5 text-[12px]">
                <Database className="h-3.5 w-3.5 text-primary" />
                <span>Retention: {retention} days</span>
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

function VersionsDialog({
  templateId,
  onClose,
  onRestored,
}: {
  templateId: string | null;
  onClose: () => void;
  onRestored: () => void;
}) {
  const fmtZoned = useZonedDateFormatter();
  const enabled = !!templateId;
  const q = useQuery({
    queryKey: ["chatbot-template", templateId],
    enabled,
    queryFn: () => getChatbotTemplate({ data: { id: templateId! } }),
  });
  const restore = useMutation({
    mutationFn: (v: number) =>
      restoreChatbotTemplateVersion({ data: { templateId: templateId!, version: v } }),
    onSuccess: () => {
      toast.success("Version restored");
      onRestored();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={enabled} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>
            Every save creates a snapshot. Restore any prior version.
          </DialogDescription>
        </DialogHeader>
        {q.isLoading ? (
          <div className="text-sm text-muted-foreground py-4">Loading</div>
        ) : (
          <div className="max-h-80 overflow-y-auto space-y-2">
            {(
              (q.data?.versions ?? []) as Array<{
                id: string;
                version: number;
                changelog: string | null;
                created_at: string;
              }>
            ).length === 0 ? (
              <div className="text-sm text-muted-foreground py-4">No prior versions yet.</div>
            ) : (
              (q.data?.versions ?? []).map(
                (v: {
                  id: string;
                  version: number;
                  changelog: string | null;
                  created_at: string;
                }) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between rounded-control border border-border p-3"
                  >
                    <div>
                      <div className="text-sm font-medium">Version {v.version}</div>
                      <div className="text-xs text-muted-foreground">
                        {fmtZoned(new Date(v.created_at), {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                        {v.changelog ? ` — ${v.changelog}` : ""}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => restore.mutate(v.version)}
                      disabled={restore.isPending}
                    >
                      Restore
                    </Button>
                  </div>
                ),
              )
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
