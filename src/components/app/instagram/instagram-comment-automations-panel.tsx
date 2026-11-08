import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Loader2, Plus, Trash2, Power, PowerOff, Instagram as InstagramIcon, FlaskConical, Activity, ArrowUp, ArrowDown, Layers } from "lucide-react";
import { InstagramCommentTestDialog } from "./instagram-comment-test-dialog";
import { InstagramCommentActivityDialog } from "./instagram-comment-activity-dialog";
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
import { sbAny } from "@/lib/supabase/untyped";

type IgAccountLite = { id: string; username: string | null; name: string | null; status: string };

type CommentTriggerConfig = {
  channel?: string;
  instagram_account_id?: string;
  post_scope?: "all" | "specific";
  post_ids?: string[];
  keywords?: string[];
  match_mode?: "any" | "all" | "exact";
  reply_message?: string | null;
  send_dm?: boolean;
  dm_message?: string | null;
  like_comment?: boolean;
  hide_negative?: boolean;
  /** Lower number runs first when multiple automations match the same comment. */
  priority?: number;
  /** stop_on_match: halt after this automation runs. run_all: continue to lower-priority automations. */
  conflict_mode?: "stop_on_match" | "run_all";
};


type AutomationRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  runs_count: number;
  last_run_at: string | null;
  trigger_config: CommentTriggerConfig;
  updated_at: string;
};

export function InstagramCommentAutomationsPanel() {
  const { data: ws } = useCurrentWorkspace();
  const workspaceId = ws?.id;
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [testTarget, setTestTarget] = useState<AutomationRow | null>(null);
  const [activityTarget, setActivityTarget] = useState<AutomationRow | null>(null);

  const flows = useQuery({
    queryKey: ["ig-comment-flows", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automations")
        .select("id,name,description,status,runs_count,last_run_at,trigger_config,updated_at")
        .eq("workspace_id", workspaceId!)
        .eq("trigger_type", "instagram_comment")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as AutomationRow[];
      // Sort client-side by priority asc (lower runs first), fallback updated_at desc.
      return [...rows].sort((a, b) => {
        const pa = a.trigger_config?.priority ?? 100;
        const pb = b.trigger_config?.priority ?? 100;
        if (pa !== pb) return pa - pb;
        return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
      });
    },
  });


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
    mutationFn: async (row: AutomationRow) => {
      const next = row.status === "active" ? "paused" : "active";
      const { error } = await sbAny(supabase).from("automations").update({ status: next }).eq("id", row.id);
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      qc.invalidateQueries({ queryKey: ["ig-comment-flows", workspaceId] });
      toast.success(next === "paused" ? "Automation paused" : "Automation resumed");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to update"),
  });

  const bumpPriority = useMutation({
    mutationFn: async ({ row, delta }: { row: AutomationRow; delta: number }) => {
      const current = row.trigger_config?.priority ?? 100;
      const next = Math.max(1, Math.min(999, current + delta));
      if (next === current) return { skipped: true as const };
      const nextConfig = { ...(row.trigger_config ?? {}), priority: next };
      const { error } = await supabase
        .from("automations")
        .update({ trigger_config: JSON.parse(JSON.stringify(nextConfig)) })
        .eq("id", row.id);
      if (error) throw error;
      return { skipped: false as const, next };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ig-comment-flows", workspaceId] }),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to reorder"),
  });

  const setConflictMode = useMutation({
    mutationFn: async ({ row, mode }: { row: AutomationRow; mode: "stop_on_match" | "run_all" }) => {
      const nextConfig = { ...(row.trigger_config ?? {}), conflict_mode: mode };
      const { error } = await supabase
        .from("automations")
        .update({ trigger_config: JSON.parse(JSON.stringify(nextConfig)) })
        .eq("id", row.id);
      if (error) throw error;
      return mode;
    },
    onSuccess: (mode) => {
      qc.invalidateQueries({ queryKey: ["ig-comment-flows", workspaceId] });
      toast.success(mode === "stop_on_match" ? "Will stop after this match" : "Will run alongside others");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to update"),
  });


  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sbAny(supabase).from("automations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ig-comment-flows", workspaceId] });
      toast.success("Automation deleted");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  const connectedAccounts = (accounts.data ?? []).filter((a) => a.status === "connected");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-xl flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            Instagram Comment Automation
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Trigger flows when someone comments on your Instagram posts.
          </p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          disabled={!workspaceId || connectedAccounts.length === 0}
          className="gap-2"
        >
          <Plus className="w-4 h-4" />
          New Automation
        </Button>
      </div>

      {connectedAccounts.length === 0 && !accounts.isLoading && (
        <div className="rounded-control border border-dashed border-border p-4 text-sm text-muted-foreground flex items-center gap-3">
          <InstagramIcon className="w-4 h-4 shrink-0" />
          Connect an Instagram Business account first, then come back to create a comment automation.
        </div>
      )}

      {flows.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading automations
        </div>
      ) : (flows.data ?? []).length === 0 ? (
        <div className="rounded-control border border-dashed border-border p-10 text-center">
          <MessageSquare className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
          <div className="font-medium text-sm">No comment automations yet</div>
          <div className="text-xs text-muted-foreground mt-1">
            Click <span className="font-medium text-foreground">New Automation</span> to trigger flows on Instagram comments.
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          {(flows.data ?? []).map((row, idx, arr) => {
            const cfg = row.trigger_config ?? {};
            const acct = (accounts.data ?? []).find((a) => a.id === cfg.instagram_account_id);
            const isActive = row.status === "active";
            const keywords = cfg.keywords ?? [];
            const priority = cfg.priority ?? 100;
            const conflictMode = cfg.conflict_mode ?? "stop_on_match";
            return (
              <div key={row.id} className="rounded-control border border-border bg-card p-4 flex items-start justify-between gap-4">
                <div className="flex flex-col items-center gap-0.5 pt-0.5">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    disabled={idx === 0 || bumpPriority.isPending}
                    onClick={() => bumpPriority.mutate({ row, delta: -10 })}
                    title="Higher priority (runs first)"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </Button>
                  <span className="text-[11px] font-mono text-muted-foreground ">{priority}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
                    disabled={idx === arr.length - 1 || bumpPriority.isPending}
                    onClick={() => bumpPriority.mutate({ row, delta: 10 })}
                    title="Lower priority (runs later)"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-medium text-sm truncate">{row.name}</div>
                    <Badge variant={isActive ? "default" : "secondary"} className="text-[11px] capitalize">
                      {isActive ? "Active" : row.status === "paused" ? "Paused" : row.status}
                    </Badge>

                    {acct && (
                      <Badge variant="outline" className="text-[11px] gap-1">
                        <InstagramIcon className="w-3 h-3" />
                        @{acct.username ?? acct.name ?? "account"}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[11px]">
                      {cfg.post_scope === "specific" ? `${cfg.post_ids?.length ?? 0} posts` : "All posts"}
                    </Badge>
                    <button
                      type="button"
                      onClick={() =>
                        setConflictMode.mutate({
                          row,
                          mode: conflictMode === "stop_on_match" ? "run_all" : "stop_on_match",
                        })
                      }
                      disabled={setConflictMode.isPending}
                      title="Click to toggle conflict rule"
                      className="inline-flex"
                    >
                      <Badge variant="outline" className="text-[11px] gap-1 cursor-pointer hover:bg-accent">
                        <Layers className="w-3 h-3" />
                        {conflictMode === "stop_on_match" ? "Stop on match" : "Run alongside others"}
                      </Badge>
                    </button>
                  </div>
                  {row.description && (
                    <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{row.description}</div>
                  )}
                  {keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {keywords.slice(0, 6).map((k) => (
                        <Badge key={k} variant="secondary" className="text-[11px]">{k}</Badge>
                      ))}
                    </div>
                  )}
                  <div className="text-[11px] text-muted-foreground mt-2 flex gap-4">
                    <span>{row.runs_count} runs</span>
                    {cfg.send_dm && <span>Sends DM</span>}
                    {cfg.reply_message && <span>Public reply</span>}
                    {cfg.like_comment && <span>Likes comment</span>}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setActivityTarget(row)}
                    title="Activity log"
                  >
                    <Activity className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setTestTarget(row)}
                    title="Test"
                  >
                    <FlaskConical className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={isActive ? "outline" : "default"}
                    onClick={() => toggleStatus.mutate(row)}
                    disabled={toggleStatus.isPending}
                    title={isActive ? "Pause automation" : "Resume automation"}
                    className="gap-1.5"
                  >
                    {toggleStatus.isPending && toggleStatus.variables?.id === row.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isActive ? (
                      <PowerOff className="w-3.5 h-3.5" />
                    ) : (
                      <Power className="w-3.5 h-3.5" />
                    )}
                    <span className="text-xs">{isActive ? "Pause" : "Resume"}</span>
                  </Button>

                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Delete "${row.name}"?`)) remove.mutate(row.id);
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

      <AddAutomationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        accounts={connectedAccounts}
        workspaceId={workspaceId}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["ig-comment-flows", workspaceId] });
          setDialogOpen(false);
        }}
      />

      {testTarget && (
        <InstagramCommentTestDialog
          open={!!testTarget}
          onOpenChange={(v) => !v && setTestTarget(null)}
          automationName={testTarget.name}
          config={testTarget.trigger_config ?? {}}
        />
      )}

      {activityTarget && (
        <InstagramCommentActivityDialog
          open={!!activityTarget}
          onOpenChange={(v) => !v && setActivityTarget(null)}
          automationId={activityTarget.id}
          automationName={activityTarget.name}
        />
      )}
    </div>
  );
}

function AddAutomationDialog({
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
  const [accountId, setAccountId] = useState<string>("");
  const [postScope, setPostScope] = useState<"all" | "specific">("all");
  const [postIds, setPostIds] = useState("");
  const [keywords, setKeywords] = useState("");
  const [matchMode, setMatchMode] = useState<"any" | "all" | "exact">("any");
  const [replyMessage, setReplyMessage] = useState("Thanks for your comment! 🙌");
  const [sendDm, setSendDm] = useState(true);
  const [dmMessage, setDmMessage] = useState("Hey! Here's the link you asked for 👉");
  const [likeComment, setLikeComment] = useState(true);
  const [hideNegative, setHideNegative] = useState(false);
  const [priority, setPriority] = useState<number>(100);
  const [conflictMode, setConflictModeLocal] = useState<"stop_on_match" | "run_all">("stop_on_match");


  const create = useMutation({
    mutationFn: async () => {
      if (!workspaceId) throw new Error("No workspace");
      if (!name.trim()) throw new Error("Name is required");
      if (!accountId) throw new Error("Select an Instagram account");

      const keywordList = keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      const postIdList =
        postScope === "specific"
          ? postIds
              .split(/[\s,]+/)
              .map((k) => k.trim())
              .filter(Boolean)
          : [];

      const trigger_config: CommentTriggerConfig = {
        channel: "instagram",
        instagram_account_id: accountId,
        post_scope: postScope,
        post_ids: postIdList,
        keywords: keywordList,
        match_mode: matchMode,
        reply_message: replyMessage.trim() || null,
        send_dm: sendDm,
        dm_message: sendDm ? dmMessage.trim() || null : null,
        like_comment: likeComment,
        hide_negative: hideNegative,
        priority: Number.isFinite(priority) ? Math.max(1, Math.min(999, priority)) : 100,
        conflict_mode: conflictMode,
      };


      const steps = [
        ...(replyMessage.trim()
          ? [{ type: "instagram_reply_comment", config: { message: replyMessage.trim() } }]
          : []),
        ...(sendDm && dmMessage.trim()
          ? [{ type: "instagram_send_dm", config: { message: dmMessage.trim() } }]
          : []),
        ...(likeComment ? [{ type: "instagram_like_comment" }] : []),
      ];

      const { error } = await sbAny(supabase).from("automations").insert({
        workspace_id: workspaceId,
        name: name.trim(),
        description: description.trim() || null,
        trigger_type: "instagram_comment",
        trigger_config: JSON.parse(JSON.stringify(trigger_config)),
        steps: JSON.parse(JSON.stringify(steps)),
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Automation created");
      setName("");
      setDescription("");
      setAccountId("");
      setPostScope("all");
      setPostIds("");
      setKeywords("");
      onCreated();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to create"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New comment automation</DialogTitle>
          <DialogDescription>
            React automatically to Instagram comments — reply publicly, send a DM, and more.
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
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Launch giveaway replies" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Applies to</Label>
              <Select value={postScope} onValueChange={(v) => setPostScope(v as "all" | "specific")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All posts</SelectItem>
                  <SelectItem value="specific">Specific posts</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Keyword match</Label>
              <Select value={matchMode} onValueChange={(v) => setMatchMode(v as "any" | "all" | "exact")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any keyword</SelectItem>
                  <SelectItem value="all">All keywords</SelectItem>
                  <SelectItem value="exact">Exact phrase</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {postScope === "specific" && (
            <div className="space-y-1.5">
              <Label>Post IDs</Label>
              <Textarea
                rows={2}
                value={postIds}
                onChange={(e) => setPostIds(e.target.value)}
                placeholder="Comma or space separated Instagram media IDs"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Keywords</Label>
            <Input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="link, price, info (leave empty to match every comment)"
            />
            <p className="text-[11px] text-muted-foreground">Comma-separated. Empty matches all comments.</p>
          </div>

          <div className="space-y-1.5">
            <Label>Public reply</Label>
            <Textarea rows={2} value={replyMessage} onChange={(e) => setReplyMessage(e.target.value)} />
          </div>

          <label className="flex items-center justify-between rounded-control border border-border p-3">
            <div>
              <div className="text-sm font-medium">Send DM</div>
              <div className="text-xs text-muted-foreground">Also message the commenter privately.</div>
            </div>
            <Switch checked={sendDm} onCheckedChange={setSendDm} />
          </label>

          {sendDm && (
            <div className="space-y-1.5">
              <Label>DM message</Label>
              <Textarea rows={2} value={dmMessage} onChange={(e) => setDmMessage(e.target.value)} />
            </div>
          )}

          <label className="flex items-center justify-between rounded-control border border-border p-3">
            <div>
              <div className="text-sm font-medium">Like the comment</div>
              <div className="text-xs text-muted-foreground">Show engagement automatically.</div>
            </div>
            <Switch checked={likeComment} onCheckedChange={setLikeComment} />
          </label>

          <label className="flex items-center justify-between rounded-control border border-border p-3">
            <div>
              <div className="text-sm font-medium">Hide negative comments</div>
              <div className="text-xs text-muted-foreground">Auto-hide comments detected as toxic.</div>
            </div>
            <Switch checked={hideNegative} onCheckedChange={setHideNegative} />
          </label>

          <div className="rounded-control border border-border p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-muted-foreground" />
              <div className="text-sm font-medium">Priority &amp; conflicts</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Input
                  type="number"
                  min={1}
                  max={999}
                  value={priority}
                  onChange={(e) => setPriority(parseInt(e.target.value || "100", 10))}
                />
                <p className="text-[11px] text-muted-foreground">Lower number runs first when several match.</p>
              </div>
              <div className="space-y-1.5">
                <Label>On match</Label>
                <Select
                  value={conflictMode}
                  onValueChange={(v) => setConflictModeLocal(v as "stop_on_match" | "run_all")}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stop_on_match">Stop — don't run lower-priority ones</SelectItem>
                    <SelectItem value="run_all">Run alongside other matches</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create automation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
