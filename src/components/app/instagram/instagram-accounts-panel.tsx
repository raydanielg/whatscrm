import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Instagram,
  PlugZap,
  Loader2,
  RefreshCw,
  Unplug,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ChannelHealthChecks } from "@/components/app/messaging/channel-health-checks";
import { useInstagramReconnect } from "@/hooks/use-instagram-reconnect";
import { useInstagramHealth } from "@/hooks/use-meta-health";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import {
  listInstagramAccounts,
  startInstagramOAuth,
  disconnectInstagramAccount,
  deleteInstagramAccount,
} from "@/lib/instagram/accounts.functions";
import { RECONNECT_HINT, reconnectReason } from "@/lib/instagram/reconnect-eligibility";

type IgAccount = {
  id: string;
  ig_user_id: string;
  username: string | null;
  name: string | null;
  profile_picture_url: string | null;
  page_id: string | null;
  page_name: string | null;
  status: string;
  status_reason: string | null;
  scopes: string[];
  connected_at: string;
  last_verified_at: string | null;
  token_expires_at: string | null;
};

const STATUS: Record<string, { label: string; className: string }> = {
  connected: { label: "Connected", className: "bg-success/10 text-success border-success/30" },
  disconnected: {
    label: "Disconnected",
    className: "bg-muted text-muted-foreground border-border",
  },
  error: { label: "Error", className: "bg-destructive/10 text-destructive border-destructive/30" },
  suspended: {
    label: "Suspended",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
};

export function InstagramAccountsPanel() {
  const { data: ws } = useCurrentWorkspace();
  const qc = useQueryClient();
  const formatZoned = useZonedDateFormatter();
  const list = useServerFn(listInstagramAccounts);
  const start = useServerFn(startInstagramOAuth);
  const disconnect = useServerFn(disconnectInstagramAccount);
  const del = useServerFn(deleteInstagramAccount);

  const q = useQuery({
    queryKey: ["instagram-accounts", ws?.id],
    queryFn: () => list({ data: { workspaceId: ws!.id } }),
    enabled: !!ws?.id,
  });

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d = e.data as { type?: string; ok?: boolean } | undefined;
      if (!d || d.type !== "instagram-oauth") return;
      if (d.ok) {
        toast.success("Instagram account linked");
        qc.invalidateQueries({ queryKey: ["instagram-accounts", ws?.id] });
      } else {
        toast.error("Instagram linking failed");
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [qc, ws?.id]);

  const linkMut = useMutation({
    mutationFn: async () => {
      if (!ws?.id) throw new Error("No workspace");
      const res = await start({
        data: {
          workspaceId: ws.id,
          origin: window.location.origin,
          returnTo: window.location.pathname + window.location.search,
        },
      });
      return res.url;
    },
    onSuccess: (url) => {
      const w = window.open(url, "instagram-oauth", "width=640,height=760");
      if (!w) window.location.href = url;
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to start OAuth"),
  });

  const disconnectMut = useMutation({
    mutationFn: (accountId: string) => disconnect({ data: { accountId } }),
    onSuccess: () => {
      toast.success("Disconnected");
      qc.invalidateQueries({ queryKey: ["instagram-accounts", ws?.id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const deleteMut = useMutation({
    mutationFn: (accountId: string) => del({ data: { accountId } }),
    onSuccess: () => {
      toast.success("Account removed");
      qc.invalidateQueries({ queryKey: ["instagram-accounts", ws?.id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  // Read-only view of the health report `ChannelHealthChecks` below already
  // runs — `enabled: false` serves whatever is cached without probing Meta a
  // second time, so a failing Page subscription can surface Reconnect here.
  const { data: health } = useInstagramHealth(false);
  const { reconnectAccount, isReconnecting } = useInstagramReconnect(ws?.id);

  const accounts = (q.data?.accounts ?? []) as IgAccount[];
  const configured = q.data?.configured ?? true;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-xl flex items-center gap-2">
            <Instagram className="w-5 h-5 text-primary" /> Link Instagram
          </h2>
          <p className="text-sm text-muted-foreground max-w-xl">
            Click the button below to link your Instagram account via Meta OAuth. Click{" "}
            <strong>Add Account</strong> to connect your Instagram Business account and start
            automating.
          </p>
        </div>
        <Button
          size="sm"
          className="gap-2"
          disabled={!ws?.id || !configured || linkMut.isPending}
          onClick={() => linkMut.mutate()}
        >
          {linkMut.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <PlugZap className="w-4 h-4" />
          )}
          Add Account
        </Button>
      </header>

      {!configured && (
        <Alert variant="destructive">
          <ShieldAlert className="w-4 h-4" />
          <AlertTitle>Meta app credentials missing</AlertTitle>
          <AlertDescription>
            Add <code className="rounded-control bg-muted px-1">META_APP_ID</code> and{" "}
            <code className="rounded-control bg-muted px-1">META_APP_SECRET</code> in project secrets,
            then reload. In your Meta app, add this OAuth redirect URI:{" "}
            <code className="rounded-control bg-muted px-1 break-all">
              {typeof window !== "undefined" ? window.location.origin : ""}
              /api/public/instagram/callback
            </code>
          </AlertDescription>
        </Alert>
      )}

      {/*
        Above the account list on purpose. "Connected" on a card below is
        earned by an outbound Graph call alone, so it can read green while
        Meta's inbound deliveries are being refused — these checks are the
        ones that say whether DMs can actually arrive.
      */}
      <ChannelHealthChecks channel="instagram" />

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading accounts
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-control border border-dashed border-border p-8 text-center">
          <Instagram className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
          <div className="font-medium">No Instagram accounts linked</div>
          <p className="text-sm text-muted-foreground mt-1">
            Add your first Instagram Business account to power inbox replies, automations, and
            campaigns.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {accounts.map((a) => {
            const s = STATUS[a.status] ?? STATUS.disconnected;
            const needsReconnect = reconnectReason(a, health);
            const reconnecting = isReconnecting(a.id);
            return (
              <div
                key={a.id}
                className="rounded-control border border-border bg-surface p-4 flex items-start gap-4"
              >
                {a.profile_picture_url ? (
                  <img
                    src={a.profile_picture_url}
                    alt={a.username ?? "IG"}
                    className="w-12 h-12 rounded-control object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-control bg-muted flex items-center justify-center">
                    <Instagram className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold truncate">@{a.username ?? a.ig_user_id}</div>
                    <Badge variant="outline" className={s.className}>
                      {a.status === "connected" ? (
                        <CheckCircle2 className="w-3 h-3 " />
                      ) : (
                        <AlertTriangle className="w-3 h-3 " />
                      )}
                      {s.label}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    {a.name && <span>{a.name}</span>}
                    {a.page_name && <span>Page: {a.page_name}</span>}
                    <span>
                      Linked{" "}
                      {formatZoned(new Date(a.connected_at), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                  {a.status_reason && (
                    <div className="text-xs text-destructive mt-1">{a.status_reason}</div>
                  )}
                  {needsReconnect && !a.status_reason && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {RECONNECT_HINT[needsReconnect]}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {needsReconnect && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => reconnectAccount(a.id)}
                      disabled={reconnecting}
                      aria-busy={reconnecting}
                    >
                      {reconnecting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      {reconnecting ? "Reconnecting" : "Reconnect"}
                    </Button>
                  )}
                  {a.status === "connected" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => disconnectMut.mutate(a.id)}
                      disabled={disconnectMut.isPending}
                    >
                      <Unplug className="w-3.5 h-3.5" /> Disconnect
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-destructive hover:text-destructive"
                    onClick={() => deleteMut.mutate(a.id)}
                    disabled={deleteMut.isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
