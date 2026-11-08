import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import {
  Plus,
  Search,
  RefreshCw,
  Trash2,
  Save,
  Upload,
  Sparkles,
  FileText,
  MessageCircleQuestion,
  GraduationCap,
  Tag as TagIcon,
  Loader2,
  Archive,
  Send,
  History,
  Eye,
  X,
  Link as LinkIcon,
  Boxes,
  MoreHorizontal,
} from "lucide-react";
import { IngestUrlDialog } from "./ingest-url-dialog";
import { CollectionsPanel } from "./collections-panel";
import { ActionBar } from "@/components/app/action-bar";
import { TopbarActions } from "@/components/app/topbar-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  useKbArticles,
  useKbCategories,
  useUpsertKbArticle,
  useDeleteKbArticle,
  useUpsertKbCategory,
  useReindexKbArticle,
  useReindexKbWorkspace,
  useSearchKb,
  useGenerateKbAnswer,
  useKbAnalytics,
  useImportKbFromStorage,
  useKbArticleVersions,
  type KbArticle,
  type KbStatus,
} from "@/hooks/use-kb";
import { supabase } from "@/integrations/supabase/client";
import { htmlToMarkdown, looksLikeHtml } from "@/lib/kb/paste-to-markdown";
// extract is dynamically imported at call time — see line 623.
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STATUS_META: Record<KbStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  published: {
    label: "Published",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  archived: {
    label: "Archived",
    className: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
};

export function KnowledgeBase({ workspaceId }: { workspaceId: string }) {
  const [tab, setTab] = useState<"articles" | "collections" | "search" | "analytics">("articles");
  const [statusFilter, setStatusFilter] = useState<KbStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string | "all" | "none">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);

  const articlesQ = useKbArticles(workspaceId, {
    status: statusFilter === "all" ? undefined : statusFilter,
    categoryId:
      categoryFilter === "all" ? undefined : categoryFilter === "none" ? null : categoryFilter,
    search: search.trim() || undefined,
  });
  const categoriesQ = useKbCategories(workspaceId);
  const reindexWs = useReindexKbWorkspace();
  const upsertArticle = useUpsertKbArticle();

  const articles = articlesQ.data ?? [];
  const selected = articles.find((a) => a.id === selectedId) ?? null;

  const startNew = async () => {
    const row = await upsertArticle.mutateAsync({
      workspaceId,
      title: "Untitled article",
      contentMd: "",
      status: "draft",
    });
    setSelectedId(row.id);
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <TopbarActions>
        <ActionBar
          primary={[
            <Button key="new" size="sm" onClick={startNew} disabled={upsertArticle.isPending}>
              <Plus className="h-4 w-4" />
              New article
            </Button>,
            <Button
              key="reindex"
              variant="outline"
              size="sm"
              onClick={() => reindexWs.mutate({ workspaceId })}
              disabled={reindexWs.isPending}
            >
              {reindexWs.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Reindex
            </Button>,
          ]}
          overflow={[
            <DropdownMenuItem key="url" onClick={() => setUrlOpen(true)}>
              <LinkIcon className="h-4 w-4" />
              URL
            </DropdownMenuItem>,
            <DropdownMenuItem key="import" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" />
              Import
            </DropdownMenuItem>,
          ]}
        />
      </TopbarActions>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex-1 min-h-0">
        <TabsList>
          <TabsTrigger value="articles">Articles</TabsTrigger>
          <TabsTrigger value="collections">
            <Boxes className="h-3.5 w-3.5" /> Collections
          </TabsTrigger>
          <TabsTrigger value="search">AI Search</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="articles" className="flex-1 min-h-0 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-[320px_minmax(0,1fr)] gap-4 h-full min-h-0 min-w-0">
            {/* Article list */}
            <Card className="flex flex-col min-h-0 overflow-hidden">
              <div className="p-3 space-y-2 border-b bg-muted/30">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter articles"
                    className="pl-9 h-9"
                  />
                </div>
                <div className="flex gap-2">
                  <Select
                    value={statusFilter}
                    onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={categoryFilter}
                    onValueChange={(v) => setCategoryFilter(v as typeof categoryFilter)}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      <SelectItem value="none">Uncategorized</SelectItem>
                      {(categoriesQ.data ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {articlesQ.isLoading && (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                      <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                    </div>
                  )}
                  {!articlesQ.isLoading && articles.length === 0 && (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                      No articles yet. Create one or import documents.
                    </div>
                  )}
                  {articles.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setSelectedId(a.id)}
                      className={cn(
                        "w-full text-left rounded-control px-3 py-2 transition-all",
                        "hover:bg-muted/60",
                        selectedId === a.id && "bg-muted shadow-sm",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-sm line-clamp-1">{a.title}</span>
                        {a.is_faq && (
                          <MessageCircleQuestion className="h-3.5 w-3.5 shrink-0 text-primary" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant="outline"
                          className={cn("text-[11px] h-4 px-1", STATUS_META[a.status].className)}
                        >
                          {STATUS_META[a.status].label}
                        </Badge>
                        {a.needs_reindex && (
                          <span className="text-[11px] text-orange-500">reindex pending</span>
                        )}
                        <span className="text-[11px] text-muted-foreground ml-auto">
                          v{a.version}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            </Card>

            {/* Editor */}
            <div className="min-h-0">
              {selected ? (
                <ArticleEditor
                  key={selected.id}
                  article={selected}
                  workspaceId={workspaceId}
                  categories={categoriesQ.data ?? []}
                  onDelete={() => setSelectedId(null)}
                  onCreateCategory={async (name) => {
                    // handled inline in editor
                    void name;
                  }}
                />
              ) : (
                <Card className="flex h-full items-center justify-center p-12">
                  <div className="text-center space-y-3">
                    <FileText className="h-10 w-10 mx-auto text-muted-foreground" />
                    <div>
                      <p className="font-medium">Select an article</p>
                      <p className="text-sm text-muted-foreground">
                        or create a new one to get started.
                      </p>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="collections" className="flex-1 min-h-0 mt-4">
          <CollectionsPanel workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="search" className="mt-4">
          <KbSearchPanel workspaceId={workspaceId} />
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <KbAnalyticsPanel workspaceId={workspaceId} />
        </TabsContent>
      </Tabs>

      {importOpen && (
        <ImportDialog
          workspaceId={workspaceId}
          categories={(categoriesQ.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
          onClose={() => setImportOpen(false)}
        />
      )}

      <IngestUrlDialog workspaceId={workspaceId} open={urlOpen} onOpenChange={setUrlOpen} />
    </div>
  );
}

/* -------------------------- Article Editor -------------------------- */

function ArticleEditor({
  article,
  workspaceId,
  categories,
  onDelete,
}: {
  article: KbArticle;
  workspaceId: string;
  categories: { id: string; name: string; slug: string; description?: string | null }[];
  onDelete: () => void;
  onCreateCategory: (name: string) => Promise<void>;
}) {
  const upsert = useUpsertKbArticle();
  const del = useDeleteKbArticle(workspaceId);
  const reindex = useReindexKbArticle();
  const upsertCat = useUpsertKbCategory();

  const [title, setTitle] = useState(article.title);
  const [summary, setSummary] = useState(article.summary ?? "");
  const [contentMd, setContentMd] = useState(article.content_md);
  const [categoryId, setCategoryId] = useState<string | null>(article.category_id);
  const [tags, setTags] = useState<string[]>(article.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [isFaq, setIsFaq] = useState(article.is_faq);
  const [faqQuestion, setFaqQuestion] = useState(article.faq_question ?? "");
  const [isTraining, setIsTraining] = useState(article.is_training);
  const [status, setStatus] = useState<KbStatus>(article.status);
  const [preview, setPreview] = useState(false);
  const [showVersions, setShowVersions] = useState(false);

  useEffect(() => {
    setTitle(article.title);
    setSummary(article.summary ?? "");
    setContentMd(article.content_md);
    setCategoryId(article.category_id);
    setTags(article.tags);
    setIsFaq(article.is_faq);
    setFaqQuestion(article.faq_question ?? "");
    setIsTraining(article.is_training);
    setStatus(article.status);
  }, [article.id]);

  const dirty =
    title !== article.title ||
    (summary || "") !== (article.summary ?? "") ||
    contentMd !== article.content_md ||
    categoryId !== article.category_id ||
    JSON.stringify(tags) !== JSON.stringify(article.tags) ||
    isFaq !== article.is_faq ||
    (faqQuestion || "") !== (article.faq_question ?? "") ||
    isTraining !== article.is_training ||
    status !== article.status;

  const save = async (targetStatus?: KbStatus) => {
    await upsert.mutateAsync({
      id: article.id,
      workspaceId,
      title: title.trim() || "Untitled",
      summary: summary.trim() || null,
      contentMd,
      status: targetStatus ?? status,
      categoryId,
      tags,
      isFaq,
      faqQuestion: isFaq ? faqQuestion.trim() || null : null,
      isTraining,
    });
    if (targetStatus) setStatus(targetStatus);
  };

  const addTag = () => {
    const t = tagDraft.trim().toLowerCase();
    if (!t) return;
    if (!tags.includes(t)) setTags([...tags, t]);
    setTagDraft("");
  };

  // In-app dialog instead of window.prompt, which some embedded browsers block.
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const createCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    const row = await upsertCat.mutateAsync({ workspaceId, name });
    setCategoryId(row.id);
    setNewCatName("");
    setCatDialogOpen(false);
  };

  return (
    <Card className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3 bg-muted/30">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <Badge variant="outline" className={`shrink-0 ${STATUS_META[article.status].className}`}>
            {STATUS_META[article.status].label}
          </Badge>
          <span className="text-xs text-muted-foreground">
            v{article.version} · updated {new Date(article.updated_at).toLocaleString()}
          </span>
          {article.needs_reindex && (
            <Badge
              variant="outline"
              className="shrink-0 text-[11px] bg-orange-500/10 text-orange-600 dark:text-orange-400"
            >
              reindex pending
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5 min-w-0">
          {/* Primary actions stay visible; everything else lives in the menu. */}
          {/* A published article keeps its status when saved, so the label says it
              updates the live article rather than implying a draft copy. */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => save()}
            disabled={!dirty || upsert.isPending}
            title={
              status === "published"
                ? "Updates the live article. It stays published."
                : "Saves your changes without publishing."
            }
          >
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {status === "published" ? "Save changes" : "Save draft"}
          </Button>
          {status !== "published" ? (
            <Button size="sm" onClick={() => save("published")} disabled={upsert.isPending}>
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Publish
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => save("archived")}
              disabled={upsert.isPending}
            >
              <Archive className="mr-1.5 h-3.5 w-3.5" />
              Archive
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={() => setPreview((v) => !v)}>
                <Eye className="mr-2 h-3.5 w-3.5" />
                {preview ? "Edit" : "Preview"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setShowVersions(true)}>
                <History className="mr-2 h-3.5 w-3.5" />
                History
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={reindex.isPending}
                onSelect={() => reindex.mutate(article.id)}
              >
                {reindex.isPending ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                )}
                Reindex
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => {
                  if (confirm(`Delete "${article.title}"? This cannot be undone.`)) {
                    del.mutate(article.id, { onSuccess: onDelete });
                  }
                }}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Body */}
      <ScrollArea className="flex-1">
        <div className="p-5 space-y-4 max-w-3xl mx-auto">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Article title"
            className="text-lg font-semibold border-none focus-visible:ring-0 shadow-none"
          />
          <Textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="One-line summary shown in suggestions and search results"
            rows={2}
            className="resize-none"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <div className="flex gap-2">
                <Select
                  value={categoryId ?? "none"}
                  onValueChange={(v) => setCategoryId(v === "none" ? null : v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Uncategorized" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Uncategorized</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="New category"
                  onClick={() => setCatDialogOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
                  <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                      <DialogTitle>New category</DialogTitle>
                      <DialogDescription>Give the category a short, clear name.</DialogDescription>
                    </DialogHeader>
                    <Input
                      autoFocus
                      value={newCatName}
                      placeholder="e.g. Shipping & returns"
                      onChange={(e) => setNewCatName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void createCategory();
                        }
                      }}
                    />
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setCatDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() => void createCategory()}
                        disabled={!newCatName.trim() || upsertCat.isPending}
                      >
                        {upsertCat.isPending && (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        )}
                        Create
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tags</Label>
              <div className="flex flex-wrap items-center gap-1.5 rounded-control border bg-background px-2 py-1.5">
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1">
                    <TagIcon className="h-3 w-3" />
                    {t}
                    <button
                      type="button"
                      onClick={() => setTags(tags.filter((x) => x !== t))}
                      className="hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag();
                    }
                    if (e.key === "Backspace" && !tagDraft && tags.length) {
                      setTags(tags.slice(0, -1));
                    }
                  }}
                  placeholder="add tag"
                  className="flex-1 min-w-[80px] bg-transparent text-sm outline-none"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-center justify-between gap-3 rounded-control border p-3">
              <div className="flex items-center gap-2">
                <MessageCircleQuestion className="h-4 w-4 text-primary" />
                <div>
                  <div className="text-sm font-medium">Mark as FAQ</div>
                  <div className="text-xs text-muted-foreground">Show in the FAQ list.</div>
                </div>
              </div>
              <Switch checked={isFaq} onCheckedChange={setIsFaq} />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-control border p-3">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-primary" />
                <div>
                  <div className="text-sm font-medium">AI training document</div>
                  <div className="text-xs text-muted-foreground">
                    Prioritize for reply grounding.
                  </div>
                </div>
              </div>
              <Switch checked={isTraining} onCheckedChange={setIsTraining} />
            </label>
          </div>

          {isFaq && (
            <div className="space-y-1.5">
              <Label className="text-xs">FAQ question</Label>
              <Input
                value={faqQuestion}
                onChange={(e) => setFaqQuestion(e.target.value)}
                placeholder="e.g. How do I reset my password?"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Content (Markdown)</Label>
              <span className="text-xs text-muted-foreground">
                {contentMd.length.toLocaleString()} chars · ~
                {Math.ceil(contentMd.length / 4).toLocaleString()} tokens
              </span>
            </div>
            {preview ? (
              // Preview scrolls inside its own box and wraps long lines, so nothing
              // is clipped by the card when the content is long or unbroken.
              // The project has no typography plugin, so spacing is set on each element here.
              <div className="max-w-none rounded-control border bg-background/60 p-4 min-h-[300px] max-h-[60vh] overflow-y-auto overflow-x-hidden text-sm leading-relaxed [overflow-wrap:anywhere] [&_p]:my-3 [&_h1]:mt-5 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:font-semibold [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_strong]:font-semibold [&_a]:text-primary [&_a]:underline [&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_hr]:my-4 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_td]:border [&_td]:px-2 [&_td]:py-1">
                <ReactMarkdown>{contentMd || "*Nothing to preview yet.*"}</ReactMarkdown>
              </div>
            ) : (
              <Textarea
                value={contentMd}
                onChange={(e) => setContentMd(e.target.value)}
                onPaste={(e) => {
                  // Rich text (from a web page or doc) arrives as HTML. Convert it to
                  // Markdown and insert at the cursor. Plain text falls through as-is.
                  // Rich HTML clipboard, or plain text that is itself HTML source
                  // (e.g. copied from a code view) — both get converted.
                  const rich = e.clipboardData.getData("text/html");
                  const plain = e.clipboardData.getData("text/plain");
                  const source = rich || (looksLikeHtml(plain) ? plain : "");
                  if (!source) return;
                  e.preventDefault();
                  const md = htmlToMarkdown(source);
                  const el = e.currentTarget;
                  const start = el.selectionStart;
                  const end = el.selectionEnd;
                  const next = contentMd.slice(0, start) + md + contentMd.slice(end);
                  setContentMd(next);
                  requestAnimationFrame(() => {
                    el.focus();
                    el.setSelectionRange(start + md.length, start + md.length);
                  });
                }}
                placeholder="Write in Markdown. Headings, lists, tables and inline code are supported."
                rows={18}
                className="font-mono text-sm"
              />
            )}
          </div>
        </div>
      </ScrollArea>

      {showVersions && (
        <VersionHistoryDialog
          articleId={article.id}
          onClose={() => setShowVersions(false)}
          onRestore={(v) => {
            setTitle(v.title);
            setSummary(v.summary ?? "");
            setContentMd(v.content_md);
            setShowVersions(false);
            toast.message("Version loaded — save to keep the changes.");
          }}
        />
      )}
    </Card>
  );
}

/* -------------------------- Version history -------------------------- */

function VersionHistoryDialog({
  articleId,
  onClose,
  onRestore,
}: {
  articleId: string;
  onClose: () => void;
  onRestore: (v: { title: string; summary: string | null; content_md: string }) => void;
}) {
  const q = useKbArticleVersions(articleId);
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>
            Older snapshots of this article. Loading one only fills the editor — save to keep it.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-2">
            {q.isLoading && <div className="text-sm text-muted-foreground">Loading</div>}
            {(q.data ?? []).map((v) => (
              <div
                key={v.id}
                className="flex items-start justify-between gap-3 rounded-control border p-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    v{v.version} · {v.title}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(v.created_at).toLocaleString()}
                  </div>
                  {v.note && (
                    <div className="text-xs text-muted-foreground mt-1">Note: {v.note}</div>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={() => onRestore(v)}>
                  Load
                </Button>
              </div>
            ))}
            {q.data && q.data.length === 0 && (
              <div className="text-sm text-muted-foreground py-6 text-center">
                No older versions yet.
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------- Import dialog -------------------------- */

function ImportDialog({
  workspaceId,
  categories,
  onClose,
}: {
  workspaceId: string;
  categories: { id: string; name: string }[];
  onClose: () => void;
}) {
  const importMut = useImportKbFromStorage();
  const [busy, setBusy] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList) => {
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        setProgress(`Extracting ${file.name}`);
        const { extractText } = await import("@/lib/kb/extract");
        const { text, sourceType } = await extractText(file);
        if (!text || text.length < 20) {
          toast.error(`No readable text found in ${file.name}`);
          continue;
        }
        setProgress(`Uploading ${file.name}`);
        const path = `${workspaceId}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
        const { error: upErr } = await supabase.storage.from("kb-sources").upload(path, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
        if (upErr) throw new Error(upErr.message);
        setProgress(`Importing ${file.name}`);
        await importMut.mutateAsync({
          workspaceId,
          storagePath: path,
          filename: file.name,
          categoryId,
          extractedText: text,
          sourceType,
        });
      }
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import documents</DialogTitle>
          <DialogDescription>
            Upload PDF, DOCX, or Markdown files. Text is extracted, saved as a draft, and embedded
            for AI retrieval.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Category</Label>
            <Select
              value={categoryId ?? "none"}
              onValueChange={(v) => setCategoryId(v === "none" ? null : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Uncategorized" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Uncategorized</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.length && !busy) handleFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "rounded-control border-2 border-dashed p-8 text-center cursor-pointer transition-colors",
              busy ? "opacity-50 pointer-events-none" : "hover:border-primary/60 hover:bg-muted/40",
            )}
          >
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">Drop files here or click to browse</p>
            <p className="text-xs text-muted-foreground">.pdf, .docx, .md, .txt</p>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.md,.markdown,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
          </div>

          {busy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {progress || "Working"}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------- Search / AI Answer -------------------------- */

function KbSearchPanel({ workspaceId }: { workspaceId: string }) {
  const [q, setQ] = useState("");
  const search = useSearchKb();
  const answer = useGenerateKbAnswer();

  const run = () => {
    const query = q.trim();
    if (!query) return;
    search.mutate({ workspaceId, query });
    answer.mutate({ workspaceId, question: query });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4">
      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="font-medium">AI Answer</h3>
        </div>
        <div className="flex gap-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
            placeholder="Ask any question your customers ask"
          />
          <Button onClick={run} disabled={search.isPending || answer.isPending}>
            {search.isPending || answer.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Ask"
            )}
          </Button>
        </div>
        <div className="rounded-control border bg-background/60 p-4 min-h-[220px]">
          {answer.data ? (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{answer.data.answer}</ReactMarkdown>
              {answer.data.sources.length > 0 && (
                <>
                  <hr />
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Grounded in
                  </p>
                  <ul className="text-xs">
                    {answer.data.sources.slice(0, 5).map((s, i) => (
                      <li key={s.chunk_id}>
                        [{i + 1}] {s.title} — {(s.similarity * 100).toFixed(0)}%
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Ask a question to preview how the AI will answer with your knowledge base.
            </div>
          )}
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-primary" />
          <h3 className="font-medium">Semantic search results</h3>
        </div>
        <ScrollArea className="h-[380px] pr-2">
          <div className="space-y-2">
            {search.data?.length ? (
              search.data.map((h, i) => (
                <div key={h.chunk_id} className="rounded-control border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">
                      {i + 1}. {h.title}
                    </span>
                    <Badge variant="outline" className="text-[11px]">
                      {(h.similarity * 100).toFixed(0)}%
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-3 mt-1">{h.content}</p>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground text-center py-8">
                {search.isPending ? "Searching" : "No results yet."}
              </div>
            )}
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
}

/* -------------------------- Analytics -------------------------- */

function KbAnalyticsPanel({ workspaceId }: { workspaceId: string }) {
  const q = useKbAnalytics(workspaceId);
  const totals = q.data?.totals;
  const top = q.data?.top ?? [];
  const stat = (label: string, value: number) => (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value.toLocaleString()}</div>
    </Card>
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {stat("Articles", totals?.articles ?? 0)}
        {stat("Views", totals?.views ?? 0)}
        {stat("Helpful", totals?.helpful ?? 0)}
        {stat("Unhelpful", totals?.unhelpful ?? 0)}
        {stat("AI grounding", totals?.aiUses ?? 0)}
      </div>
      <Card className="p-4">
        <h3 className="font-medium mb-3">Top articles</h3>
        <div className="space-y-2">
          {top.length === 0 && (
            <div className="text-sm text-muted-foreground py-6 text-center">
              No article activity yet.
            </div>
          )}
          {top.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-control border p-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{a.title}</div>
                <div className="text-xs text-muted-foreground">
                  {a.view_count} views · {a.helpful_count} helpful · {a.ai_use_count} AI uses
                </div>
              </div>
              <Badge variant="outline" className={STATUS_META[a.status].className}>
                {STATUS_META[a.status].label}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
