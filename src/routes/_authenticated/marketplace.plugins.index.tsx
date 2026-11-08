import { BRAND_NAME } from "@/lib/branding/brand";
import { useBrandName } from "@/hooks/use-brand-name";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listPluginCatalog, listMyInstalledPlugins } from "@/lib/plugins/plugins.functions";
import { AppTopbar } from "@/components/app/app-topbar";
import { ActionBar } from "@/components/app/action-bar";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BuyNowButton } from "@/components/app/marketplace/buy-now-button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Star,
  Search,
  Package,
  Sparkles,
  Filter,
  Flame,
  Clock,
  CheckCircle2,
  Shield,
  Users,
  Bot,
  Workflow,
  Megaphone,
  MessageCircle,
  Instagram,
  Send,
  BarChart3,
  ShoppingBag,
  CreditCard,
  Palette,
  Wrench,
  LayoutGrid,
} from "lucide-react";
import { useTenantCurrency } from "@/hooks/use-currency";

type CatKey =
  | "all"
  | "crm"
  | "ai"
  | "automation"
  | "marketing"
  | "whatsapp"
  | "instagram"
  | "messenger"
  | "telegram"
  | "analytics"
  | "commerce"
  | "payments"
  | "themes"
  | "utilities";

const CATEGORIES: { key: CatKey; label: string; icon: any }[] = [
  { key: "all", label: "All", icon: LayoutGrid },
  { key: "crm", label: "CRM", icon: Users },
  { key: "ai", label: "AI", icon: Bot },
  { key: "automation", label: "Automation", icon: Workflow },
  { key: "marketing", label: "Marketing", icon: Megaphone },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { key: "instagram", label: "Instagram", icon: Instagram },
  { key: "messenger", label: "Messenger", icon: MessageCircle },
  { key: "telegram", label: "Telegram", icon: Send },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "commerce", label: "Commerce", icon: ShoppingBag },
  { key: "payments", label: "Payments", icon: CreditCard },
  { key: "themes", label: "Themes", icon: Palette },
  { key: "utilities", label: "Utilities", icon: Wrench },
];

type PriceFilter = "any" | "free" | "paid";

export const Route = createFileRoute("/_authenticated/marketplace/plugins/")({
  staticData: { breadcrumb: "Plugin Marketplace" },
  head: () => ({
    meta: [
      { title: `Plugin Marketplace — Extend ${BRAND_NAME}` },
      {
        name: "description",
        content:
          "Browse free and commercial plugins for CRM, AI, automation, WhatsApp, commerce, payments, themes and more.",
      },
    ],
  }),
  component: PluginMarketplaceIndex,
});

function PluginMarketplaceIndex() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CatKey>("all");
  const [tab, setTab] = useState<"featured" | "popular" | "new" | "installed">("featured");
  const [price, setPrice] = useState<PriceFilter>("any");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const sort = tab === "new" ? "new" : tab === "popular" ? "top" : "rated";

  const { data, isLoading } = useQuery({
    queryKey: ["plugin-catalog", category, sort, search],
    queryFn: () =>
      listPluginCatalog({
        data: {
          category: category === "all" ? undefined : category,
          sort: sort as any,
          search: search || undefined,
          limit: 100,
        },
      }),
  });

  const { data: installedData } = useQuery({
    queryKey: ["plugin-installed"],
    queryFn: () => listMyInstalledPlugins({}),
  });
  const installedIds = useMemo(
    () => new Set((installedData?.installations ?? []).map((i: any) => i.plugin_id)),
    [installedData],
  );

  const all = data?.plugins ?? [];
  const filtered = useMemo(() => {
    return all.filter((p: any) => {
      if (verifiedOnly && !p.is_verified) return false;
      if (price === "free" && !(p.pricing_model === "free" || p.price_cents === 0)) return false;
      if (price === "paid" && (p.pricing_model === "free" || p.price_cents === 0)) return false;
      return true;
    });
  }, [all, price, verifiedOnly]);

  const brandName = useBrandName();
  const featured = filtered.filter((p: any) => p.is_featured);
  const popular = [...filtered].sort(
    (a: any, b: any) => (b.install_count ?? 0) - (a.install_count ?? 0),
  );
  const fresh = [...filtered].sort(
    (a: any, b: any) => +new Date(b.created_at) - +new Date(a.created_at),
  );
  const installedPlugins = (installedData?.installations ?? [])
    .map((i: any) => i.plugins)
    .filter(Boolean);

  const visible =
    tab === "featured"
      ? featured.length
        ? featured
        : filtered
      : tab === "popular"
        ? popular
        : tab === "new"
          ? fresh
          : installedPlugins;

  return (
    <>
      <AppTopbar
        title="Plugin Marketplace"
        subtitle={`Free and commercial plugins to extend every part of ${brandName}.`}
        actions={
          <ActionBar
            primary={[
              <Link key="publish" to="/developer/plugins">
                <Button variant="outline">
                  <Sparkles className="size-4 mr-2" />
                  Publish a plugin
                </Button>
              </Link>,
              <Link key="manage" to="/settings/plugin-management">
                <Button variant="outline">
                  <Wrench className="size-4 mr-2" />
                  Manage installed
                </Button>
              </Link>,
            ]}
            overflow={[
              <DropdownMenuItem key="store" asChild>
                <Link to="/store">
                  <Package className="size-4 mr-2" />
                  Public store page
                </Link>
              </DropdownMenuItem>,
            ]}
          />
        }
      />
      <main className="mx-auto max-w-7xl w-full p-6 space-y-6">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Browse plugins</h2>
            <p className="text-muted-foreground mt-1">
              Extend CRM, AI, automation, WhatsApp, commerce, payments, themes and more.
            </p>
          </div>
        </header>

        {/* Search + filters */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search plugins by name, tag, or publisher"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-xs border p-0.75 h-9">
              {(["any", "free", "paid"] as PriceFilter[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPrice(p)}
                  className={`px-2.5 h-7 text-xs rounded-xs capitalize ${price === p ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  {p === "any" ? "Any price" : p}
                </button>
              ))}
            </div>
            <Button
              variant={verifiedOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setVerifiedOnly((v) => !v)}
            >
              <Shield className="size-4 mr-2" />
              Verified
            </Button>
          </div>
        </div>

        {/* Category rail */}
        <ScrollArea
          orientation="horizontal"
          type="hover"
          className="w-full"
          viewportClassName="pb-2 -mx-1 px-1"
          aria-label="Plugin categories"
        >
          <div className="flex w-max gap-2">
            {CATEGORIES.map((c) => {
              const Icon = c.icon;
              const active = category === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => setCategory(c.key)}
                  className={`shrink-0 flex items-center gap-2 h-9 px-3 rounded-control border text-sm transition-colors ${
                    active ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
                  }`}
                >
                  <Icon className="size-4" />
                  {c.label}
                </button>
              );
            })}
          </div>
        </ScrollArea>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="featured">
              <Sparkles className="size-4 mr-1.5" />
              Featured
            </TabsTrigger>
            <TabsTrigger value="popular">
              <Flame className="size-4 mr-1.5" />
              Popular
            </TabsTrigger>
            <TabsTrigger value="new">
              <Clock className="size-4 mr-1.5" />
              New
            </TabsTrigger>
            <TabsTrigger value="installed">
              <CheckCircle2 className="size-4 mr-1.5" />
              Installed
              {installedIds.size > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[11px]">
                  {installedIds.size}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-6">
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Card key={i} className="animate-pulse h-56 bg-muted/40" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <EmptyState tab={tab} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {visible.map((p: any) => (
                  <PluginCard key={p.id} plugin={p} installed={installedIds.has(p.id)} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}

function PluginCard({ plugin: p, installed }: { plugin: any; installed: boolean }) {
  const tenantCurrency = useTenantCurrency();
  const isFree = p.pricing_model === "free" || p.price_cents === 0;
  return (
    <Link to="/marketplace/plugins/$slug" params={{ slug: p.slug }}>
      <Card className="h-full hover:border-primary hover:shadow-sm transition-all">
        {p.banner_url && (
          <div className="h-24 w-full overflow-hidden rounded-t-xl">
            <img src={p.banner_url} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            {p.icon_url ? (
              <img src={p.icon_url} alt="" className="size-11 rounded-control object-cover shrink-0" />
            ) : (
              <div className="size-11 rounded-control bg-muted flex items-center justify-center shrink-0">
                <Package className="size-5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base truncate flex items-center gap-1.5">
                {p.name}
                {installed && <CheckCircle2 className="size-3.5 text-green-500 shrink-0" />}
              </CardTitle>
              <p className="text-xs text-muted-foreground truncate">
                by {p.publisher_name ?? "Community"}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
            {p.tagline ?? p.description ?? "—"}
          </p>
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1 text-amber-500">
              <Star className="size-3.5 fill-current" />
              <span className="font-medium">{Number(p.rating_avg ?? 0).toFixed(1)}</span>
              <span className="text-muted-foreground">({p.rating_count})</span>
            </div>
            <span className="text-muted-foreground">
              {(p.install_count ?? 0).toLocaleString()} installs
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {p.is_verified && (
              <Badge variant="secondary" className="text-[11px]">
                <Shield className="size-2.5 " />
                Verified
              </Badge>
            )}
            {p.is_featured && <Badge className="text-[11px]">Featured</Badge>}
            <Badge variant={isFree ? "outline" : "default"} className="text-[11px] capitalize">
              {isFree
                ? "Free"
                : `$${(p.price_cents / 100).toFixed(2)} · ${p.pricing_model.replace("_", " ")}`}
            </Badge>
            {p.category && (
              <Badge variant="outline" className="text-[11px] capitalize">
                {p.category}
              </Badge>
            )}
          </div>
          <div
            className="pt-1 space-y-2"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <BuyNowButton
              pluginId={p.id}
              priceCents={p.price_cents}
              currency={p.currency ?? tenantCurrency}
              pricingModel={p.pricing_model}
              size="sm"
              className="w-full"
            />
            <Link to="/marketplace/plugins/$slug" params={{ slug: p.slug }} className="block">
              <Button variant="outline" size="sm" className="w-full">
                <Package className="size-4 mr-2" />
                {installed ? "Open install page" : "View & install"}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function EmptyState({ tab }: { tab: string }) {
  return (
    <div className="text-center py-20 border border-dashed rounded-control">
      <Filter className="size-8 mx-auto text-muted-foreground mb-3" />
      <h3 className="font-medium">
        {tab === "installed" ? "No plugins installed yet" : "No plugins match your filters"}
      </h3>
      <p className="text-sm text-muted-foreground mt-1">
        {tab === "installed"
          ? "Browse Featured or Popular to find your first plugin."
          : "Try clearing filters or selecting a different category."}
      </p>
    </div>
  );
}
