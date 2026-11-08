import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listPluginCatalog } from "@/lib/plugins/plugins.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/brand";
import { useBrandName } from "@/hooks/use-brand-name";
import { Package, Search, Star, ShieldCheck } from "lucide-react";
import { useTenantCurrency } from "@/hooks/use-currency";

/**
 * `currency` is the listing's own, resolved by the caller against the platform
 * default — this helper no longer substitutes dollars for a missing one.
 */
export function formatListingPrice(priceCents: number, currency: string, pricingModel: string) {
  if (!priceCents) return "Free";
  const amount = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(priceCents / 100);
  return pricingModel === "subscription" ? `${amount}/mo` : `${amount} one-time`;
}

export const Route = createFileRoute("/store/")({
  loader: async () => listPluginCatalog({ data: { limit: 100 } }),
  errorComponent: () => (
    <main className="mx-auto max-w-3xl p-10 text-center">
      <h1 className="text-2xl font-semibold">Store unavailable</h1>
      <p className="text-muted-foreground mt-2">Please try again in a moment.</p>
    </main>
  ),
  notFoundComponent: () => <main className="p-10 text-center">Not found</main>,
  head: () => ({
    meta: [
      { title: "Plugin Store — Plugins, Add-ons & Pricing" },
      {
        name: "description",
        content:
          "Browse plugins for WhatsApp, social scheduling, AI, automation, helpdesk and commerce. See pricing and install pages — no account needed to look.",
      },
      { property: "og:title", content: "Plugin Store — Plugins & Add-ons" },
      {
        property: "og:description",
        content: "Public plugin catalog with pricing and install guides.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PublicStore,
});

function PublicStore() {
  const brandName = useBrandName();
  const platformCurrency = useTenantCurrency();
  const initial = Route.useLoaderData();
  const { data } = useQuery({
    queryKey: ["public-store-catalog"],
    queryFn: () => listPluginCatalog({ data: { limit: 100 } }),
    initialData: initial,
  });
  const [q, setQ] = useState("");

  const plugins = useMemo(() => {
    const rows = (data?.plugins ?? []) as any[];
    const term = q.trim().toLowerCase();
    return term
      ? rows.filter((p) => `${p.name} ${p.tagline ?? ""} ${p.category}`.toLowerCase().includes(term))
      : rows;
  }, [data, q]);

  return (
    <main className="mx-auto w-full max-w-6xl p-6 space-y-8">
      <header className="space-y-3 pt-6">
        <h1 className="text-4xl font-semibold tracking-tight">
          <Brand /> Store
        </h1>
        <p className="text-muted-foreground max-w-2xl">
          Every plugin that extends {brandName} — messaging, social publishing, AI, automation, support and
          commerce. Browse freely; you only need an account to install.
        </p>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search plugins" className="pl-9" />
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plugins.map((p: any) => (
          <Card key={p.id} className="flex flex-col">
            <CardHeader className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-lg">{p.name}</CardTitle>
                {p.is_verified ? (
                  <Badge variant="secondary" className="shrink-0">
                    <ShieldCheck className="size-3 " />
                    Verified
                  </Badge>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">{p.tagline}</p>
            </CardHeader>
            <CardContent className="mt-auto space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {formatListingPrice(p.price_cents, p.currency || platformCurrency, p.pricing_model)}
                </span>
                <span className="text-muted-foreground flex items-center gap-1">
                  <Star className="size-3" />
                  {Number(p.rating_avg ?? 0).toFixed(1)}
                </span>
              </div>
              <Link to="/store/$slug" params={{ slug: p.slug }} className="block">
                <Button className="w-full">
                  <Package className="size-4 mr-2" />
                  View &amp; install
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
        {!plugins.length ? (
          <p className="text-muted-foreground">No listings match your search.</p>
        ) : null}
      </section>
    </main>
  );
}
