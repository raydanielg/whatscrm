import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Link,
  Link2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FAQ_CATEGORIES, getLandingFaqs, type Faq } from "@/lib/marketing/landing-content";
import { usePlatformBranding } from "@/hooks/use-platform-branding";

const FAQ_CATEGORY_STORAGE_KEY = "wacrm:faq-category";
const FAQS_PER_PAGE = 5;

/**
 * Searchable, filterable FAQ with accordion rows and per-question anchors.
 *
 * - typing filters across question + answer text
 * - category chips narrow the list
 * - every row owns a `#faq-<id>` anchor: landing on one opens and scrolls to it,
 *   and the link button copies the deep link
 */
export function FaqSection() {
  const { platformName } = usePlatformBranding();
  const landingFaqs = useMemo(() => getLandingFaqs(platformName), [platformName]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(landingFaqs[0]?.id ?? null);
  const [copied, setCopied] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const categoryListRef = useRef<HTMLDivElement>(null);
  const categoryRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const categoryScrollTimerRef = useRef<number | null>(null);
  const skipInitialCategoryPersistenceRef = useRef(true);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const f of landingFaqs) map[f.category] = (map[f.category] ?? 0) + 1;
    return map;
  }, [landingFaqs]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return landingFaqs.filter((f) => {
      if (category !== "all" && f.category !== category) return false;
      if (!q) return true;
      return `${f.q} ${f.a}`.toLowerCase().includes(q);
    });
  }, [query, category, landingFaqs]);

  const pageCount = Math.max(1, Math.ceil(results.length / FAQS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const paginatedResults = results.slice(
    (currentPage - 1) * FAQS_PER_PAGE,
    currentPage * FAQS_PER_PAGE,
  );

  useEffect(() => {
    setPage(1);
  }, [query, category]);

  useEffect(() => {
    try {
      const storedCategory = window.localStorage.getItem(FAQ_CATEGORY_STORAGE_KEY);
      if (
        storedCategory !== null &&
        (storedCategory === "all" || FAQ_CATEGORIES.some((item) => item.id === storedCategory))
      ) {
        setCategory(storedCategory);
      }
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }
  }, [landingFaqs]);

  useEffect(() => {
    if (skipInitialCategoryPersistenceRef.current) {
      skipInitialCategoryPersistenceRef.current = false;
      return;
    }

    try {
      window.localStorage.setItem(FAQ_CATEGORY_STORAGE_KEY, category);
    } catch {
      // Filtering still works when browser storage is unavailable.
    }
  }, [category]);

  // Keep the selected topic visible and centred as the single-line tab list overflows.
  useEffect(() => {
    const list = categoryListRef.current;
    const activeCategory = categoryRefs.current[category];
    if (!list || !activeCategory) return;

    const listRect = list.getBoundingClientRect();
    const activeCategoryRect = activeCategory.getBoundingClientRect();
    const centeredPosition =
      list.scrollLeft +
      activeCategoryRect.left -
      listRect.left +
      activeCategoryRect.width / 2 -
      list.clientWidth / 2;
    const maximumPosition = list.scrollWidth - list.clientWidth;

    list.scrollTo({
      left: Math.max(0, Math.min(centeredPosition, maximumPosition)),
      behavior: "smooth",
    });
  }, [category]);

  useEffect(
    () => () => {
      if (categoryScrollTimerRef.current !== null) {
        window.clearTimeout(categoryScrollTimerRef.current);
      }
    },
    [],
  );

  const handleCategoryScroll = useCallback(() => {
    if (categoryScrollTimerRef.current !== null) {
      window.clearTimeout(categoryScrollTimerRef.current);
    }

    categoryScrollTimerRef.current = window.setTimeout(() => {
      const list = categoryListRef.current;
      if (!list) return;

      const listRect = list.getBoundingClientRect();
      const viewportCenter = list.scrollLeft + list.clientWidth / 2;
      const availableCategories = Object.entries(categoryRefs.current).filter(
        (entry): entry is [string, HTMLButtonElement] => entry[1] !== null,
      );
      const maximumPosition = list.scrollWidth - list.clientWidth;
      const boundaryCategory =
        list.scrollLeft <= 1
          ? availableCategories[0]
          : list.scrollLeft >= maximumPosition - 1
            ? availableCategories[availableCategories.length - 1]
            : null;

      const nearestCategory = availableCategories.reduce<{
        id: string;
        distance: number;
      } | null>((nearest, [id, element]) => {
        const elementRect = element.getBoundingClientRect();
        const itemCenter =
          list.scrollLeft + elementRect.left - listRect.left + elementRect.width / 2;
        const distance = Math.abs(itemCenter - viewportCenter);
        return !nearest || distance < nearest.distance ? { id, distance } : nearest;
      }, null);

      const nextCategory = boundaryCategory?.[0] ?? nearestCategory?.id;
      if (nextCategory) {
        setCategory((current) => (current === nextCategory ? current : nextCategory));
      }
    }, 120);
  }, []);

  // Deep link support: /#faq-<id> opens the matching question.
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash.startsWith("faq-")) return;
      const id = hash.slice(4);
      if (!landingFaqs.some((f) => f.id === id)) return;
      setQuery("");
      setCategory("all");
      setOpen(id);
      window.requestAnimationFrame(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [landingFaqs]);

  const copyLink = useCallback(async (id: string) => {
    const url = `${window.location.origin}${window.location.pathname}#faq-${id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard can be blocked; the hash update below still gives a shareable URL.
    }
    window.history.replaceState(null, "", `#faq-${id}`);
    setCopied(id);
    window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600);
  }, []);

  return (
    <section
      id="faq"
      className="section-marketing relative border-b border-border bg-background"
      ref={containerRef}
    >
      {/* <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-48 -top-40 size-[34rem] rounded-full bg-[#25D366]/7 blur-3xl" />
        <div className="absolute -right-40 bottom-0 size-[30rem] rounded-full bg-primary/6 blur-3xl" />
        <div
          className="absolute right-0 top-0 h-96 w-1/2 opacity-45"
          style={{
            backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            maskImage: "linear-gradient(to left, black, transparent)",
            WebkitMaskImage: "linear-gradient(to left, black, transparent)",
          }}
        />
      </div> */}

      <div className="container-marketing relative pb-0">
        {/* FAQ Header */}
        <div className="border-b border-border pb-8 row-bleed-marketing">
          <div className="max-w-lg">
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold uppercase text-primary">
              Answers without friction
            </span>
            <h2 className="text-marketing-title mt-4 mb-3">Answers before you ask.</h2>
            <p className="text-marketing-lede mb-0">
              Search {landingFaqs.length} practical answers across product, channels, automation,
              security, deployment, and pricing.
            </p>
          </div>
        </div>

        <div className="grid items-stretch gap-10 lg:grid-cols-[0.7fr_1fr] lg:gap-20 row-bleed-marketing px-0">
          {/* Left side content */}
          <div className="flex flex-col gap-6 px-6 py-6 sm:px-8">
            <div>
              <h4 className="font-display text-xl font-semibold">Still have a question?</h4>
              <p className="mt-3 text-sm leading-relaxed ">
                Tell us about your workflow and we'll point you to the right setup.
              </p>
            </div>
            <div>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="shrink-0 self-start sm:self-auto"
              >
                <a href="/contact">
                  Talk to our team <ArrowRight className="size-4" />
                </a>
              </Button>
            </div>
          </div>

          {/* Right side content */}
          <div className="min-w-0 border-l border-border">
            {/* search */}
            <div className="w-full max-w-full relative border-b border-border">
              <Search className=" pointer-events-none absolute left-4 top-1/2 size-4.5 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a question, feature, or topic"
                aria-label="Search frequently asked questions"
                className="h-16 pl-12 pr-12 border-0! border-transparent!"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-control text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            {/* filter chips */}
            <div
              ref={categoryListRef}
              role="tablist"
              aria-label="FAQ topics"
              onScroll={handleCategoryScroll}
              className="scrollbar-none flex touch-pan-x snap-x snap-mandatory flex-nowrap overflow-x-auto overscroll-x-contain border-b border-border bg-background"
            >
              <CategoryChip
                ref={(node) => {
                  categoryRefs.current.all = node;
                }}
                active={category === "all"}
                onClick={() => setCategory("all")}
                label="All topics"
                count={landingFaqs.length}
              />
              {FAQ_CATEGORIES.map((c) => (
                <CategoryChip
                  key={c.id}
                  ref={(node) => {
                    categoryRefs.current[c.id] = node;
                  }}
                  active={category === c.id}
                  onClick={() => setCategory(category === c.id ? "all" : c.id)}
                  label={c.label}
                  count={counts[c.id] ?? 0}
                />
              ))}
            </div>
            {/* faq rows */}
            <div className="overflow-hidden rounded-none bg-background">
              <div className="flex flex-col gap-2 border-b border-border bg-surface px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8 dark:bg-emerald-950/10">
                <p className="text-[12px] font-semibold uppercase text-foreground">
                  {results.length} {results.length === 1 ? "answer" : "answers"}
                  {category !== "all" && (
                    <span className="ml-2 font-normal normal-case text-muted-foreground">
                      in {FAQ_CATEGORIES.find((item) => item.id === category)?.label}
                    </span>
                  )}
                </p>
                <p className="text-[12px] text-muted-foreground">
                  Select a question to reveal the complete answer
                </p>
              </div>

              <div className="divide-y divide-border">
                {paginatedResults.map((f, index) => (
                  <FaqRow
                    key={f.id}
                    index={(currentPage - 1) * FAQS_PER_PAGE + index}
                    faq={f}
                    open={open === f.id}
                    copied={copied === f.id}
                    onToggle={() => setOpen(open === f.id ? null : f.id)}
                    onCopy={() => copyLink(f.id)}
                    query={query}
                  />
                ))}
              </div>

              {results.length > FAQS_PER_PAGE && (
                <nav
                  aria-label="FAQ pagination"
                  className="flex items-center justify-between border-t border-border px-5 py-4 sm:px-8"
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="size-4" />
                    Previous
                  </Button>
                  <span className="text-xs font-medium text-muted-foreground" aria-live="polite">
                    Page {currentPage} of {pageCount}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                    disabled={currentPage === pageCount}
                  >
                    Next
                    <ChevronRight className="size-4" />
                  </Button>
                </nav>
              )}

              {results.length === 0 && (
                <div className="px-6 py-16 text-center sm:px-10">
                  <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-[#015941] dark:text-emerald-400">
                    <Search className="size-5" />
                  </span>
                  <p className="mt-5 font-display font-semibold text-foreground">
                    No answers match “{query}”.
                  </p>
                  <p className="text-marketing-card-body mt-2">
                    Try a different keyword or reset the selected topic.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-5"
                    onClick={() => {
                      setQuery("");
                      setCategory("all");
                    }}
                  >
                    Reset filters
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CategoryChip({
  ref,
  active,
  label,
  count,
  onClick,
}: {
  ref: (node: HTMLButtonElement | null) => void;
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      onClick={onClick}
      aria-selected={active}
      className={cn(
        "relative inline-flex shrink-0 snap-center items-center gap-2 whitespace-nowrap border-r border-border px-5 py-4 font-semibold transition-colors sm:px-6 rounded-none",
        active
          ? "bg-muted/50 text-dark-foreground "
          : "bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      {label}
      <span
        className={cn(
          "inline-flex min-w-5 items-center justify-center rounded-full px-0.5 py-0.5 font-mono text-[10px] ",
          active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-0 bottom-0 h-0.5 bg-primary transition-opacity dark:bg-emerald-400",
          active ? "opacity-100" : "opacity-0",
        )}
      />
    </button>
  );
}

function FaqRow({
  index,
  faq,
  open,
  copied,
  onToggle,
  onCopy,
  query,
}: {
  index: number;
  faq: Faq;
  open: boolean;
  copied: boolean;
  onToggle: () => void;
  onCopy: () => void;
  query: string;
}) {
  const categoryLabel = FAQ_CATEGORIES.find((c) => c.id === faq.category)?.label ?? faq.category;
  return (
    <div
      id={`faq-${faq.id}`}
      className={cn(
        "group relative scroll-mt-28 transition-colors duration-300",
        open ? "bg-muted" : "hover:bg-muted/50",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-0.75 bg-primary transition-opacity ",
          open ? "opacity-100" : "opacity-0",
        )}
      />

      <div className="flex items-start gap-3 px-5 py-5 sm:px-8 sm:py-6">
        <span
          className={cn(
            "mt-0.5 hidden w-8 shrink-0 font-mono text-base font-medium  transition-colors sm:block",
            open ? "text-foreground" : "text-muted-foreground",
          )}
        >
          [{String(index + 1).padStart(2, "0")}]
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={`faq-panel-${faq.id}`}
          className="flex min-w-0 flex-1 items-start justify-between gap-4 text-left"
        >
          <span className="min-w-0">
            <span className="block font-display text-[14px] font-semibold leading-snug text-foreground sm:text-[15px]">
              <Highlight text={faq.q} query={query} />
            </span>
            <span className="mt-1.5 block text-[12px] font-semibold uppercase text-muted-foreground sm:hidden">
              {categoryLabel}
            </span>
          </span>
          <span
            className={cn(
              "grid size-6 shrink-0 place-items-center rounded-full border transition-all duration-300",
              open
                ? "rotate-45 "
                : "border-border bg-background text-muted-foreground group-hover:text-foreground",
            )}
          >
            <Plus className="size-3" strokeWidth={1.5} />
          </span>
        </button>
        <button
          type="button"
          onClick={onCopy}
          aria-label={`Copy link to “${faq.q}”`}
          title="Copy link to this answer"
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-full border transition-all duration-300",
            open ? "opacity-100" : "opacity-50 group-hover:opacity-100",
          )}
        >
          {copied ? (
            <Check className="size-3.5 text-[#015941] dark:text-emerald-400" />
          ) : (
            <Link2 className="size-3.5" />
          )}
        </button>
      </div>

      <div
        id={`faq-panel-${faq.id}`}
        aria-hidden={!open}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-7 sm:pl-[4.75rem] sm:pr-24">
            <p className="leading-7 text-muted-foreground">
              <Highlight text={faq.a} query={query} />
            </p>
            <span className="mt-4 hidden w-fit rounded-full border border-[#015941]/15 bg-background px-2.5 py-1 text-[9px] font-semibold uppercase text-[#015941] sm:inline-flex dark:text-emerald-400">
              {categoryLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Highlights the active search term inside a string. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-primary/15 text-foreground">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}
