/**
 * Public booking page (multi-service) — /book/p/$pageSlug
 * Service selection screen powered by booking_pages + its event_type_ids.
 */
import { Brand } from "@/components/brand";
import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, MapPin, ArrowRight, Loader2 } from "lucide-react";
import { ThemeToggle } from "@/components/app/booking/public/theme-toggle";
import { brandStyle, useBookingTheme } from "@/components/app/booking/public/theme";

type Page = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  brand_color: string | null;
  logo_url: string | null;
  theme: { mode?: "light" | "dark" } | null;
};
type EventType = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  duration_minutes: number;
  location_kind: string;
  color: string | null;
  price: number | null;
  currency: string | null;
  category: string | null;
};

export const Route = createFileRoute("/book/p/$pageSlug")({
  ssr: false,
  loader: async ({ params }) => {
    const res = await fetch(`/api/public/booking/page?slug=${encodeURIComponent(params.pageSlug)}`);
    if (!res.ok) throw notFound();
    const j = (await res.json()) as { page: Page; eventTypes: EventType[] };
    return j;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.page.title} · Book` : "Book" },
      {
        name: "description",
        content: loaderData?.page.description ?? "Choose a service and pick a time.",
      },
      { property: "og:title", content: loaderData?.page.title ?? "Book" },
      { property: "og:description", content: loaderData?.page.description ?? "Choose a service." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "index, follow" },
    ],
    links: loaderData ? [{ rel: "canonical", href: `/book/p/${loaderData.page.slug}` }] : [],
  }),
  component: PublicMultiServicePage,
  notFoundComponent: () => (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="text-center">
        <h1 className="text-2xl font-semibold mb-2">Page not found</h1>
        <p className="text-muted-foreground">This booking page is no longer active.</p>
      </div>
    </div>
  ),
});

function PublicMultiServicePage() {
  const { page, eventTypes } = Route.useLoaderData() as {
    page: Page;
    eventTypes: EventType[];
  };
  const brand = page.brand_color ?? "#075E54";
  const defaultTheme = page.theme?.mode ?? "light";
  // Ensure the html.dark class syncs with page default on first mount
  const { theme } = useBookingTheme(defaultTheme);
  const [tz, setTz] = useState("UTC");
  useEffect(() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone), []);

  return (
    <div className="min-h-screen bg-background text-foreground" style={brandStyle(brand)}>
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-header flex items-center justify-between">
          <div className="flex items-center gap-3">
            {page.logo_url ? (
              <img
                src={page.logo_url}
                alt={`${page.title} logo`}
                className="h-8 w-8 rounded-control object-cover"
              />
            ) : (
              <div className="h-8 w-8 rounded-control" style={{ background: brand }} />
            )}
            <span className="font-semibold text-sm">{page.title}</span>
          </div>
          <ThemeToggle defaultTheme={defaultTheme} />
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-4 md:p-8">
        <div className="mb-6">
          <div className="h-1.5 w-12 rounded-full mb-4" style={{ background: brand }} />
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">{page.title}</h1>
          {page.description && (
            <p className="text-muted-foreground mt-2 max-w-2xl">{page.description}</p>
          )}
          <p className="text-xs text-muted-foreground mt-2">Detected timezone: {tz}</p>
        </div>

        {eventTypes.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <Loader2 className="h-5 w-5" />
              No services available on this page yet.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {eventTypes.map((et) => (
              <Link
                key={et.id}
                to="/book/$slug"
                params={{ slug: et.slug }}
                className="group"
              >
                <Card className="transition-all group-hover:border-foreground group-hover:shadow-none">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div
                          className="h-1 w-8 rounded-full mb-2"
                          style={{ background: et.color ?? brand }}
                        />
                        <h2 className="font-semibold text-lg leading-tight truncate">{et.name}</h2>
                        {et.category && (
                          <p className="text-[11px] uppercase text-muted-foreground mt-1">
                            {et.category}
                          </p>
                        )}
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 mt-2 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </div>
                    {et.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{et.description}</p>
                    )}
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {et.duration_minutes} min
                      </span>
                      <span className="flex items-center gap-1 capitalize">
                        <MapPin className="h-3.5 w-3.5" />
                        {String(et.location_kind).replace(/_/g, " ")}
                      </span>
                      {et.price != null && et.price > 0 && (
                        <span className="font-medium text-foreground">
                          {et.price} {et.currency ?? ""}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        <p className="text-xs text-center text-muted-foreground mt-8">
          Theme: {theme} · Powered by <span className="font-medium"><Brand /></span>
        </p>
      </div>
    </div>
  );
}
