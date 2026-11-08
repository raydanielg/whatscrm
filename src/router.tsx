import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import { auditQueryFailure } from "@/lib/security/audit-telemetry";
import { orgScopedQueryKeyHashFn } from "@/lib/query/org-scope";
import { retryTransient, retryDelayTransient } from "@/lib/net/client-throttle";
import { createRouter, Link } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { usePlatformBranding } from "@/hooks/use-platform-branding";

function DefaultNotFound() {
  const brand = usePlatformBranding();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-xs uppercase text-muted-foreground">{brand.platformName}</p>
        <h1 className="mt-4 font-display text-7xl font-semibold">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">This page doesn't exist.</p>
        <Link to="/" className="mt-6 inline-flex rounded-control bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Return home</Link>
      </div>
    </div>
  );
}

const RELOAD_FLAG = "platform.chunk-reload";

function isStaleChunkError(error: Error) {
  const msg = `${error?.message ?? ""}`;
  return (
    /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i.test(msg)
  );
}

function DefaultError({ error: rawError, reset }: { error: unknown; reset: () => void }) {
  const error = rawError instanceof Error ? rawError : new Error(String(rawError));
  if (import.meta.env.DEV) console.error(error);
  if (typeof window !== "undefined" && isStaleChunkError(error)) {
    if (!window.sessionStorage.getItem(RELOAD_FLAG)) {
      window.sessionStorage.setItem(RELOAD_FLAG, "1");
      window.location.reload();
    }
  }
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h2 className="font-display text-xl font-semibold">Something went wrong</h2>
        <p className="mt-2 text-sm text-muted-foreground">{(error as Error).message || "Please try again."}</p>
        <button
          onClick={() => {
            if (typeof window !== "undefined") window.sessionStorage.removeItem(RELOAD_FLAG);
            reset();
          }}
          className="mt-6 rounded-control border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

export const getRouter = () => {
  const queryCache = new QueryCache({
    onError: (error, query) => {
      auditQueryFailure(error, { operation: "read", queryKey: query.queryKey });
    },
  });
  const mutationCache = new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      auditQueryFailure(error, {
        operation: "write",
        queryKey: mutation.options.mutationKey,
      });
    },
  });

  const queryClient = new QueryClient({
    queryCache,
    mutationCache,
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: retryTransient,
        retryDelay: retryDelayTransient,
        queryKeyHashFn: orgScopedQueryKeyHashFn,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultError,
    defaultNotFoundComponent: DefaultNotFound,
  });

  return router;
};
