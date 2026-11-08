import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCheck,
  Loader2,
  MessageCircle,
  Send,
  Sparkles,
  Star,
  TrendingUp,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  addTicketMessage,
  closeTicket,
  escalateTicket,
  getTicketDetail,
  submitTicketFeedback,
} from "@/lib/client-portal/portal.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useZonedDateFormatter } from "@/hooks/use-timezone";

export const Route = createFileRoute("/_authenticated/client/tickets/$id")({
  component: TicketDetailPage,
});

const STATUS_STYLES: Record<string, string> = {
  open: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  in_progress: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  resolved: "bg-muted text-muted-foreground border-border",
  closed: "bg-muted text-muted-foreground border-border",
};

function TicketDetailPage() {
  const fmtZoned = useZonedDateFormatter();
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(getTicketDetail);
  const addFn = useServerFn(addTicketMessage);
  const closeFn = useServerFn(closeTicket);
  const escalateFn = useServerFn(escalateTicket);
  const feedbackFn = useServerFn(submitTicketFeedback);

  const detail = useQuery({
    queryKey: ["portal-ticket", id],
    queryFn: () => getFn({ data: { id } }),
    refetchInterval: 15000,
  });

  const [reply, setReply] = useState("");
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [escalateReason, setEscalateReason] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState("");

  const scrollerRef = useRef<HTMLDivElement>(null);

  const send = useMutation({
    mutationFn: (body: string) => addFn({ data: { id, body } }),
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["portal-ticket", id] });
      qc.invalidateQueries({ queryKey: ["portal-tickets"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to send"),
  });

  const closeM = useMutation({
    mutationFn: () => closeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Ticket marked as resolved");
      setFeedbackOpen(true);
      qc.invalidateQueries({ queryKey: ["portal-ticket", id] });
      qc.invalidateQueries({ queryKey: ["portal-tickets"] });
    },
  });

  const escalateM = useMutation({
    mutationFn: (reason: string) => escalateFn({ data: { id, reason } }),
    onSuccess: (r) => {
      toast.success(`Priority raised to ${r.priority}`);
      setEscalateOpen(false);
      setEscalateReason("");
      qc.invalidateQueries({ queryKey: ["portal-ticket", id] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const feedbackM = useMutation({
    mutationFn: () => feedbackFn({ data: { id, rating, comment: feedbackComment || undefined } }),
    onSuccess: () => {
      toast.success("Thanks for your feedback!");
      setFeedbackOpen(false);
      qc.invalidateQueries({ queryKey: ["portal-ticket", id] });
    },
  });

  // Realtime message stream
  useEffect(() => {
    const channel = supabase
      .channel(`portal-ticket-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["portal-ticket", id] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, qc]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [detail.data?.messages.length]);

  if (detail.isLoading)
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading ticket
      </div>
    );
  if (detail.isError || !detail.data)
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Ticket not found.{" "}
        <Link to="/client/tickets" className="text-accent underline">
          Back to support
        </Link>
        .
      </div>
    );

  const { ticket, messages, feedback, escalations } = detail.data;
  const isClosed = ticket.status === "resolved" || ticket.status === "closed";

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <Link
        to="/client/tickets"
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to support
      </Link>

      {/* Header */}
      <header className="rounded-control border border-border bg-surface p-5">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="outline"
                className={`capitalize ${STATUS_STYLES[ticket.status] ?? ""}`}
              >
                {ticket.status.replace("_", " ")}
              </Badge>
              <span className="text-xs text-muted-foreground capitalize">
                Priority: {ticket.priority}
              </span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">
                Opened{" "}
                {fmtZoned(new Date(ticket.created_at), { dateStyle: "medium", timeStyle: "short" })}
              </span>
            </div>
            <h1 className="font-display text-2xl font-semibold mt-2 leading-tight">
              {ticket.subject ?? "Support request"}
            </h1>
          </div>
          <div className="flex gap-2">
            {!isClosed && (
              <>
                <Button variant="outline" size="sm" onClick={() => setEscalateOpen(true)}>
                  <TrendingUp className="w-3.5 h-3.5 mr-1.5" /> Escalate
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => closeM.mutate()}
                  disabled={closeM.isPending}
                >
                  {closeM.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Mark resolved
                </Button>
              </>
            )}
            {isClosed && !feedback && (
              <Button size="sm" onClick={() => setFeedbackOpen(true)}>
                <Star className="w-3.5 h-3.5 mr-1.5" /> Rate this ticket
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="grid lg:grid-cols-[1fr_300px] gap-4">
        {/* Timeline */}
        <section className="rounded-control border border-border bg-surface overflow-hidden flex flex-col min-h-[500px]">
          <div className="px-5 py-3 border-b border-border flex items-center gap-2 text-sm font-medium">
            <MessageCircle className="w-4 h-4" /> Conversation
          </div>

          <div ref={scrollerRef} className="flex-1 overflow-y-auto p-5 space-y-3 max-h-[600px]">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No messages yet.</p>
            ) : (
              messages.map((m) => {
                const mine = m.direction === "inbound";
                const isSystem =
                  typeof m.body === "string" && m.body.startsWith("[Customer escalation]");
                if (isSystem) {
                  return (
                    <div key={m.id} className="flex justify-center">
                      <div className="text-[11px] text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-control inline-flex items-center gap-1.5">
                        <TrendingUp className="w-3 h-3" /> {m.body}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-control px-4 py-2.5 ${
                        mine
                          ? "bg-accent text-accent-foreground rounded-br-sm"
                          : "bg-muted rounded-bl-sm"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                      <div
                        className={`flex items-center gap-1 mt-1 text-[11px] ${mine ? "text-accent-foreground/70 justify-end" : "text-muted-foreground"}`}
                      >
                        <span>
                          {fmtZoned(new Date(m.created_at), {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {mine &&
                          (m.status === "read" ? (
                            <CheckCheck className="w-3 h-3" />
                          ) : (
                            <Check className="w-3 h-3" />
                          ))}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-border p-3 bg-background">
            {isClosed ? (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-muted-foreground">
                  This ticket is resolved. Replying will reopen it.
                </p>
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Reply to reopen"
                  rows={1}
                  className="flex-1 min-w-[200px] resize-none"
                />
                <Button
                  size="sm"
                  disabled={!reply.trim() || send.isPending}
                  onClick={() => send.mutate(reply)}
                >
                  {send.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                </Button>
              </div>
            ) : (
              <div className="flex gap-2 items-end">
                <Textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && reply.trim()) {
                      e.preventDefault();
                      send.mutate(reply);
                    }
                  }}
                  placeholder="Type your reply (⌘/Ctrl+Enter to send)"
                  rows={2}
                  maxLength={4000}
                  className="flex-1 resize-none"
                />
                <Button
                  size="sm"
                  disabled={!reply.trim() || send.isPending}
                  onClick={() => send.mutate(reply)}
                >
                  {send.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Send
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* Sidebar — timeline metadata */}
        <aside className="space-y-4">
          <section className="rounded-control border border-border bg-surface p-4">
            <h3 className="text-xs uppercase text-muted-foreground mb-3">Details</h3>
            <dl className="text-sm space-y-2">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Channel</dt>
                <dd className="capitalize">{ticket.channel}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Priority</dt>
                <dd className="capitalize">{ticket.priority}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="capitalize">{ticket.status.replace("_", " ")}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Last update</dt>
                <dd>{fmtZoned(new Date(ticket.updated_at), { dateStyle: "medium" })}</dd>
              </div>
            </dl>
          </section>

          {escalations.length > 0 && (
            <section className="rounded-control border border-border bg-surface p-4">
              <h3 className="text-xs uppercase text-muted-foreground mb-3 flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3" /> Escalation history
              </h3>
              <ul className="space-y-2">
                {escalations.map((e, i) => (
                  <li key={i} className="text-xs">
                    <p className="font-medium capitalize">
                      {e.from} → {e.to}
                    </p>
                    <p className="text-muted-foreground line-clamp-2">{e.reason}</p>
                    <p className="text-muted-foreground/70 mt-0.5">
                      {fmtZoned(new Date(e.at), { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {feedback && (
            <section className="rounded-control border border-border bg-surface p-4">
              <h3 className="text-xs uppercase text-muted-foreground mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" /> Your feedback
              </h3>
              <div className="flex items-center gap-0.5 mb-1">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star
                    key={i}
                    className={`w-4 h-4 ${i < (feedback.rating ?? 0) ? "fill-amber-500 text-amber-500" : "text-muted-foreground/30"}`}
                  />
                ))}
              </div>
              {feedback.comment && (
                <p className="text-xs text-muted-foreground italic">"{feedback.comment}"</p>
              )}
            </section>
          )}
        </aside>
      </div>

      {/* Escalate dialog */}
      <Dialog open={escalateOpen} onOpenChange={setEscalateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Escalate this ticket
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Explain why this needs faster attention. We'll raise the priority level.
          </p>
          <Textarea
            value={escalateReason}
            onChange={(e) => setEscalateReason(e.target.value)}
            rows={4}
            placeholder="e.g. This is now blocking our team's work"
            maxLength={500}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEscalateOpen(false)}>
              <X className="w-3.5 h-3.5 mr-1.5" /> Cancel
            </Button>
            <Button
              disabled={escalateReason.trim().length < 3 || escalateM.isPending}
              onClick={() => escalateM.mutate(escalateReason)}
            >
              {escalateM.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
              )}
              Escalate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Feedback dialog */}
      <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>How was your support experience?</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center gap-1 py-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                className="p-1 transition-transform"
              >
                <Star
                  className={`w-8 h-8 ${n <= rating ? "fill-amber-500 text-amber-500" : "text-muted-foreground/30"}`}
                />
              </button>
            ))}
          </div>
          <Textarea
            value={feedbackComment}
            onChange={(e) => setFeedbackComment(e.target.value)}
            placeholder="Anything else you'd like to share? (optional)"
            rows={3}
            maxLength={2000}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFeedbackOpen(false)}>
              Skip
            </Button>
            <Button disabled={rating < 1 || feedbackM.isPending} onClick={() => feedbackM.mutate()}>
              {feedbackM.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
              Submit feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
