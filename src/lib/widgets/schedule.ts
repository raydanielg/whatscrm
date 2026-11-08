/**
 * Widget schedule — declarative activation windows for a chat widget.
 *
 * Combines with `is_active` (the hard on/off switch):
 *   - is_active=false      → widget never serves (schedule ignored)
 *   - schedule.enabled=false → widget serves 24/7 when is_active=true
 *   - schedule.enabled=true  → widget serves only inside the computed window
 */

export type ScheduleDay = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday
export interface ScheduleWindow { from: string; to: string } // "HH:MM"

export type OfflineBehavior = "hide" | "show_offline";

export interface WidgetSchedule {
  enabled: boolean;
  timezone: string;
  weeklyHours: Record<string, ScheduleWindow[]>; // keys "0".."6"
  activeFrom: string | null;   // ISO date (YYYY-MM-DD)
  activeUntil: string | null;  // ISO date
  blackoutDates: string[];     // ISO dates
  offlineBehavior: OfflineBehavior;
  offlineMessage: string;
}

export const DEFAULT_SCHEDULE: WidgetSchedule = {
  enabled: false,
  timezone: "UTC",
  weeklyHours: {
    "0": [],
    "1": [{ from: "09:00", to: "17:00" }],
    "2": [{ from: "09:00", to: "17:00" }],
    "3": [{ from: "09:00", to: "17:00" }],
    "4": [{ from: "09:00", to: "17:00" }],
    "5": [{ from: "09:00", to: "17:00" }],
    "6": [],
  },
  activeFrom: null,
  activeUntil: null,
  blackoutDates: [],
  offlineBehavior: "show_offline",
  offlineMessage: "We're currently offline. Leave a message and we'll get back to you.",
};

export function mergeSchedule(raw: unknown): WidgetSchedule {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<WidgetSchedule>;
  return {
    ...DEFAULT_SCHEDULE,
    ...r,
    weeklyHours: { ...DEFAULT_SCHEDULE.weeklyHours, ...(r.weeklyHours ?? {}) },
    blackoutDates: Array.isArray(r.blackoutDates) ? r.blackoutDates : [],
  };
}

interface TzParts { year: number; month: number; day: number; weekday: number; hour: number; minute: number }

function partsInTimeZone(date: Date, timeZone: string): TzParts {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const parts = fmt.formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    let hour = Number(get("hour"));
    if (hour === 24) hour = 0; // Safari edge
    return {
      year: Number(get("year")),
      month: Number(get("month")),
      day: Number(get("day")),
      weekday: weekdayMap[get("weekday")] ?? 0,
      hour,
      minute: Number(get("minute")),
    };
  } catch {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      weekday: date.getUTCDay(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
    };
  }
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function isoDate(p: TzParts): string {
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export interface ScheduleEvaluation {
  active: boolean;
  reason: "no_schedule" | "in_window" | "before_start" | "after_end" | "blackout" | "outside_hours";
  isoDate: string;
  weekday: number;
}

export function evaluateSchedule(schedule: WidgetSchedule, now: Date = new Date()): ScheduleEvaluation {
  if (!schedule.enabled) {
    const p = partsInTimeZone(now, schedule.timezone || "UTC");
    return { active: true, reason: "no_schedule", isoDate: isoDate(p), weekday: p.weekday };
  }
  const p = partsInTimeZone(now, schedule.timezone || "UTC");
  const today = isoDate(p);

  if (schedule.activeFrom && today < schedule.activeFrom) {
    return { active: false, reason: "before_start", isoDate: today, weekday: p.weekday };
  }
  if (schedule.activeUntil && today > schedule.activeUntil) {
    return { active: false, reason: "after_end", isoDate: today, weekday: p.weekday };
  }
  if (schedule.blackoutDates.includes(today)) {
    return { active: false, reason: "blackout", isoDate: today, weekday: p.weekday };
  }

  const windows = schedule.weeklyHours[String(p.weekday)] ?? [];
  const cur = p.hour * 60 + p.minute;
  const inWindow = windows.some(({ from, to }) => {
    const s = toMinutes(from);
    const e = toMinutes(to);
    return s <= e ? cur >= s && cur < e : cur >= s || cur < e;
  });
  return {
    active: inWindow,
    reason: inWindow ? "in_window" : "outside_hours",
    isoDate: today,
    weekday: p.weekday,
  };
}

export const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
