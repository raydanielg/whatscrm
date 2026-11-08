import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import { pluginManager } from "@/lib/plugins/manager";
import { PERMISSION_GROUPS } from "@/lib/plugins/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  AlertTriangle,
  CheckCircle2,
  Package,
  Power,
  RefreshCw,
  Trash2,
  ShieldAlert,
} from "lucide-react";
import { AppTopbar } from "@/components/app/app-topbar";
import { toast } from "sonner";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/settings/plugins")({
  staticData: { breadcrumb: "Installed Plugins" },
  head: () => ({ meta: [{ title: "Installed Plugins — Settings" }] }),
  component: InstalledPluginsPage,
});

function useManagerSnapshot() {
  return useSyncExternalStore(
    (cb) => pluginManager.subscribe(() => cb()),
    () => pluginManager.snapshot,
    () => pluginManager.snapshot,
  );
}

function InstalledPluginsPage() {
  const snap = useManagerSnapshot();
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (slug: string, fn: () => Promise<void>) => {
    setBusy(slug);
    try {
      await fn();
      toast.success("Done");
    } catch (e: any) {
      toast.error(e?.message ?? "Action failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <AppTopbar
        title="Installed plugins"
        subtitle="Hot-install, update, disable, and remove workspace plugins without a redeploy."
        actions={
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RefreshCw className="size-4 mr-2" />
            Reload host
          </Button>
        }
      />
      <main className="container mx-auto max-w-7xl p-6 space-y-6">
        {snap.installed.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-muted-foreground">
              No plugins installed. Browse the{" "}
              <a href="/marketplace/plugins" className="underline">
                marketplace
              </a>
              .
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {snap.installed.map((p) => {
              const err = snap.errors[p.slug];
              const lic = snap.licenses[p.slug];
              return (
                <Card key={p.slug}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          {p.pluginName}
                          <Badge variant="outline" className="font-mono text-[11px]">
                            v{p.version}
                          </Badge>
                          {p.status === "active" && !err && (
                            <Badge className="text-[11px]">
                              <CheckCircle2 className="size-3 " />
                              Active
                            </Badge>
                          )}
                          {err && (
                            <Badge variant="destructive" className="text-[11px]">
                              <AlertTriangle className="size-3 " />
                              Error
                            </Badge>
                          )}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5 font-mono">{p.slug}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={p.status === "active"}
                          disabled={busy === p.slug}
                          onCheckedChange={(v) =>
                            act(p.slug, () =>
                              v ? pluginManager.enable(p.slug) : pluginManager.disable(p.slug),
                            )
                          }
                          aria-label="Enable plugin"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy === p.slug}
                          onClick={() => act(p.slug, () => pluginManager.update(p.slug))}
                        >
                          <RefreshCw className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy === p.slug}
                          onClick={() =>
                            act(p.slug, () => pluginManager.remove(p.slug, p.pluginId))
                          }
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {err && (
                      <div className="rounded-control border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive flex items-start gap-2">
                        <ShieldAlert className="size-4 mt-0.5" /> {err}
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">
                          Granted permissions
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {p.grantedPermissions.length === 0 ? (
                            <span className="text-xs text-muted-foreground">None</span>
                          ) : (
                            p.grantedPermissions.map((perm) => (
                              <Badge
                                key={perm}
                                variant="secondary"
                                className="text-[11px] font-mono"
                              >
                                {perm}
                              </Badge>
                            ))
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">License</p>
                        <LicenseBadge status={lic} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Permission reference</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {Object.entries(PERMISSION_GROUPS).map(([k, g]) => (
              <div key={k}>
                <p className="font-medium">{g.label}</p>
                <p className="text-xs text-muted-foreground">{g.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

function LicenseBadge({ status }: { status: any }) {
  const formatZoned = useZonedDateFormatter();
  if (!status)
    return (
      <Badge variant="outline" className="text-[11px]">
        Unknown
      </Badge>
    );
  if (status.state === "not_required")
    return (
      <Badge variant="secondary" className="text-[11px]">
        Free / open
      </Badge>
    );
  if (status.state === "valid")
    return (
      <Badge className="text-[11px]">
        <CheckCircle2 className="size-3 " />
        Valid
        {status.expiresAt
          ? ` · exp ${formatZoned(new Date(status.expiresAt), { dateStyle: "short" })}`
          : ""}
      </Badge>
    );
  if (status.state === "expired")
    return (
      <Badge variant="destructive" className="text-[11px]">
        Expired
      </Badge>
    );
  return (
    <Badge variant="destructive" className="text-[11px]">
      <Power className="size-3 " />
      Invalid
    </Badge>
  );
}
