import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppTopbar } from "@/components/app/app-topbar";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLiveChatAccounts, liveChatBotId } from "@/hooks/use-livechat-accounts";
import { bulkUpdateChatbotStatus } from "@/lib/chatbots/chatbots.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Bot, Inbox, Copy, ExternalLink, Search, MessageCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/livechat/bots")({
  head: () => ({
    meta: [
      { title: "Live Chat Bots" },
      {
        name: "description",
        content:
          "Enable or disable widget-enabled chatbots and inspect their inbox channel mapping.",
      },
      { property: "og:title", content: "Live Chat Bots" },
      {
        property: "og:description",
        content:
          "Manage which website chatbots serve the Live Chat widget and how they map to inbox accounts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LiveChatBotsPage,
});

function copy(value: string) {
  void navigator.clipboard.writeText(value).then(
    () => toast.success("Copied"),
    () => toast.error("Copy failed"),
  );
}

function LiveChatBotsPage() {
  const { active: workspace } = useCurrentWorkspace();
  const workspaceId = workspace?.id;
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const accounts = useLiveChatAccounts(workspaceId);

  const setStatus = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) =>
      bulkUpdateChatbotStatus({ data: { ids: [v.id], status: v.enabled ? "active" : "paused" } }),
    onSuccess: (_r, v) => {
      toast.success(v.enabled ? "Bot enabled" : "Bot disabled");
      void qc.invalidateQueries({ queryKey: ["livechat-accounts", workspaceId] });
      void qc.invalidateQueries({ queryKey: ["chatbots"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = accounts.data ?? [];
    if (!term) return list;
    return list.filter((a) => (a.display_name ?? "").toLowerCase().includes(term));
  }, [accounts.data, q]);

  const connectedCount = (accounts.data ?? []).filter((a) => a.status === "connected").length;

  return (
    <>
      <AppTopbar
        title="Live Chat Bots"
        subtitle="Enable or disable each widget-enabled chatbot and review how it maps to the omnichannel inbox."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <MessageCircle className="h-3 w-3" /> {connectedCount} enabled
            </Badge>
            <Button asChild size="sm" variant="outline">
              <Link to="/chatbots">
                <Bot className="h-4 w-4 mr-2" /> All chatbots
              </Link>
            </Button>
          </div>
        }
      />
      <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search bots"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search live chat bots"
          />
        </div>

        {accounts.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded" />
            ))}
          </div>
        ) : accounts.isError ? (
          <Card>
            <CardContent className="py-10 text-center space-y-3">
              <p className="text-sm text-destructive">Could not load live chat bots.</p>
              <Button size="sm" variant="outline" onClick={() => void accounts.refetch()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <Bot className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {q
                  ? "No bots match your search."
                  : "No chatbots yet. Create one to serve the Live Chat widget."}
              </p>
              <Button asChild size="sm">
                <Link to="/chatbots">
                  <Bot className="h-4 w-4 mr-2" /> Go to chatbots
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {rows.map((a) => {
              const botId = liveChatBotId(a.id) ?? "";
              const enabled = a.status === "connected";
              const pending = setStatus.isPending && setStatus.variables?.id === botId;
              return (
                <Card key={a.id}>
                  <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                    <div className="space-y-1">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Bot className="h-4 w-4 text-muted-foreground" />
                        {a.display_name}
                      </CardTitle>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={
                            enabled
                              ? "border-emerald-400 text-emerald-700"
                              : "border-muted-foreground/40 text-muted-foreground"
                          }
                        >
                          {enabled ? "Connected" : "Disabled"}
                        </Badge>
                        {a.status_reason && (
                          <span className="text-xs text-muted-foreground">{a.status_reason}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {enabled ? "Enabled" : "Disabled"}
                      </span>
                      <Switch
                        checked={enabled}
                        disabled={pending}
                        aria-label={`Toggle ${a.display_name}`}
                        onCheckedChange={(v) => setStatus.mutate({ id: botId, enabled: v })}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
                      <Detail
                        label="Inbox channel"
                        value="Live Chat (webchat)"
                        icon={<Inbox className="h-3.5 w-3.5" />}
                      />
                      <Detail label="Provider" value={a.provider} />
                      <Detail
                        label="Inbox account id"
                        value={a.id}
                        mono
                        action={
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => copy(a.id)}
                            aria-label="Copy inbox account id"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        }
                      />
                      <Detail
                        label="Chatbot id"
                        value={botId}
                        mono
                        action={
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => copy(botId)}
                            aria-label="Copy chatbot id"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        }
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Conversations from this bot are matched in the inbox via{" "}
                      <code>metadata.chatbot_id</code>.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/chatbots/$botId/widget-builder" params={{ botId }}>
                          Widget builder
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link to="/chatbots/$botId" params={{ botId }}>
                          <ExternalLink className="h-4 w-4 mr-2" /> Bot settings
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/inbox" search={{ channels: "webchat", account: a.id }}>
                          <Inbox className="h-4 w-4 mr-2" /> Open in inbox
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function Detail({
  label,
  value,
  mono,
  icon,
  action,
}: {
  label: string;
  value: string;
  mono?: boolean;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded border bg-muted/30 p-3 space-y-1">
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className="flex items-center gap-1">
        <span className={`truncate ${mono ? "font-mono text-xs" : "text-sm"}`} title={value}>
          {value}
        </span>
        {action}
      </div>
    </div>
  );
}
