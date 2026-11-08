import { BRAND_NAME } from "@/lib/branding/brand";
import { createFileRoute, Link, notFound, useParams, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ALL_PROVIDERS } from "@/lib/integrations/providers";
import { ProviderAvatar } from "@/components/integrations/provider-avatar";
import { ConnectIntegrationDialog } from "@/components/integrations/connect-integration-dialog";
import { AppTopbar } from "@/components/app/app-topbar";

export const Route = createFileRoute(
  "/_authenticated/integrations/marketplace/$providerId/install",
)({
  staticData: { breadcrumb: "Install" },
  component: InstallPage,
  loader: ({ params }) => {
    const provider = ALL_PROVIDERS.find((p) => p.id === params.providerId);
    if (!provider) throw notFound();
    return { provider };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `Install ${loaderData?.provider.name ?? "integration"} · ${BRAND_NAME}` },
      {
        name: "description",
        content: `Guided setup for ${loaderData?.provider.name ?? "this integration"}.`,
      },
    ],
  }),
  notFoundComponent: () => (
    <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
      <BackLink />
      <div className="text-sm text-muted-foreground">Integration not found.</div>
    </div>
  ),
  errorComponent: ({ error, reset }) => (
    <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
      <BackLink />
      <div className="text-sm text-destructive">{(error as Error).message}</div>
      <Button size="sm" variant="outline" onClick={reset}>
        Retry
      </Button>
    </div>
  ),
});

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link to="/integrations/marketplace">
        <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Marketplace
      </Link>
    </Button>
  );
}

function InstallPage() {
  const { providerId } = useParams({
    from: "/_authenticated/integrations/marketplace/$providerId/install",
  });
  const provider = ALL_PROVIDERS.find((p) => p.id === providerId)!;
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);

  return (
    <>
      <AppTopbar
        title={`Install ${provider.name}`}
        subtitle="Guided setup and permission review."
        actions={
          <div className="flex gap-2">
            <Button onClick={() => setOpen(true)}>Start guided setup</Button>
            <Button variant="outline" asChild>
              <Link to="/integrations/marketplace/$providerId" params={{ providerId }}>
                Back to details
              </Link>
            </Button>
          </div>
        }
      />
      <div className="p-6 space-y-6 max-w-3xl w-full mx-auto">
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <Button asChild variant="ghost" size="sm" className="-ml-2 h-7">
            <Link to="/integrations/marketplace">
              <ArrowLeft className="h-3.5 w-3.5 " /> Marketplace
            </Link>
          </Button>
          <span>/</span>
          <Link
            to="/integrations/marketplace/$providerId"
            params={{ providerId }}
            className="hover:text-foreground"
          >
            {provider.name}
          </Link>
          <span>/</span>
          <span className="text-foreground">Install</span>
        </div>

        <div className="flex items-start gap-4">
          <ProviderAvatar id={provider.id} name={provider.name} size="lg" />
          <p className="text-sm text-muted-foreground mt-1">{provider.tagline}</p>
        </div>

        <ConnectIntegrationDialog
          provider={provider}
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o)
              navigate({ to: "/integrations/marketplace/$providerId", params: { providerId } });
          }}
          onSuccess={() => navigate({ to: "/integrations/installed" })}
        />
      </div>
    </>
  );
}
