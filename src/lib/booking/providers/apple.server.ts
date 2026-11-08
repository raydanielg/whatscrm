/**
 * Apple Calendar provider — read-only ICS feed.
 *
 * Apple iCloud does not expose a public REST API, so we consume a shared
 * ICS URL (Calendar → Share Calendar → Public Calendar). This is enough
 * for availability sync (busy-time detection). Two-way write requires
 * CalDAV credentials, which are handled by the caldav adapter.
 */
import type { CalendarProvider, ProviderContext, BusyBlock, CalendarListItem } from "./types";

export const appleCalendarProvider: CalendarProvider = {
  kind: "apple",

  async listCalendars(ctx) {
    return [{ id: "ics", name: ctx.icsUrl ? "ICS Feed" : "No feed", primary: true, read_only: true }] as CalendarListItem[];
  },

  async listBusy(ctx, fromISO, toISO) {
    if (!ctx.icsUrl) return [];
    let text: string;
    try {
      const res = await fetch(ctx.icsUrl.replace(/^webcal:/, "https:"));
      if (!res.ok) return [];
      text = await res.text();
    } catch {
      return [];
    }
    const from = new Date(fromISO).getTime();
    const to = new Date(toISO).getTime();
    return parseICS(text).filter((b) => {
      const s = new Date(b.start_at).getTime();
      const e = new Date(b.end_at).getTime();
      return e >= from && s <= to;
    });
  },

  async createEvent() {
    throw new Error("Apple ICS is read-only; use CalDAV or Google/Microsoft to write");
  },
  async updateEvent() {
    throw new Error("Apple ICS is read-only");
  },
  async deleteEvent() {
    /* noop */
  },
};

function parseICS(text: string): BusyBlock[] {
  const events: BusyBlock[] = [];
  // Unfold long lines per RFC 5545 (leading whitespace = continuation)
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);
  let cur: Partial<BusyBlock> | null = null;
  for (const raw of lines) {
    if (raw === "BEGIN:VEVENT") cur = {};
    else if (raw === "END:VEVENT") {
      if (cur?.start_at && cur.end_at) events.push(cur as BusyBlock);
      cur = null;
    } else if (cur) {
      const idx = raw.indexOf(":");
      if (idx < 0) continue;
      const rawKey = raw.slice(0, idx);
      const value = raw.slice(idx + 1);
      const key = rawKey.split(";")[0];
      if (key === "DTSTART") cur.start_at = parseIcsDate(value);
      else if (key === "DTEND") cur.end_at = parseIcsDate(value);
      else if (key === "SUMMARY") cur.title = value;
      else if (key === "UID") cur.external_id = value;
    }
  }
  return events;
}

function parseIcsDate(v: string): string {
  // Basic ICS date parsing: 20260719T140000Z or 20260719 (all-day)
  if (/^\d{8}T\d{6}Z?$/.test(v)) {
    const y = v.slice(0, 4), m = v.slice(4, 6), d = v.slice(6, 8);
    const hh = v.slice(9, 11), mm = v.slice(11, 13), ss = v.slice(13, 15);
    return `${y}-${m}-${d}T${hh}:${mm}:${ss}${v.endsWith("Z") ? "Z" : ""}`;
  }
  if (/^\d{8}$/.test(v)) {
    return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T00:00:00Z`;
  }
  return new Date().toISOString();
}
