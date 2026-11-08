import { Brand } from "@/components/brand";
import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute, Link, notFound, useParams } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Plug,
  ShieldCheck,
  Zap,
  Settings2,
  PauseCircle,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ALL_PROVIDERS } from "@/lib/integrations/providers";
import { ProviderAvatar } from "@/components/integrations/provider-avatar";
import { useIsInstalled } from "@/lib/integrations/installed-store";
import { describeScope } from "@/components/integrations/scope-description";
import { ConnectIntegrationDialog } from "@/components/integrations/connect-integration-dialog";
import { DisconnectIntegrationDialog } from "@/components/integrations/disconnect-integration-dialog";
import { AppTopbar } from "@/components/app/app-topbar";
import { ActionBar } from "@/components/app/action-bar";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated/integrations/marketplace/$providerId/")({
  staticData: { breadcrumb: "Provider" },
  component: ProviderDetailPage,
  loader: ({ params }) => {
    const provider = ALL_PROVIDERS.find((p) => p.id === params.providerId);
    if (!provider) throw notFound();
    return { provider };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.provider.name ?? "Integration"} · Marketplace · ${BRAND_NAME}` },
      { name: "description", content: loaderData?.provider.tagline ?? "Integration details" },
    ],
  }),
  notFoundComponent: () => (
    <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
      <BackToMarketplace />
      <div className="text-sm text-muted-foreground">Integration not found.</div>
    </div>
  ),
  errorComponent: ({ error, reset }) => (
    <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
      <BackToMarketplace />
      <div className="text-sm text-destructive">{(error as Error).message}</div>
      <Button size="sm" variant="outline" onClick={reset}>
        Retry
      </Button>
    </div>
  ),
});

function BackToMarketplace() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link to="/integrations/marketplace">
        <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Marketplace
      </Link>
    </Button>
  );
}

function ProviderDetailPage() {
  const { providerId } = useParams({
    from: "/_authenticated/integrations/marketplace/$providerId/",
  });
  const provider = ALL_PROVIDERS.find((p) => p.id === providerId)!;
  const { installed } = useIsInstalled(providerId);
  const [connectOpen, setConnectOpen] = useState(false);
  const [reconnectOpen, setReconnectOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const actions = provider.capabilities.filter((c) => c.kind !== "trigger");
  const triggers = provider.capabilities.filter((c) => c.kind === "trigger");
  const related = ALL_PROVIDERS.filter(
    (p) => p.category === provider.category && p.id !== provider.id,
  ).slice(0, 3);

  return (
    <>
      <AppTopbar
        title={provider.name}
        subtitle={provider.tagline}
        actions={
          <ActionBar
            primary={
              installed
                ? installed.status === "needs_reconnect"
                  ? [
                      <Button
                        key="reconnect"
                        size="sm"
                        variant="outline"
                        onClick={() => setReconnectOpen(true)}
                      >
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Reconnect
                      </Button>,
                      <Button key="manage" asChild size="sm" variant="secondary">
                        <Link to="/integrations/installed">
                          <Settings2 className="h-3.5 w-3.5 mr-1.5" /> Manage
                        </Link>
                      </Button>,
                    ]
                  : [
                      <Button key="manage" asChild size="sm" variant="secondary">
                        <Link to="/integrations/installed">
                          <Settings2 className="h-3.5 w-3.5 mr-1.5" /> Manage
                        </Link>
                      </Button>,
                    ]
                : [
                    <Button key="connect" size="sm" onClick={() => setConnectOpen(true)}>
                      <Plug className="h-3.5 w-3.5 mr-1.5" /> Connect
                    </Button>,
                  ]
            }
            overflow={[
              ...(provider.docsUrl
                ? [
                    <DropdownMenuItem key="docs" asChild>
                      <a href={provider.docsUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Docs
                      </a>
                    </DropdownMenuItem>,
                  ]
                : []),
              ...(installed
                ? [
                    <DropdownMenuItem key="disconnect" onClick={() => setDisconnectOpen(true)}>
                      <Unplug className="h-3.5 w-3.5 mr-1.5" /> Disconnect
                    </DropdownMenuItem>,
                  ]
                : []),
            ]}
          />
        }
      />
      <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <BackToMarketplace />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <ProviderAvatar id={provider.id} name={provider.name} size="lg" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">{provider.category}</Badge>
                {provider.featured && (
                  <Badge className="bg-primary/10 text-primary hover:bg-primary/10">Featured</Badge>
                )}
                {installed && (
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15">
                    {installed.status === "active"
                      ? "Installed"
                      : installed.status === "disabled"
                        ? "Disabled"
                        : "Needs attention"}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {provider.vendor} · v{provider.version}
              </p>
            </div>
          </div>
        </div>

        <ConnectIntegrationDialog
          provider={provider}
          open={connectOpen}
          onOpenChange={setConnectOpen}
        />
        <ConnectIntegrationDialog
          provider={provider}
          open={reconnectOpen}
          onOpenChange={setReconnectOpen}
          mode="reconnect"
        />
        <DisconnectIntegrationDialog
          provider={provider}
          open={disconnectOpen}
          onOpenChange={setDisconnectOpen}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Capabilities</CardTitle>
              <CardDescription>
                Actions and triggers this integration exposes to <Brand /> workflows and AI agents.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {actions.length > 0 && (
                <section>
                  <div className="text-[11px] uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3" /> Actions
                  </div>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {actions.map((c) => (
                      <li key={c.id} className="text-sm border border-border rounded-control px-3 py-2">
                        {c.label}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {triggers.length > 0 && (
                <section>
                  <div className="text-[11px] uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Zap className="h-3 w-3" /> Triggers
                  </div>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {triggers.map((c) => (
                      <li key={c.id} className="text-sm border border-border rounded-control px-3 py-2">
                        {c.label}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {provider.capabilities.length === 0 && (
                <p className="text-sm text-muted-foreground">No capabilities declared yet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" /> Permissions
              </CardTitle>
              <CardDescription>
                Authorization method:{" "}
                <Badge variant="secondary">{provider.authType.replace("_", " ")}</Badge>
              </CardDescription>
            </CardHeader>
            <CardContent>
              {provider.scopes && provider.scopes.length > 0 ? (
                <ul className="space-y-2">
                  {provider.scopes.map((s) => (
                    <li key={s} className="text-sm flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                      <div className="min-w-0">
                        <div>{describeScope(s)}</div>
                        <div className="text-[11px] font-mono text-muted-foreground truncate">
                          {s}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No additional scopes required.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {related.length > 0 && (
          <section>
            <Separator className="mb-4" />
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium uppercase text-muted-foreground">
                Related in {provider.category}
              </h2>
              <Button asChild variant="ghost" size="sm">
                <Link to="/integrations/marketplace">Browse all</Link>
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {related.map((p) => (
                <Link
                  key={p.id}
                  to="/integrations/marketplace/$providerId"
                  params={{ providerId: p.id }}
                  className="block"
                >
                  <Card className="hover:shadow-md transition-shadow">
                    <CardContent className="p-3 flex items-center gap-3">
                      <ProviderAvatar id={p.id} name={p.name} size="sm" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{p.tagline}</div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {installed?.status === "disabled" && (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <CardContent className="py-3 px-4 text-sm flex items-center gap-2">
              <PauseCircle className="h-4 w-4 text-amber-600" />
              This integration is currently disabled. Re-enable it from the Installed tab.
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
