import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ShieldOff, Loader2, Puzzle } from "lucide-react";
import { toast } from "sonner";
import { revokeConnectedApp } from "@/lib/oauth/oauth.functions";
import { connectedAppsQueryOptions } from "@/lib/oauth/connected-apps-query";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/settings/connected-apps")({
  staticData: { breadcrumb: "Connected Apps" },
  head: () => ({
    meta: [
      { title: "Connected Applications" },
      {
        name: "description",
        content: "Review and revoke third-party applications connected to your account.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(connectedAppsQueryOptions),
  component: () => (
    <>
      <AppTopbar
        title="Connected applications"
        subtitle="Third-party apps that can access your the account via OAuth."
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <Suspense fallback={<Loader2 className="animate-spin" />}>
          <AppsList />
        </Suspense>
      </main>
    </>
  ),
  errorComponent: ({ error }) => (
    <div className="p-6" role="alert">
      <h1 className="font-display text-xl font-semibold">Connected applications</h1>
      <p className="text-sm text-destructive mt-2">{(error as Error).message}</p>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Not found.</div>,
});

function AppsList() {
  const { data } = useSuspenseQuery(connectedAppsQueryOptions);
  const qc = useQueryClient();
  const revoke = useServerFn(revokeConnectedApp);
  const formatZoned = useZonedDateFormatter();

  if (!data.apps.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          No connected applications.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {data.apps.map((a: any) => (
        <Card key={a.consent_id}>
          <CardHeader className="flex-row items-center gap-4 space-y-0">
            <Avatar className="w-12 h-12">
              {a.client?.logo_url ? (
                <AvatarImage src={a.client.logo_url} alt={a.client.name} />
              ) : null}
              <AvatarFallback>{a.client?.name?.slice(0, 2).toUpperCase() ?? "?"}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <CardTitle className="text-base">{a.client?.name ?? "Unknown app"}</CardTitle>
              <p className="text-xs text-muted-foreground">
                Connected {formatZoned(new Date(a.granted_at), { dateStyle: "short" })}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (!confirm(`Revoke access for ${a.client?.name}?`)) return;
                await revoke({ data: { consentId: a.consent_id } });
                qc.invalidateQueries({ queryKey: ["oauth", "connected-apps"] });
                toast.success("Access revoked");
              }}
            >
              <ShieldOff className="w-4 h-4" /> Revoke
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-1">
              {(a.scopes as string[]).map((s) => (
                <Badge key={s} variant="secondary" className="text-xs">
                  {s}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
