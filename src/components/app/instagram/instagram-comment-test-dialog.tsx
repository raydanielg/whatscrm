import { useMemo, useState } from "react";
import { FlaskConical, CheckCircle2, XCircle, MessageCircle, Send, Heart, EyeOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type CommentTriggerConfig = {
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
  priority?: number;
  conflict_mode?: "stop_on_match" | "run_all";
};


const NEGATIVE_HINTS = [
  "hate", "stupid", "scam", "trash", "worst", "awful", "terrible",
  "spam", "fake", "ugly", "boring", "idiot",
];

function matchesKeywords(comment: string, cfg: CommentTriggerConfig) {
  const keywords = (cfg.keywords ?? []).map((k) => k.toLowerCase()).filter(Boolean);
  const text = comment.toLowerCase().trim();
  if (keywords.length === 0) return { matched: true, hits: [] as string[], reason: "No keywords set — matches any comment" };
  const mode = cfg.match_mode ?? "any";
  if (mode === "exact") {
    const matched = keywords.some((k) => text === k);
    return { matched, hits: matched ? keywords.filter((k) => text === k) : [], reason: matched ? "Exact phrase match" : "Comment is not an exact match" };
  }
  const hits = keywords.filter((k) => text.includes(k));
  if (mode === "all") {
    return { matched: hits.length === keywords.length, hits, reason: hits.length === keywords.length ? "All keywords present" : `Missing: ${keywords.filter((k) => !hits.includes(k)).join(", ")}` };
  }
  return { matched: hits.length > 0, hits, reason: hits.length > 0 ? "At least one keyword matched" : "No keyword matched" };
}

export function InstagramCommentTestDialog({
  open,
  onOpenChange,
  automationName,
  config,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  automationName: string;
  config: CommentTriggerConfig;
}) {
  const [comment, setComment] = useState("Hey! Can I get the link please?");
  const [postId, setPostId] = useState("");
  const [username, setUsername] = useState("test_user");

  const result = useMemo(() => {
    const km = matchesKeywords(comment, config);
    const scopeOk = config.post_scope === "specific"
      ? !!postId && (config.post_ids ?? []).includes(postId)
      : true;
    const scopeReason = config.post_scope === "specific"
      ? scopeOk ? "Post ID is in the target list" : postId ? "Post ID is not in the target list" : "Enter a Post ID to test scope"
      : "Applies to all posts";
    const isNegative = NEGATIVE_HINTS.some((h) => comment.toLowerCase().includes(h));
    const willFire = km.matched && scopeOk;
    return { km, scopeOk, scopeReason, isNegative, willFire };
  }, [comment, postId, config]);

  const actions = [
    { on: !!config.reply_message && result.willFire, icon: MessageCircle, label: "Public reply", detail: config.reply_message ?? "" },
    { on: !!config.send_dm && !!config.dm_message && result.willFire, icon: Send, label: "Send DM", detail: config.dm_message ?? "" },
    { on: !!config.like_comment && result.willFire, icon: Heart, label: "Like comment", detail: "" },
    { on: !!config.hide_negative && result.isNegative, icon: EyeOff, label: "Hide comment (negative)", detail: "" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-primary" /> Test: {automationName}
          </DialogTitle>
          <DialogDescription>
            Simulate a comment event and preview which configured actions would fire. Nothing is sent to Instagram.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>From (username)</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="test_user" />
            </div>
            <div className="space-y-1.5">
              <Label>Post ID {config.post_scope === "specific" && <span className="text-destructive">*</span>}</Label>
              <Input value={postId} onChange={(e) => setPostId(e.target.value)} placeholder="17841400000000000" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Comment text</Label>
            <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>

          <div className="rounded-control border border-border bg-muted/30 p-3 space-y-2">
            <div className="text-xs font-medium uppercase text-muted-foreground">Trigger evaluation</div>
            <TestRow ok={result.km.matched} label="Keyword match" detail={result.km.reason} />
            <TestRow ok={result.scopeOk} label="Post scope" detail={result.scopeReason} />
            {result.km.hits.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {result.km.hits.map((h) => (
                  <Badge key={h} variant="secondary" className="text-[11px]">{h}</Badge>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-control border border-border p-3 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-xs font-medium uppercase text-muted-foreground">Actions</div>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-[11px]">
                  Priority {config.priority ?? 100}
                </Badge>
                <Badge variant="outline" className="text-[11px]">
                  {(config.conflict_mode ?? "stop_on_match") === "stop_on_match"
                    ? "Stops on match"
                    : "Runs with others"}
                </Badge>
                <Badge variant={result.willFire ? "default" : "secondary"} className="text-[11px]">
                  {result.willFire ? "Would fire" : "Would skip"}
                </Badge>
              </div>
            </div>

            {actions.filter((a) => a.on).length === 0 ? (
              <div className="text-xs text-muted-foreground">No actions would run for this input.</div>
            ) : (
              actions.filter((a) => a.on).map((a) => {
                const Icon = a.icon;
                return (
                  <div key={a.label} className="flex items-start gap-2 text-sm">
                    <Icon className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium">{a.label}</div>
                      {a.detail && (
                        <div className="text-xs text-muted-foreground break-words">
                          {a.detail.replace(/\{\{\s*username\s*\}\}/gi, `@${username}`)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TestRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 mt-0.5 text-destructive shrink-0" />
      )}
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}
