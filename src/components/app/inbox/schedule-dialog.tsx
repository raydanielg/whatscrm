import { useMemo, useState } from "react";
import { CalendarClock, Clock, Loader2, Paperclip, X } from "lucide-react";
import { format } from "date-fns";
import { useZonedDateFormatter } from "@/hooks/use-timezone";
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
import {
  DateTimePicker,
  toLocalDateTimeString,
  fromLocalDateTimeString,
} from "@/shared/components";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  useScheduledMessages,
  useScheduleMessage,
  useCancelScheduledMessage,
} from "@/hooks/use-productivity";
import { uploadAttachment } from "@/hooks/use-messages";
import { buildMedia, type MediaKind } from "@/lib/messaging/builders";

export type SchedulableAttachment = {
  file: File;
  messageType: MediaKind;
  previewUrl: string | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversationId: string;
  workspaceId: string;
  /** Recipient's WhatsApp number — required to schedule an attachment, since
   * the dispatcher replays a pre-built payload rather than re-resolving the
   * conversation's contact at send time. */
  recipientPhone: string | null;
  body: string;
  /** A pending attachment from the composer, if the user opened Schedule
   * while one was staged. Uploaded immediately on submit (not at dialog
   * open) so the file isn't held hostage if the user cancels. */
  attachment?: SchedulableAttachment | null;
  onScheduled: () => void;
};

/** Suggested quick times relative to now. */
function useQuickTimes() {
  return useMemo(() => {
    const now = new Date();
    const in1h = new Date(now.getTime() + 60 * 60 * 1000);
    const tomorrow9 = new Date(now);
    tomorrow9.setDate(tomorrow9.getDate() + 1);
    tomorrow9.setHours(9, 0, 0, 0);
    const monday9 = new Date(now);
    const dow = monday9.getDay(); // 0 = Sun
    const delta = (1 - dow + 7) % 7 || 7;
    monday9.setDate(monday9.getDate() + delta);
    monday9.setHours(9, 0, 0, 0);
    return [
      { label: "In 1 hour", value: in1h },
      { label: "Tomorrow, 9:00 AM", value: tomorrow9 },
      { label: "Monday, 9:00 AM", value: monday9 },
    ];
  }, []);
}

export function ScheduleDialog({
  open,
  onOpenChange,
  conversationId,
  workspaceId,
  recipientPhone,
  body,
  attachment,
  onScheduled,
}: Props) {
  const formatZoned = useZonedDateFormatter();
  const quick = useQuickTimes();
  const [custom, setCustom] = useState<string>(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    return format(d, "yyyy-MM-dd'T'HH:mm");
  });
  const [uploading, setUploading] = useState(false);
  const schedule = useScheduleMessage();
  const cancel = useCancelScheduledMessage();
  const { data: pending = [] } = useScheduledMessages(conversationId);

  const canSubmit = !!body.trim() || !!attachment;
  const busy = uploading || schedule.isPending;

  const submit = async (when: Date) => {
    if (when.getTime() <= Date.now()) {
      toast.error("Pick a time in the future");
      return;
    }
    if (!canSubmit) return;
    if (attachment && !recipientPhone) {
      toast.error("This conversation has no WhatsApp number to send the attachment to.");
      return;
    }
    try {
      if (attachment) {
        setUploading(true);
        const { url, type } = await uploadAttachment(
          workspaceId,
          conversationId,
          attachment.file,
          attachment.file.name,
        );
        const payload = buildMedia(
          recipientPhone!,
          attachment.messageType,
          { url },
          {
            caption: attachment.messageType === "document" ? undefined : body.trim() || undefined,
            filename: attachment.file.name,
            mimeType: type || attachment.file.type || undefined,
          },
        );
        await schedule.mutateAsync({
          conversation_id: conversationId,
          body: attachment.messageType === "document" ? attachment.file.name : body.trim(),
          message_type: attachment.messageType,
          scheduled_for: when.toISOString(),
          metadata: { payload },
        });
      } else {
        await schedule.mutateAsync({
          conversation_id: conversationId,
          body,
          scheduled_for: when.toISOString(),
        });
      }
      toast.success(
        `Scheduled for ${formatZoned(when, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })}`,
      );
      onScheduled();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md min-w-0 w-[calc(100vw-2rem)] sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            Schedule message
          </DialogTitle>
          <DialogDescription>Send this message later automatically.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {attachment && (
            <div className="flex items-center gap-2 rounded-control border border-border bg-muted/30 p-2.5 text-sm">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <Paperclip className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{attachment.file.name}</div>
                <div className="text-xs capitalize text-muted-foreground">
                  {attachment.messageType}
                </div>
              </div>
            </div>
          )}
          {body ? (
            <div className="rounded-control border border-border bg-muted/30 p-3 text-sm max-h-32 overflow-y-auto whitespace-pre-wrap">
              {body}
            </div>
          ) : !attachment ? (
            <div className="rounded-control border border-dashed border-border p-3 text-xs text-muted-foreground">
              Nothing to schedule yet. Type your message in the composer, then open Schedule again.
            </div>
          ) : null}
          {attachment && (
            <p className="text-[11px] text-muted-foreground">
              Attachments are uploaded now and linked for 7 days — schedule more than a week out and
              the file may no longer be reachable when it's time to send.
              {!recipientPhone && (
                <span className="text-destructive">
                  {" "}
                  This conversation has no WhatsApp number on file, so it can't be scheduled yet.
                </span>
              )}
            </p>
          )}

          <div>
            <div className="text-[11px] font-medium  text-muted-foreground mb-2">Quick times</div>
            <div className="grid grid-cols-1 gap-1">
              {quick.map((q) => (
                <Button
                  key={q.label}
                  variant="outline"
                  className="justify-between h-9"
                  onClick={() => submit(q.value)}
                  disabled={!canSubmit || busy || (!!attachment && !recipientPhone)}
                >
                  <span className="flex items-center gap-2">
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Clock className="h-3.5 w-3.5" />
                    )}
                    {q.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatZoned(q.value, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sched-custom" className="text-[11px] ">
              Or pick a custom time
            </Label>
            <div className="flex gap-2">
              <DateTimePicker
                className="min-w-0 flex-1"
                value={fromLocalDateTimeString(custom)}
                onChange={(d) => setCustom(toLocalDateTimeString(d))}
                fromDate={new Date()}
              />
              <Button
                className="shrink-0"
                onClick={() => submit(new Date(custom))}
                disabled={!canSubmit || !custom || busy || (!!attachment && !recipientPhone)}
              >
                {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Schedule
              </Button>
            </div>
          </div>

          {pending.length > 0 && (
            <>
              <Separator />
              <div>
                <div className="text-[11px] font-medium  text-muted-foreground mb-2">
                  Already scheduled ({pending.length})
                </div>
                <ScrollArea className="max-h-32">
                  <ul className="space-y-1">
                    {pending.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-start gap-2 rounded-control border border-border p-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium">
                            {formatZoned(new Date(m.scheduled_for), {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{m.body}</div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => cancel.mutate(m.id)}
                          aria-label="Cancel"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
