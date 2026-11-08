/**
 * Timezone-aware date formatting — the display-layer counterpart to
 * `src/lib/currency/format.ts`'s tenant currency resolution.
 *
 * Previously `org.timezone`/`profile.timezone` were saved by the Locale
 * settings UI and never read again: every timestamp in the app (`format(new
 * Date(iso), ...)` from date-fns) rendered in whatever timezone the
 * *browser* happened to be in, not the org's or the viewing user's chosen
 * one. That's invisible to an agent working from the same timezone as their
 * business, but wrong for a remote/outsourced agent or a business that
 * explicitly wants times shown in head-office time regardless of who's
 * viewing.
 *
 * No new dependency: `Intl.DateTimeFormat` already supports an explicit IANA
 * `timeZone`, which is all `date-fns-tz` would add here.
 */

const browserTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

/** Format a date/time in a specific IANA timezone. Falls back to the
 * browser's own timezone if `timezone` is invalid (e.g. a stale/freeform
 * legacy value) rather than throwing and blanking the timestamp. */
export function formatInTimezone(
  date: Date | string | number,
  timezone: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
  locale?: string,
): string {
  const d = date instanceof Date ? date : new Date(date);
  const tz = timezone?.trim() || browserTimezone();
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: tz }).format(d);
  } catch {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: browserTimezone() }).format(d);
  }
}

/** The Y-M-D of a date as it falls in a given timezone (not the browser's). */
function zonedYmd(date: Date, timezone: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** Whether two dates fall on the same calendar day in a given timezone —
 * the zoned counterpart to date-fns `isSameDay`, which only ever compares in
 * the browser's own timezone. Used to group chat messages by day divider. */
export function isSameZonedDay(
  a: Date | string | number,
  b: Date | string | number,
  timezone: string | null | undefined,
): boolean {
  const tz = timezone?.trim() || browserTimezone();
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);
  try {
    const pa = zonedYmd(da, tz);
    const pb = zonedYmd(db, tz);
    return pa.y === pb.y && pa.m === pb.m && pa.d === pb.d;
  } catch {
    const pa = zonedYmd(da, browserTimezone());
    const pb = zonedYmd(db, browserTimezone());
    return pa.y === pb.y && pa.m === pb.m && pa.d === pb.d;
  }
}

/**
 * "Today" / "Yesterday" / "Month d, yyyy" — computed against the *target*
 * timezone's calendar day, not the browser's. A message sent at 11pm in the
 * org's timezone must still read "Today" for an agent browsing from a zone
 * where it's already past midnight, and vice versa.
 */
export function zonedDayLabel(
  date: Date | string | number,
  timezone: string | null | undefined,
  locale?: string,
): string {
  const d = date instanceof Date ? date : new Date(date);
  const tz = timezone?.trim() || browserTimezone();
  let target: { y: number; m: number; d: number };
  let now: { y: number; m: number; d: number };
  try {
    target = zonedYmd(d, tz);
    now = zonedYmd(new Date(), tz);
  } catch {
    target = zonedYmd(d, browserTimezone());
    now = zonedYmd(new Date(), browserTimezone());
  }
  if (target.y === now.y && target.m === now.m && target.d === now.d) return "Today";
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const y = zonedYmd(yesterday, tz);
  if (target.y === y.y && target.m === y.m && target.d === y.d) return "Yesterday";
  return formatInTimezone(d, tz, { month: "long", day: "numeric", year: "numeric" }, locale);
}
