import { Brand } from "@/components/brand";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { queryOptions, useSuspenseQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sparkles,
  Search,
  Star,
  ShieldCheck,
  Package,
  Loader2,
  ExternalLink,
  CheckCircle2,
  Trash2,
  ChevronRight,
  History,
  Users2,
  CreditCard,
  Cloud,
  Zap,
  LineChart,
  BookText,
  Calculator,
  Bot,
  Puzzle,
} from "lucide-react";
import { toast } from "sonner";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import {
  listMarketplaceCatalog,
  listMyInstallations,
  installIntegration,
  setInstallationEnabled,
  updateInstallationConfig,
  uninstallIntegration,
} from "@/lib/marketplace/marketplace.functions";

const CATEGORIES = [
  { id: "all", label: "All", icon: Puzzle },
  { id: "CRM", label: "CRM", icon: Users2 },
  { id: "Marketing", label: "Marketing", icon: Sparkles },
  { id: "Productivity", label: "Productivity", icon: BookText },
  { id: "Payments", label: "Payments", icon: CreditCard },
  { id: "Communication", label: "Communication", icon: Users2 },
  { id: "Storage", label: "Storage", icon: Cloud },
  { id: "AI", label: "AI", icon: Bot },
  { id: "Analytics", label: "Analytics", icon: LineChart },
  { id: "Accounting", label: "Accounting", icon: Calculator },
  { id: "Automation", label: "Automation", icon: Zap },
] as const;

export const catalogQO = queryOptions({
  queryKey: ["marketplace", "catalog"],
  queryFn: () => listMarketplaceCatalog(),
  staleTime: 60_000,
});

export const Route = createFileRoute("/_authenticated/marketplace/")({
  head: () => ({
    meta: [
      { title: "Integration Marketplace" },
      {
        name: "description",
        content:
          "Browse, install, and configure integrations across CRM, marketing, payments, AI, analytics, storage, and automation.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(catalogQO),
  component: MarketplacePage,
  errorComponent: ({ error }) => (
    <div className="p-6" role="alert">
      <h1 className="font-display text-xl font-semibold">Marketplace</h1>
      <p className="text-sm text-destructive mt-2">{(error as Error).message}</p>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Not found.</div>,
});

type Integration = any;
type Installation = any;

function MarketplacePage() {
  return (
    <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
      <header className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold flex items-center gap-2">
            <Puzzle className="w-7 h-7 text-primary" /> Integration Marketplace
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl mt-1">
            Extend <Brand /> with best-in-class apps. Install with one click, configure via guided
            wizards, manage permissions, and roll back to previous versions.
          </p>
        </div>
      </header>
      <Suspense
        fallback={
          <div className="flex justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <MarketplaceBody />
      </Suspense>
    </main>
  );
}

function MarketplaceBody() {
  const { data } = useSuspenseQuery(catalogQO);
  const loadInstallations = useServerFn(listMyInstallations);
  const { data: installData } = useQuery({
    queryKey: ["marketplace", "installations"],
    queryFn: () => loadInstallations(),
  });
  const installed: Installation[] = installData?.installations ?? [];
  const installedIds = useMemo(() => new Set(installed.map((i) => i.integration_id)), [installed]);

  const [category, setCategory] = useState<string>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"popular" | "rating" | "newest">("popular");
  const [selected, setSelected] = useState<Integration | null>(null);

  const filtered = useMemo(() => {
    const items: Integration[] = data.integrations;
    let list = category === "all" ? items : items.filter((i) => i.category === category);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter(
        (i) =>
          i.name.toLowerCase().includes(s) ||
          i.tagline.toLowerCase().includes(s) ||
          i.vendor?.toLowerCase().includes(s),
      );
    }
    const sorted = [...list];
    if (sort === "rating") sorted.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    else if (sort === "newest")
      sorted.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    else sorted.sort((a, b) => b.install_count - a.install_count);
    return sorted;
  }, [data.integrations, category, q, sort]);

  const featured = data.integrations.filter((i: Integration) => i.featured).slice(0, 4);
  const recommended = data.integrations
    .filter((i: Integration) => i.recommended && !installedIds.has(i.id))
    .slice(0, 4);

  return (
    <>
      <Tabs defaultValue="browse">
        <TabsList>
          <TabsTrigger value="browse">Browse</TabsTrigger>
          <TabsTrigger value="installed">
            Installed{" "}
            {installed.length > 0 && (
              <Badge variant="secondary" className="ml-1.5">
                {installed.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="mt-4 space-y-6">
          {featured.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase mb-3 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Featured
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {featured.map((i: Integration) => (
                  <FeaturedCard
                    key={i.id}
                    integration={i}
                    installed={installedIds.has(i.id)}
                    onOpen={() => setSelected(i)}
                  />
                ))}
              </div>
            </section>
          )}

          {recommended.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase mb-3 flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5" /> Recommended for you
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {recommended.map((i: Integration) => (
                  <IntegrationCard
                    key={i.id}
                    integration={i}
                    installed={false}
                    onOpen={() => setSelected(i)}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search integrations"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={sort} onValueChange={(v: any) => setSort(v)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="popular">Most installed</SelectItem>
                  <SelectItem value="rating">Top rated</SelectItem>
                  <SelectItem value="newest">Recently updated</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => {
                const Icon = c.icon;
                const active = category === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setCategory(c.id)}
                    className={`inline-flex items-center gap-1.5 rounded-control px-3 py-1.5 text-xs font-medium transition-all ${
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted hover:bg-muted/80 text-foreground"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {c.label}
                  </button>
                );
              })}
            </div>

            {filtered.length === 0 ? (
              <Card>
                <CardContent className="py-14 text-center text-sm text-muted-foreground">
                  No integrations match your search.
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filtered.map((i) => (
                  <IntegrationCard
                    key={i.id}
                    integration={i}
                    installed={installedIds.has(i.id)}
                    onOpen={() => setSelected(i)}
                  />
                ))}
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="installed" className="mt-4">
          <InstalledList
            installations={installed}
            onOpen={(inst) => setSelected(inst.integration)}
          />
        </TabsContent>
      </Tabs>

      <IntegrationDetailDialog
        integration={selected}
        installation={installed.find((i) => i.integration_id === selected?.id) ?? null}
        onClose={() => setSelected(null)}
      />
    </>
  );
}

function FeaturedCard({
  integration,
  installed,
  onOpen,
}: {
  integration: Integration;
  installed: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="text-left group relative overflow-hidden rounded-control border bg-gradient-to-br from-primary/5 via-background to-background p-4 hover:shadow-lg hover:border-primary/40 transition-all"
    >
      <div className="flex items-start gap-3">
        <IntegrationIcon integration={integration} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="font-semibold truncate">{integration.name}</div>
            {installed && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{integration.tagline}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
        <Badge variant="outline" className="text-[11px]">
          {integration.category}
        </Badge>
        {integration.rating && (
          <span className="inline-flex items-center gap-0.5">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            {integration.rating}
          </span>
        )}
      </div>
    </button>
  );
}

function IntegrationCard({
  integration,
  installed,
  onOpen,
}: {
  integration: Integration;
  installed: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="text-left group rounded-control border bg-card p-4 hover:border-primary/40 hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <IntegrationIcon integration={integration} />
        {installed ? (
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2 className="w-3 h-3" />
            Installed
          </Badge>
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
      <div className="mt-3">
        <div className="font-semibold truncate">{integration.name}</div>
        <div className="text-xs text-muted-foreground">{integration.vendor}</div>
      </div>
      <p className="text-xs text-muted-foreground mt-2 line-clamp-2 min-h-[2rem]">
        {integration.tagline}
      </p>
      <div className="flex items-center gap-2 mt-3 text-xs">
        <Badge variant="outline" className="text-[11px]">
          {integration.category}
        </Badge>
        {integration.rating && (
          <span className="inline-flex items-center gap-0.5 text-muted-foreground">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            {integration.rating}
          </span>
        )}
        <span className="text-muted-foreground text-[11px] ml-auto">
          {integration.install_count.toLocaleString()} installs
        </span>
      </div>
    </button>
  );
}

function IntegrationIcon({ integration }: { integration: Integration }) {
  const letter = integration.name.charAt(0);
  return (
    <div className="w-10 h-10 rounded-control bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary font-display font-bold text-lg shrink-0">
      {integration.icon_url ? (
        <img
          src={integration.icon_url}
          alt=""
          className="w-full h-full rounded-control object-cover"
        />
      ) : (
        letter
      )}
    </div>
  );
}

function InstalledList({
  installations,
  onOpen,
}: {
  installations: Installation[];
  onOpen: (inst: Installation) => void;
}) {
  const qc = useQueryClient();
  const toggle = useServerFn(setInstallationEnabled);
  const formatZoned = useZonedDateFormatter();
  if (!installations.length) {
    return (
      <Card>
        <CardContent className="py-14 text-center text-sm text-muted-foreground">
          <Package className="w-8 h-8 mx-auto mb-2 opacity-60" />
          No integrations installed yet. Browse the marketplace to add your first.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {installations.map((inst) => (
        <Card
          key={inst.id}
          className="cursor-pointer hover:border-primary/40 transition-colors"
          onClick={() => onOpen(inst)}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <IntegrationIcon integration={inst.integration} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{inst.integration.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                v{inst.version} · {inst.integration.category}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                Installed {formatZoned(new Date(inst.installed_at), { dateStyle: "medium" })}
              </div>
            </div>
            <Switch
              checked={inst.status === "active"}
              onClick={(e) => e.stopPropagation()}
              onCheckedChange={async (v) => {
                await toggle({ data: { id: inst.id, enabled: v } });
                qc.invalidateQueries({ queryKey: ["marketplace", "installations"] });
                toast.success(v ? "Enabled" : "Disabled");
              }}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function IntegrationDetailDialog({
  integration,
  installation,
  onClose,
}: {
  integration: Integration | null;
  installation: Installation | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const install = useServerFn(installIntegration);
  const updateCfg = useServerFn(updateInstallationConfig);
  const uninstall = useServerFn(uninstallIntegration);

  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState<Record<string, any>>({});
  const [wizardStep, setWizardStep] = useState<"config" | "permissions" | "review">("config");
  const [scopes, setScopes] = useState<string[]>([]);

  const isInstalled = !!installation;
  const schema: any[] = (integration?.config_schema as any[]) ?? [];
  const allScopes: string[] = (integration?.scopes as string[]) ?? [];

  // Reset when integration changes.
  useMemo(() => {
    if (!integration) return;
    setConfig(installation?.config ?? {});
    setScopes(installation?.granted_scopes ?? allScopes);
    setWizardStep("config");
  }, [integration?.id]);

  if (!integration) return null;
  const changelog: any[] = (integration.changelog as any[]) ?? [];

  const requiredMissing = schema
    .filter((f) => f.required)
    .some((f) => !config[f.key] || String(config[f.key]).trim() === "");

  async function handleInstall() {
    setBusy(true);
    try {
      await install({ data: { integrationId: integration.id, config, scopes } });
      qc.invalidateQueries({ queryKey: ["marketplace", "installations"] });
      toast.success(`${integration.name} installed`);
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Install failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    if (!installation) return;
    setBusy(true);
    try {
      await updateCfg({ data: { id: installation.id, config, scopes } });
      qc.invalidateQueries({ queryKey: ["marketplace", "installations"] });
      toast.success("Configuration saved");
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleUninstall() {
    if (!installation) return;
    if (!confirm(`Uninstall ${integration.name}? Configuration will be removed.`)) return;
    setBusy(true);
    try {
      await uninstall({ data: { id: installation.id } });
      qc.invalidateQueries({ queryKey: ["marketplace", "installations"] });
      toast.success("Uninstalled");
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!integration} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <IntegrationIcon integration={integration} />
            <div className="flex-1">
              <DialogTitle className="flex items-center gap-2">
                {integration.name}
                {isInstalled && (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Installed
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="mt-1">{integration.tagline}</DialogDescription>
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="text-[11px]">
                  {integration.category}
                </Badge>
                <span>by {integration.vendor}</span>
                <span>· v{integration.version}</span>
                {integration.rating && (
                  <span className="inline-flex items-center gap-0.5">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    {integration.rating}
                  </span>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="setup" className="mt-2">
          <TabsList>
            <TabsTrigger value="setup">{isInstalled ? "Configure" : "Setup Wizard"}</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
            <TabsTrigger value="history">Version History</TabsTrigger>
          </TabsList>

          <TabsContent value="setup" className="mt-4 space-y-4">
            {!isInstalled && <WizardSteps step={wizardStep} />}

            {(isInstalled || wizardStep === "config") && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium">Configuration</h3>
                {schema.length === 0 && (
                  <p className="text-xs text-muted-foreground">No configuration required.</p>
                )}
                {schema.map((field) => (
                  <div key={field.key}>
                    <Label className="text-xs">
                      {field.label}
                      {field.required && <span className="text-destructive ml-0.5">*</span>}
                    </Label>
                    {field.type === "select" ? (
                      <Select
                        value={config[field.key] ?? ""}
                        onValueChange={(v) => setConfig({ ...config, [field.key]: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose" />
                        </SelectTrigger>
                        <SelectContent>
                          {(field.options as string[]).map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        placeholder={field.placeholder ?? ""}
                        value={config[field.key] ?? ""}
                        onChange={(e) => setConfig({ ...config, [field.key]: e.target.value })}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {!isInstalled && wizardStep === "permissions" && (
              <PermissionsPicker scopes={allScopes} granted={scopes} onChange={setScopes} />
            )}

            {!isInstalled && wizardStep === "review" && (
              <div className="rounded-control border p-3 bg-muted/40 text-sm space-y-2">
                <div className="font-medium">Ready to install</div>
                <div className="text-xs text-muted-foreground">
                  {integration.name} will be installed with {scopes.length} permission
                  {scopes.length === 1 ? "" : "s"} and {Object.keys(config).length} configuration
                  value{Object.keys(config).length === 1 ? "" : "s"}.
                </div>
              </div>
            )}

            <DialogFooter className="pt-2">
              {isInstalled ? (
                <>
                  <Button
                    variant="ghost"
                    className="text-destructive mr-auto"
                    onClick={handleUninstall}
                    disabled={busy}
                  >
                    <Trash2 className="w-4 h-4" /> Uninstall
                  </Button>
                  <Button onClick={handleSave} disabled={busy || requiredMissing}>
                    {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save changes
                  </Button>
                </>
              ) : wizardStep === "config" ? (
                <Button onClick={() => setWizardStep("permissions")} disabled={requiredMissing}>
                  Continue <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              ) : wizardStep === "permissions" ? (
                <>
                  <Button variant="ghost" onClick={() => setWizardStep("config")}>
                    Back
                  </Button>
                  <Button onClick={() => setWizardStep("review")} disabled={scopes.length === 0}>
                    Continue <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" onClick={() => setWizardStep("permissions")}>
                    Back
                  </Button>
                  <Button onClick={handleInstall} disabled={busy}>
                    {busy ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    Install {integration.name}
                  </Button>
                </>
              )}
            </DialogFooter>
          </TabsContent>

          <TabsContent value="permissions" className="mt-4">
            <PermissionsPicker
              scopes={allScopes}
              granted={scopes}
              onChange={setScopes}
              readOnly={!isInstalled}
            />
            {isInstalled && (
              <div className="flex justify-end mt-3">
                <Button size="sm" onClick={handleSave} disabled={busy}>
                  Save permissions
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <div className="space-y-2">
              {changelog.length === 0 ? (
                <p className="text-xs text-muted-foreground">No version history available.</p>
              ) : (
                changelog.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 border-l-2 border-primary/30 pl-3 py-1"
                  >
                    <History className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div>
                      <div className="text-sm font-medium">
                        v{c.version}{" "}
                        <span className="text-xs text-muted-foreground font-normal">
                          · {c.date}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">{c.notes}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {integration.docs_url && (
              <a
                href={integration.docs_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 mt-4 text-xs text-primary hover:underline"
              >
                <ExternalLink className="w-3 h-3" /> View documentation
              </a>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function WizardSteps({ step }: { step: "config" | "permissions" | "review" }) {
  const steps = [
    { id: "config", label: "Configuration" },
    { id: "permissions", label: "Permissions" },
    { id: "review", label: "Review & Install" },
  ];
  const activeIdx = steps.findIndex((s) => s.id === step);
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2 flex-1">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
              i <= activeIdx
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {i + 1}
          </div>
          <div
            className={`text-xs font-medium ${i === activeIdx ? "text-foreground" : "text-muted-foreground"}`}
          >
            {s.label}
          </div>
          {i < steps.length - 1 && <div className="flex-1 h-px bg-border" />}
        </div>
      ))}
    </div>
  );
}

function PermissionsPicker({
  scopes,
  granted,
  onChange,
  readOnly = false,
}: {
  scopes: string[];
  granted: string[];
  onChange: (s: string[]) => void;
  readOnly?: boolean;
}) {
  if (scopes.length === 0)
    return (
      <p className="text-xs text-muted-foreground">This integration requires no permissions.</p>
    );
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <ShieldCheck className="w-4 h-4" /> Requested permissions
      </div>
      <p className="text-xs text-muted-foreground">
        Review and grant the scopes this integration needs. You can revoke them any time.
      </p>
      <div className="rounded-control border divide-y">
        {scopes.map((s) => {
          const checked = granted.includes(s);
          return (
            <div
              key={s}
              className={`flex items-center gap-3 p-3 text-sm ${readOnly ? "cursor-default" : "cursor-pointer hover:bg-muted/40"}`}
            >
              <Checkbox
                id={`scope-${s}`}
                checked={checked}
                disabled={readOnly}
                onCheckedChange={() =>
                  onChange(checked ? granted.filter((x) => x !== s) : [...granted, s])
                }
              />
              <Label htmlFor={`scope-${s}`} className="font-normal cursor-pointer">
                <code className="font-mono text-xs">{s}</code>
              </Label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
