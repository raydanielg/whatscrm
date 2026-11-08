import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextarea } from "@/shared/components/rich-textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Save,
  Sparkles,
  GitBranch,
  FlaskConical,
  BarChart3,
  Library,
  Play,
  Share2,
  Star,
  Trash2,
  Loader2,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { upsertChatbot, type Chatbot } from "@/lib/chatbots/chatbots.functions";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
import {
  listPrompts,
  upsertPrompt,
  deletePrompt,
  setPromptShared,
  forkPromptVersion,
  listPromptVersions,
  runPromptTest,
  listPromptTests,
  ratePromptTest,
  promptAnalytics,
  type ChatbotPrompt,
  type PromptCategory,
  type ChatbotPromptTest,
} from "@/lib/chatbots/training.functions";
import { ScrollArea } from "@/components/ui/scroll-area";

const CATEGORIES: { value: PromptCategory; label: string }[] = [
  { value: "system", label: "System" },
  { value: "organization", label: "Organization" },
  { value: "department", label: "Department" },
  { value: "personality", label: "Personality" },
  { value: "tone", label: "Tone" },
  { value: "greeting", label: "Greeting" },
  { value: "fallback", label: "Fallback" },
  { value: "escalation", label: "Escalation" },
  { value: "custom", label: "Custom" },
];

const TONES = ["professional", "friendly", "casual", "formal", "witty", "empathetic", "concise"];

export function ChatbotTrainingTab({ bot, onSaved }: { bot: Chatbot; onSaved: () => void }) {
  return (
    <Tabs defaultValue="prompts" className="space-y-4">
      <TabsList>
        <TabsTrigger value="prompts">
          <Sparkles className="h-3.5 w-3.5 " /> Core Prompts
        </TabsTrigger>
        <TabsTrigger value="library">
          <Library className="h-3.5 w-3.5 " /> Library
        </TabsTrigger>
        <TabsTrigger value="testing">
          <FlaskConical className="h-3.5 w-3.5 " /> Testing
        </TabsTrigger>
        <TabsTrigger value="analytics">
          <BarChart3 className="h-3.5 w-3.5 " /> Analytics
        </TabsTrigger>
      </TabsList>
      <TabsContent value="prompts">
        <CorePromptsPanel bot={bot} onSaved={onSaved} />
      </TabsContent>
      <TabsContent value="library">
        <PromptLibraryPanel bot={bot} />
      </TabsContent>
      <TabsContent value="testing">
        <PromptTestingPanel bot={bot} />
      </TabsContent>
      <TabsContent value="analytics">
        <PromptAnalyticsPanel bot={bot} />
      </TabsContent>
    </Tabs>
  );
}

// ---------- Core prompts (per-bot training) ----------

function CorePromptsPanel({ bot, onSaved }: { bot: Chatbot; onSaved: () => void }) {
  const [systemPrompt, setSystemPrompt] = useState(bot.system_prompt);
  const [orgPrompt, setOrgPrompt] = useState(bot.organization_prompt ?? "");
  const [deptPrompt, setDeptPrompt] = useState(bot.department_prompt ?? "");
  const [personality, setPersonality] = useState(bot.personality ?? "");
  const [tone, setTone] = useState(bot.tone ?? "professional");
  const [language, setLanguage] = useState(bot.language ?? "en");
  const [greeting, setGreeting] = useState(bot.greeting ?? bot.welcome_message ?? "");
  const [fallback, setFallback] = useState(bot.fallback_message);
  const [escalation, setEscalation] = useState(bot.escalation_prompt ?? "");

  const save = useMutation({
    mutationFn: () =>
      upsertChatbot({
        data: {
          id: bot.id,
          workspaceId: bot.workspace_id,
          name: bot.name,
          system_prompt: systemPrompt,
          organization_prompt: orgPrompt || null,
          department_prompt: deptPrompt || null,
          personality: personality || null,
          tone: tone || null,
          language,
          greeting: greeting || null,
          welcome_message: greeting || bot.welcome_message,
          fallback_message: fallback,
          escalation_prompt: escalation || null,
        },
      }),
    onSuccess: () => {
      toast.success("Training saved");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Field label="System Prompt" hint="Base instructions for this bot.">
        <Textarea rows={6} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
      </Field>
      <Field label="Organization Prompt" hint="Shared context describing your company / product.">
        <Textarea rows={6} value={orgPrompt} onChange={(e) => setOrgPrompt(e.target.value)} />
      </Field>
      <Field
        label="Department Prompt"
        hint="Domain rules for this bot's department (Sales, Support)."
      >
        <Textarea rows={6} value={deptPrompt} onChange={(e) => setDeptPrompt(e.target.value)} />
      </Field>
      <Field label="Personality" hint="How the bot should behave and reason.">
        <Textarea rows={6} value={personality} onChange={(e) => setPersonality(e.target.value)} />
      </Field>

      <div className="rounded-control border border-border bg-surface p-6 space-y-4">
        <div>
          <Label>Tone</Label>
          <Select value={tone} onValueChange={setTone}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TONES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Language</Label>
          <Input
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            placeholder="en, es, fr, de, ar"
          />
        </div>
        <div>
          <Label>Greeting</Label>
          <RichTextarea
            rows={3}
            value={greeting}
            onChange={(v) => setGreeting(v)}
            placeholder="Hi! I'm {{botName}}, how can I help today?"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Supports variables like {"{{name}}"}.
          </p>
        </div>
      </div>

      <div className="rounded-control border border-border bg-surface p-6 space-y-4">
        <div>
          <Label>Fallback Message</Label>
          <RichTextarea rows={3} value={fallback} onChange={(v) => setFallback(v)} />
        </div>
        <div>
          <Label>Escalation Prompt</Label>
          <Textarea
            rows={4}
            value={escalation}
            onChange={(e) => setEscalation(e.target.value)}
            placeholder="When user asks for a human, express empathy and confirm we're transferring"
          />
        </div>
      </div>

      <div className="lg:col-span-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          <Save className="h-4 w-4 " /> Save training
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-control border border-border bg-surface p-6 space-y-2">
      <Label className="text-sm font-semibold">{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {children}
    </div>
  );
}

// ---------- Prompt library ----------

function PromptLibraryPanel({ bot }: { bot: Chatbot }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [editing, setEditing] = useState<ChatbotPrompt | null>(null);
  const [creating, setCreating] = useState(false);
  const [versionsFor, setVersionsFor] = useState<ChatbotPrompt | null>(null);

  const prompts = useQuery({
    queryKey: ["prompts", bot.workspace_id, bot.id, category, search],
    queryFn: () =>
      listPrompts({
        data: {
          workspaceId: bot.workspace_id,
          chatbotId: bot.id,
          category: category === "all" ? undefined : category,
          search: search || undefined,
        },
      }),
  });

  const del = useMutation({
    mutationFn: (id: string) => deletePrompt({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["prompts"] });
    },
  });

  const share = useMutation({
    mutationFn: (p: { id: string; shared: boolean }) =>
      setPromptShared({ data: { id: p.id, is_shared: p.shared } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prompts"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="Search prompts"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 " /> New prompt
          </Button>
        </div>
      </div>

      <div className="rounded-control border border-border overflow-hidden bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Category</th>
              <th className="text-left p-3">Scope</th>
              <th className="text-left p-3">Version</th>
              <th className="text-right p-3">Uses</th>
              <th className="text-right p-3">Rating</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {prompts.isLoading && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  <Loader2 className="animate-spin inline h-4 w-4 mr-2" />
                  Loading
                </td>
              </tr>
            )}
            {prompts.data?.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3">
                  <Badge variant="secondary">{p.category}</Badge>
                </td>
                <td className="p-3 text-xs">
                  {p.chatbot_id === null
                    ? "Workspace"
                    : p.chatbot_id === bot.id
                      ? "This bot"
                      : "Other bot"}
                  {p.is_shared && (
                    <Badge variant="outline" className="ml-1 text-[11px]">
                      <Share2 className="h-3 w-3 mr-0.5" />
                      Shared
                    </Badge>
                  )}
                </td>
                <td className="p-3 text-xs">v{p.version}</td>
                <td className="p-3 text-right">{p.usage_count}</td>
                <td className="p-3 text-right">
                  {p.avg_rating != null ? p.avg_rating.toFixed(1) : "—"}
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setVersionsFor(p)}
                      title="Versions"
                    >
                      <GitBranch className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => share.mutate({ id: p.id, shared: !p.is_shared })}
                      title="Toggle shared"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(p)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm("Delete this prompt?")) del.mutate(p.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {prompts.data && prompts.data.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  No prompts yet. Create one to start building your library.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(editing || creating) && (
        <PromptEditor
          bot={bot}
          prompt={editing}
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSaved={() => {
            setEditing(null);
            setCreating(false);
            qc.invalidateQueries({ queryKey: ["prompts"] });
          }}
        />
      )}
      {versionsFor && (
        <VersionsDialog
          prompt={versionsFor}
          onClose={() => setVersionsFor(null)}
          onRestored={() => {
            setVersionsFor(null);
            qc.invalidateQueries({ queryKey: ["prompts"] });
          }}
        />
      )}
    </div>
  );
}

function PromptEditor({
  bot,
  prompt,
  onClose,
  onSaved,
}: {
  bot: Chatbot;
  prompt: ChatbotPrompt | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(prompt?.name ?? "");
  const [category, setCategory] = useState<PromptCategory>(prompt?.category ?? "system");
  const [content, setContent] = useState(prompt?.content ?? "");
  const [tags, setTags] = useState((prompt?.tags ?? []).join(", "));
  const [isShared, setIsShared] = useState(prompt?.is_shared ?? false);
  const [scope, setScope] = useState<"bot" | "workspace">(
    prompt ? (prompt.chatbot_id ? "bot" : "workspace") : "bot",
  );
  const [notes, setNotes] = useState(prompt?.notes ?? "");

  const save = useMutation({
    mutationFn: () =>
      upsertPrompt({
        data: {
          id: prompt?.id,
          workspaceId: bot.workspace_id,
          chatbotId: scope === "bot" ? bot.id : null,
          name,
          category,
          content,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          is_shared: isShared,
          notes: notes || null,
        },
      }),
    onSuccess: () => {
      toast.success(prompt ? "Updated" : "Created");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fork = useMutation({
    mutationFn: () => forkPromptVersion({ data: { id: prompt!.id, content, notes } }),
    onSuccess: () => {
      toast.success("New version created");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{prompt ? `Edit prompt · v${prompt.version}` : "New prompt"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as PromptCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Content</Label>
            <Textarea
              rows={10}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Use {{variables}} for interpolation"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tags (comma separated)</Label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} />
            </div>
            <div>
              <Label>Scope</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as "bot" | "workspace")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bot">This bot only</SelectItem>
                  <SelectItem value="workspace">Workspace library</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Share with all bots</p>
              <p className="text-xs text-muted-foreground">
                Makes this prompt visible to every bot in the workspace.
              </p>
            </div>
            <Switch checked={isShared} onCheckedChange={setIsShared} />
          </div>
          <div>
            <Label>Notes</Label>
            <RichTextarea rows={2} value={notes} onChange={(v) => setNotes(v)} />
          </div>
        </div>
        <DialogFooter>
          {prompt && (
            <Button variant="outline" onClick={() => fork.mutate()} disabled={fork.isPending}>
              <GitBranch className="h-4 w-4 " /> Save as new version
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending || !name || !content}>
            <Save className="h-4 w-4 " /> {prompt ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VersionsDialog({
  prompt,
  onClose,
  onRestored,
}: {
  prompt: ChatbotPrompt;
  onClose: () => void;
  onRestored: () => void;
}) {
  const fmtZoned = useZonedDateFormatter();
  const versions = useQuery({
    queryKey: ["prompt-versions", prompt.id],
    queryFn: () => listPromptVersions({ data: { id: prompt.id } }),
  });
  const restore = useMutation({
    mutationFn: (v: ChatbotPrompt) =>
      forkPromptVersion({
        data: { id: v.id, content: v.content, notes: `Restored from v${v.version}` },
      }),
    onSuccess: () => {
      toast.success("Restored as new version");
      onRestored();
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{prompt.name} · versions</DialogTitle>
        </DialogHeader>
        <ScrollArea type="hover" viewportClassName="max-h-[60vh] [&>div]:!block">
          <div className="space-y-2">
            {versions.data?.map((v) => (
              <div key={v.id} className="rounded-control border border-border p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge>v{v.version}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {fmtZoned(new Date(v.created_at), { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto"
                    onClick={() => restore.mutate(v)}
                  >
                    Restore
                  </Button>
                </div>
                <p className="text-xs whitespace-pre-wrap font-mono text-muted-foreground line-clamp-4">
                  {v.content}
                </p>
                {v.notes && <p className="text-xs italic mt-1">{v.notes}</p>}
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Testing ----------

function PromptTestingPanel({ bot }: { bot: Chatbot }) {
  const qc = useQueryClient();
  const prompts = useQuery({
    queryKey: ["prompts-test-select", bot.workspace_id, bot.id],
    queryFn: () => listPrompts({ data: { workspaceId: bot.workspace_id, chatbotId: bot.id } }),
  });
  const tests = useQuery({
    queryKey: ["prompt-tests", bot.id],
    queryFn: () =>
      listPromptTests({ data: { workspaceId: bot.workspace_id, chatbotId: bot.id, limit: 25 } }),
  });

  const [selectedId, setSelectedId] = useState<string>("");
  const selected = prompts.data?.find((p) => p.id === selectedId);
  const [content, setContent] = useState("");
  const [userInput, setUserInput] = useState("What are your business hours?");
  const [model, setModel] = useState(bot.model ?? "google/gemini-2.5-flash");

  const run = useMutation({
    mutationFn: () =>
      runPromptTest({
        data: {
          workspaceId: bot.workspace_id,
          chatbotId: bot.id,
          promptId: selectedId || null,
          promptContent: content || selected?.content || bot.system_prompt,
          userInput,
          model,
        },
      }),
    onSuccess: () => {
      toast.success("Test complete");
      qc.invalidateQueries({ queryKey: ["prompt-tests", bot.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="rounded-control border border-border bg-surface p-5 space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary" /> Test prompt
        </h3>
        <div>
          <Label>Prompt from library</Label>
          <Select
            value={selectedId}
            onValueChange={(v) => {
              setSelectedId(v);
              const p = prompts.data?.find((x) => x.id === v);
              if (p) setContent(p.content);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="(Type manually)" />
            </SelectTrigger>
            <SelectContent>
              {prompts.data?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} · v{p.version}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Prompt content</Label>
          <Textarea rows={6} value={content} onChange={(e) => setContent(e.target.value)} />
        </div>
        <div>
          <Label>User message</Label>
          <Textarea rows={2} value={userInput} onChange={(e) => setUserInput(e.target.value)} />
        </div>
        <div>
          <Label>Model</Label>
          <Input value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
        <Button onClick={() => run.mutate()} disabled={run.isPending || !userInput}>
          {run.isPending ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Play className="h-4 w-4 " />
          )}
          Run test
        </Button>
      </div>

      <div className="rounded-control border border-border bg-surface p-5 space-y-3">
        <h3 className="font-semibold">Recent runs</h3>
        <ScrollArea type="hover" viewportClassName="max-h-[600px]">
          <div className="space-y-2">
            {tests.data?.map((t) => (
              <TestRow key={t.id} test={t} />
            ))}
            {tests.data && tests.data.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No test runs yet.</p>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

function TestRow({ test }: { test: ChatbotPromptTest }) {
  const fmtZoned = useZonedDateFormatter();
  const qc = useQueryClient();
  const [rating, setRating] = useState(test.rating ?? 0);
  const rate = useMutation({
    mutationFn: (r: number) => ratePromptTest({ data: { id: test.id, rating: r } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prompt-tests"] }),
  });
  return (
    <div className="rounded-control border border-border p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <Badge variant={test.success ? "default" : "destructive"}>
          {test.success ? "ok" : "error"}
        </Badge>
        <span className="text-muted-foreground">
          {fmtZoned(new Date(test.created_at), { dateStyle: "medium", timeStyle: "short" })}
        </span>
        {test.latency_ms != null && (
          <span className="text-muted-foreground">· {test.latency_ms}ms</span>
        )}
        <span className="ml-auto text-muted-foreground">{test.model}</span>
      </div>
      <div className="text-xs">
        <span className="text-muted-foreground">User:</span> {test.input}
      </div>
      <div className="text-xs whitespace-pre-wrap">
        <span className="text-muted-foreground">Bot:</span> {test.output || test.error}
      </div>
      <div className="flex items-center gap-1 pt-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => {
              setRating(n);
              rate.mutate(n);
            }}
            className={`transition-colors ${n <= rating ? "text-yellow-500" : "text-muted-foreground/40"}`}
          >
            <Star className="h-4 w-4 fill-current" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- Analytics ----------

function PromptAnalyticsPanel({ bot }: { bot: Chatbot }) {
  const a = useQuery({
    queryKey: ["prompt-analytics", bot.id],
    queryFn: () =>
      promptAnalytics({ data: { workspaceId: bot.workspace_id, chatbotId: bot.id, days: 30 } }),
  });
  if (a.isLoading)
    return (
      <div className="p-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
        Loading
      </div>
    );
  const d = a.data;
  if (!d) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Total tests (30d)" value={d.totalTests} />
        <Kpi label="Success rate" value={`${d.successRate}%`} />
        <Kpi label="Failed" value={d.failedTests} />
        <Kpi label="Avg latency" value={`${d.avgLatency}ms`} />
        <Kpi label="Avg rating" value={d.avgRating.toFixed(1)} />
      </div>
      <div className="rounded-control border border-border bg-surface p-5">
        <h3 className="font-semibold mb-2">Top prompts</h3>
        {d.topPrompts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No test data yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {d.topPrompts.map((p) => (
              <li key={p.prompt_id} className="flex justify-between">
                <span className="font-mono text-xs">{p.prompt_id.slice(0, 8)}</span>
                <span>{p.count} runs</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-control border border-border bg-surface p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
