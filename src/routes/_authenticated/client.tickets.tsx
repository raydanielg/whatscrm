import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  BookOpen, ChevronRight, HelpCircle, LifeBuoy, Loader2, MessageCircle,
  Plus, Search, Star,
} from "lucide-react";
import {
  listMyTickets, listFaqs, suggestKbArticles, listKbArticles,
} from "@/lib/client-portal/portal.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/client/tickets")({
  component: SupportCenterPage,
});

const STATUS_BADGE: Record<string, "default" | "outline" | "destructive"> = {
  open: "default",
  pending: "outline",
  in_progress: "default",
  resolved: "outline",
  closed: "outline",
};

function SupportCenterPage() {
  const listFn = useServerFn(listMyTickets);
  const faqsFn = useServerFn(listFaqs);
  const suggestFn = useServerFn(suggestKbArticles);
  const popularFn = useServerFn(listKbArticles);

  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 300);

  const tickets = useQuery({ queryKey: ["portal-tickets"], queryFn: () => listFn() });
  const faqs = useQuery({ queryKey: ["portal-faqs"], queryFn: () => faqsFn() });
  const popular = useQuery({ queryKey: ["portal-kb-popular"], queryFn: () => popularFn({ data: {} }) });
  const suggestions = useQuery({
    queryKey: ["portal-kb-suggest", debounced],
    queryFn: () => suggestFn({ data: { query: debounced, limit: 6 } }),
    enabled: debounced.length >= 2,
  });

  const openTickets = useMemo(() =>
    (tickets.data ?? []).filter((t) => (t.status as string) !== "resolved" && (t.status as string) !== "closed"),
    [tickets.data]);
  const recentTickets = (tickets.data ?? []).slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Hero — self-service first */}
      <section className="rounded-control border border-border bg-gradient-to-br from-accent/10 via-surface to-surface p-6 md:p-8">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 text-xs uppercase text-accent font-medium">
            <LifeBuoy className="w-3.5 h-3.5" /> Support center
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-semibold mt-2">How can we help?</h1>
          <p className="mt-2 text-sm text-muted-foreground">Search our help center or browse FAQs — most questions are answered instantly.</p>

          <div className="mt-5 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search articles, e.g. 'reset password', 'refund policy'"
              className="pl-9 h-11 text-base"
            />
          </div>

          {debounced.length >= 2 && (
            <div className="mt-3 rounded-control border border-border bg-background shadow-lg overflow-hidden">
              {suggestions.isLoading ? (
                <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Searching</div>
              ) : (suggestions.data ?? []).length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">No matches. Try different keywords or open a ticket.</div>
              ) : (
                <ul className="divide-y divide-border max-h-80 overflow-auto">
                  {suggestions.data!.map((a) => (
                    <li key={a.id}>
                      <Link
                        to="/client/knowledge"
                        className="flex items-center gap-3 p-3 hover:bg-muted transition-colors"
                      >
                        <BookOpen className="w-4 h-4 text-accent shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{a.title}</p>
                          {a.summary && <p className="text-xs text-muted-foreground truncate">{a.summary}</p>}
                        </div>
                        {a.is_faq && <Badge variant="outline" className="text-[11px]">FAQ</Badge>}
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            <Link to="/client/knowledge"><Button variant="outline" size="sm"><BookOpen className="w-3.5 h-3.5 mr-1.5" /> Browse all articles</Button></Link>
            <Link to="/client/tickets/new"><Button size="sm"><Plus className="w-3.5 h-3.5 mr-1.5" /> Contact support</Button></Link>
          </div>
        </div>
      </section>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-6">
          {/* FAQs */}
          <section className="rounded-control border border-border bg-surface p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg font-semibold flex items-center gap-2"><HelpCircle className="w-4 h-4 text-accent" /> Frequently asked questions</h2>
            </div>
            {faqs.isLoading ? (
              <SkeletonRows n={4} />
            ) : (faqs.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No FAQs yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {faqs.data!.slice(0, 8).map((a) => (
                  <li key={a.id}>
                    <Link
                      to="/client/knowledge"
                      className="group flex items-start gap-3 py-3 hover:bg-muted -mx-2 px-2 rounded-control transition-colors"
                    >
                      <div className="w-7 h-7 rounded-control bg-accent/10 text-accent flex items-center justify-center shrink-0"><HelpCircle className="w-3.5 h-3.5" /></div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{a.faq_question || a.title}</p>
                        {a.summary && <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{a.summary}</p>}
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-accent shrink-0 mt-1" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Popular articles */}
          <section className="rounded-control border border-border bg-surface p-5">
            <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2"><Star className="w-4 h-4 text-amber-500" /> Popular help articles</h2>
            {popular.isLoading ? <SkeletonRows n={4} /> : (
              <div className="grid sm:grid-cols-2 gap-2">
                {(popular.data ?? []).slice(0, 6).map((a) => (
                  <Link key={a.id} to="/client/knowledge"
                    className="rounded-control border border-border p-3 hover:border-border-strong transition-colors group">
                    <p className="text-sm font-medium group-hover:text-accent line-clamp-1">{a.title}</p>
                    {a.summary && <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{a.summary}</p>}
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Tickets sidebar */}
        <aside className="space-y-4">
          <section className="rounded-control border border-border bg-surface p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-base font-semibold flex items-center gap-2"><MessageCircle className="w-4 h-4" /> Your tickets</h2>
              <Link to="/client/tickets/new"><Button size="sm" variant="ghost" className="h-7 -mr-2"><Plus className="w-3.5 h-3.5" /></Button></Link>
            </div>

            {tickets.isLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading</div>
            ) : recentTickets.length === 0 ? (
              <div className="text-center py-6">
                <LifeBuoy className="w-8 h-8 mx-auto text-muted-foreground/40" />
                <p className="mt-2 text-xs text-muted-foreground">No tickets yet.</p>
                <Link to="/client/tickets/new"><Button size="sm" className="mt-3">Open your first ticket</Button></Link>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {recentTickets.map((t) => (
                  <li key={t.id}>
                    <Link
                      to="/client/tickets/$id" params={{ id: t.id }}
                      className="group flex items-start gap-2 rounded-control border border-transparent hover:border-border p-2 -mx-1"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{t.subject ?? "Support request"}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {t.last_message_at ? relTime(t.last_message_at) : relTime(t.created_at)}
                        </p>
                      </div>
                      <Badge variant={STATUS_BADGE[t.status] ?? "outline"} className="capitalize text-[11px] shrink-0">{t.status.replace("_", " ")}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            {openTickets.length > 0 && (
              <p className="mt-3 pt-3 border-t border-border text-[11px] text-muted-foreground">
                {openTickets.length} open · {(tickets.data?.length ?? 0) - openTickets.length} resolved
              </p>
            )}
          </section>

          <section className="rounded-control border border-border bg-surface p-5">
            <h3 className="text-sm font-semibold mb-2">Still need help?</h3>
            <p className="text-xs text-muted-foreground mb-3">Our support team usually responds within a few business hours.</p>
            <Link to="/client/tickets/new" className="block"><Button className="w-full" size="sm">Contact support</Button></Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

function SkeletonRows({ n }: { n: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="h-10 rounded-control bg-muted/40 animate-pulse" />
      ))}
    </div>
  );
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString();
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemoEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// Small helper — avoids importing useEffect at the top for cleaner reads
import { useEffect as useMemoEffect } from "react";
