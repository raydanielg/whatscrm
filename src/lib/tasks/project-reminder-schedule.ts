export type ReminderKind = "lead" | "due" | "overdue";
export type ReminderEvent = { kind: ReminderKind; offsetMinutes: number };

type Settings = {
  lead_minutes: number[];
  notify_overdue: boolean;
  overdue_repeat_minutes: number;
};

/** Project due dates are calendar dates. Remind at 09:00 in the organization timezone. */
export function minutesUntilProjectDeadline(now: Date, dueDate: string, timezone: string): number {
  const [year, month, day] = dueDate.split("-").map(Number);
  if (!year || !month || !day) throw new Error("Invalid project task due date");
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    return minutesUntilProjectDeadline(now, dueDate, "UTC");
  }
  const get = (kind: string) => Number(parts.find((part) => part.type === kind)?.value ?? 0);
  const dayDelta = (Date.UTC(year, month - 1, day) -
    Date.UTC(get("year"), get("month") - 1, get("day"))) / 86_400_000;
  return dayDelta * 1440 + 9 * 60 - (get("hour") * 60 + get("minute"));
}

/** The cron runs every five minutes; return only events in this run's window. */
export function projectReminderEvents(deltaMinutes: number, settings: Settings): ReminderEvent[] {
  const events: ReminderEvent[] = [];
  const delta = Math.round(deltaMinutes);
  if (delta >= -5) {
    for (const offset of settings.lead_minutes) {
      if (!Number.isInteger(offset) || offset < 0 || offset > 20160) continue;
      if (delta <= offset && delta > offset - 6) {
        events.push({ kind: offset === 0 ? "due" : "lead", offsetMinutes: offset });
      }
    }
  }
  if (settings.notify_overdue && delta < 0) {
    const overdue = -delta;
    const repeat = settings.overdue_repeat_minutes;
    const slots = repeat > 0 ? [Math.floor(overdue / repeat) * repeat] : [15, 60, 240, 1440];
    for (const slot of slots) {
      if (slot > 0 && overdue >= slot && overdue < slot + 6) {
        events.push({ kind: "overdue", offsetMinutes: slot });
      }
    }
  }
  return events;
}
