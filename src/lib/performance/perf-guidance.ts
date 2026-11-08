import type { PerfCategory } from "./performance-center.functions";

/**
 * General performance guidance. This is advice, not measurement: it carries no
 * severity and never affects the score. (It used to be mixed into the findings
 * list with "ok" / "warning" badges computed from invented numbers.)
 */
export type PerfGuidance = { id: string; category: PerfCategory; title: string; detail: string };

export const PERFORMANCE_GUIDANCE: PerfGuidance[] = [
  {
    id: "lazy-routes", category: "lazy-loading", title: "Route-level code splitting",
    detail: "TanStack Start splits route components automatically. Keep loaders in the critical chunk, put heavy panels behind React.lazy + Suspense, and preload on hover or intent.",
  },
  {
    id: "component-split", category: "code-splitting", title: "Split heavy components",
    detail: "Load rich editors, chart libraries, PDF renderers and emoji pickers with dynamic import(). Never import them at module scope in __root.tsx.",
  },
  {
    id: "images", category: "images", title: "Optimise images",
    detail: "Serve AVIF/WebP variants, lazy-load below-the-fold images with loading=\"lazy\" decoding=\"async\", and give every image explicit dimensions to avoid layout shift.",
  },
  {
    id: "caching", category: "caching", title: "Cache read-heavy queries",
    detail: "Raise TanStack Query staleTime for data that rarely changes, send Cache-Control on /api/public/* responses, and cache public pages at the edge.",
  },
  {
    id: "db-indexes", category: "database", title: "Index what RLS and lists filter on",
    detail: "Make sure workspace_id, created_at, conversation_id, assignee columns and the foreign keys used by RLS policies are indexed. Use pg_stat_statements to find slow queries.",
  },
  {
    id: "realtime", category: "realtime", title: "Keep realtime channels coarse",
    detail: "Prefer one channel per conversation or per workspace over per-row channels, tear channels down on unmount, and filter high-fanout events server-side.",
  },
  {
    id: "virtualization", category: "virtualization", title: "Virtualise long lists",
    detail: "Use @tanstack/react-virtual for the inbox, contacts, activities and audit logs so only visible rows are rendered.",
  },
  {
    id: "pagination", category: "pagination", title: "Keyset pagination",
    detail: "Prefer useInfiniteQuery with a created_at cursor over offset pagination — it stays fast as tables grow.",
  },
  {
    id: "queues", category: "queues", title: "Make jobs retry-safe",
    detail: "Give queued work exponential backoff, dead-letter isolation and idempotency keys so provider webhooks and retries cannot double-process.",
  },
  {
    id: "api", category: "api", title: "Trim API responses",
    detail: "Batch server functions where you can, select only the columns you need, and stream long responses instead of buffering them.",
  },
];
