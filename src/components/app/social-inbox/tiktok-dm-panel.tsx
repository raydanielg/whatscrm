import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, CheckCircle2, Copy, ExternalLink, Loader2, Plus, Unplug, Webhook } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChannelIcon } from "@/components/app/inbox/channel-icon";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import {
  disconnectTikTokDmAccount,
  getTikTokDmSetup,
  startTikTokDmConnect,
  syncTikTokDmWebhook,
} from "@/lib/tiktok-dm/accounts.functions";

const REQUIREMENTS = [
  "A TikTok API for Business app (business-api.tiktok.com/portal/apps) with Business Messaging API access approved. This is a different app from the TikTok Login Kit app used for publishing.",
  "TIKTOK_BUSINESS_APP_ID and TIKTOK_BUSINESS_APP_SECRET are set on the server, and the redirect URL below is added to the app.",
  "The connected account is a TikTok Business account set to accept direct messages from everyone.",
  "Not available for accounts registered in the EEA, Switzerland or the UK.",
  "TikTok allows replies only within 48 hours of the customer's last message. Text replies only for now.",
];

function relative(iso: string | null) {
  return iso ? formatDistanceToNow(new Date(iso), { addSuffix: true }) : "never";
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate rounded bg-muted px-2 py-1 text-xs">{value}</code>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label={`Copy ${label}`}
          onClick={() => {
            void navigator.clipboard.writeText(value);
            toast.success(`${label} copied`);
          }}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function TikTokDmPanel() {
  const { data: ws } = useCurrentWorkspace();
  const workspaceId = ws?.id;
  const qc = useQueryClient();
  const fetchSetup = useServerFn(getTikTokDmSetup);
  const startConnect = useServerFn(startTikTokDmConnect);
  const webhookFn = useServerFn(syncTikTokDmWebhook);
  const disconnectFn = useServerFn(disconnectTikTokDmAccount);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  // Surface the OAuth callback outcome once, then clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ok = params.get("tiktok_connected");
    const err = params.get("tiktok_error");
    if (ok) toast.success(`TikTok account ${ok} connected`);
    if (err) toast.error(err);
    if (ok || err) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const setup = useQuery({
    queryKey: ["tiktok-dm-setup", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => fetchSetup({ data: { workspaceId: workspaceId! } }),
  });

  const connect = useMutation({
    mutationFn: () => startConnect({ data: { workspaceId: workspaceId!, origin } }),
    onSuccess: (res) => window.location.assign(res.url),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not start TikTok connect"),
  });

  const webhook = useMutation({
    mutationFn: (register: boolean) => webhookFn({ data: { workspaceId: workspaceId!, origin, register } }),
    onSuccess: (res) =>
      res.matches
        ? toast.success("TikTok webhook points at this app")
        : toast.warning(`TikTok webhook is ${res.current ? `set to ${res.current}` : "not set"}. Click Register.`),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Webhook check failed"),
  });

  const disconnect = useMutation({
    mutationFn: (accountId: string) => disconnectFn({ data: { workspaceId: workspaceId!, accountId } }),
    onSuccess: () => {
      toast.success("TikTok account disconnected");
      void qc.invalidateQueries({ queryKey: ["tiktok-dm-setup", workspaceId] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Disconnect failed"),
  });

  const data = setup.data;
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <ChannelIcon channel="tiktok" boxed className="h-9 w-9" />
          <div>
            <h2 className="font-bold text-xl">TikTok Messages</h2>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Direct messages sent to your TikTok Business account arrive in the Inbox in real time (TikTok
              channel). Replies you send from the Inbox go back as TikTok DMs through the official Business
              Messaging API.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={() => connect.mutate()}
          disabled={!workspaceId || !data?.appConfigured || connect.isPending}
        >
          {connect.isPending ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5 mr-1.5" />
          )}
          Connect TikTok Business account
        </Button>
      </header>

      <section className="rounded-control border border-border p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {data?.appConfigured ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <AlertCircle className="h-4 w-4 text-destructive" />
          )}
          App credentials
        </div>
        <p className="text-xs text-muted-foreground">
          {setup.isLoading
            ? "Checking…"
            : data?.appConfigured
              ? "Configured on the server."
              : `Missing on the server: ${data?.missingEnv.join(", ")}. Add them to the deployment environment and redeploy.`}
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Connected accounts</h3>
        {setup.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading
          </div>
        ) : setup.isError ? (
          <p className="text-sm text-destructive">
            {setup.error instanceof Error ? setup.error.message : "Could not load the setup."}
          </p>
        ) : !data?.accounts.length ? (
          <div className="rounded-control border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No TikTok Business account connected yet.
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-control border border-border">
            {data.accounts.map((a) => (
              <li key={a.id} className="p-3 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{a.displayName || a.username || "TikTok account"}</span>
                  {a.username && <span className="text-xs text-muted-foreground font-mono">@{a.username}</span>}
                  <Badge variant={a.status === "active" ? "outline" : "destructive"} className="text-[11px]">
                    {a.status === "reauth_required" ? "Reconnect needed" : a.status}
                  </Badge>
                  <span className="ml-auto text-xs text-muted-foreground">Last message {relative(a.lastEventAt)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => disconnect.mutate(a.id)}
                    disabled={disconnect.isPending}
                  >
                    <Unplug className="h-3.5 w-3.5 mr-1" /> Disconnect
                  </Button>
                </div>
                {a.lastError && (
                  <p className="text-xs text-destructive flex items-start gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 mt-px shrink-0" /> {a.lastError}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-control border border-border p-4 space-y-3">
        <h3 className="text-sm font-semibold">TikTok app settings</h3>
        <CopyRow label="Redirect URL" value={`${origin}/api/public/tiktok-dm/callback`} />
        <CopyRow label="Webhook callback URL" value={`${origin}/api/public/webhooks/tiktok`} />
        <p className="text-xs text-muted-foreground">
          The webhook is set once per TikTok app. Register points the app's DIRECT_MESSAGE webhook at this
          deployment (use your public HTTPS domain, not localhost).
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!data?.appConfigured || webhook.isPending}
            onClick={() => webhook.mutate(false)}
          >
            Check
          </Button>
          <Button size="sm" disabled={!data?.appConfigured || webhook.isPending} onClick={() => webhook.mutate(true)}>
            {webhook.isPending ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Webhook className="h-3.5 w-3.5 mr-1.5" />
            )}
            Register webhook
          </Button>
        </div>
      </section>

      <section className="rounded-control border border-border p-4 space-y-2">
        <h3 className="text-sm font-semibold">Requirements</h3>
        <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">
          {REQUIREMENTS.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <Link to="/inbox" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          Open the Inbox <ExternalLink className="h-3 w-3" />
        </Link>
      </section>
    </div>
  );
}
