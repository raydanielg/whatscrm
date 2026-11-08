export type ClientUpdateRule = {
  day_of_week: number;
  hour_utc: number;
  enabled: boolean;
  cadence: "weekly";
};

/** Five-minute cron can run repeatedly in the scheduled hour; the DB slot key deduplicates it. */
export function dueClientUpdateSlot(rule: ClientUpdateRule, now: Date): string | null {
  if (!rule.enabled || rule.cadence !== "weekly" ||
      !Number.isInteger(rule.day_of_week) || !Number.isInteger(rule.hour_utc) ||
      rule.day_of_week !== now.getUTCDay() || rule.hour_utc !== now.getUTCHours()) return null;
  return now.toISOString().slice(0, 10);
}
