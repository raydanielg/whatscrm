import { Brand } from "@/components/brand";
import { BRAND_NAME } from "@/lib/branding/brand";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TenantAccentProvider } from "@/lib/themes/tenant-accent";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useNavigate,
  HeadContent,
  Scripts,
  retainSearchParams,
} from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { OrgUrlSync } from "@/lib/tenant/org-url-sync";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "sonner";
import { MediaLightboxProvider } from "@/components/ui/media-lightbox";
import { IdleLogoutSentinel } from "@/hooks/use-idle-logout";
import { clearActiveOrgState, hydrateActiveOrgFromProfile } from "@/hooks/use-organization";
import { setCurrentUserId } from "@/lib/storage/active-user";
import { auditAuthEvent } from "@/lib/security/audit-telemetry";
import { MARKETING_PATHS } from "@/lib/auth/marketing-redirect";

import { ThemeProvider } from "@/shared/providers/theme-provider";
import { DemoModeBanner } from "@/components/demo-mode-banner";
import { CookieConsentBanner } from "@/components/cookie-consent-banner";
import { PwaProvider } from "@/components/pwa/pwa-provider";
import { PlatformBrandingApplier } from "@/components/platform-branding-applier";
import { platformBrandingQueryOptions } from "@/hooks/use-platform-branding";
import { AnalyticsProvider } from "@/components/analytics/analytics-provider";
import { PlatformMaintenanceGate } from "@/components/platform-maintenance-gate";
import { RouteProgressBar } from "@/components/app/route-progress-bar";

import { initInstallPromptCapture } from "@/lib/pwa/install";

const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var t=localStorage.getItem('wacrm:theme');if(t!=='light'&&t!=='dark'&&t!=='system')t='system';var r=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;var e=document.documentElement;e.classList.remove('light','dark');e.classList.add(r);e.dataset.theme=r;e.dataset.colorMode=t;e.style.colorScheme=r}catch(e){}})()`;

/**
 * Strip TanStack pathless layout segments (leading underscore, e.g.
 * `_authenticated`, `_admin`) from a URL path. Returns the suggested public
 * path when at least one segment was stripped, otherwise null.
 */
function suggestPublicPath(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  const cleaned = segments.filter((seg) => !seg.startsWith("_"));
  if (cleaned.length === segments.length) return null;
  const rebuilt = "/" + cleaned.join("/");
  return rebuilt === pathname ? null : rebuilt || "/";
}

function NotFoundComponent() {
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/";
  const search = typeof window !== "undefined" ? window.location.search : "";
  const hash = typeof window !== "undefined" ? window.location.hash : "";
  const suggested = suggestPublicPath(pathname);
  const suggestedHref = suggested ? `${suggested}${search}${hash}` : null;

  // Redirect synchronously during render — no visible "Redirecting" flash.
  if (suggestedHref && typeof window !== "undefined") {
    window.location.replace(suggestedHref);
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-xs uppercase text-muted-foreground">
          <Brand />
        </p>
        <h1 className="mt-4 font-display text-7xl font-semibold text-foreground">404</h1>
        <h2 className="mt-2 text-lg font-medium text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          We couldn't find{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            {pathname}
          </code>
          .
        </p>

        {suggestedHref && (
          <div className="mt-5 rounded-control border border-border bg-muted/40 p-4 text-left">
            <p className="text-xs font-medium uppercase text-muted-foreground">Did you mean</p>
            <p className="mt-1 text-sm text-foreground">
              <code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs">
                {suggested}
              </code>
              ?
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Paths starting with an underscore (like{" "}
              <code className="font-mono">_authenticated</code>) are internal layout segments — they
              aren't part of the real URL.
            </p>
            <a
              href={suggestedHref}
              className="mt-3 inline-flex items-center justify-center rounded-control bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Go to {suggested}
            </a>
          </div>
        )}

        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-control border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted hover:text-foreground"
          >
            Return home
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Redact a URL path so it never contains query params, hashes, tokens, emails,
 * or long ID-shaped segments before we render or log it.
 */
function sanitizePath(rawPath: string): string {
  try {
    // Drop query + hash — they commonly carry tokens, emails, invite codes.
    const pathOnly = rawPath.split("?")[0].split("#")[0] || "/";
    const segments = pathOnly.split("/").map((seg) => {
      if (!seg) return seg;
      // UUID
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return ":id";
      // JWT-ish / very long tokens
      if (seg.length > 40) return ":token";
      // Numeric IDs
      if (/^\d{4,}$/.test(seg)) return ":id";
      // Emails
      if (/@/.test(seg)) return ":email";
      return seg;
    });
    const joined = segments.join("/") || "/";
    return joined.length > 120 ? `${joined.slice(0, 117)}` : joined;
  } catch {
    return "/";
  }
}

function makeErrorId(path: string, error: Error): string {
  const input = `${path}:${error?.name ?? "Error"}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).slice(0, 8).padStart(8, "0");
}

function ErrorComponent({ error: rawError, reset }: { error: unknown; reset: () => void }) {
  const error = rawError instanceof Error ? rawError : new Error(String(rawError));
  const router = useRouter();
  const rawPath =
    typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}${window.location.hash}`
      : "/";
  const path = sanitizePath(rawPath);
  // Short correlation id so users can quote it in support requests without
  // us exposing the underlying error message or stack.
  const errorId = makeErrorId(path, error);

  // Log the raw error to the console (dev tools + server logs pick this up)
  // with a short correlation id for support.
  console.error(`[route-error ${errorId}] ${path}`, error);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-xs uppercase text-muted-foreground">
          <Brand />
        </p>
        <h1 className="mt-4 font-display text-2xl font-semibold text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong while loading{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            {path}
          </code>
          . Try again or head back home.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Reference: <span className="font-mono">{errorId}</span>
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-control bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-control border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted hover:text-foreground"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: ({ context }) => context.queryClient.ensureQueryData(platformBrandingQueryOptions()),
  // Global search param: the active organization id. Declared at the root
  // so every child route inherits the typed slot and TanStack Router keeps
  // it in the URL across navigations (see `retainSearchParams` below).
  validateSearch: zodValidator(
    z.object({
      org: z
        .string()
        .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
        .optional(),
    }),
  ),
  search: { middlewares: [retainSearchParams(["org"])] },
  head: ({ loaderData: brand }) => {
    const brandName = brand?.platformName ?? BRAND_NAME;
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { title: `${brandName} — The AI-Powered WhatsApp CRM Platform` },
        {
          name: "description",
          content: `${brandName} is the modern, self-hosted WhatsApp CRM for sales, support, marketing, and AI automation. Enterprise-grade, multi-tenant, production-ready.`,
        },
        { name: "author", content: brandName },
        { property: "og:title", content: `${brandName} — The AI-Powered WhatsApp CRM` },
        {
          property: "og:description",
          content:
            "Sales, support, marketing, and AI automation on one WhatsApp CRM. Self-hosted, multi-tenant, enterprise-ready.",
        },
        { property: "og:type", content: "website" },
        { property: "og:site_name", content: brandName },
        { property: "og:image", content: "/og-image.png" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: `${brandName} — The AI-Powered WhatsApp CRM` },
        {
          name: "twitter:description",
          content: "Modern WhatsApp CRM for sales, support, marketing, and AI automation.",
        },
        { name: "twitter:image", content: "/og-image.png" },
        { name: "application-name", content: brandName },
        { name: "apple-mobile-web-app-title", content: brandName },
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "icon", href: brand?.faviconUrl ?? "/favicon.png" },
        { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
        { rel: "manifest", href: "/api/public/manifest.webmanifest" },
      ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    let activeAuthUserId: string | null | undefined;
    // On boot, adopt whatever session Supabase already restored so
    // `getActiveOrgId()` can key by user id before the first auth event
    // fires. This is what keeps the correct org selected after a hard
    // reload of an already-signed-in tab.
    void supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null;
      setCurrentUserId(uid);
      if (uid) void hydrateActiveOrgFromProfile(uid);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const nextAuthUserId = session?.user?.id ?? null;
      if (event === "INITIAL_SESSION") activeAuthUserId = nextAuthUserId;
      // Recheck a marketing route after initial session hydration so a direct
      // visit or OAuth return enters the app.
      if (
        event === "INITIAL_SESSION" &&
        session &&
        MARKETING_PATHS.includes(router.state.location.pathname as (typeof MARKETING_PATHS)[number])
      ) {
        router.invalidate();
        return;
      }
      // Supabase can emit SIGNED_IN again when a tab regains focus. Refresh
      // app data only when the signed-in identity actually changes.
      if (event === "SIGNED_IN" && activeAuthUserId === nextAuthUserId) return;
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        activeAuthUserId = nextAuthUserId;
      }
      // Security audit trail: record identity transitions (incl. password
      // recovery + MFA) before any cache/router work so a sign-out still
      // carries the outgoing user id.
      if (
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "USER_UPDATED" ||
        event === "PASSWORD_RECOVERY" ||
        event === "MFA_CHALLENGE_VERIFIED"
      ) {
        auditAuthEvent(event, {
          userId: session?.user?.id ?? null,
          email: session?.user?.email ?? null,
        });
      }
      // Filter to identity transitions only. TOKEN_REFRESHED (~hourly + tab
      // focus) and INITIAL_SESSION (every mount) would thrash router + cache.
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      if (event === "SIGNED_OUT") {
        // Purge tenant-scoped browser state before router.invalidate() so any
        // refetch sees a clean slate (no stale active org id, no cached data).
        clearActiveOrgState();
        setCurrentUserId(null);
        queryClient.clear();
        router.invalidate();
        // Do NOT invalidateQueries on SIGNED_OUT — refetching against a
        // cleared session storms the app with 401s.
        return;
      }
      const uid = session?.user?.id ?? null;
      setCurrentUserId(uid);
      if (uid) void hydrateActiveOrgFromProfile(uid);
      router.invalidate();
      queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  useEffect(() => {
    return initInstallPromptCapture();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TenantAccentProvider>
          <MediaLightboxProvider>
            <PlatformBrandingApplier />
            <RouteProgressBar />
            <AnalyticsProvider />
            <DemoModeBanner />
            <PwaProvider />
            <OrgUrlSync />
            <PlatformMaintenanceGate>
              <Outlet />
            </PlatformMaintenanceGate>

            <IdleLogoutSentinel />
            <CookieConsentBanner />
            <Toaster position="top-right" richColors closeButton />
          </MediaLightboxProvider>
        </TenantAccentProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
