import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Bell,
  Calendar,
  CalendarDays,
  Check,
  Clock,
  Copy,
  Download,
  KeyRound,
  Loader2,
  MapPin,
  MessageSquareText,
  RotateCcw,
  Star,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  getMyAppointmentDetail,
  cancelMyAppointment,
  getRescheduleLink,
  getAppointmentIcs,
  updateAppointmentNotes,
  submitAppointmentFeedback,
} from "@/lib/client-portal/portal.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RichTextarea } from "@/shared/components/rich-textarea";

export const Route = createFileRoute("/_authenticated/client/appointments/$id")({
  component: AppointmentDetailPage,
});

function AppointmentDetailPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const qc = useQueryClient();

  const detailFn = useServerFn(getMyAppointmentDetail);
  const cancelFn = useServerFn(cancelMyAppointment);
  const reschedFn = useServerFn(getRescheduleLink);
  const icsFn = useServerFn(getAppointmentIcs);
  const notesFn = useServerFn(updateAppointmentNotes);
  const feedbackFn = useServerFn(submitAppointmentFeedback);

  const q = useQuery({
    queryKey: ["portal-appointment", id],
    queryFn: () => detailFn({ data: { id } }),
  });

  const cancelMut = useMutation({
    mutationFn: (reason: string) => cancelFn({ data: { appointment_id: id, reason } }),
    onSuccess: () => {
      toast.success("Appointment cancelled");
      qc.invalidateQueries({ queryKey: ["portal-appointment", id] });
      qc.invalidateQueries({ queryKey: ["portal-appointments"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const rescheduleMut = useMutation({
    mutationFn: () => reschedFn({ data: { id } }),
    onSuccess: (r) => {
      router.navigate({ to: r.url as never });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Cannot reschedule"),
  });

  const [notes, setNotes] = useState("");
  const [notesLoaded, setNotesLoaded] = useState(false);
  useEffect(() => {
    if (q.data && !notesLoaded) {
      const cn = (q.data.appointment.answers as Record<string, { text?: string } | undefined>)
        ?.customer_notes;
      setNotes(cn?.text ?? "");
      setNotesLoaded(true);
    }
  }, [q.data, notesLoaded]);

  const notesMut = useMutation({
    mutationFn: () => notesFn({ data: { appointment_id: id, notes } }),
    onSuccess: () => {
      toast.success("Notes saved");
      qc.invalidateQueries({ queryKey: ["portal-appointment", id] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const feedbackMut = useMutation({
    mutationFn: () =>
      feedbackFn({ data: { appointment_id: id, rating, comment: comment || undefined } }),
    onSuccess: () => {
      toast.success("Thanks for your feedback!");
      qc.invalidateQueries({ queryKey: ["portal-appointment", id] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const downloadIcs = useMutation({
    mutationFn: () => icsFn({ data: { id } }),
    onSuccess: (r) => {
      const blob = new Blob([r.ics], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (q.isLoading)
    return (
      <div className="p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading
      </div>
    );
  if (q.isError || !q.data)
    return <div className="p-8 text-sm text-muted-foreground">Appointment not found.</div>;

  const { appointment: a, event_type, history, forward, reminders, feedback } = q.data;
  const start = new Date(a.start_at);
  const end = new Date(a.end_at);
  const now = Date.now();
  const isPast =
    end.getTime() < now || ["completed", "cancelled", "no_show", "rescheduled"].includes(a.status);
  const canModify =
    !isPast && !["cancelled", "no_show", "completed", "rescheduled"].includes(a.status);

  const copyLink = () => {
    if (a.join_url) {
      navigator.clipboard.writeText(a.join_url);
      toast.success("Link copied");
    }
  };

  return (
    <div className="space-y-5">
      <Link
        to="/client/appointments"
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to appointments
      </Link>

      <header className="rounded-control border border-border bg-surface p-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase text-muted-foreground">
            {event_type?.name ?? "Appointment"}
          </p>
          <h1 className="font-display text-2xl font-semibold mt-1">
            {start.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />{" "}
              {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} –{" "}
              {end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
            <span>·</span>
            <span>{a.customer_timezone}</span>
            {a.location_kind === "video" ? (
              <span className="inline-flex items-center gap-1">
                <Video className="w-3.5 h-3.5" /> Video call
              </span>
            ) : a.location_kind === "in_person" ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> In person
              </span>
            ) : (
              a.location_kind && <span className="capitalize">{a.location_kind}</span>
            )}
          </p>
        </div>
        <Badge
          variant={
            a.status === "cancelled" || a.status === "no_show"
              ? "destructive"
              : a.status === "completed"
                ? "outline"
                : "default"
          }
          className="capitalize"
        >
          {a.status}
        </Badge>
      </header>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        {a.join_url && canModify && (
          <a href={a.join_url} target="_blank" rel="noreferrer">
            <Button size="sm">
              <Video className="w-3.5 h-3.5 " /> Join meeting
            </Button>
          </a>
        )}
        {a.join_url && (
          <Button size="sm" variant="outline" onClick={copyLink}>
            <Copy className="w-3.5 h-3.5 " /> Copy link
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => downloadIcs.mutate()}
          disabled={downloadIcs.isPending}
        >
          <Download className="w-3.5 h-3.5 " /> Add to calendar
        </Button>
        {canModify && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => rescheduleMut.mutate()}
              disabled={rescheduleMut.isPending}
            >
              <RotateCcw className="w-3.5 h-3.5 " /> Reschedule
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const reason = window.prompt("Reason for cancellation (optional):") ?? "";
                if (window.confirm("Cancel this appointment?")) cancelMut.mutate(reason);
              }}
              disabled={cancelMut.isPending}
            >
              <X className="w-3.5 h-3.5 " /> Cancel
            </Button>
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <div className="space-y-4">
          {/* Meeting link details */}
          {(a.join_url || a.meeting_password) && (
            <section className="rounded-control border border-border bg-surface p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Video className="w-4 h-4" /> Meeting details
              </h3>
              <dl className="space-y-2 text-sm">
                {a.join_url && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground shrink-0">Join URL</dt>
                    <dd className="truncate">
                      <a
                        href={a.join_url}
                        className="text-accent hover:underline break-all"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {a.join_url}
                      </a>
                    </dd>
                  </div>
                )}
                {a.meeting_password && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground shrink-0 flex items-center gap-1">
                      <KeyRound className="w-3 h-3" /> Password
                    </dt>
                    <dd className="font-mono text-xs">{a.meeting_password}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {/* Meeting Notes */}
          <section className="rounded-control border border-border bg-surface p-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <MessageSquareText className="w-4 h-4" /> Meeting notes
            </h3>
            {a.meeting_notes && (
              <div className="mb-3 rounded-control bg-background/70 border border-border p-3 text-sm">
                <p className="text-xs uppercase text-muted-foreground mb-1">From your host</p>
                <p className="whitespace-pre-line">{a.meeting_notes}</p>
              </div>
            )}
            <p className="text-xs text-muted-foreground mb-1.5">Your private notes</p>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Add notes, agenda, or takeaways"
            />
            <div className="mt-2 flex justify-end">
              <Button size="sm" onClick={() => notesMut.mutate()} disabled={notesMut.isPending}>
                {notesMut.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5 " />
                )}{" "}
                Save
              </Button>
            </div>
          </section>

          {/* Feedback (only for past confirmed meetings) */}
          {isPast &&
            (a.status === "completed" || end.getTime() < now) &&
            a.status !== "cancelled" && (
              <section className="rounded-control border border-border bg-surface p-4">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <Star className="w-4 h-4" /> Rate this meeting
                </h3>
                {feedback ? (
                  <div className="text-sm">
                    <div className="flex items-center gap-1 mb-1">
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${i < (feedback.rating ?? 0) ? "fill-amber-500 text-amber-500" : "text-muted-foreground/30"}`}
                        />
                      ))}
                      <span className="ml-2 text-xs text-muted-foreground">
                        Submitted{" "}
                        {feedback.submitted_at
                          ? new Date(feedback.submitted_at).toLocaleDateString()
                          : ""}
                      </span>
                    </div>
                    {feedback.comment && (
                      <p className="text-muted-foreground">{feedback.comment}</p>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-1 mb-3">
                      {Array.from({ length: 5 }, (_, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setRating(i + 1)}
                          aria-label={`Rate ${i + 1}`}
                        >
                          <Star
                            className={`w-6 h-6 transition-colors ${i < rating ? "fill-amber-500 text-amber-500" : "text-muted-foreground/30 hover:text-amber-500"}`}
                          />
                        </button>
                      ))}
                    </div>
                    <Textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={3}
                      placeholder="Anything you'd like to share? (optional)"
                    />
                    <div className="mt-2 flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => feedbackMut.mutate()}
                        disabled={feedbackMut.isPending || rating === 0}
                      >
                        Submit feedback
                      </Button>
                    </div>
                  </>
                )}
              </section>
            )}
        </div>

        <aside className="space-y-4">
          {/* Reminders */}
          <section className="rounded-control border border-border bg-surface p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Bell className="w-4 h-4" /> Reminders
              </h3>
              <Link
                to="/client/appointments/preferences"
                className="text-xs text-accent hover:underline"
              >
                Manage
              </Link>
            </div>
            {reminders.length === 0 ? (
              <p className="text-xs text-muted-foreground">No reminders scheduled.</p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {reminders.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <span className="capitalize">{r.channel}</span>
                    <span className="text-muted-foreground">
                      {new Date(r.send_at).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <Badge
                      variant={r.status === "sent" ? "outline" : "default"}
                      className="capitalize text-[11px]"
                    >
                      {r.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* History */}
          <section className="rounded-control border border-border bg-surface p-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <CalendarDays className="w-4 h-4" /> Appointment history
            </h3>
            <ol className="space-y-2">
              {forward.map((f) => (
                <li key={f.id} className="text-xs">
                  <Link
                    to="/client/appointments/$id"
                    params={{ id: f.id }}
                    className="hover:text-accent"
                  >
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3 h-3 text-accent" />
                      <span className="font-medium">Rescheduled to</span>
                    </div>
                    <p className="text-muted-foreground ml-5">
                      {new Date(f.start_at).toLocaleString()}
                    </p>
                  </Link>
                </li>
              ))}
              {history.map((h, i) => (
                <li key={h.id} className="text-xs">
                  {h.id === a.id ? (
                    <>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3 h-3 text-accent" />
                        <span className="font-medium">Current</span>
                      </div>
                      <p className="text-muted-foreground ml-5">
                        {new Date(h.start_at).toLocaleString()}
                      </p>
                    </>
                  ) : (
                    <Link
                      to="/client/appointments/$id"
                      params={{ id: h.id }}
                      className="hover:text-accent block"
                    >
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3 h-3 text-muted-foreground" />
                        <span className="font-medium">
                          {i === 1 ? "Rescheduled from" : "Previously"}
                        </span>
                      </div>
                      <p className="text-muted-foreground ml-5">
                        {new Date(h.start_at).toLocaleString()}
                      </p>
                    </Link>
                  )}
                </li>
              ))}
              <li className="text-xs">
                <div className="flex items-center gap-2">
                  <Calendar className="w-3 h-3 text-muted-foreground" />
                  <span className="font-medium">Booked</span>
                </div>
                <p className="text-muted-foreground ml-5">
                  {new Date(a.created_at).toLocaleString()}
                </p>
              </li>
              {a.cancellation_reason && (
                <li className="text-xs">
                  <div className="flex items-center gap-2">
                    <X className="w-3 h-3 text-destructive" />
                    <span className="font-medium">Cancelled</span>
                  </div>
                  <p className="text-muted-foreground ml-5">{a.cancellation_reason}</p>
                </li>
              )}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
