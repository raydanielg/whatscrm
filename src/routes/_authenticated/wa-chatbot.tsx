import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { AppTopbar } from "@/components/app/app-topbar";
import { ActionBar } from "@/components/app/action-bar";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessagesSquare,
  Plus,
  Trash2,
  Pencil,
  Smartphone,
  Zap,
  Play,
  Pause,
  BookText,
  FlaskConical,
  Inbox,
  BarChart3,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  TemplatesLibraryDialog,
  TemplatePicker,
} from "@/components/app/wa-chatbot/templates-library";
import { WaChatbotTestConsole } from "@/components/app/wa-chatbot/test-console";
import { WaConversationInbox } from "@/components/app/wa-chatbot/conversation-inbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WaChatbotAnalytics } from "@/components/app/wa-chatbot/analytics-dashboard";
import { WaHandoffSettingsPanel } from "@/components/app/wa-chatbot/handoff-settings";
import { WaRulesTransfer } from "@/components/app/wa-chatbot/rules-transfer";
import {
  WA_TRIGGER_LABEL,
  WA_TRIGGERS_WITHOUT_KEYWORDS,
  keywordsPlaceholder,
  SUPPORTED_LANGUAGES,
  type WaTriggerType,
  DEFAULT_LANGUAGE_MIN_CONFIDENCE,
  normalizeMinConfidence,
} from "@/lib/messaging/wa-trigger-matching";
import { sbAny } from "@/lib/supabase/untyped";

export const Route = createFileRoute("/_authenticated/wa-chatbot")({
  component: WAChatbotPage,
});

type TriggerType = WaTriggerType;
type ReplyType = "text" | "image" | "video" | "document" | "audio" | "location";

type Rule = {
  id: string;
  workspace_id: string;
  session_id: string | null;
  name: string;
  trigger_type: TriggerType;
  keywords: string[];
  reply_type: ReplyType;
  reply_text: string | null;
  media_url: string | null;
  media_caption: string | null;
  enabled: boolean;
  match_case: boolean;
  priority: number;
  cooldown_seconds: number;
  min_confidence: number | null;
  hit_count: number;
  last_triggered_at: string | null;
  updated_at: string;
};

type Session = {
  id: string;
  phone_number: string | null;
  status: string;
  display_name?: string | null;
};

const TRIGGER_LABEL: Record<TriggerType, string> = WA_TRIGGER_LABEL;

const REPLY_LABEL: Record<ReplyType, string> = {
  text: "Text",
  image: "Image",
  video: "Video",
  document: "Document",
  audio: "Audio",
  location: "Location",
};

const EMPTY: Partial<Rule> = {
  name: "",
  trigger_type: "contains",
  keywords: [],
  reply_type: "text",
  reply_text: "",
  media_url: "",
  media_caption: "",
  enabled: true,
  match_case: false,
  priority: 100,
  cooldown_seconds: 0,
  min_confidence: DEFAULT_LANGUAGE_MIN_CONFIDENCE,
  session_id: null,
};

function WAChatbotPage() {
  const qc = useQueryClient();
  const { active: workspace } = useCurrentWorkspace();
  const workspaceId = workspace?.id ?? null;

  const [instanceFilter, setInstanceFilter] = useState<string>("all");
  const [dlg, setDlg] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Rule>>(EMPTY);
  const [keywordsInput, setKeywordsInput] = useState("");

  const { data: sessions = [] } = useQuery<Session[]>({
    enabled: !!workspaceId,
    queryKey: ["wa-qr-sessions", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_qr_sessions")
        .select("id, phone_number, status, display_name")
        .eq("workspace_id", workspaceId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Session[];
    },
  });

  const { data: rules = [], isLoading } = useQuery<Rule[]>({
    enabled: !!workspaceId,
    queryKey: ["wa-auto-replies", workspaceId, instanceFilter],
    queryFn: async () => {
      let q = supabase
        .from("whatsapp_auto_replies")
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("priority", { ascending: true })
        .order("updated_at", { ascending: false });
      if (instanceFilter === "all-instances") {
        q = q.is("session_id", null);
      } else if (instanceFilter !== "all") {
        q = q.eq("session_id", instanceFilter);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Rule[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (payload: Partial<Rule>) => {
      if (!workspaceId) throw new Error("No workspace");
      const row = {
        workspace_id: workspaceId,
        session_id: payload.session_id || null,
        name: payload.name!,
        trigger_type: payload.trigger_type ?? "contains",
        keywords: payload.keywords ?? [],
        reply_type: payload.reply_type ?? "text",
        reply_text: payload.reply_text ?? null,
        media_url: payload.media_url || null,
        media_caption: payload.media_caption || null,
        enabled: payload.enabled ?? true,
        match_case: payload.match_case ?? false,
        priority: payload.priority ?? 100,
        cooldown_seconds: payload.cooldown_seconds ?? 0,
        min_confidence: normalizeMinConfidence(
          payload.min_confidence ?? DEFAULT_LANGUAGE_MIN_CONFIDENCE,
        ),
      };
      if (payload.id) {
        const { error } = await supabase
          .from("whatsapp_auto_replies")
          .update(row)
          .eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await sbAny(supabase).from("whatsapp_auto_replies").insert(row);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wa-auto-replies"] });
      setDlg(false);
      toast.success("Auto-reply saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("whatsapp_auto_replies")
        .update({ enabled })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wa-auto-replies"] }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sbAny(supabase).from("whatsapp_auto_replies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wa-auto-replies"] });
      toast.success("Rule deleted");
    },
  });

  function openNew() {
    setEditing({ ...EMPTY });
    setKeywordsInput("");
    setDlg(true);
  }
  function openEdit(r: Rule) {
    setEditing(r);
    setKeywordsInput((r.keywords ?? []).join(", "));
    setDlg(true);
  }
  function submit() {
    if (!editing.name?.trim()) return toast.error("Name required");
    const keywords = keywordsInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    upsert.mutate({ ...editing, keywords });
  }

  const activeCount = rules.filter((r) => r.enabled).length;
  const connectedInstances = sessions.filter((s) => s.status === "connected").length;

  return (
    <>
      <AppTopbar
        title="WA Chatbot"
        subtitle="Setup auto replies for your WhatsApp instances"
        actions={
          <ActionBar
            primary={[
              <Button key="new" onClick={openNew} size="sm">
                <Plus className="h-4 w-4 " /> New Auto-Reply
              </Button>,
              <Button key="test" onClick={() => setTestOpen(true)} size="sm" variant="outline">
                <FlaskConical className="h-4 w-4 " /> Test Console
              </Button>,
            ]}
            overflow={[
              <DropdownMenuItem key="templates" onClick={() => setLibraryOpen(true)}>
                <BookText className="h-4 w-4 " /> Templates
              </DropdownMenuItem>,
              <WaRulesTransfer
                key="rules-transfer"
                workspaceId={workspaceId}
                workspaceName={workspace?.name ?? null}
                rules={rules}
                instances={sessions}
                asMenuItems
              />,
            ]}
          />
        }
      />

      <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard icon={MessagesSquare} label="Total Rules" value={rules.length} />
          <StatCard icon={Play} label="Active" value={activeCount} tint="text-success" />
          <StatCard
            icon={Pause}
            label="Paused"
            value={rules.length - activeCount}
            tint="text-muted-foreground"
          />
          <StatCard
            icon={Smartphone}
            label="Connected Instances"
            value={connectedInstances}
            tint="text-primary"
          />
        </div>

        <Tabs defaultValue="rules">
          <TabsList>
            <TabsTrigger value="rules" className="gap-1">
              <MessagesSquare className="h-4 w-4" /> Auto-Reply Rules
            </TabsTrigger>
            <TabsTrigger value="inbox" className="gap-1">
              <Inbox className="h-4 w-4" /> Conversations
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-1">
              <BarChart3 className="h-4 w-4" /> Analytics
            </TabsTrigger>
            <TabsTrigger value="handoff" className="gap-1">
              <Users className="h-4 w-4" /> Handoff
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rules" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle>Auto-Reply Rules</CardTitle>
                  <CardDescription>
                    Rules fire top-down by priority. First match wins.
                  </CardDescription>
                </div>
                <div className="w-64">
                  <Select value={instanceFilter} onValueChange={setInstanceFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All instances</SelectItem>
                      <SelectItem value="all-instances">Applies to every instance</SelectItem>
                      {sessions.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.display_name || s.phone_number || s.id.slice(0, 8)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">Loading</div>
                ) : rules.length === 0 ? (
                  <div className="py-12 text-center border rounded-control border-dashed">
                    <MessagesSquare className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="mt-2 text-sm text-muted-foreground">No auto-reply rules yet.</p>
                    <Button onClick={openNew} size="sm" className="mt-3">
                      <Plus className="h-4 w-4 " /> Create first rule
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y">
                    {rules.map((r) => {
                      const inst = sessions.find((s) => s.id === r.session_id);
                      return (
                        <div key={r.id} className="py-3 flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">{r.name}</span>
                              <Badge variant="outline" className="rounded-control">
                                {TRIGGER_LABEL[r.trigger_type]}
                              </Badge>
                              <Badge variant="secondary" className="rounded-control">
                                {REPLY_LABEL[r.reply_type]}
                              </Badge>
                              {r.session_id ? (
                                <Badge variant="outline" className="rounded-control gap-1">
                                  <Smartphone className="h-3 w-3" />
                                  {inst?.display_name || inst?.phone_number || "instance"}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="rounded-control">
                                  All instances
                                </Badge>
                              )}
                            </div>
                            {r.keywords?.length > 0 && (
                              <div className="mt-1 text-xs text-muted-foreground truncate">
                                Keywords: {r.keywords.join(", ")}
                              </div>
                            )}
                            {r.reply_text && (
                              <div className="mt-1 text-sm text-muted-foreground line-clamp-2">
                                {r.reply_text}
                              </div>
                            )}
                            <div className="mt-1 text-xs text-muted-foreground flex gap-3">
                              <span>Priority {r.priority}</span>
                              <span className="inline-flex items-center gap-1">
                                <Zap className="h-3 w-3" /> {r.hit_count} triggered
                              </span>
                              {r.cooldown_seconds > 0 && (
                                <span>Cooldown {r.cooldown_seconds}s</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Switch
                              checked={r.enabled}
                              onCheckedChange={(v) => toggle.mutate({ id: r.id, enabled: v })}
                            />
                            <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => confirm("Delete this rule?") && del.mutate(r.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inbox" className="mt-4">
            <WaConversationInbox instances={sessions} />
          </TabsContent>

          <TabsContent value="analytics" className="mt-4">
            <WaChatbotAnalytics workspaceId={workspaceId} instances={sessions} />
          </TabsContent>

          <TabsContent value="handoff" className="mt-4">
            <WaHandoffSettingsPanel workspaceId={workspaceId} />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={dlg} onOpenChange={setDlg}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing.id ? "Edit Auto-Reply" : "New Auto-Reply"}</DialogTitle>
            <DialogDescription>
              Configure how this instance should respond to incoming WhatsApp messages.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label>Name</Label>
              <Input
                value={editing.name ?? ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. Business hours greeting"
              />
            </div>

            <div>
              <Label>Instance</Label>
              <Select
                value={editing.session_id ?? "__all__"}
                onValueChange={(v) =>
                  setEditing({ ...editing, session_id: v === "__all__" ? null : v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Applies to all instances</SelectItem>
                  {sessions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.display_name || s.phone_number || s.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Trigger</Label>
              <Select
                value={editing.trigger_type ?? "contains"}
                onValueChange={(v) => setEditing({ ...editing, trigger_type: v as TriggerType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TRIGGER_LABEL) as TriggerType[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {TRIGGER_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <Label>
                {editing.trigger_type === "language"
                  ? "Language codes (comma-separated)"
                  : editing.trigger_type === "handoff"
                    ? "Extra handoff phrases (comma-separated, optional)"
                    : "Keywords (comma-separated)"}
              </Label>
              <Input
                value={keywordsInput}
                onChange={(e) => setKeywordsInput(e.target.value)}
                placeholder={keywordsPlaceholder(
                  (editing.trigger_type ?? "contains") as TriggerType,
                )}
                disabled={WA_TRIGGERS_WITHOUT_KEYWORDS.includes(
                  (editing.trigger_type ?? "contains") as TriggerType,
                )}
              />
              {editing.trigger_type === "handoff" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Fires when the contact asks for a human — phrases like “agent”, “operator”, “talk
                  to someone” are built in. Add your own above to extend them.
                </p>
              )}
              {editing.trigger_type === "language" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Fires when the contact writes in one of these languages. Leave empty to match any
                  non-English message. Supported:{" "}
                  {SUPPORTED_LANGUAGES.map((l) => `${l.code} (${l.label})`).join(", ")}.
                </p>
              )}
            </div>

            {editing.trigger_type === "language" && (
              <div className="md:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>Minimum detection confidence</Label>
                  <span className="text-xs font-medium ">
                    {Math.round(
                      normalizeMinConfidence(
                        editing.min_confidence ?? DEFAULT_LANGUAGE_MIN_CONFIDENCE,
                      ) * 100,
                    )}
                    %
                  </span>
                </div>
                <Slider
                  className="mt-3"
                  min={0}
                  max={100}
                  step={5}
                  value={[
                    Math.round(
                      normalizeMinConfidence(
                        editing.min_confidence ?? DEFAULT_LANGUAGE_MIN_CONFIDENCE,
                      ) * 100,
                    ),
                  ]}
                  onValueChange={([v]: number[]) =>
                    setEditing({ ...editing, min_confidence: (v ?? 60) / 100 })
                  }
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Language detection is best-effort — short messages score lower. The rule only
                  fires when the detector is at least this confident. Higher values reduce false
                  matches; lower values catch more messages. Use the Test console to see live
                  scores.
                </p>
              </div>
            )}

            <div>
              <Label>Reply Type</Label>
              <Select
                value={editing.reply_type ?? "text"}
                onValueChange={(v) => setEditing({ ...editing, reply_type: v as ReplyType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(REPLY_LABEL) as ReplyType[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {REPLY_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Priority</Label>
              <Input
                type="number"
                value={editing.priority ?? 100}
                onChange={(e) => setEditing({ ...editing, priority: Number(e.target.value) })}
              />
            </div>

            <div className="md:col-span-2">
              <div className="flex items-center justify-between">
                <Label>Reply Text {editing.reply_type !== "text" && "/ Caption"}</Label>
                <button
                  type="button"
                  onClick={() => setLibraryOpen(true)}
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  <BookText className="h-3 w-3" /> Manage templates
                </button>
              </div>
              <Textarea
                rows={4}
                value={editing.reply_text ?? ""}
                onChange={(e) => setEditing({ ...editing, reply_text: e.target.value })}
                placeholder="Hi {{name}}, thanks for reaching out!"
              />
              <div className="mt-2">
                <TemplatePicker
                  workspaceId={workspaceId}
                  onPick={(body) => setEditing({ ...editing, reply_text: body })}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Variables: {"{{name}}"}, {"{{phone}}"}, {"{{time}}"}
              </p>
            </div>

            {editing.reply_type !== "text" && (
              <div className="md:col-span-2">
                <Label>Media URL</Label>
                <Input
                  value={editing.media_url ?? ""}
                  onChange={(e) => setEditing({ ...editing, media_url: e.target.value })}
                  placeholder="https://"
                />
              </div>
            )}

            <div>
              <Label>Cooldown (seconds)</Label>
              <Input
                type="number"
                value={editing.cooldown_seconds ?? 0}
                onChange={(e) =>
                  setEditing({ ...editing, cooldown_seconds: Number(e.target.value) })
                }
              />
            </div>

            <div className="flex items-center gap-4 pt-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={editing.match_case ?? false}
                  onCheckedChange={(v) => setEditing({ ...editing, match_case: v })}
                />
                Match case
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={editing.enabled ?? true}
                  onCheckedChange={(v) => setEditing({ ...editing, enabled: v })}
                />
                Enabled
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={upsert.isPending}>
              {upsert.isPending ? "Saving" : "Save Rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TemplatesLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        workspaceId={workspaceId}
      />

      <WaChatbotTestConsole open={testOpen} onOpenChange={setTestOpen} workspaceId={workspaceId} />
    </>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tint = "text-foreground",
}: {
  icon: typeof MessagesSquare;
  label: string;
  value: number;
  tint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`p-2 rounded-control bg-muted ${tint}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-semibold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
