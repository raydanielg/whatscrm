import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Facebook,
  PlugZap,
  Loader2,
  Unplug,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  KeyRound,
  Radio,
  Inbox,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ChannelHealthChecks } from "@/components/app/messaging/channel-health-checks";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import {
  listMessengerAccounts,
  startMessengerOAuth,
  deleteMessengerAccount,
} from "@/lib/messenger/accounts.functions";
import {
  getMessengerCapabilities,
  setMessengerPageSubscription,
  reconnectMessengerAccount,
  pauseMessengerAccount,
  type PageCapabilityReport,
} from "@/lib/messenger/capabilities.functions";
import { syncMessengerConversations } from "@/lib/messenger/sync.functions";
import {
  verifyMessengerAccount,
  verifyAllMessengerAccounts,
} from "@/lib/messenger/token.functions";

/** Small pass/warn/fail chip used for the per-Page Messenger capability row. */
function CapabilityChip({
  ok,
  warn,
  okLabel,
  warnLabel,
  failLabel,
}: {
  ok: boolean;
  warn?: boolean;
  okLabel: string;
  warnLabel?: string;
  failLabel: string;
}) {
  const state = ok ? "ok" : warn ? "warn" : "fail";
  const cls =
    state === "ok"
      ? "bg-success/10 text-success border-success/30"
      : state === "warn"
        ? "bg-warning/10 text-warning border-warning/30"
        : "bg-destructive/10 text-destructive border-destructive/30";
  const label = state === "ok" ? okLabel : state === "warn" ? (warnLabel ?? failLabel) : failLabel;
  return (
    <Badge variant="outline" className={`${cls} font-normal`}>
      {state === "ok" ? (
        <CheckCircle2 className="w-3 h-3 " />
      ) : state === "warn" ? (
        <AlertTriangle className="w-3 h-3 " />
      ) : (
        <XCircle className="w-3 h-3 " />
      )}
      {label}
    </Badge>
  );
}

type MessengerAccount = {
  id: string;
  page_id: string;
  page_name: string | null;
  category: string | null;
  profile_picture_url: string | null;
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
  expired: {
    label: "Reconnect required",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
};

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.round(ms / 86400000);
}

export function MessengerAccountsPanel() {
  const { data: ws } = useCurrentWorkspace();
  const qc = useQueryClient();
  const formatZoned = useZonedDateFormatter();
  const list = useServerFn(listMessengerAccounts);
  const start = useServerFn(startMessengerOAuth);
  const del = useServerFn(deleteMessengerAccount);
  const sync = useServerFn(syncMessengerConversations);
  const verifyOne = useServerFn(verifyMessengerAccount);
  const verifyAll = useServerFn(verifyAllMessengerAccounts);
  const capabilitiesFn = useServerFn(getMessengerCapabilities);
  const setSubscription = useServerFn(setMessengerPageSubscription);
  const reconnect = useServerFn(reconnectMessengerAccount);
  const pause = useServerFn(pauseMessengerAccount);

  const q = useQuery({
    queryKey: ["messenger-accounts", ws?.id],
    queryFn: () => list({ data: { workspaceId: ws!.id } }),
    enabled: !!ws?.id,
  });

  // Live Messenger capability status per Page (token, permission, webhooks).
  const capQ = useQuery({
    queryKey: ["messenger-capabilities", ws?.id],
    queryFn: () => capabilitiesFn({ data: { workspaceId: ws!.id } }),
    enabled: !!ws?.id,
    staleTime: 30_000,
  });
  const capabilities: PageCapabilityReport[] = capQ.data?.reports ?? [];

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["messenger-accounts", ws?.id] });
    qc.invalidateQueries({ queryKey: ["messenger-capabilities", ws?.id] });
  };

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d = e.data as { type?: string; ok?: boolean } | undefined;
      if (!d || d.type !== "messenger-oauth") return;
      if (d.ok) {
        toast.success("Facebook Page linked");
        qc.invalidateQueries({ queryKey: ["messenger-accounts", ws?.id] });
      } else {
        toast.error("Messenger linking failed");
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
      const w = window.open(url, "messenger-oauth", "width=640,height=760");
      if (!w) window.location.href = url;
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to start OAuth"),
  });

  // Pause delivery, keep every conversation / assignment / setting intact.
  const pauseMut = useMutation({
    mutationFn: (accountId: string) => pause({ data: { accountId } }),
    onSuccess: (res: any) => {
      toast.success("Page disconnected", {
        description: res?.warning
          ? `Delivery paused. Meta said: ${res.warning}. Conversations and settings are preserved.`
          : "Delivery paused. Conversations, assignments and settings are preserved for reconnect.",
      });
      refreshAll();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to disconnect"),
  });

  // Restore delivery: reuse the stored token when Meta still accepts it,
  // otherwise fall back to a fresh OAuth pass.
  const reconnectMut = useMutation({
    mutationFn: (accountId: string) => reconnect({ data: { accountId } }),
    onSuccess: (res: any) => {
      if (res?.ok) {
        toast.success("Page reconnected", {
          description: res.resubscribed
            ? "Messenger webhooks re-armed. Existing Inbox settings kept."
            : `Reconnected, but webhook subscription failed: ${res.reason ?? "unknown error"}`,
        });
        refreshAll();
        return;
      }
      toast.info("Facebook re-authorization needed", {
        description: res?.reason ?? "Meta rejected the stored Page token.",
      });
      linkMut.mutate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Reconnect failed"),
  });

  const subscribeMut = useMutation({
    mutationFn: (vars: { accountId: string; subscribe: boolean }) =>
      setSubscription({ data: vars }),
    onSuccess: (_res, vars) => {
      toast.success(vars.subscribe ? "Messenger delivery enabled" : "Messenger delivery paused");
      refreshAll();
    },
    onError: (e: any) => toast.error(e?.message ?? "Meta rejected the change"),
  });

  const deleteMut = useMutation({
    mutationFn: (accountId: string) => del({ data: { accountId } }),
    onSuccess: () => {
      toast.success("Page removed");
      qc.invalidateQueries({ queryKey: ["messenger-accounts", ws?.id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const syncMut = useMutation({
    mutationFn: (accountId: string) => sync({ data: { accountId } }),
    onSuccess: (res: any) => {
      const errCount = res?.errors?.length ?? 0;
      toast.success(
        `Synced ${res.conversations} conversation${res.conversations === 1 ? "" : "s"} · ${res.messagesInserted} new message${res.messagesInserted === 1 ? "" : "s"}` +
          (errCount ? ` · ${errCount} thread${errCount === 1 ? "" : "s"} failed` : ""),
      );
      qc.invalidateQueries({ queryKey: ["messenger-accounts", ws?.id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Sync failed"),
  });

  const verifyOneMut = useMutation({
    mutationFn: (accountId: string) => verifyOne({ data: { accountId } }),
    onSuccess: (res: any) => {
      if (res?.ok) toast.success("Token is healthy");
      else toast.error(res?.reason ?? "Token check failed");
      refreshAll();
    },
    onError: (e: any) => toast.error(e?.message ?? "Verification failed"),
  });

  const verifyAllMut = useMutation({
    mutationFn: async () => {
      if (!ws?.id) throw new Error("No workspace");
      return verifyAll({ data: { workspaceId: ws.id } });
    },
    onSuccess: (res: any) => {
      toast.success(`Checked ${res.checked} · ${res.ok} healthy · ${res.expired} need reconnect`);
      refreshAll();
    },
    onError: (e: any) => toast.error(e?.message ?? "Verification failed"),
  });

  const accounts = (q.data?.accounts ?? []) as MessengerAccount[];
  const configured = q.data?.configured ?? true;
  const expiredCount = accounts.filter(
    (a) => a.status === "expired" || a.status === "error",
  ).length;
  const expiringSoon = accounts.filter((a) => {
    const d = daysUntil(a.token_expires_at);
    return a.status === "connected" && d !== null && d <= 7;
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-xl flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-primary" /> Messenger Accounts
          </h2>
          <p className="text-sm text-muted-foreground max-w-xl">
            Connect your Facebook Pages for Messenger. Click <strong>Add Account</strong> to connect
            your Facebook Page.
          </p>
        </div>
        <div className="flex gap-2">
          {accounts.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={verifyAllMut.isPending}
              onClick={() => verifyAllMut.mutate()}
              title="Re-check every stored Page token against Meta"
            >
              {verifyAllMut.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
              Verify all tokens
            </Button>
          )}
          <Button
            size="sm"
            className="gap-2"
            disabled={!ws?.id || linkMut.isPending}
            title={
              !configured
                ? "Meta app credentials are missing — connect the Meta app first"
                : "Authorize a Facebook Page for Messenger"
            }
            onClick={() => {
              if (!configured) {
                toast.error("Meta app not configured", {
                  description:
                    "META_APP_ID and META_APP_SECRET are missing, so Facebook can't be asked for authorization yet. Add them in project secrets, then reload this page.",
                });
                return;
              }
              linkMut.mutate();
            }}
          >
            {linkMut.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <PlugZap className="w-4 h-4" />
            )}
            Add Account
          </Button>
        </div>
      </header>

      {expiredCount > 0 && (
        <Alert variant="destructive">
          <KeyRound className="w-4 h-4" />
          <AlertTitle>
            {expiredCount} Facebook Page{expiredCount === 1 ? "" : "s"} need
            {expiredCount === 1 ? "s" : ""} to be reconnected
          </AlertTitle>
          <AlertDescription>
            Meta rejected the stored Page access token. Sends and inbound webhooks for these pages
            will fail until an admin re-authorizes the app. Use <strong>Reconnect</strong> on each
            affected page below.
          </AlertDescription>
        </Alert>
      )}

      {expiringSoon.length > 0 && (
        <Alert>
          <AlertTriangle className="w-4 h-4" />
          <AlertTitle>Token expiring soon</AlertTitle>
          <AlertDescription>
            {expiringSoon.length} page{expiringSoon.length === 1 ? "" : "s"} expire within 7 days (
            {expiringSoon.map((a) => a.page_name ?? a.page_id).join(", ")}). Reconnect them now to
            avoid delivery interruptions.
          </AlertDescription>
        </Alert>
      )}

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
              /api/public/messenger/callback
            </code>
          </AlertDescription>
        </Alert>
      )}

      {/*
        Above the account list on purpose. "Connected" on a card below is
        earned by an outbound Graph call alone, so it can read green while
        Meta's inbound deliveries are being refused — these checks are the
        ones that say whether messages can actually arrive.
      */}
      <ChannelHealthChecks channel="messenger" />

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading accounts
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-control border border-dashed border-border p-8 text-center">
          <Facebook className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
          <div className="font-medium">No Facebook Pages linked</div>
          <p className="text-sm text-muted-foreground mt-1">
            Click <span className="font-medium text-foreground">Add Account</span> to connect your
            Facebook Page.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {accounts.map((a) => {
            const s = STATUS[a.status] ?? STATUS.disconnected;
            const cap = capabilities.find((c) => c.accountId === a.id) ?? null;

            return (
              <div
                key={a.id}
                className="rounded-control border border-border bg-surface p-4 flex items-start gap-4"
              >
                {a.profile_picture_url ? (
                  <img
                    src={a.profile_picture_url}
                    alt={a.page_name ?? "Page"}
                    className="w-12 h-12 rounded-control object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-control bg-muted flex items-center justify-center">
                    <Facebook className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-semibold truncate">{a.page_name ?? a.page_id}</div>
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
                    {a.category && <span>{a.category}</span>}
                    <span>Page ID: {a.page_id}</span>
                    <span>
                      Linked{" "}
                      {formatZoned(new Date(a.connected_at), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                    {a.last_verified_at && (
                      <span>
                        Last checked{" "}
                        {formatZoned(new Date(a.last_verified_at), {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    )}
                    {(() => {
                      const d = daysUntil(a.token_expires_at);
                      if (d === null) return null;
                      const cls =
                        d <= 0
                          ? "text-destructive"
                          : d <= 7
                            ? "text-warning"
                            : "text-muted-foreground";
                      return (
                        <span className={cls}>
                          {d <= 0
                            ? "Token expired"
                            : `Token expires in ${d} day${d === 1 ? "" : "s"}`}
                        </span>
                      );
                    })()}
                  </div>

                  {/* Messenger capability status */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {capQ.isLoading && !cap ? (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Checking Messenger capability
                      </span>
                    ) : cap ? (
                      <>
                        <CapabilityChip
                          ok={cap.tokenOk}
                          okLabel="Page token valid"
                          failLabel="Page token rejected"
                        />
                        <CapabilityChip
                          ok={cap.canMessage}
                          okLabel="pages_messaging granted"
                          failLabel="pages_messaging missing"
                        />
                        <CapabilityChip
                          ok={cap.subscribed && cap.missingFields.length === 0}
                          warn={cap.subscribed && cap.missingFields.length > 0}
                          okLabel="Webhooks subscribed"
                          warnLabel={`Missing fields: ${cap.missingFields.join(", ")}`}
                          failLabel="Not receiving messages"
                        />
                        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <Inbox className="w-3 h-3" />
                          {cap.conversations} conversation{cap.conversations === 1 ? "" : "s"}
                          {cap.unread > 0 ? ` · ${cap.unread} unread` : ""} kept on reconnect
                        </span>
                      </>
                    ) : null}
                  </div>

                  {cap?.tokenReason && (
                    <div className="text-xs text-destructive mt-1">{cap.tokenReason}</div>
                  )}
                  {cap?.subscriptionError && (
                    <div className="text-xs text-warning mt-1">{cap.subscriptionError}</div>
                  )}
                  {a.status_reason && (
                    <div className="text-xs text-muted-foreground mt-1">{a.status_reason}</div>
                  )}
                </div>

                <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                  {a.status !== "connected" && (
                    <Button
                      variant="default"
                      size="sm"
                      className="gap-1"
                      onClick={() => reconnectMut.mutate(a.id)}
                      disabled={reconnectMut.isPending || linkMut.isPending}
                      title="Restore delivery for this Page — conversations, assignments and settings are kept"
                    >
                      {(reconnectMut.isPending && reconnectMut.variables === a.id) ||
                      linkMut.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <KeyRound className="w-3.5 h-3.5" />
                      )}
                      Reconnect
                    </Button>
                  )}
                  {a.status !== "disconnected" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => verifyOneMut.mutate(a.id)}
                      disabled={verifyOneMut.isPending}
                      title="Ping Meta to confirm this Page token is still valid"
                    >
                      {verifyOneMut.isPending && verifyOneMut.variables === a.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ShieldCheck className="w-3.5 h-3.5" />
                      )}
                      Verify
                    </Button>
                  )}
                  {a.status === "connected" && (
                    <>
                      {cap && !cap.subscribed && cap.tokenOk && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => subscribeMut.mutate({ accountId: a.id, subscribe: true })}
                          disabled={subscribeMut.isPending}
                          title="Subscribe this app to the Page so inbound messages reach the Inbox"
                        >
                          {subscribeMut.isPending && subscribeMut.variables?.accountId === a.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Radio className="w-3.5 h-3.5" />
                          )}
                          Enable Messenger
                        </Button>
                      )}
                      <Button
                        variant="default"
                        size="sm"
                        className="gap-1"
                        onClick={() => syncMut.mutate(a.id)}
                        disabled={syncMut.isPending}
                        title="Pull threads and message history from Facebook"
                      >
                        {syncMut.isPending && syncMut.variables === a.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        Sync conversations
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => pauseMut.mutate(a.id)}
                        disabled={pauseMut.isPending}
                        title="Pause delivery — all conversations, assignments and settings are preserved"
                      >
                        {pauseMut.isPending && pauseMut.variables === a.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Unplug className="w-3.5 h-3.5" />
                        )}
                        Disconnect
                      </Button>
                    </>
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
