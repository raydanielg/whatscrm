import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppTopbar } from "@/components/app/app-topbar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getChatbot,
  upsertChatbot,
  listDeployments,
  upsertDeployment,
  removeDeployment,
  chatbotChat,
  listChatbotSessions,
  deleteChatbot,
  duplicateChatbot,
  bulkUpdateChatbotStatus,
  disableInstalledChatbot,
  uninstallInstalledChatbot,
  reEnableInstalledChatbot,
  type Chatbot,
  type ChatbotChannel,
  type ChatbotReply,
} from "@/lib/chatbots/chatbots.functions";
import { ChatbotAnalyticsTab } from "@/components/app/chatbots/analytics-tab";
import { useState } from "react";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichTextarea } from "@/shared/components/rich-textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/shared/components/confirm-dialog";
import {
  Bot,
  Send,
  Save,
  Trash2,
  ArrowLeft,
  Sparkles,
  Loader2,
  User,
  Workflow,
  GraduationCap,
  MoreHorizontal,
  Copy,
  Pause,
  Play,
  Check,
  X,
  PowerOff,
  Power,
  PackageX,
  PackageCheck,
} from "lucide-react";
import { toast } from "sonner";
import { ChatbotTrainingTab } from "@/components/app/chatbots/training-tab";
import {
  UninstallTemplateDialog,
  type TemplateAction,
} from "@/components/chatbots/uninstall-template-dialog";
import { useChatbotPermissions } from "@/hooks/use-chatbot-permissions";

export const Route = createFileRoute("/_authenticated/chatbots/$botId")({
  head: () => ({ meta: [{ title: "Chatbot Editor" }] }),
  component: ChatbotEditorPage,
});

const CHANNELS: { id: ChatbotChannel; label: string; color: string }[] = [
  { id: "whatsapp", label: "WhatsApp", color: "text-green-500" },
  { id: "instagram", label: "Instagram", color: "text-pink-500" },
  { id: "messenger", label: "Messenger", color: "text-blue-500" },
  { id: "telegram", label: "Telegram", color: "text-sky-500" },
  { id: "livechat", label: "Live Chat", color: "text-primary" },
  { id: "sms", label: "SMS", color: "text-amber-500" },
  { id: "email", label: "Email", color: "text-rose-500" },
];

function ChatbotEditorPage() {
  const { botId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const bot = useQuery({
    queryKey: ["chatbot", botId],
    queryFn: () => getChatbot({ data: { id: botId } }),
  });

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [templateAction, setTemplateAction] = useState<TemplateAction | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["chatbot", botId] });
    qc.invalidateQueries({ queryKey: ["chatbots"] });
  };

  const renameMut = useMutation({
    mutationFn: (name: string) =>
      upsertChatbot({ data: { id: botId, workspaceId: bot.data!.workspace_id, name } }),
    onSuccess: () => {
      toast.success("Renamed");
      setEditingName(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const statusMut = useMutation({
    mutationFn: (status: Chatbot["status"]) =>
      bulkUpdateChatbotStatus({ data: { ids: [botId], status } }),
    onSuccess: () => {
      toast.success("Status updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const duplicateMut = useMutation({
    mutationFn: () => duplicateChatbot({ data: { id: botId } }),
    onSuccess: (row) => {
      toast.success("Duplicated");
      invalidate();
      navigate({ to: "/chatbots/$botId", params: { botId: row.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: () => deleteChatbot({ data: { ids: [botId] } }),
    onSuccess: () => {
      toast.success("Chatbot moved to trash");
      invalidate();
      navigate({ to: "/chatbots" });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const disableInstalledMut = useMutation({
    mutationFn: (reason: string) => disableInstalledChatbot({ data: { id: botId, reason } }),
    onSuccess: () => {
      toast.success("Template bot disabled");
      setTemplateAction(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const uninstallInstalledMut = useMutation({
    mutationFn: (reason: string) => uninstallInstalledChatbot({ data: { id: botId, reason } }),
    onSuccess: () => {
      toast.success("Template bot uninstalled");
      setTemplateAction(null);
      invalidate();
      navigate({ to: "/chatbots" });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const reEnableInstalledMut = useMutation({
    mutationFn: () => reEnableInstalledChatbot({ data: { id: botId } }),
    onSuccess: () => {
      toast.success("Template bot re-enabled");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const perms = useChatbotPermissions(bot.data?.workspace_id);

  if (bot.isLoading)
    return (
      <div className="p-12 text-center text-muted-foreground">
        <Loader2 className="animate-spin inline mr-2 h-4 w-4" />
        Loading
      </div>
    );
  if (!bot.data)
    return (
      <div className="p-12 text-center text-muted-foreground">
        Chatbot not found.{" "}
        <Link to="/chatbots" className="text-primary underline">
          Back
        </Link>
      </div>
    );

  const b = bot.data;
  const readOnly = !perms.canManage;
  const startRename = () => {
    if (!perms.canRename) return;
    setNameDraft(b.name);
    setEditingName(true);
  };
  const submitRename = () => {
    const v = nameDraft.trim();
    if (!v || v === b.name) {
      setEditingName(false);
      return;
    }
    renameMut.mutate(v);
  };

  return (
    <>
      <AppTopbar
        title={
          editingName ? (
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitRename();
                  if (e.key === "Escape") setEditingName(false);
                }}
                className="h-8 w-56"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={submitRename}
                disabled={renameMut.isPending}
                aria-label="Save name"
              >
                {renameMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setEditingName(false)}
                aria-label="Cancel"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <button
              onClick={startRename}
              disabled={!perms.canRename}
              className="group inline-flex items-center gap-2 text-left hover:text-primary transition-colors disabled:hover:text-inherit disabled:cursor-default"
              title={perms.canRename ? "Click to rename" : "Read-only role"}
            >
              <span className="truncate">{b.name}</span>
              <Badge
                variant={b.status === "active" ? "default" : "secondary"}
                className="capitalize text-xs"
              >
                {b.status}
              </Badge>
              {readOnly && (
                <Badge variant="outline" className="text-xs">
                  Read-only
                </Badge>
              )}
            </button>
          )
        }
        subtitle="Chatbot Builder"
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => navigate({ to: "/chatbots/$botId/builder", params: { botId } })}
              disabled={!perms.canManage}
              title={perms.canManage ? undefined : "Read-only role"}
            >
              <Workflow className="h-4 w-4 " /> Chatbot Builder
            </Button>
            {perms.canManage && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" aria-label="More actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {b.status === "active" ? (
                    <DropdownMenuItem
                      disabled={!perms.canChangeStatus}
                      onClick={() => statusMut.mutate("paused")}
                    >
                      <Pause className="h-4 w-4 mr-2" /> Pause
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      disabled={!perms.canChangeStatus}
                      onClick={() => statusMut.mutate("active")}
                    >
                      <Play className="h-4 w-4 mr-2" /> Activate
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    disabled={!perms.canDuplicate || duplicateMut.isPending}
                    onClick={() => duplicateMut.mutate()}
                  >
                    <Copy className="h-4 w-4 mr-2" /> Duplicate
                  </DropdownMenuItem>
                  {b.installed_from_template_id && (
                    <>
                      <DropdownMenuSeparator />
                      <div className="px-2 py-1 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <PackageCheck className="h-3 w-3" /> Installed from template
                      </div>
                      {!b.disabled_at ? (
                        <DropdownMenuItem
                          disabled={!perms.canManage}
                          onClick={() => setTemplateAction("disable")}
                        >
                          <PowerOff className="h-4 w-4 mr-2" /> Disable template bot
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          disabled={!perms.canManage || reEnableInstalledMut.isPending}
                          onClick={() => reEnableInstalledMut.mutate()}
                        >
                          <Power className="h-4 w-4 mr-2" /> Re-enable template bot
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        disabled={!perms.canUninstallTemplate}
                        className="text-destructive focus:text-destructive"
                        onClick={() => setTemplateAction("uninstall")}
                      >
                        <PackageX className="h-4 w-4 mr-2" /> Uninstall template bot
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={!perms.canDelete}
                    className="text-destructive focus:text-destructive"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button size="sm" variant="ghost" onClick={() => navigate({ to: "/chatbots" })}>
              <ArrowLeft className="h-4 w-4 " /> Back
            </Button>
          </div>
        }
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Move chatbot to trash?"
        description={
          <>
            Chatbot <strong>{b.name}</strong> will be moved to Trash. You can restore it later.
          </>
        }
        destructive
        confirmLabel="Move to trash"
        onConfirm={async () => {
          await deleteMut.mutateAsync();
        }}
      />
      <UninstallTemplateDialog
        open={templateAction !== null}
        onOpenChange={(v) => !v && setTemplateAction(null)}
        action={templateAction ?? "disable"}
        botName={b.name}
        pending={disableInstalledMut.isPending || uninstallInstalledMut.isPending}
        onConfirm={async (reason) => {
          if (templateAction === "disable") await disableInstalledMut.mutateAsync(reason);
          else if (templateAction === "uninstall") await uninstallInstalledMut.mutateAsync(reason);
        }}
      />
      <main className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <Tabs defaultValue="general" className="space-y-4">
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="training">
              <GraduationCap className="h-3.5 w-3.5 " />
              Training
            </TabsTrigger>
            <TabsTrigger value="ai">AI &amp; RAG</TabsTrigger>
            <TabsTrigger value="deploy">Channels</TabsTrigger>
            <TabsTrigger value="playground">Playground</TabsTrigger>
            <TabsTrigger value="sessions">Sessions</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="test">Test chat</TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <GeneralTab
              bot={bot.data}
              onSaved={() => qc.invalidateQueries({ queryKey: ["chatbot", botId] })}
            />
          </TabsContent>
          <TabsContent value="training">
            <ChatbotTrainingTab
              bot={bot.data}
              onSaved={() => qc.invalidateQueries({ queryKey: ["chatbot", botId] })}
            />
          </TabsContent>
          <TabsContent value="ai">
            <AITab
              bot={bot.data}
              onSaved={() => qc.invalidateQueries({ queryKey: ["chatbot", botId] })}
            />
          </TabsContent>
          <TabsContent value="deploy">
            <DeployTab bot={bot.data} />
          </TabsContent>
          <TabsContent value="playground">
            <PlaygroundTab bot={bot.data} />
          </TabsContent>
          <TabsContent value="sessions">
            <SessionsTab bot={bot.data} />
          </TabsContent>
          <TabsContent value="analytics">
            <ChatbotAnalyticsTab bot={bot.data} />
          </TabsContent>
          <TabsContent value="test">
            <TestChatTab bot={bot.data} />
          </TabsContent>
        </Tabs>
      </main>
    </>
  );
}

// ---------- Tabs ----------

/**
 * Runs the live chat widget inside this page, so the bot can be tried without
 * installing the embed snippet on a website. Uses the same iframe route the
 * public widget loads, so what you see here matches what visitors get.
 */
function TestChatTab({ bot }: { bot: Chatbot }) {
  const src = `/embed/chatbots/${encodeURIComponent(bot.id)}?color=${encodeURIComponent("#075E54")}&pos=br`;
  return (
    <div className="grid gap-4 md:grid-cols-[1fr_380px] items-start">
      <div className="rounded-control border border-border bg-surface p-4 space-y-2 text-sm">
        <div className="font-semibold">Test "{bot.name}"</div>
        <p className="text-muted-foreground">
          This is the same chat window visitors see. Messages you send here create real chatbot
          sessions, so use them for testing only.
        </p>
        {bot.status !== "active" && (
          <p className="text-amber-600">
            This chatbot is not active yet, so the chat will show an unavailable message.
          </p>
        )}
      </div>
      <div className="rounded-control border border-border overflow-hidden shadow-sm bg-background">
        <iframe title="Test chat" src={src} className="w-full h-150 border-0" />
      </div>
    </div>
  );
}

function GeneralTab({ bot, onSaved }: { bot: Chatbot; onSaved: () => void }) {
  const [name, setName] = useState(bot.name);
  const [description, setDescription] = useState(bot.description ?? "");
  const [status, setStatus] = useState(bot.status);
  const [welcome, setWelcome] = useState(bot.welcome_message);
  const [fallback, setFallback] = useState(bot.fallback_message);
  const save = useMutation({
    mutationFn: () =>
      upsertChatbot({
        data: {
          id: bot.id,
          workspaceId: bot.workspace_id,
          name,
          description,
          status,
          welcome_message: welcome,
          fallback_message: fallback,
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="rounded-control border border-border bg-surface p-6 space-y-4 max-w-3xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Status</Label>
          <select
            className="w-full h-9 rounded-control border border-input bg-background px-3 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as Chatbot["status"])}
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>
      <div>
        <Label>Description</Label>
        <RichTextarea rows={2} value={description} onChange={(v) => setDescription(v)} />
      </div>
      <div>
        <Label>Welcome message</Label>
        <RichTextarea rows={2} value={welcome} onChange={(v) => setWelcome(v)} />
      </div>
      <div>
        <Label>Fallback message</Label>
        <RichTextarea rows={2} value={fallback} onChange={(v) => setFallback(v)} />
      </div>
      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        <Save className="h-4 w-4 " /> Save
      </Button>
    </div>
  );
}

function AITab({ bot, onSaved }: { bot: Chatbot; onSaved: () => void }) {
  const [systemPrompt, setSystemPrompt] = useState(bot.system_prompt);
  const [model, setModel] = useState(bot.model ?? "google/gemini-2.5-flash");
  const [temperature, setTemperature] = useState(Number(bot.temperature));
  const [maxTokens, setMaxTokens] = useState(bot.max_tokens);
  const [ragEnabled, setRagEnabled] = useState(bot.rag_enabled);
  const [ragSim, setRagSim] = useState(Number(bot.rag_min_similarity));
  const [ragCount, setRagCount] = useState(bot.rag_match_count);
  const [handoffEnabled, setHandoffEnabled] = useState(bot.handoff_enabled);
  const [keywords, setKeywords] = useState((bot.handoff_keywords ?? []).join(", "));

  const save = useMutation({
    mutationFn: () =>
      upsertChatbot({
        data: {
          id: bot.id,
          workspaceId: bot.workspace_id,
          name: bot.name,
          system_prompt: systemPrompt,
          model,
          temperature,
          max_tokens: maxTokens,
          rag_enabled: ragEnabled,
          rag_min_similarity: ragSim,
          rag_match_count: ragCount,
          handoff_enabled: handoffEnabled,
          handoff_keywords: keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
        },
      }),
    onSuccess: () => {
      toast.success("AI settings saved");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="rounded-control border border-border bg-surface p-6 space-y-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> AI Model
        </h3>
        <div>
          <Label>System prompt</Label>
          <Textarea
            rows={6}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
          />
        </div>
        <div>
          <Label>Model</Label>
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="google/gemini-2.5-flash"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Any supported provider model. Uses your workspace's default AI provider.
          </p>
        </div>
        <div>
          <Label>Temperature: {temperature.toFixed(2)}</Label>
          <Slider
            min={0}
            max={2}
            step={0.1}
            value={[temperature]}
            onValueChange={(v) => setTemperature(v[0])}
          />
        </div>
        <div>
          <Label>Max tokens</Label>
          <Input
            type="number"
            value={maxTokens}
            onChange={(e) => setMaxTokens(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="rounded-control border border-border bg-surface p-6 space-y-4">
        <h3 className="font-semibold">Knowledge Base (RAG)</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Enable retrieval-augmented generation</p>
            <p className="text-xs text-muted-foreground">Pull context from your knowledge base.</p>
          </div>
          <Switch checked={ragEnabled} onCheckedChange={setRagEnabled} />
        </div>
        <div>
          <Label>Minimum similarity: {ragSim.toFixed(2)}</Label>
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={[ragSim]}
            onValueChange={(v) => setRagSim(v[0])}
          />
        </div>
        <div>
          <Label>Chunks to retrieve</Label>
          <Input
            type="number"
            min={1}
            max={20}
            value={ragCount}
            onChange={(e) => setRagCount(Number(e.target.value))}
          />
        </div>

        <div className="pt-4 border-t border-border">
          <h4 className="font-semibold mb-2">Human handoff</h4>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Escalate to an agent on trigger keywords.
            </p>
            <Switch checked={handoffEnabled} onCheckedChange={setHandoffEnabled} />
          </div>
          <div className="mt-3">
            <Label>Trigger keywords (comma separated)</Label>
            <Input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="agent, human, support"
            />
          </div>
        </div>

        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="h-4 w-4 " /> Save AI settings
        </Button>
      </div>
    </div>
  );
}

function DeployTab({ bot }: { bot: Chatbot }) {
  const qc = useQueryClient();
  const deps = useQuery({
    queryKey: ["chatbot-deploys", bot.id],
    queryFn: () => listDeployments({ data: { chatbotId: bot.id } }),
  });
  const toggle = useMutation({
    mutationFn: (channel: ChatbotChannel) =>
      upsertDeployment({
        data: { workspaceId: bot.workspace_id, chatbotId: bot.id, channel, enabled: true },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatbot-deploys", bot.id] }),
  });
  const disable = useMutation({
    mutationFn: (id: string) => removeDeployment({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chatbot-deploys", bot.id] }),
  });
  return (
    <div className="space-y-3">
      <div className="rounded-control border border-border bg-surface p-4 flex items-center justify-between gap-3">
        <div className="text-sm">
          <div className="font-semibold text-violet-500">Web widget</div>
          <p className="text-muted-foreground text-xs">
            Website-এ বট বসানো ও রাউটিং Chat Widgets থেকে করুন।
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/widgets">Chat Widgets খুলুন</Link>
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {CHANNELS.map((c) => {
          const active = deps.data?.find((d) => d.channel === c.id && d.enabled);
          return (
            <div key={c.id} className="rounded-control border border-border bg-surface p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className={`font-semibold ${c.color}`}>{c.label}</div>
                {active && (
                  <Badge variant="default" className="text-xs">
                    Live
                  </Badge>
                )}
              </div>
              {active ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => disable.mutate(active.id)}
                >
                  <Trash2 className="h-3 w-3 " /> Disconnect
                </Button>
              ) : (
                <Button size="sm" className="w-full" onClick={() => toggle.mutate(c.id)}>
                  Connect
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlaygroundTab({ bot }: { bot: Chatbot }) {
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [messages, setMessages] = useState<
    Array<{ role: "user" | "assistant"; content: string; citations?: ChatbotReply["citations"] }>
  >([{ role: "assistant", content: bot.welcome_message }]);
  const send = useMutation({
    // Text is passed as a variable: the input is cleared right after submit, so
    // reading it from state here would send an empty message.
    mutationFn: (text: string) =>
      chatbotChat({
        data: { chatbotId: bot.id, sessionId, channel: "web", message: text },
      }),
    onSuccess: (res) => {
      setSessionId(res.sessionId);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: res.reply, citations: res.citations },
      ]);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const handleSubmit = () => {
    const text = input.trim();
    if (!text) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    send.mutate(text);
  };
  const startNewConversation = () => {
    setSessionId(undefined);
    setMessages([{ role: "assistant", content: bot.welcome_message }]);
    setInput("");
  };
  return (
    <div className="rounded-control border border-border bg-surface flex flex-col h-[70vh] max-w-3xl mx-auto">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <Bot className="h-5 w-5 text-primary" />
        <div>
          <div className="font-semibold text-sm">{bot.name}</div>
          <div className="text-xs text-muted-foreground">Live preview</div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={startNewConversation}
          disabled={send.isPending}
        >
          New conversation
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            <div
              className={`w-8 h-8 rounded-full grid place-items-center flex-shrink-0 ${m.role === "user" ? "bg-primary/10 text-primary" : "bg-muted"}`}
            >
              {m.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </div>
            <div
              className={`rounded-control px-4 py-2 max-w-[80%] text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.citations && Array.isArray(m.citations) && m.citations.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/50 text-xs opacity-80">
                  <div className="font-semibold mb-1">Sources</div>
                  {m.citations.map((c, ci) => (
                    <div key={ci} className="truncate">
                      [{ci + 1}] {c.title} · {(c.similarity * 100).toFixed(0)}%
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {send.isPending && (
          <div className="flex gap-2">
            <div className="w-8 h-8 rounded-full grid place-items-center bg-muted">
              <Bot className="h-4 w-4" />
            </div>
            <div className="rounded-control px-4 py-2 bg-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}
      </div>
      <div className="p-3 border-t border-border flex gap-2">
        <Input
          placeholder="Type a message"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) =>
            e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSubmit())
          }
          disabled={send.isPending}
        />
        <Button onClick={handleSubmit} disabled={send.isPending || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function SessionsTab({ bot }: { bot: Chatbot }) {
  const fmtZoned = useZonedDateFormatter();
  const sess = useQuery({
    queryKey: ["chatbot-sessions", bot.id],
    queryFn: () => listChatbotSessions({ data: { chatbotId: bot.id, limit: 100 } }),
  });
  return (
    <div className="rounded-control border border-border bg-surface overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="text-left p-3">Started</th>
            <th className="text-left p-3">Channel</th>
            <th className="text-left p-3">Status</th>
            <th className="text-right p-3">Messages</th>
            <th className="text-left p-3">Last activity</th>
          </tr>
        </thead>
        <tbody>
          {sess.data?.map((s) => (
            <tr key={s.id} className="border-t border-border">
              <td className="p-3">
                {fmtZoned(new Date(s.created_at), { dateStyle: "medium", timeStyle: "short" })}
              </td>
              <td className="p-3 capitalize">{s.channel}</td>
              <td className="p-3">
                <Badge
                  variant={
                    s.status === "handed_off"
                      ? "destructive"
                      : s.status === "closed"
                        ? "secondary"
                        : "default"
                  }
                >
                  {s.status}
                </Badge>
              </td>
              <td className="p-3 text-right">{s.message_count}</td>
              <td className="p-3 text-muted-foreground">
                {s.last_message_at
                  ? fmtZoned(new Date(s.last_message_at), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "—"}
              </td>
            </tr>
          ))}
          {sess.data && sess.data.length === 0 && (
            <tr>
              <td colSpan={5} className="p-12 text-center text-muted-foreground">
                No sessions yet. Try the Playground tab.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
