import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, Plus, Trash2, Power, PowerOff, Instagram as InstagramIcon, Sparkles } from "lucide-react";
import { InstagramChatbotTestDialog } from "./instagram-chatbot-test-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { QuickPickTemplates } from "@/components/app/chatbots/quick-pick-templates";
import { DEFAULT_TEMPLATES } from "@/lib/chatbots/message-templates";
import {
  useChatbotAnalytics,
  formatReplyRate,
  formatRelativeTime,
} from "@/hooks/use-chatbot-analytics";
import { sbAny } from "@/lib/supabase/untyped";

type ChatbotRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  greeting: string | null;
  welcome_message: string | null;
  fallback_message: string | null;
  total_messages: number;
  total_sessions: number;
  handoff_enabled: boolean;
  widget_config: Record<string, unknown> | null;
  updated_at: string;
};

type IgAccountLite = { id: string; username: string | null; name: string | null; status: string };

export function InstagramChatbotsPanel() {
  const { data: ws } = useCurrentWorkspace();
  const workspaceId = ws?.id;
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [testBot, setTestBot] = useState<ChatbotRow | null>(null);

  const bots = useQuery({
    queryKey: ["ig-chatbots", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chatbots")
        .select("id,name,description,status,greeting,welcome_message,fallback_message,total_messages,total_sessions,handoff_enabled,widget_config,updated_at")
        .eq("workspace_id", workspaceId!)
        .contains("widget_config", { channel: "instagram" })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ChatbotRow[];
    },
  });

  const botIds = (bots.data ?? []).map((b) => b.id);
  const analytics = useChatbotAnalytics(botIds);

  const accounts = useQuery({
    queryKey: ["ig-accounts-lite", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instagram_accounts")
        .select("id,username,name,status")
        .eq("workspace_id", workspaceId!)
        .order("connected_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as IgAccountLite[];
    },
  });

  const toggleStatus = useMutation({
    mutationFn: async (bot: ChatbotRow) => {
      const next = bot.status === "active" ? "paused" : "active";
      const { error } = await sbAny(supabase).from("chatbots").update({ status: next }).eq("id", bot.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ig-chatbots", workspaceId] });
      toast.success("Chatbot updated");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to update"),
  });

  const removeBot = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sbAny(supabase).from("chatbots").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ig-chatbots", workspaceId] });
      toast.success("Chatbot deleted");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  const connectedAccounts = (accounts.data ?? []).filter((a) => a.status === "connected");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-xl flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            Instagram Chatbot
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Setup auto replies for Instagram DMs.
          </p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          disabled={!workspaceId || connectedAccounts.length === 0}
          className="gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Chatbot
        </Button>
      </div>

      {connectedAccounts.length === 0 && !accounts.isLoading && (
        <div className="rounded-control border border-dashed border-border p-4 text-sm text-muted-foreground flex items-center gap-3">
          <InstagramIcon className="w-4 h-4 shrink-0" />
          Connect an Instagram Business account first, then come back to create a chatbot.
        </div>
      )}

      {bots.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading chatbots
        </div>
      ) : (bots.data ?? []).length === 0 ? (
        <div className="rounded-control border border-dashed border-border p-10 text-center">
          <Bot className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
          <div className="font-medium text-sm">No Instagram chatbots yet</div>
          <div className="text-xs text-muted-foreground mt-1">
            Click <span className="font-medium text-foreground">Add Chatbot</span> to create your first one.
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {(bots.data ?? []).map((bot) => {
            const cfg = (bot.widget_config ?? {}) as { instagram_account_id?: string };
            const acct = (accounts.data ?? []).find((a) => a.id === cfg.instagram_account_id);
            const isActive = bot.status === "active";
            return (
              <div key={bot.id} className="rounded-control border border-border bg-card p-4 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium text-sm truncate">{bot.name}</div>
                    <Badge variant={isActive ? "default" : "secondary"} className="text-[11px]">
                      {isActive ? "Active" : bot.status}
                    </Badge>
                    {acct && (
                      <Badge variant="outline" className="text-[11px] gap-1">
                        <InstagramIcon className="w-3 h-3" />
                        @{acct.username ?? acct.name ?? "account"}
                      </Badge>
                    )}
                  </div>
                  {bot.description && (
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{bot.description}</div>
                  )}
                  {(() => {
                    const a = analytics.data?.[bot.id];
                    const sessions = a?.sessions ?? bot.total_sessions ?? 0;
                    const messages = a?.messages ?? bot.total_messages ?? 0;
                    return (
                      <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2">
                        <KpiCell label="Sessions" value={String(sessions)} />
                        <KpiCell label="Messages" value={String(messages)} />
                        <KpiCell label="Reply rate" value={formatReplyRate(a?.replyRate ?? null)} />
                        <KpiCell label="Handoffs" value={String(a?.handoffCount ?? 0)} />
                        <KpiCell label="Last active" value={formatRelativeTime(a?.lastActiveAt ?? null)} />
                      </div>
                    );
                  })()}
                  {bot.handoff_enabled && (
                    <div className="text-[11px] text-muted-foreground mt-2">Human handoff on</div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTestBot(bot)}
                    className="gap-1.5 h-8"
                    title="Send a test DM and preview replies"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Test
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => toggleStatus.mutate(bot)}
                    title={isActive ? "Pause" : "Activate"}
                  >
                    {isActive ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Delete "${bot.name}"?`)) removeBot.mutate(bot.id);
                    }}
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AddChatbotDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        accounts={connectedAccounts}
        workspaceId={workspaceId}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["ig-chatbots", workspaceId] });
          setDialogOpen(false);
        }}
      />

      <InstagramChatbotTestDialog
        open={!!testBot}
        onOpenChange={(v) => !v && setTestBot(null)}
        bot={testBot}
        accountHandle={(() => {
          if (!testBot) return undefined;
          const cfg = (testBot.widget_config ?? {}) as { instagram_account_id?: string };
          const acct = (accounts.data ?? []).find((a) => a.id === cfg.instagram_account_id);
          return acct?.username ?? acct?.name ?? undefined;
        })()}
      />
    </div>
  );
}

function AddChatbotDialog({
  open,
  onOpenChange,
  accounts,
  workspaceId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accounts: IgAccountLite[];
  workspaceId: string | undefined;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [greeting, setGreeting] = useState(DEFAULT_TEMPLATES.greeting);
  const [fallback, setFallback] = useState(DEFAULT_TEMPLATES.fallback);
  const [handoffMessage, setHandoffMessage] = useState(DEFAULT_TEMPLATES.handoff);
  const [handoff, setHandoff] = useState(true);
  const [accountId, setAccountId] = useState<string>("");

  const create = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("No workspace");
      if (!name.trim()) throw new Error("Name is required");
      if (!accountId) throw new Error("Select an Instagram account");
      const { error } = await sbAny(supabase).from("chatbots").insert({
        workspace_id: workspaceId,
        name: name.trim(),
        description: description.trim() || null,
        greeting: greeting.trim() || null,
        welcome_message: greeting.trim() || null,
        fallback_message: fallback.trim() || null,
        handoff_enabled: handoff,
        status: "active",
        widget_config: {
          channel: "instagram",
          instagram_account_id: accountId,
          handoff_message: handoffMessage.trim() || null,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Chatbot created");
      setName("");
      setDescription("");
      setAccountId("");
      onCreated();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to create"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Instagram chatbot</DialogTitle>
          <DialogDescription>
            Auto-reply to Instagram DMs. You can refine flows and prompts after creation.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Instagram account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a connected account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    @{a.username ?? a.name ?? a.id.slice(0, 6)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Support Bot" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Handles DMs after hours" />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Greeting</Label>
              <QuickPickTemplates kind="greeting" onPick={setGreeting} />
            </div>
            <Textarea rows={2} value={greeting} onChange={(e) => setGreeting(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Fallback reply</Label>
              <QuickPickTemplates kind="fallback" onPick={setFallback} />
            </div>
            <Textarea rows={2} value={fallback} onChange={(e) => setFallback(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Human handoff message</Label>
              <QuickPickTemplates kind="handoff" onPick={setHandoffMessage} />
            </div>
            <Textarea
              rows={2}
              value={handoffMessage}
              onChange={(e) => setHandoffMessage(e.target.value)}
              disabled={!handoff}
            />
          </div>
          <label className="flex items-center justify-between rounded-control border border-border p-3">
            <div>
              <div className="text-sm font-medium">Human handoff</div>
              <div className="text-xs text-muted-foreground">Escalate to an agent when the bot can't help.</div>
            </div>
            <Switch checked={handoff} onCheckedChange={setHandoff} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create chatbot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KpiCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control border border-border/60 bg-muted/30 px-2 py-1.5 min-w-0">
      <div className="text-[11px] uppercase text-muted-foreground truncate">{label}</div>
      <div className="text-xs font-medium text-foreground truncate">{value}</div>
    </div>
  );
}
