import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { ALL_PROVIDERS } from "@/lib/integrations/providers";
import { ProviderAvatar } from "@/components/integrations/provider-avatar";
import {
  useInstalledIntegrations,
  type InstalledIntegration,
  type InstalledStatus,
} from "@/lib/integrations/installed-store";
import { ConnectIntegrationDialog } from "@/components/integrations/connect-integration-dialog";
import { DisconnectIntegrationDialog } from "@/components/integrations/disconnect-integration-dialog";
import { WebhookConfigDialog } from "@/components/integrations/webhook-config-dialog";
import {
  PlugZap,
  MoreHorizontal,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Trash2,
  Search,
  ShieldAlert,
  CheckCircle2,
  Webhook,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/integrations/installed")({
  component: InstalledPage,
  head: () => ({
    meta: [
      { title: "Installed Integrations" },
      {
        name: "description",
        content:
          "Manage active connections, sync status, and lifecycle for every installed integration.",
      },
    ],
  }),
});

const STATUS_FILTERS = ["All", "Active", "Disabled", "Needs attention"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function InstalledPage() {
  const { items, hydrated, setStatus, markSynced } = useInstalledIntegrations();
  const formatZoned = useZonedDateFormatter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("All");
  const [reconnectId, setReconnectId] = useState<string | null>(null);
  const [disconnectId, setDisconnectId] = useState<string | null>(null);
  const [webhookId, setWebhookId] = useState<string | null>(null);

  const rows = useMemo(() => {
    return items
      .map((i) => ({ i, p: ALL_PROVIDERS.find((p) => p.id === i.providerId) }))
      .filter((r): r is { i: InstalledIntegration; p: (typeof ALL_PROVIDERS)[number] } =>
        Boolean(r.p),
      )
      .filter((r) => {
        if (filter === "Active" && r.i.status !== "active") return false;
        if (filter === "Disabled" && r.i.status !== "disabled") return false;
        if (
          filter === "Needs attention" &&
          r.i.status !== "needs_reconnect" &&
          r.i.status !== "error"
        )
          return false;
        if (q.trim()) {
          const ql = q.trim().toLowerCase();
          return [r.p.name, r.p.vendor, r.p.category].some((s) => s.toLowerCase().includes(ql));
        }
        return true;
      });
  }, [items, filter, q]);

  const counts = useMemo(
    () => ({
      All: items.length,
      Active: items.filter((i) => i.status === "active").length,
      Disabled: items.filter((i) => i.status === "disabled").length,
      "Needs attention": items.filter((i) => i.status === "needs_reconnect" || i.status === "error")
        .length,
    }),
    [items],
  );

  if (!hydrated) {
    return (
      <div className="p-6 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded-control border border-border bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 flex flex-col items-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary grid place-items-center">
              <PlugZap className="h-5 w-5" />
            </div>
            <h2 className="font-semibold">No integrations installed yet</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              Connect providers from the Marketplace to see them here. You'll manage credentials,
              sync status, and lifecycle actions from this screen.
            </p>
            <Button asChild size="sm">
              <Link to="/integrations/marketplace">Browse Marketplace</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const reconnectProvider = reconnectId
    ? (ALL_PROVIDERS.find((p) => p.id === reconnectId) ?? null)
    : null;
  const disconnectProvider = disconnectId
    ? (ALL_PROVIDERS.find((p) => p.id === disconnectId) ?? null)
    : null;
  const webhookProvider = webhookId
    ? (ALL_PROVIDERS.find((p) => p.id === webhookId) ?? null)
    : null;

  return (
    <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search installed"
            className="pl-9 h-9"
          />
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
          <TabsList>
            {STATUS_FILTERS.map((s) => (
              <TabsTrigger key={s} value={s} className="gap-1.5">
                {s}
                <span className="text-[11px] text-muted-foreground rounded bg-muted px-1.5 py-0.5">
                  {counts[s]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <Card>
        <CardContent className="p-0 divide-y divide-border">
          {rows.map(({ i, p }) => (
            <div key={i.providerId} className="flex items-center gap-3 px-4 py-3">
              <ProviderAvatar id={p.id} name={p.name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Link
                    to="/integrations/marketplace/$providerId"
                    params={{ providerId: p.id }}
                    className="text-sm font-medium hover:text-primary truncate"
                  >
                    {p.name}
                  </Link>
                  <StatusPill status={i.status} />
                  {i.webhook?.enabled && (
                    <Badge
                      variant="secondary"
                      className="gap-1 text-[11px] bg-primary/10 text-primary"
                    >
                      <Webhook className="h-3 w-3" /> Webhook
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {p.category} · Installed{" "}
                  {formatZoned(new Date(i.installedAt), { dateStyle: "medium" })}
                  {i.lastSyncAt && ` · Last sync ${timeAgo(i.lastSyncAt)}`}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {i.status === "needs_reconnect" && (
                  <Button size="sm" variant="outline" onClick={() => setReconnectId(i.providerId)}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Reconnect
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" aria-label={`${p.name} actions`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem asChild>
                      <Link
                        to="/integrations/marketplace/$providerId"
                        params={{ providerId: p.id }}
                      >
                        View details
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setReconnectId(i.providerId)}>
                      <RefreshCw className="h-4 w-4 mr-2" /> Reconnect
                    </DropdownMenuItem>
                    {i.status === "active" ? (
                      <DropdownMenuItem
                        onClick={async () => {
                          try { await setStatus(i.providerId, "disabled"); toast.success(`${p.name} disabled`); }
                          catch (error) { toast.error(error instanceof Error ? error.message : "Could not disable integration"); }
                        }}
                      >
                        <PauseCircle className="h-4 w-4 mr-2" /> Disable
                      </DropdownMenuItem>
                    ) : i.status === "disabled" ? (
                      <DropdownMenuItem
                        onClick={async () => {
                          try { await setStatus(i.providerId, "active"); toast.success(`${p.name} enabled`); }
                          catch (error) { toast.error(error instanceof Error ? error.message : "Could not enable integration"); }
                        }}
                      >
                        <PlayCircle className="h-4 w-4 mr-2" /> Enable
                      </DropdownMenuItem>
                    ) : null}
                    {i.providerId !== "google-workspace" && <DropdownMenuItem
                      onClick={() => {
                        markSynced(i.providerId);
                        toast.success(`${p.name} local metadata refreshed`);
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" /> Sync now
                    </DropdownMenuItem>}
                    <DropdownMenuItem onClick={() => setWebhookId(i.providerId)}>
                      <Webhook className="h-4 w-4 mr-2" />
                      {i.webhook ? "Manage webhook" : "Configure webhook"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDisconnectId(i.providerId)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Disconnect
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No installed integrations match your filters.
            </div>
          )}
        </CardContent>
      </Card>

      <ConnectIntegrationDialog
        provider={reconnectProvider}
        open={!!reconnectId}
        onOpenChange={(o) => !o && setReconnectId(null)}
        mode="reconnect"
      />
      <DisconnectIntegrationDialog
        provider={disconnectProvider}
        open={!!disconnectId}
        onOpenChange={(o) => !o && setDisconnectId(null)}
      />
      <WebhookConfigDialog
        provider={webhookProvider}
        open={!!webhookId}
        onOpenChange={(o) => !o && setWebhookId(null)}
      />
    </div>
  );
}

function StatusPill({ status }: { status: InstalledStatus }) {
  const map: Record<
    InstalledStatus,
    { label: string; className: string; Icon: typeof CheckCircle2 }
  > = {
    active: {
      label: "Active",
      className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
      Icon: CheckCircle2,
    },
    disabled: {
      label: "Disabled",
      className: "bg-muted text-muted-foreground",
      Icon: PauseCircle,
    },
    needs_reconnect: {
      label: "Needs reconnect",
      className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
      Icon: ShieldAlert,
    },
    error: {
      label: "Error",
      className: "bg-destructive/15 text-destructive",
      Icon: ShieldAlert,
    },
  };
  const { label, className, Icon } = map[status];
  return (
    <Badge variant="secondary" className={cn("gap-1 text-[11px]", className)}>
      <Icon className="h-3 w-3" /> {label}
    </Badge>
  );
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
