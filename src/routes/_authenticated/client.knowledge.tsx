import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { BookOpen, Loader2, Search, ArrowLeft, Eye } from "lucide-react";
import { listKbArticles, getKbArticle } from "@/lib/client-portal/portal.functions";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/client/knowledge")({
  component: KnowledgePage,
});

type Article = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  tags: string[] | null;
  view_count: number | null;
  updated_at: string;
  published_at: string | null;
};

function KnowledgePage() {
  const fmtZoned = useZonedDateFormatter();
  const [query, setQuery] = useState("");
  const [slug, setSlug] = useState<string | null>(null);

  const listFn = useServerFn(listKbArticles);
  const getFn = useServerFn(getKbArticle);

  const listQ = useQuery({
    queryKey: ["client-kb", query],
    queryFn: () => listFn({ data: { query: query || undefined } }),
  });

  const articleQ = useQuery({
    queryKey: ["client-kb-article", slug],
    queryFn: () => getFn({ data: { slug: slug! } }),
    enabled: !!slug,
  });

  if (slug) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setSlug(null)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Back to articles
        </button>
        {articleQ.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground p-8">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading
          </div>
        ) : articleQ.isError ? (
          <div className="rounded-control border border-destructive/40 bg-destructive/5 p-6 text-sm">
            {(articleQ.error as Error).message}
          </div>
        ) : articleQ.data ? (
          <article className="rounded-control border border-border bg-surface/40 p-8 max-w-3xl">
            <h1 className="font-display text-3xl font-semibold">
              {(articleQ.data as { title: string }).title}
            </h1>
            {(articleQ.data as { summary: string | null }).summary && (
              <p className="mt-2 text-muted-foreground">
                {(articleQ.data as { summary: string | null }).summary}
              </p>
            )}
            <div className="prose prose-sm dark:prose-invert mt-6 whitespace-pre-wrap font-body text-[15px] leading-relaxed">
              {(articleQ.data as { content_md: string | null }).content_md}
            </div>
          </article>
        ) : null}
      </div>
    );
  }

  const rows = (listQ.data ?? []) as Article[];

  return (
    <div className="space-y-4">
      <header>
        <p className="text-[11px] uppercase   text-accent font-medium">Help center</p>
        <h2 className="font-display text-2xl font-semibold flex items-center gap-2">
          <BookOpen className="w-5 h-5" /> Knowledge base
        </h2>
      </header>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search articles"
          className="w-full pl-9 pr-3 h-10 rounded-control border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
      </div>

      {listQ.isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground p-8">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-control border border-dashed border-border p-10 text-center text-muted-foreground text-sm">
          No articles found.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {rows.map((a) => (
            <button
              key={a.id}
              onClick={() => setSlug(a.slug)}
              className="text-left rounded-control border border-border bg-surface/40 p-4 hover:border-border-strong hover:bg-muted/[0.03] transition-colors"
            >
              <p className="font-medium text-sm">{a.title}</p>
              {a.summary && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.summary}</p>
              )}
              <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Eye className="w-3 h-3" /> {a.view_count ?? 0}
                </span>
                <span>
                  {fmtZoned(new Date(a.published_at ?? a.updated_at), { dateStyle: "medium" })}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
