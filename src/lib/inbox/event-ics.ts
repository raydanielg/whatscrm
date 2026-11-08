/**
 * Pure RFC 5545 (iCalendar) builder for the composer's "Event" attachment.
 *
 * No channel sends a native event message, so the composer builds a .ics
 * file in the browser and sends it as a plain document — any channel that
 * accepts documents (WhatsApp, Telegram, Messenger, Email, live chat) can
 * then deliver a real, openable calendar invite.
 */

export interface EventIcsInput {
  title: string;
  /** Event start, as a JS Date (any timezone — converted to UTC). */
  start: Date;
  /** Event end. Defaults to start + 1 hour. */
  end?: Date;
  location?: string;
  description?: string;
  /** Fixed for deterministic tests; defaults to `start`. */
  now?: Date;
  /** Fixed for deterministic tests; defaults to a random-ish value. */
  uid?: string;
}

export interface ParsedEventIcs {
  title: string;
  start: string;
  end?: string;
  location?: string;
  description?: string;
}

const ONE_HOUR_MS = 60 * 60 * 1000;

/** `YYYYMMDDTHHMMSSZ` — the RFC 5545 UTC "basic" date-time format. */
export function formatIcsUtc(date: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * Escape a TEXT value per RFC 5545 §3.3.11: backslash, then semicolon,
 * comma and newline. Backslash must be escaped first so the escapes it
 * introduces are not themselves re-escaped.
 */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

function unescapeIcsText(value: string): string {
  return value.replace(/\\[nN]/g, "\n").replace(/\\([\\;,])/g, "$1");
}

function parseIcsUtc(value: string): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Read the first VEVENT from an .ics file created by WACRM. */
export function parseEventIcs(source: string): ParsedEventIcs | null {
  const unfolded = source.replace(/\r?\n[ \t]/g, "");
  const event = unfolded.match(/BEGIN:VEVENT\r?\n([\s\S]*?)\r?\nEND:VEVENT/i)?.[1];
  if (!event) return null;

  const fields = new Map<string, string>();
  for (const line of event.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).split(";", 1)[0]?.toUpperCase();
    if (key && !fields.has(key)) fields.set(key, line.slice(separator + 1));
  }

  const title = fields.get("SUMMARY");
  const start = fields.get("DTSTART");
  if (!title || !start) return null;
  const parsedStart = parseIcsUtc(start);
  if (!parsedStart) return null;
  const parsedEnd = fields.get("DTEND") ? parseIcsUtc(fields.get("DTEND")!) : null;

  return {
    title: unescapeIcsText(title),
    start: parsedStart,
    end: parsedEnd ?? undefined,
    location: fields.get("LOCATION") ? unescapeIcsText(fields.get("LOCATION")!) : undefined,
    description: fields.get("DESCRIPTION")
      ? unescapeIcsText(fields.get("DESCRIPTION")!)
      : undefined,
  };
}

/**
 * Fold a content line to 75 octets per line (RFC 5545 §3.1), continuation
 * lines prefixed with a single space. Folds on UTF-8 byte boundaries so a
 * multi-byte character is never split across the fold.
 */
function foldLine(line: string): string {
  const bytes = (s: string) => new TextEncoder().encode(s).length;
  if (bytes(line) <= 75) return line;

  const chars = Array.from(line);
  const lines: string[] = [];
  let current = "";
  let currentBytes = 0;
  let limit = 75;
  for (const ch of chars) {
    const chBytes = bytes(ch);
    if (currentBytes + chBytes > limit) {
      lines.push(current);
      current = "";
      currentBytes = 0;
      limit = 74; // continuation lines reserve 1 octet for the leading space
    }
    current += ch;
    currentBytes += chBytes;
  }
  if (current) lines.push(current);
  return lines.map((l, i) => (i === 0 ? l : ` ${l}`)).join("\r\n");
}

/** Build a one-event VCALENDAR document with CRLF line endings. */
export function buildEventIcs(input: EventIcsInput): string {
  const title = input.title.trim();
  if (!title) throw new Error("Event title is required.");
  if (!(input.start instanceof Date) || Number.isNaN(input.start.getTime())) {
    throw new Error("Event start date/time is required.");
  }
  const end =
    input.end && !Number.isNaN(input.end.getTime())
      ? input.end
      : new Date(input.start.getTime() + ONE_HOUR_MS);
  if (end.getTime() <= input.start.getTime()) {
    throw new Error("Event end must be after the start.");
  }
  const now = input.now ?? input.start;
  const uid = input.uid ?? `${now.getTime()}-${Math.random().toString(36).slice(2, 10)}@wacrm`;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WACRM//Inbox Composer//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(uid)}`,
    `DTSTAMP:${formatIcsUtc(now)}`,
    `DTSTART:${formatIcsUtc(input.start)}`,
    `DTEND:${formatIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(title)}`,
  ];
  if (input.location?.trim()) lines.push(`LOCATION:${escapeIcsText(input.location.trim())}`);
  if (input.description?.trim()) {
    lines.push(`DESCRIPTION:${escapeIcsText(input.description.trim())}`);
  }
  lines.push("END:VEVENT", "END:VCALENDAR");

  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** A filesystem/WhatsApp-safe `<title>.ics` filename. */
export function icsFileName(title: string): string {
  const base = title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${(base || "event").slice(0, 100)}.ics`;
}
