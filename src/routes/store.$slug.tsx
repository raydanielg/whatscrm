import { createFileRoute, Link } from "@tanstack/react-router";
import { getPluginBySlug } from "@/lib/plugins/plugins.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { BRAND_NAME } from "@/lib/branding/brand";
import { formatListingPrice } from "./store.index";
import { ArrowLeft, CheckCircle2, ShieldCheck, Star } from "lucide-react";
import { useTenantCurrency } from "@/hooks/use-currency";
import { useBrandName } from "@/hooks/use-brand-name";

export const Route = createFileRoute("/store/$slug")({
  loader: ({ params }) => getPluginBySlug({ data: { slug: params.slug } }),
  errorComponent: () => (
    <main className="mx-auto max-w-3xl p-10 text-center space-y-3">
      <h1 className="text-2xl font-semibold">Listing not available</h1>
      <Link to="/store" className="underline">
        Back to the store
      </Link>
    </main>
  ),
  notFoundComponent: () => <main className="p-10 text-center">Listing not found</main>,
  head: ({ loaderData }) => {
    const p: any = (loaderData as any)?.plugin;
    const title = p ? `${p.name} — ${BRAND_NAME} Store` : `${BRAND_NAME} Store`;
    const description = p?.tagline ?? "Plugin details, pricing and installation steps.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "product" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: PublicListing,
});

function PublicListing() {
  const brandName = useBrandName();
  const platformCurrency = useTenantCurrency();
  const { plugin, versions } = Route.useLoaderData() as any;

  return (
    <main className="mx-auto w-full max-w-4xl p-6 space-y-8">
      <Link to="/store" className="text-sm text-muted-foreground inline-flex items-center gap-1">
        <ArrowLeft className="size-4" /> All plugins
      </Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{plugin.name}</h1>
          {plugin.is_verified ? (
            <Badge variant="secondary">
              <ShieldCheck className="size-3 " />
              Verified
            </Badge>
          ) : null}
          <Badge variant="outline">{plugin.category}</Badge>
        </div>
        <p className="text-muted-foreground text-lg">{plugin.tagline}</p>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-xl font-semibold">
            {formatListingPrice(
              plugin.price_cents,
              plugin.currency || platformCurrency,
              plugin.pricing_model,
            )}
          </span>
          <span className="text-muted-foreground flex items-center gap-1">
            <Star className="size-3" />
            {Number(plugin.rating_avg ?? 0).toFixed(1)} ({plugin.rating_count ?? 0})
          </span>
          <span className="text-muted-foreground">{plugin.install_count ?? 0} installs</span>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link to="/marketplace/plugins/$slug" params={{ slug: plugin.slug }}>
            <Button>Sign in to install</Button>
          </Link>
          <Link to="/pricing">
            <Button variant="outline">See platform pricing</Button>
          </Link>
        </div>
      </header>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-xl font-medium">About this plugin</h2>
        <p className="text-muted-foreground whitespace-pre-line">{plugin.description}</p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How to install</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          {[
            `Create or sign in to your ${brandName} account.`,
            "Open Marketplace → Plugins and find this listing.",
            plugin.price_cents
              ? "Choose Buy now and complete secure checkout — your licence is issued automatically."
              : "Choose Get for free — the licence is granted instantly.",
            "Press Install to add it to your workspace, then configure it in Settings.",
          ].map((step, i) => (
            <p key={i} className="flex gap-2">
              <CheckCircle2 className="size-4 mt-0.5 text-primary shrink-0" />
              <span>{step}</span>
            </p>
          ))}
        </CardContent>
      </Card>

      {versions?.length ? (
        <section className="space-y-2">
          <h2 className="text-xl font-medium">Releases</h2>
          <ul className="text-sm text-muted-foreground space-y-1">
            {versions.slice(0, 5).map((v: any) => (
              <li key={v.id}>
                v{v.version} —{" "}
                {v.published_at ? new Date(v.published_at).toLocaleDateString() : "unreleased"}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
