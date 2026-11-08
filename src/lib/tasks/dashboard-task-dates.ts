/** A date-only project deadline is interpreted in the viewer's configured timezone. */
export function dateKeyInTimezone(date: Date, timezone: string): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
  }
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export type DatedDashboardTask = {
  source: "CRM" | "Project";
  dueAt: string | null;
  dueDate: string | null;
};

/** CRM timestamps sort within each day; date-only project tasks follow them that day. */
export function compareDashboardTasks(
  a: DatedDashboardTask,
  b: DatedDashboardTask,
  timezone: string,
): number {
  const aDay = a.source === "CRM" ? dateKeyInTimezone(new Date(a.dueAt!), timezone) : a.dueDate!;
  const bDay = b.source === "CRM" ? dateKeyInTimezone(new Date(b.dueAt!), timezone) : b.dueDate!;
  const dayOrder = aDay.localeCompare(bDay);
  if (dayOrder) return dayOrder;
  if (a.source !== b.source) return a.source === "CRM" ? -1 : 1;
  return a.source === "CRM" ? Date.parse(a.dueAt!) - Date.parse(b.dueAt!) : 0;
}
