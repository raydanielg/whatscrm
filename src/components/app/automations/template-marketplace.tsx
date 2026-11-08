import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  listTemplates,
  toggleFavorite,
  cloneTemplateToWorkflow,
  cloneTemplate,
  importTemplate,
  ensureShareSlug,
  deleteTemplate,
  setFeatured,
  upsertTemplate,
} from "@/lib/workflows/marketplace.functions";
import {
  Search,
  Star,
  Sparkles,
  Upload,
  Download,
  Share2,
  Copy,
  Play,
  Trash2,
  Plus,
  Clock,
  Filter,
  ShieldCheck,
  Workflow as WorkflowIcon,
} from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  "All",
  "Sales",
  "Support",
  "Marketing",
  "Customer Success",
  "HR",
  "Internal Automation",
  "Lead Qualification",
  "AI",
  "WhatsApp",
  "CRM",
] as const;

type Template = {
  id: string;
  workspace_id: string | null;
  owner_user_id: string | null;
  name: string;
  description: string | null;
  category: string;
  icon: string;
  tags: string[];
  is_featured: boolean;
  is_public_in_workspace: boolean;
  share_slug: string | null;
  usage_count: number;
  forked_from_template_id: string | null;
  created_at: string;
  updated_at: string;
  is_favorite: boolean;
};

type View = "all" | "featured" | "favorites" | "recent" | "mine";

export function TemplateMarketplace() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [category, setCategory] = React.useState<(typeof CATEGORIES)[number]>("All");
  const [search, setSearch] = React.useState("");
  const [view, setView] = React.useState<View>("all");
  const [userId, setUserId] = React.useState<string | null>(null);
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [editing, setEditing] = React.useState<Template | null>(null);

  React.useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!mounted || !data.user) return;
      setUserId(data.user.id);
      const { data: m } = await supabase
        .from("workspace_members")
        .select("role")
        .eq("user_id", data.user.id)
        .limit(1)
        .maybeSingle();
      if (mounted) setIsAdmin(!!m && ["owner", "admin"].includes(m.role));
    });
    return () => {
      mounted = false;
    };
  }, []);

  const listFn = useServerFn(listTemplates);
  const { data, isLoading } = useQuery({
    queryKey: ["wf-templates"],
    queryFn: () => listFn(),
  });

  // realtime
  React.useEffect(() => {
    const ch = supabase
      .channel("wf-marketplace")
      .on("postgres_changes", { event: "*", schema: "public", table: "workflow_templates" }, () =>
        qc.invalidateQueries({ queryKey: ["wf-templates"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workflow_template_favorites" },
        () => qc.invalidateQueries({ queryKey: ["wf-templates"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const templates = (data?.templates ?? []) as Template[];
  const recentIds = new Set(data?.recentlyUsedIds ?? []);

  const filtered = React.useMemo(() => {
    let list = templates;
    if (category !== "All") list = list.filter((t) => t.category === category);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q)),
      );
    }
    if (view === "featured") list = list.filter((t) => t.is_featured);
    if (view === "favorites") list = list.filter((t) => t.is_favorite);
    if (view === "recent") list = list.filter((t) => recentIds.has(t.id));
    if (view === "mine") list = list.filter((t) => t.owner_user_id === userId);
    return list;
  }, [templates, category, search, view, recentIds, userId]);

  const featured = templates.filter((t) => t.is_featured).slice(0, 6);

  const favFn = useServerFn(toggleFavorite);
  const favMut = useMutation({
    mutationFn: (v: { templateId: string; favorite: boolean }) => favFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wf-templates"] }),
  });

  const cloneToWfFn = useServerFn(cloneTemplateToWorkflow);
  const useMut = useMutation({
    mutationFn: (templateId: string) => cloneToWfFn({ data: { templateId } }),
    onSuccess: (res) => {
      toast.success("Workflow created from template");
      navigate({ to: "/automations/$workflowId", params: { workflowId: res.automationId } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cloneFn = useServerFn(cloneTemplate);
  const cloneMut = useMutation({
    mutationFn: (templateId: string) => cloneFn({ data: { templateId } }),
    onSuccess: () => {
      toast.success("Template cloned to your workspace");
      qc.invalidateQueries({ queryKey: ["wf-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const shareFn = useServerFn(ensureShareSlug);
  const shareMut = useMutation({
    mutationFn: (id: string) => shareFn({ data: { id } }),
    onSuccess: async ({ slug }) => {
      const url = `${window.location.origin}/templates/${slug}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Share link copied to clipboard");
      } catch {
        toast.success(`Share link: ${url}`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteFn = useServerFn(deleteTemplate);
  const delMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Template deleted");
      qc.invalidateQueries({ queryKey: ["wf-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const featFn = useServerFn(setFeatured);
  const featMut = useMutation({
    mutationFn: (v: { id: string; featured: boolean }) => featFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wf-templates"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const importFn = useServerFn(importTemplate);
  const importMut = useMutation({
    mutationFn: (json: unknown) => importFn({ data: { json: json as never } }),
    onSuccess: () => {
      toast.success("Template imported");
      qc.invalidateQueries({ queryKey: ["wf-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function handleImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        importMut.mutate(json);
      } catch (err) {
        toast.error(`Invalid JSON: ${(err as Error).message}`);
      }
    };
    input.click();
  }

  function handleExport(t: Template) {
    // Need to fetch graph via getTemplate — do inline via supabase for simplicity.
    supabase
      .from("workflow_templates")
      .select("name, description, category, icon, tags, graph")
      .eq("id", t.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return toast.error("Cannot export");
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${t.name.replace(/[^\w]+/g, "-").toLowerCase()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  return (
    <section aria-label="Template marketplace" className="space-y-5">
      {/* Header */}
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-sm font-medium">Template marketplace</div>
          <div className="text-xs text-muted-foreground">
            Discover, share and clone workflow templates across your workspace.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleImport}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-control border border-border bg-surface text-xs hover:bg-muted"
          >
            <Upload className="w-3.5 h-3.5" /> Import
          </button>
          <button
            onClick={() => setEditing(newTemplate())}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
          >
            <Plus className="w-3.5 h-3.5" /> New template
          </button>
        </div>
      </header>

      {/* Search + view tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates"
            className="w-full pl-8 pr-3 py-2 rounded-control border border-border bg-surface text-sm"
          />
        </div>
        <ViewTabs value={view} onChange={setView} />
      </div>

      {/* Featured strip */}
      {featured.length > 0 && view === "all" && !search && (
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
            <Sparkles className="w-3.5 h-3.5" /> Featured
          </div>
          <ScrollArea orientation="horizontal" type="hover" className="w-full">
            <div className="flex w-max gap-3 pb-1">
              {featured.map((t) => (
                <FeaturedCard
                  key={t.id}
                  tpl={t}
                  onUse={() => useMut.mutate(t.id)}
                  onFav={() => favMut.mutate({ templateId: t.id, favorite: !t.is_favorite })}
                />
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Category chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`px-2.5 py-1 rounded-control border text-xs transition ${
              category === c
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border bg-surface hover:bg-muted"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="rounded-control border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
          Loading templates
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-control border border-border bg-surface p-10 text-center">
          <WorkflowIcon className="w-8 h-8 mx-auto text-muted-foreground" aria-hidden="true" />
          <div className="mt-3 font-medium">No templates match</div>
          <div className="text-sm text-muted-foreground mt-1">
            Try a different category or import a template JSON file.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <TemplateCard
              key={t.id}
              tpl={t}
              recent={recentIds.has(t.id)}
              ownerIsMe={t.owner_user_id === userId}
              isAdmin={isAdmin}
              onUse={() => useMut.mutate(t.id)}
              onFav={() => favMut.mutate({ templateId: t.id, favorite: !t.is_favorite })}
              onClone={() => cloneMut.mutate(t.id)}
              onShare={() => shareMut.mutate(t.id)}
              onExport={() => handleExport(t)}
              onDelete={() => delMut.mutate(t.id)}
              onFeature={() => featMut.mutate({ id: t.id, featured: !t.is_featured })}
              onEdit={() => setEditing(t)}
            />
          ))}
        </div>
      )}

      {editing && (
        <TemplateEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["wf-templates"] });
          }}
        />
      )}
    </section>
  );
}

/* --------------------------------- cards --------------------------------- */

function TemplateCard({
  tpl,
  recent,
  ownerIsMe,
  isAdmin,
  onUse,
  onFav,
  onClone,
  onShare,
  onExport,
  onDelete,
  onFeature,
  onEdit,
}: {
  tpl: Template;
  recent: boolean;
  ownerIsMe: boolean;
  isAdmin: boolean;
  onUse: () => void;
  onFav: () => void;
  onClone: () => void;
  onShare: () => void;
  onExport: () => void;
  onDelete: () => void;
  onFeature: () => void;
  onEdit: () => void;
}) {
  return (
    <article className="rounded-control border border-border bg-surface p-4 shadow-sm hover:shadow-md transition group">
      <header className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-control bg-accent/10 text-accent grid place-items-center">
          <WorkflowIcon className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="font-medium truncate">{tpl.name}</div>
            {tpl.is_featured && (
              <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-control px-1.5 py-0.5">
                <Sparkles className="w-2.5 h-2.5" /> Featured
              </span>
            )}
            {recent && (
              <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground border border-border rounded-control px-1.5 py-0.5">
                <Clock className="w-2.5 h-2.5" /> Recent
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">{tpl.category}</div>
        </div>
        <button
          onClick={onFav}
          className={`p-1.5 rounded-control hover:bg-muted transition ${tpl.is_favorite ? "text-amber-500" : "text-muted-foreground"}`}
          aria-label={tpl.is_favorite ? "Unfavorite" : "Favorite"}
        >
          <Star className={`w-4 h-4 ${tpl.is_favorite ? "fill-current" : ""}`} />
        </button>
      </header>
      {tpl.description && (
        <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{tpl.description}</p>
      )}
      {tpl.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {tpl.tags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              className="text-[11px] px-1.5 py-0.5 rounded-control bg-muted text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="text-[11px] text-muted-foreground ">{tpl.usage_count} uses</div>
        <div className="flex items-center gap-1">
          <IconBtn title="Clone to my templates" onClick={onClone}>
            <Copy className="w-3.5 h-3.5" />
          </IconBtn>
          <IconBtn title="Share" onClick={onShare}>
            <Share2 className="w-3.5 h-3.5" />
          </IconBtn>
          <IconBtn title="Export JSON" onClick={onExport}>
            <Download className="w-3.5 h-3.5" />
          </IconBtn>
          {isAdmin && tpl.workspace_id && (
            <IconBtn title={tpl.is_featured ? "Unfeature" : "Feature (admin)"} onClick={onFeature}>
              <ShieldCheck className={`w-3.5 h-3.5 ${tpl.is_featured ? "text-amber-500" : ""}`} />
            </IconBtn>
          )}
          {ownerIsMe && (
            <>
              <IconBtn title="Edit" onClick={onEdit}>
                <Sparkles className="w-3.5 h-3.5" />
              </IconBtn>
              <IconBtn title="Delete" onClick={onDelete}>
                <Trash2 className="w-3.5 h-3.5" />
              </IconBtn>
            </>
          )}
          <button
            onClick={onUse}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-control bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
          >
            <Play className="w-3 h-3" /> Use
          </button>
        </div>
      </div>
    </article>
  );
}

function FeaturedCard({
  tpl,
  onUse,
  onFav,
}: {
  tpl: Template;
  onUse: () => void;
  onFav: () => void;
}) {
  return (
    <div className="min-w-[260px] max-w-[300px] rounded-control border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent p-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-amber-500" />
        <div className="font-medium text-sm truncate">{tpl.name}</div>
        <button
          onClick={onFav}
          className={`ml-auto p-1 rounded hover:bg-muted ${tpl.is_favorite ? "text-amber-500" : "text-muted-foreground"}`}
        >
          <Star className={`w-3.5 h-3.5 ${tpl.is_favorite ? "fill-current" : ""}`} />
        </button>
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{tpl.category}</div>
      {tpl.description && (
        <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{tpl.description}</p>
      )}
      <button
        onClick={onUse}
        className="mt-3 w-full inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-control bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
      >
        <Play className="w-3 h-3" /> Use template
      </button>
    </div>
  );
}

function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="p-1.5 rounded-control text-muted-foreground hover:bg-muted hover:text-foreground transition"
    >
      {children}
    </button>
  );
}

function ViewTabs({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  const items: { v: View; label: string; icon: React.ReactNode }[] = [
    { v: "all", label: "All", icon: <WorkflowIcon className="w-3 h-3" /> },
    { v: "featured", label: "Featured", icon: <Sparkles className="w-3 h-3" /> },
    { v: "favorites", label: "Favorites", icon: <Star className="w-3 h-3" /> },
    { v: "recent", label: "Recent", icon: <Clock className="w-3 h-3" /> },
    { v: "mine", label: "Mine", icon: <ShieldCheck className="w-3 h-3" /> },
  ];
  return (
    <div className="inline-flex items-center rounded-control border border-border bg-surface p-0.5">
      {items.map((it) => (
        <button
          key={it.v}
          onClick={() => onChange(it.v)}
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-control text-xs ${
            value === it.v
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted text-muted-foreground"
          }`}
        >
          {it.icon}
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------- editor -------------------------------- */

function newTemplate(): Template {
  return {
    id: "",
    workspace_id: null,
    owner_user_id: null,
    name: "",
    description: "",
    category: "Internal Automation",
    icon: "Workflow",
    tags: [],
    is_featured: false,
    is_public_in_workspace: true,
    share_slug: null,
    usage_count: 0,
    forked_from_template_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_favorite: false,
  };
}

function TemplateEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: Template;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState(initial.name);
  const [description, setDescription] = React.useState(initial.description ?? "");
  const [category, setCategory] = React.useState(initial.category);
  const [tags, setTags] = React.useState(initial.tags.join(", "));
  const [isPublic, setIsPublic] = React.useState(initial.is_public_in_workspace);
  const [graphText, setGraphText] = React.useState<string>(() => {
    return JSON.stringify({ nodes: [], edges: [] }, null, 2);
  });

  React.useEffect(() => {
    if (initial.id) {
      supabase
        .from("workflow_templates")
        .select("graph")
        .eq("id", initial.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.graph) setGraphText(JSON.stringify(data.graph, null, 2));
        });
    }
  }, [initial.id]);

  const upsertFn = useServerFn(upsertTemplate);
  const saveMut = useMutation({
    mutationFn: () => {
      let graph;
      try {
        graph = JSON.parse(graphText);
      } catch {
        throw new Error("Graph must be valid JSON");
      }
      return upsertFn({
        data: {
          id: initial.id || undefined,
          name,
          description: description || null,
          category,
          icon: initial.icon,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          graph,
          is_public_in_workspace: isPublic,
        },
      });
    },
    onSuccess: () => {
      toast.success(initial.id ? "Template updated" : "Template created");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative ml-auto w-full max-w-xl h-full bg-surface border-l border-border shadow-2xl overflow-auto animate-in slide-in-from-right duration-200">
        <header className="sticky top-0 bg-surface border-b border-border px-4 py-3 flex items-center justify-between">
          <div className="text-sm font-medium">{initial.id ? "Edit template" : "New template"}</div>
          <button
            onClick={onClose}
            className="text-xs px-2 py-1 rounded-control border border-border hover:bg-muted"
          >
            Close
          </button>
        </header>
        <div className="p-4 space-y-3">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-control border border-border bg-background text-sm"
            />
          </Field>
          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-2.5 py-1.5 rounded-control border border-border bg-background text-sm"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-control border border-border bg-background text-sm"
              >
                {CATEGORIES.filter((c) => c !== "All").map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tags (comma-separated)">
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-control border border-border bg-background text-sm"
              />
            </Field>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Checkbox
              id="publish-to-workspace"
              checked={isPublic}
              onCheckedChange={(v) => setIsPublic(v === true)}
            />
            <Label htmlFor="publish-to-workspace" className="font-normal text-xs">
              Publish to workspace (visible to teammates)
            </Label>
          </div>
          <Field label="Graph JSON">
            <textarea
              value={graphText}
              onChange={(e) => setGraphText(e.target.value)}
              rows={12}
              className="w-full px-2.5 py-1.5 rounded-control border border-border bg-background text-xs font-mono"
              spellCheck={false}
            />
          </Field>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-control border border-border text-xs hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !name}
              className="px-3 py-1.5 rounded-control bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-60"
            >
              {saveMut.isPending ? "Saving" : "Save template"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] uppercase text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
