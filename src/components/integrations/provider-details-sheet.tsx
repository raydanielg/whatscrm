import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle2,
  ExternalLink,
  Plug,
  ShieldCheck,
  Zap,
  Settings2,
  Unplug,
  RefreshCw,
} from "lucide-react";
import type { IntegrationProvider } from "@/lib/integrations/core";
import { ProviderAvatar } from "./provider-avatar";
import { describeScope } from "./scope-description";
import { ConnectIntegrationDialog } from "./connect-integration-dialog";
import { DisconnectIntegrationDialog } from "./disconnect-integration-dialog";
import { useIsInstalled } from "@/lib/integrations/installed-store";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  disabled: "Disabled",
  needs_reconnect: "Needs reconnect",
  error: "Error",
};

/**
 * Quick-look drawer for a marketplace provider. Shows the manifest (capabilities,
 * scopes, auth) and exposes install / reconnect / uninstall actions inline so the
 * user never has to leave the marketplace grid.
 */
export function ProviderDetailsSheet({
  provider,
  open,
  onOpenChange,
}: {
  provider: IntegrationProvider | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { installed } = useIsInstalled(provider?.id ?? "");
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectMode, setConnectMode] = useState<"connect" | "reconnect">("connect");
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const formatZoned = useZonedDateFormatter();

  if (!provider) return null;

  const actions = provider.capabilities.filter((c) => c.kind === "action");
  const triggers = provider.capabilities.filter((c) => c.kind === "trigger");

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
          <SheetHeader className="p-6 pb-4 space-y-0">
            <div className="flex items-start gap-3">
              <ProviderAvatar id={provider.id} name={provider.name} size="lg" />
              <div className="min-w-0 flex-1">
                <SheetTitle className="flex flex-wrap items-center gap-2 text-left">
                  <span className="truncate">{provider.name}</span>
                  <Badge variant="outline" className="shrink-0">
                    {provider.category}
                  </Badge>
                  {installed && (
                    <Badge variant="secondary" className="shrink-0">
                      {STATUS_LABEL[installed.status] ?? installed.status}
                    </Badge>
                  )}
                </SheetTitle>
                <SheetDescription className="text-left mt-1">
                  {provider.vendor} · v{provider.version}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="px-6 pb-6 space-y-6">
              <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                {provider.tagline}
              </p>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
                Authorization:{" "}
                <span className="text-foreground">{provider.authType.replace("_", " ")}</span>
              </div>

              {actions.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs font-medium uppercase text-muted-foreground">
                    Actions
                  </h3>
                  <ul className="space-y-1.5">
                    {actions.map((c) => (
                      <li key={c.id} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                        <span className="[overflow-wrap:anywhere]">{c.label}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {triggers.length > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs font-medium uppercase text-muted-foreground">
                    Triggers
                  </h3>
                  <ul className="space-y-1.5">
                    {triggers.map((c) => (
                      <li key={c.id} className="flex items-start gap-2 text-sm">
                        <Zap className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                        <span className="[overflow-wrap:anywhere]">{c.label}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {(provider.scopes?.length ?? 0) > 0 && (
                <section className="space-y-2">
                  <h3 className="text-xs font-medium uppercase text-muted-foreground">
                    Permissions
                  </h3>
                  <ul className="space-y-2">
                    {provider.scopes!.map((s) => (
                      <li key={s} className="text-sm">
                        <span className="[overflow-wrap:anywhere]">{describeScope(s)}</span>
                        <div className="text-[11px] text-muted-foreground font-mono [overflow-wrap:anywhere]">
                          {s}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {installed && (
                <>
                  <Separator />
                  <section className="space-y-1 text-xs text-muted-foreground">
                    <div>
                      Installed{" "}
                      {formatZoned(new Date(installed.installedAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </div>
                    {installed.lastSyncAt && (
                      <div>
                        Last sync{" "}
                        {formatZoned(new Date(installed.lastSyncAt), {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </div>
                    )}
                    {installed.meta?.accountLabel && (
                      <div className="[overflow-wrap:anywhere]">
                        Account: {installed.meta.accountLabel}
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          </ScrollArea>

          <div className="border-t p-4 flex flex-wrap items-center gap-2">
            {installed ? (
              <>
                <Button size="sm" asChild>
                  <Link to="/integrations/installed" onClick={() => onOpenChange(false)}>
                    <Settings2 className="h-3.5 w-3.5 mr-1.5" /> Manage
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setConnectMode("reconnect");
                    setConnectOpen(true);
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Reconnect
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setDisconnectOpen(true)}>
                  <Unplug className="h-3.5 w-3.5 mr-1.5" /> Uninstall
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={() => {
                  setConnectMode("connect");
                  setConnectOpen(true);
                }}
              >
                <Plug className="h-3.5 w-3.5 mr-1.5" /> Install
              </Button>
            )}

            <div className="ml-auto flex items-center gap-2">
              {provider.docsUrl && (
                <Button size="sm" variant="ghost" asChild>
                  <a href={provider.docsUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Docs
                  </a>
                </Button>
              )}
              <Button size="sm" variant="ghost" asChild>
                <Link
                  to="/integrations/marketplace/$providerId"
                  params={{ providerId: provider.id }}
                  onClick={() => onOpenChange(false)}
                >
                  Full page
                </Link>
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ConnectIntegrationDialog
        provider={provider}
        open={connectOpen}
        mode={connectMode}
        onOpenChange={setConnectOpen}
      />
      <DisconnectIntegrationDialog
        provider={provider}
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
      />
    </>
  );
}
