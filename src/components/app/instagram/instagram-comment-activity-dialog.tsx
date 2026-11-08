import { useQuery } from "@tanstack/react-query";
import { Activity, Loader2, CheckCircle2, XCircle, MessageCircle, Send, Heart, EyeOff } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

type LogRow = {
  id: string;
  processed_at: string;
  commenter_username: string | null;
  comment_text: string | null;
  post_id: string | null;
  matched: boolean;
  match_reason: string | null;
  matched_keywords: string[];
  actions_taken: Array<{ type: string; status?: string; detail?: string }>;
  status: string;
  error: string | null;
};

const ACTION_ICONS: Record<string, typeof MessageCircle> = {
  instagram_reply_comment: MessageCircle,
  instagram_send_dm: Send,
  instagram_like_comment: Heart,
  instagram_hide_comment: EyeOff,
};

const ACTION_LABELS: Record<string, string> = {
  instagram_reply_comment: "Replied",
  instagram_send_dm: "Sent DM",
  instagram_like_comment: "Liked",
  instagram_hide_comment: "Hid comment",
};

export function InstagramCommentActivityDialog({
  open,
  onOpenChange,
  automationId,
  automationName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  automationId: string;
  automationName: string;
}) {
  const logs = useQuery({
    queryKey: ["ig-comment-logs", automationId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instagram_comment_automation_logs")
        .select("id,processed_at,commenter_username,comment_text,post_id,matched,match_reason,matched_keywords,actions_taken,status,error")
        .eq("automation_id", automationId)
        .order("processed_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" /> Activity: {automationName}
          </DialogTitle>
          <DialogDescription>
            Every comment processed by this automation, with the matched trigger and actions taken.
          </DialogDescription>
        </DialogHeader>

        {logs.isLoading ? (
          <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading activity
          </div>
        ) : (logs.data ?? []).length === 0 ? (
          <div className="rounded-control border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No comments processed yet. Logs will appear here once Instagram sends comment events.
          </div>
        ) : (
          <div className="space-y-2">
            {(logs.data ?? []).map((log) => {
              const failed = log.status === "failed" || !!log.error;
              return (
                <div key={log.id} className="rounded-control border border-border bg-card p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {log.matched ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <XCircle className="w-6 h-6 text-muted-foreground shrink-0" />
                        )}
                        <span className="text-sm font-medium truncate">
                          @{log.commenter_username ?? "unknown"}
                        </span>
                        <Badge variant={log.matched ? "default" : "secondary"} className="text-[11px]">
                          {log.matched ? "Matched" : "Skipped"}
                        </Badge>
                        {failed && (
                          <Badge variant="destructive" className="text-[11px]">Failed</Badge>
                        )}
                        {log.post_id && (
                          <Badge variant="outline" className="text-[11px]">Post {log.post_id.slice(-6)}</Badge>
                        )}
                      </div>
                      {log.comment_text && (
                        <div className="text-sm mt-1 line-clamp-2 break-words">"{log.comment_text}"</div>
                      )}
                      {log.match_reason && (
                        <div className="text-[11px] text-muted-foreground mt-1">{log.match_reason}</div>
                      )}
                      {log.matched_keywords?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {log.matched_keywords.map((k) => (
                            <Badge key={k} variant="secondary" className="text-[11px]">{k}</Badge>
                          ))}
                        </div>
                      )}
                      {log.actions_taken?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {log.actions_taken.map((a, i) => {
                            const Icon = ACTION_ICONS[a.type] ?? Activity;
                            const okay = !a.status || a.status === "ok" || a.status === "success";
                            return (
                              <div key={i} className={`flex items-center gap-1 text-[11px] rounded-control border px-1.5 py-0.5 ${okay ? "border-border bg-muted/40" : "border-destructive/40 bg-destructive/10 text-destructive"}`}>
                                <Icon className="w-3 h-3" />
                                <span>{ACTION_LABELS[a.type] ?? a.type}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {log.error && (
                        <div className="text-[11px] text-destructive mt-1 break-words">{log.error}</div>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                      {formatDistanceToNow(new Date(log.processed_at), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
