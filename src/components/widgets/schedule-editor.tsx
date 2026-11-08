import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { RichTextarea } from "@/shared/components/rich-textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X, CalendarClock, Clock, CalendarX } from "lucide-react";
import { DAY_LABELS, evaluateSchedule, type WidgetSchedule } from "@/lib/widgets/schedule";

const COMMON_TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Oslo",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

interface Props {
  schedule: WidgetSchedule;
  onChange: (next: WidgetSchedule) => void;
}

export function WidgetScheduleEditor({ schedule, onChange }: Props) {
  const [blackoutInput, setBlackoutInput] = useState("");
  const set = <K extends keyof WidgetSchedule>(k: K, v: WidgetSchedule[K]) =>
    onChange({ ...schedule, [k]: v });

  const evaluation = useMemo(() => evaluateSchedule(schedule), [schedule]);

  const setWindow = (day: number, idx: number, field: "from" | "to", val: string) => {
    const key = String(day);
    const windows = [...(schedule.weeklyHours[key] ?? [])];
    windows[idx] = { ...windows[idx], [field]: val };
    onChange({ ...schedule, weeklyHours: { ...schedule.weeklyHours, [key]: windows } });
  };
  const addWindow = (day: number) => {
    const key = String(day);
    onChange({
      ...schedule,
      weeklyHours: {
        ...schedule.weeklyHours,
        [key]: [...(schedule.weeklyHours[key] ?? []), { from: "09:00", to: "17:00" }],
      },
    });
  };
  const removeWindow = (day: number, idx: number) => {
    const key = String(day);
    onChange({
      ...schedule,
      weeklyHours: {
        ...schedule.weeklyHours,
        [key]: (schedule.weeklyHours[key] ?? []).filter((_, i) => i !== idx),
      },
    });
  };
  const copyMondayToWeekdays = () => {
    const monday = schedule.weeklyHours["1"] ?? [];
    onChange({
      ...schedule,
      weeklyHours: {
        ...schedule.weeklyHours,
        "2": [...monday],
        "3": [...monday],
        "4": [...monday],
        "5": [...monday],
      },
    });
  };
  const addBlackout = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(blackoutInput)) return;
    if (schedule.blackoutDates.includes(blackoutInput)) return;
    onChange({ ...schedule, blackoutDates: [...schedule.blackoutDates, blackoutInput].sort() });
    setBlackoutInput("");
  };

  return (
    <div className="grid gap-6">
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-bold text-xl flex items-center gap-2">
              <CalendarClock className="size-5" /> Schedule
            </h3>
            <p className="mt-1 text-muted-foreground text-sm">
              Automatically activate the widget within specific hours, date ranges, or timezones.
              When disabled, the widget serves 24/7 (while the master switch is on).
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={evaluation.active ? "default" : "secondary"}>
              {evaluation.active ? "In window now" : "Offline now"}
            </Badge>
            <Switch
              checked={schedule.enabled}
              onCheckedChange={(v) => set("enabled", v)}
              aria-label="Enable schedule"
            />
          </div>
        </div>

        <div className={schedule.enabled ? "" : "pointer-events-none opacity-60"}>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div>
              <Label>Timezone</Label>
              <Select value={schedule.timezone} onValueChange={(v) => set("timezone", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Active from (optional)</Label>
              <Input
                type="date"
                value={schedule.activeFrom ?? ""}
                onChange={(e) => set("activeFrom", e.target.value || null)}
              />
            </div>
            <div>
              <Label>Active until (optional)</Label>
              <Input
                type="date"
                value={schedule.activeUntil ?? ""}
                onChange={(e) => set("activeUntil", e.target.value || null)}
              />
            </div>
          </div>
        </div>
      </Card>

      <Card className={"p-6 " + (schedule.enabled ? "" : "pointer-events-none opacity-60")}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-xl flex items-center gap-2">
              <Clock className="size-5" /> Weekly hours
            </h3>
            <p className="text-muted-foreground text-sm">
              Times are interpreted in the schedule timezone.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={copyMondayToWeekdays}>
            Copy Monday to Tue–Fri
          </Button>
        </div>
        <div className="mt-4 grid gap-3">
          {DAY_LABELS.map((label, day) => {
            const windows = schedule.weeklyHours[String(day)] ?? [];
            return (
              <div key={day} className="flex items-start gap-3 rounded-control border p-3">
                <div className="w-28 shrink-0">
                  <p className="font-medium text-sm">{label}</p>
                  <p className="text-muted-foreground text-xs">
                    {windows.length === 0
                      ? "Closed"
                      : `${windows.length} window${windows.length === 1 ? "" : "s"}`}
                  </p>
                </div>
                <div className="flex-1 grid gap-2">
                  {windows.map((w, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        type="time"
                        className="w-28"
                        value={w.from}
                        onChange={(e) => setWindow(day, i, "from", e.target.value)}
                      />
                      <span className="text-muted-foreground text-xs">to</span>
                      <Input
                        type="time"
                        className="w-28"
                        value={w.to}
                        onChange={(e) => setWindow(day, i, "to", e.target.value)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remove window"
                        onClick={() => removeWindow(day, i)}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-fit"
                    onClick={() => addWindow(day)}
                  >
                    <Plus className="mr-2 size-4" /> Add window
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className={"p-6 " + (schedule.enabled ? "" : "pointer-events-none opacity-60")}>
        <h3 className="font-bold text-xl flex items-center gap-2">
          <CalendarX className="size-5" /> Blackout dates
        </h3>
        <p className="text-muted-foreground text-sm">
          Force the widget offline on specific dates (holidays, maintenance).
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Input
            type="date"
            value={blackoutInput}
            onChange={(e) => setBlackoutInput(e.target.value)}
            className="w-56"
          />
          <Button variant="outline" onClick={addBlackout} disabled={!blackoutInput}>
            <Plus className="mr-2 size-4" /> Add date
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {schedule.blackoutDates.length === 0 && (
            <p className="text-muted-foreground text-sm">No blackout dates.</p>
          )}
          {schedule.blackoutDates.map((d) => (
            <Badge key={d} variant="secondary" className="gap-1">
              {d}
              <button
                aria-label={`Remove ${d}`}
                onClick={() =>
                  set(
                    "blackoutDates",
                    schedule.blackoutDates.filter((x) => x !== d),
                  )
                }
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      </Card>

      <Card className={"p-6 " + (schedule.enabled ? "" : "pointer-events-none opacity-60")}>
        <h3 className="font-bold text-xl">Offline behavior</h3>
        <p className="text-muted-foreground text-sm">
          What happens when the widget is outside its schedule window.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <Label>When offline</Label>
            <Select
              value={schedule.offlineBehavior}
              onValueChange={(v) => set("offlineBehavior", v as WidgetSchedule["offlineBehavior"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="show_offline">Show widget with offline message</SelectItem>
                <SelectItem value="hide">Hide widget completely</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Offline message</Label>
            <RichTextarea
              rows={3}
              value={schedule.offlineMessage}
              onChange={(v) => set("offlineMessage", v)}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
