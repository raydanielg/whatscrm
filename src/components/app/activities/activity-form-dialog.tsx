import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextarea } from "@/shared/components/rich-textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import type {
  SalesActivity,
  ActivityType,
  ActivityStatus,
  ActivityPriority,
  EntityType,
  RecurrenceRule,
} from "@/hooks/use-sales-activities";
import {
  useCreateActivity,
  useUpdateActivity,
  ACTIVITY_TYPE_META,
} from "@/hooks/use-sales-activities";
import {
  DatePicker,
  DateTimePicker,
  toLocalDateTimeString,
  fromLocalDateTimeString,
} from "@/shared/components";
import { format as fmtDate, parseISO } from "date-fns";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  activity?: SalesActivity | null;
  defaults?: Partial<SalesActivity>;
};

const TYPES: ActivityType[] = [
  "call",
  "meeting",
  "task",
  "email",
  "whatsapp",
  "demo",
  "follow_up",
  "note",
];
const STATUSES: ActivityStatus[] = ["planned", "in_progress", "completed", "cancelled", "no_show"];
const PRIORITIES: ActivityPriority[] = ["low", "normal", "high", "urgent"];
const ENTITIES: EntityType[] = ["contact", "company", "lead", "deal", "customer"];

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string | null {
  return v ? new Date(v).toISOString() : null;
}

export function ActivityFormDialog({ open, onOpenChange, activity, defaults }: Props) {
  const create = useCreateActivity();
  const update = useUpdateActivity();
  const isEdit = !!activity;

  const [type, setType] = useState<ActivityType>("task");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [status, setStatus] = useState<ActivityStatus>("planned");
  const [priority, setPriority] = useState<ActivityPriority>("normal");
  const [entityType, setEntityType] = useState<EntityType | "none">("none");
  const [entityId, setEntityId] = useState("");
  const [reminderAt, setReminderAt] = useState("");
  const [notes, setNotes] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [recFreq, setRecFreq] = useState<RecurrenceRule["freq"]>("weekly");
  const [recInterval, setRecInterval] = useState(1);
  const [recUntil, setRecUntil] = useState("");

  useEffect(() => {
    if (!open) return;
    const src = activity ?? defaults ?? {};
    setType(src.type ?? "task");
    setTitle(src.title ?? "");
    setDescription(src.description ?? "");
    setLocation(src.location ?? "");
    setMeetingUrl(src.meeting_url ?? "");
    setStartAt(toLocalInput(src.start_at));
    setEndAt(toLocalInput(src.end_at));
    setAllDay(src.all_day ?? false);
    setStatus(src.status ?? "planned");
    setPriority(src.priority ?? "normal");
    setEntityType((src.entity_type as EntityType) ?? "none");
    setEntityId(src.entity_id ?? "");
    setReminderAt(toLocalInput(src.reminder_at));
    setNotes(src.notes ?? "");
    const rec = src.recurrence as RecurrenceRule | null | undefined;
    setRecurring(!!rec);
    setRecFreq(rec?.freq ?? "weekly");
    setRecInterval(rec?.interval ?? 1);
    setRecUntil(rec?.until ? rec.until.slice(0, 10) : "");
  }, [open, activity, defaults]);

  const submit = async () => {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    const payload: Partial<SalesActivity> = {
      type,
      title: title.trim(),
      description: description || null,
      location: location || null,
      meeting_url: meetingUrl || null,
      start_at: fromLocalInput(startAt),
      end_at: fromLocalInput(endAt),
      all_day: allDay,
      status,
      priority,
      entity_type: entityType === "none" ? null : entityType,
      entity_id: entityId || null,
      reminder_at: fromLocalInput(reminderAt),
      notes: notes || null,
      recurrence: recurring
        ? {
            freq: recFreq,
            interval: Math.max(1, recInterval),
            until: recUntil ? new Date(recUntil).toISOString() : null,
          }
        : null,
    };
    try {
      if (isEdit && activity) {
        await update.mutateAsync({ id: activity.id, patch: payload });
        toast.success("Activity updated");
      } else {
        await create.mutateAsync(payload);
        toast.success("Activity created");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit activity" : "New activity"}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="details" className="mt-2">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
            <TabsTrigger value="link">Link & Notes</TabsTrigger>
          </TabsList>
          <TabsContent value="details" className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as ActivityType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {ACTIVITY_TYPE_META[t].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as ActivityPriority)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Title *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Discovery call with Acme"
                autoFocus
              />
            </div>
            <div>
              <Label>Description</Label>
              <RichTextarea value={description} onChange={(v) => setDescription(v)} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Location</Label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Office / phone / address"
                />
              </div>
              <div>
                <Label>Meeting URL</Label>
                <Input
                  value={meetingUrl}
                  onChange={(e) => setMeetingUrl(e.target.value)}
                  placeholder="https://meet"
                />
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ActivityStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
          <TabsContent value="schedule" className="space-y-4">
            <div className="flex items-center justify-between rounded-control border p-3">
              <div>
                <Label className="mb-0">All-day</Label>
                <p className="text-xs text-muted-foreground">
                  Spans the whole day (no specific time).
                </p>
              </div>
              <Switch checked={allDay} onCheckedChange={setAllDay} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Starts at</Label>
                <DateTimePicker
                  value={fromLocalDateTimeString(startAt)}
                  onChange={(d) => setStartAt(toLocalDateTimeString(d))}
                />
              </div>
              <div>
                <Label>Ends at</Label>
                <DateTimePicker
                  value={fromLocalDateTimeString(endAt)}
                  onChange={(d) => setEndAt(toLocalDateTimeString(d))}
                />
              </div>
            </div>
            <div>
              <Label>Reminder</Label>
              <DateTimePicker
                value={fromLocalDateTimeString(reminderAt)}
                onChange={(d) => setReminderAt(toLocalDateTimeString(d))}
              />
            </div>
            <div className="rounded-control border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="mb-0">Recurring</Label>
                <Switch checked={recurring} onCheckedChange={setRecurring} />
              </div>
              {recurring && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Frequency</Label>
                    <Select
                      value={recFreq}
                      onValueChange={(v) => setRecFreq(v as RecurrenceRule["freq"])}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Every</Label>
                    <Input
                      type="number"
                      min={1}
                      value={recInterval}
                      onChange={(e) => setRecInterval(Number(e.target.value) || 1)}
                    />
                  </div>
                  <div>
                    <Label>Until</Label>
                    <DatePicker
                      value={recUntil ? parseISO(recUntil) : undefined}
                      onChange={(d) => setRecUntil(d ? fmtDate(d, "yyyy-MM-dd") : "")}
                    />
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent value="link" className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Linked to</Label>
                <Select
                  value={entityType}
                  onValueChange={(v) => setEntityType(v as EntityType | "none")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nothing</SelectItem>
                    {ENTITIES.map((e) => (
                      <SelectItem key={e} value={e}>
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Record ID</Label>
                <Input
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
                  placeholder="UUID"
                  disabled={entityType === "none"}
                />
              </div>
            </div>
            <div>
              <Label>Internal notes</Label>
              <RichTextarea value={notes} onChange={(v) => setNotes(v)} rows={5} />
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>
            {isEdit ? "Save changes" : "Create activity"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
