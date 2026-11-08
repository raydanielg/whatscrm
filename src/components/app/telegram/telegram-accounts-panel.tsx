import { Brand } from "@/components/brand";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Send,
  Trash2,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  Ban as BanIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import {
  connectTelegramBot,
  deleteTelegramAccount,
  hasStoredTelegramToken,
  listTelegramAccounts,
  verifyTelegramAccount,
  type TelegramAccountSummary,
} from "@/lib/telegram/accounts.functions";
import { TelegramWebhookEventsPanel } from "./telegram-webhook-events-panel";

function origin() {
  return typeof window !== "undefined" ? window.location.origin : "";
}

type StatusMeta = {
  label: string;
  hint: string;
  variant: "secondary" | "destructive" | "outline";
  dot: string;
  canSend: boolean;
};

const STATUS_META: Record<string, StatusMeta> = {
  connected: {
    label: "Connected",
    hint: "Bot token valid and webhook pointing at this app. Sending is enabled.",
    variant: "secondary",
    dot: "bg-emerald-500",
    canSend: true,
  },
  token_invalid: {
    label: "Token invalid",
    hint: "Telegram rejected the stored bot token. Reconnect the bot with a fresh BotFather token.",
    variant: "destructive",
    dot: "bg-destructive",
    canSend: false,
  },
  webhook_not_set: {
    label: "Webhook not set",
    hint: "The bot token works, but Telegram is not delivering updates to this app. Run Verify to re-register.",
    variant: "outline",
    dot: "bg-amber-500",
    canSend: false,
  },
};

function statusMeta(status: string): StatusMeta {
  return (
    STATUS_META[status] ?? {
      label: status || "Unknown",
      hint: "Connection state could not be confirmed. Run Verify to refresh it.",
      variant: "destructive",
      dot: "bg-destructive",
      canSend: false,
    }
  );
}

export function TelegramAccountsPanel() {
  const { data: ws } = useCurrentWorkspace();
  const workspaceId = ws?.id ?? null;
  const qc = useQueryClient();
  const [token, setToken] = useState("");

  const accountsQuery = useQuery({
    queryKey: ["telegram-accounts", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const res = await listTelegramAccounts({ data: { workspaceId: workspaceId as string } });
      return res.accounts as TelegramAccountSummary[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["telegram-accounts", workspaceId] });

  const storedToken = useQuery({
    queryKey: ["telegram-stored-token"],
    queryFn: async () => (await hasStoredTelegramToken()).available,
  });

  const connect = useMutation({
    mutationFn: async (useStored?: boolean) =>
      connectTelegramBot({
        data: {
          workspaceId: workspaceId as string,
          ...(useStored ? {} : { botToken: token.trim() }),
          origin: origin(),
        },
      }),
    onSuccess: (res) => {
      setToken("");
      const name = res.botUsername ? `@${res.botUsername}` : "Bot";
      if (res.alreadyConnected) {
        toast.info(`${name} was already connected — token and webhook refreshed`, {
          description: "Paste a different BotFather token to add another bot.",
        });
      } else {
        toast.success(`${name} connected — webhook registered`, {
          description: "Its chats now appear in the unified Inbox.",
        });
      }
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const verify = useMutation({
    mutationFn: async (accountId: string) =>
      verifyTelegramAccount({ data: { accountId, origin: origin() } }),
    onSuccess: (r) => {
      if (r.ok) toast.success(`Webhook healthy · ${r.pendingUpdates} pending updates`);
      else toast.warning(r.lastError ?? "Webhook is not pointing at this app");
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (accountId: string) => deleteTelegramAccount({ data: { accountId } }),
    onSuccess: () => {
      toast.success("Telegram bot removed");
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const accounts = accountsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="font-bold text-xl">Telegram bots</h2>
        <p className="text-sm text-muted-foreground">
          Connect as many Telegram bots as you need — each one gets its own webhook and shows up
          as a separate account in the unified Inbox alongside WhatsApp, Messenger and Instagram.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {accounts.length > 0 ? "Connect another bot" : "Connect a bot"}
          </CardTitle>
          <CardDescription>
            Create a bot with{" "}
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noreferrer"
              className="underline inline-flex items-center gap-1"
            >
              @BotFather <ExternalLink className="h-3 w-3" />
            </a>{" "}
            and paste the token below. <Brand /> validates it and registers the webhook for you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tg-token">Bot token</Label>
            <Input
              id="tg-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="123456789:AAE"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => connect.mutate(false)}
              disabled={!workspaceId || token.trim().length < 20 || connect.isPending}
            >
              <Send className="h-4 w-4 mr-1.5" />
              {connect.isPending ? "Connecting" : "Connect bot"}
            </Button>
            {storedToken.data && (
              <Button
                variant="outline"
                onClick={() => connect.mutate(true)}
                disabled={!workspaceId || connect.isPending}
              >
                <ShieldCheck className="h-4 w-4 mr-1.5" />
                Use saved TELEGRAM_BOT_TOKEN
              </Button>
            )}
          </div>
          {storedToken.data && (
            <p className="text-xs text-muted-foreground">
              A TELEGRAM_BOT_TOKEN secret is configured — you can connect without pasting anything.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            The token is encrypted at rest and never exposed to the browser.
          </p>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {accountsQuery.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading bots</div>
        ) : accounts.length === 0 ? (
          <div className="rounded-control border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No Telegram bots connected yet.
          </div>
        ) : (
          accounts.map((a) => {
            const meta = statusMeta(a.status);
            return (
              <div
                key={a.id}
                className="flex flex-wrap items-center gap-3 rounded-control border border-border p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">
                      {a.bot_name ?? a.bot_username ?? `Bot ${a.bot_id}`}
                    </span>
                    {a.bot_username && (
                      <span className="text-xs text-muted-foreground">@{a.bot_username}</span>
                    )}
                    <Badge variant={meta.variant} className="gap-1">
                      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden />
                      {meta.canSend ? (
                        <ShieldCheck className="h-3 w-3" />
                      ) : (
                        <AlertTriangle className="h-3 w-3" />
                      )}
                      {meta.label}
                    </Badge>
                    {!meta.canSend && (
                      <Badge variant="outline" className="gap-1 text-[11px]">
                        <BanIcon className="h-3 w-3" />
                        Sending disabled
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{meta.hint}</p>
                  {a.status_reason && (
                    <p className="text-xs text-destructive mt-1 [overflow-wrap:anywhere]">
                      {a.status_reason}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-1 [overflow-wrap:anywhere]">
                    {origin()}/api/public/webhooks/telegram/{a.id}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => verify.mutate(a.id)}
                    disabled={verify.isPending}
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 mr-1.5 ${verify.isPending ? "animate-spin" : ""}`}
                    />
                    Verify
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove.mutate(a.id)}
                    disabled={remove.isPending}
                    aria-label="Remove bot"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <TelegramWebhookEventsPanel workspaceId={workspaceId} />
    </div>
  );
}
