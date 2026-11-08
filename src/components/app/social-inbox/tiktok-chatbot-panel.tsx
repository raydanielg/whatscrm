import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Loader2, Pencil, Plus, Power, PowerOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { sbAny } from "@/lib/supabase/untyped";
import { DEFAULT_TEMPLATES } from "@/lib/chatbots/message-templates";
import { getTikTokDmSetup } from "@/lib/tiktok-dm/accounts.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ChannelIcon } from "@/components/app/inbox/channel-icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type TikTokBot = {
  id: string;
  name: string;
  status: string;
  system_prompt: string | null;
  fallback_message: string | null;
  handoff_enabled: boolean | null;
  handoff_keywords: string[] | null;
  total_sessions: number | null;
  total_messages: number | null;
  widget_config: { tiktok_account_id?: string | null } | null;
  updated_at: string;
};

const ALL_ACCOUNTS = "__all__";
const DEFAULT_INSTRUCTIONS =
  "You are the customer support assistant for our TikTok shop. Answer questions about products, prices, orders and delivery briefly and politely. If you do not know the answer, say a team member will reply soon.";

export function TikTokChatbotPanel() {
  const { data: ws } = useCurrentWorkspace();
  const workspaceId = ws?.id;
  const qc = useQueryClient();
  const fetchSetup = useServerFn(getTikTokDmSetup);
  const [editing, setEditing] = useState<TikTokBot | "new" | null>(null);

  const setup = useQuery({
    queryKey: ["tiktok-dm-setup", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => fetchSetup({ data: { workspaceId: workspaceId! } }),
  });
  const accounts = setup.data?.accounts ?? [];

  const bots = useQuery({
    queryKey: ["tiktok-chatbots", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await sbAny(supabase)
        .from("chatbots")
        .select(
          "id,name,status,system_prompt,fallback_message,handoff_enabled,handoff_keywords,total_sessions,total_messages,widget_config,updated_at",
        )
        .eq("workspace_id", workspaceId!)
        .contains("widget_config", { channel: "tiktok" })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TikTokBot[];
    },
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["tiktok-chatbots", workspaceId] });

  const toggle = useMutation({
    mutationFn: async (bot: TikTokBot) => {
      const { error } = await sbAny(supabase)
        .from("chatbots")
        .update({ status: bot.status === "active" ? "paused" : "active" })
        .eq("id", bot.id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to update"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sbAny(supabase).from("chatbots").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Chatbot deleted");
      refresh();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  const accountLabel = (id?: string | null) => {
    if (!id) return "All TikTok accounts";
    const a = accounts.find((x) => x.id === id);
    return a ? a.displayName || (a.username ? `@${a.username}` : "TikTok account") : "Disconnected account";
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <ChannelIcon channel="tiktok" boxed className="h-9 w-9" />
          <div>
            <h2 className="font-bold text-xl">TikTok Chatbot</h2>
            <p className="text-sm text-muted-foreground max-w-2xl">
              An AI assistant that answers TikTok direct messages automatically. Replies appear in the Inbox
              thread, and a handoff keyword passes the conversation to a human agent.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setEditing("new")} disabled={!workspaceId}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Add chatbot
        </Button>
      </header>

      {!setup.isLoading && accounts.length === 0 && (
        <div className="rounded-control border border-dashed border-border p-4 text-sm text-muted-foreground">
          No TikTok Business account is connected yet, so the bot has nothing to answer.{" "}
          <Link
            to="/api-config/$section"
            params={{ section: "tiktok-dm" }}
            className="font-medium text-primary hover:underline"
          >
            Connect one in TikTok Messages
          </Link>
          .
        </div>
      )}

      {bots.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading chatbots
        </div>
      ) : !bots.data?.length ? (
        <div className="rounded-control border border-dashed border-border p-10 text-center">
          <Bot className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
          <div className="font-medium text-sm">No TikTok chatbot yet</div>
          <div className="text-xs text-muted-foreground mt-1">Click Add chatbot to create one.</div>
        </div>
      ) : (
        <div className="grid gap-3">
          {bots.data.map((bot) => {
            const active = bot.status === "active";
            return (
              <div
                key={bot.id}
                className="rounded-control border border-border bg-card p-4 flex flex-wrap items-start justify-between gap-3"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm">{bot.name}</span>
                    <Badge variant={active ? "default" : "secondary"} className="text-[11px]">
                      {active ? "Active" : bot.status}
                    </Badge>
                    <Badge variant="outline" className="text-[11px]">
                      {accountLabel(bot.widget_config?.tiktok_account_id)}
                    </Badge>
                  </div>
                  {bot.system_prompt && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{bot.system_prompt}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {bot.total_sessions ?? 0} conversations · {bot.total_messages ?? 0} messages
                    {bot.handoff_enabled && bot.handoff_keywords?.length
                      ? ` · Handoff on: ${bot.handoff_keywords.join(", ")}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(bot)} aria-label="Edit chatbot">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggle.mutate(bot)}
                    aria-label={active ? "Pause chatbot" : "Activate chatbot"}
                  >
                    {active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Delete "${bot.name}"?`)) remove.mutate(bot.id);
                    }}
                    aria-label="Delete chatbot"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <section className="rounded-control border border-border p-4 space-y-2">
        <h3 className="text-sm font-semibold">How it works</h3>
        <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">
          <li>Every new text DM is answered by the active bot pinned to that account, or the bot set to all accounts.</li>
          <li>Replies are written by the workspace AI provider (AI Settings) and sent within TikTok's 48-hour reply window.</li>
          <li>When a customer writes a handoff keyword, the bot stops answering that customer and an agent takes over in the Inbox.</li>
          <li>If the AI is unavailable, the fallback message is sent instead.</li>
        </ul>
      </section>

      {editing && (
        <TikTokBotDialog
          bot={editing === "new" ? null : editing}
          workspaceId={workspaceId}
          accounts={accounts.map((a) => ({ id: a.id, label: accountLabel(a.id) }))}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function TikTokBotDialog({
  bot,
  workspaceId,
  accounts,
  onClose,
  onSaved,
}: {
  bot: TikTokBot | null;
  workspaceId: string | undefined;
  accounts: { id: string; label: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(bot?.name ?? "TikTok assistant");
  const [accountId, setAccountId] = useState(bot?.widget_config?.tiktok_account_id ?? ALL_ACCOUNTS);
  const [instructions, setInstructions] = useState(bot?.system_prompt ?? DEFAULT_INSTRUCTIONS);
  const [fallback, setFallback] = useState(bot?.fallback_message ?? DEFAULT_TEMPLATES.fallback);
  const [handoff, setHandoff] = useState(bot?.handoff_enabled ?? true);
  const [keywords, setKeywords] = useState((bot?.handoff_keywords ?? ["human", "agent"]).join(", "));

  const save = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("No workspace");
      if (!name.trim()) throw new Error("Name is required");
      const payload = {
        name: name.trim(),
        system_prompt: instructions.trim() || null,
        fallback_message: fallback.trim() || null,
        handoff_enabled: handoff,
        handoff_keywords: keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
        widget_config: { channel: "tiktok", tiktok_account_id: accountId === ALL_ACCOUNTS ? null : accountId },
      };
      const { error } = bot
        ? await sbAny(supabase).from("chatbots").update(payload).eq("id", bot.id)
        : await sbAny(supabase)
            .from("chatbots")
            .insert({ ...payload, workspace_id: workspaceId, status: "active" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(bot ? "Chatbot updated" : "Chatbot created");
      onSaved();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to save"),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{bot ? "Edit TikTok chatbot" : "New TikTok chatbot"}</DialogTitle>
          <DialogDescription>Answers TikTok direct messages with your AI provider.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tt-bot-name">Name</Label>
            <Input id="tt-bot-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>TikTok account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_ACCOUNTS}>All TikTok accounts</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tt-bot-instructions">Instructions</Label>
            <Textarea
              id="tt-bot-instructions"
              rows={5}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Tell the bot about your business, products, prices and tone.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tt-bot-fallback">Fallback message</Label>
            <Input id="tt-bot-fallback" value={fallback} onChange={(e) => setFallback(e.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded-control border border-border p-3">
            <div>
              <div className="text-sm font-medium">Human handoff</div>
              <div className="text-xs text-muted-foreground">Stop the bot when a customer asks for a person.</div>
            </div>
            <Switch checked={handoff} onCheckedChange={setHandoff} />
          </div>
          {handoff && (
            <div className="space-y-1.5">
              <Label htmlFor="tt-bot-keywords">Handoff keywords (comma separated)</Label>
              <Input id="tt-bot-keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {bot ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
