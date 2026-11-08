/**
 * Provider registry. Resolves a `CalendarProvider` for a given
 * `calendar_accounts` row and hydrates its `ProviderContext`
 * (decrypted connection key, calendar id, ICS URL).
 */
import type { CalendarProvider, ProviderContext, CalendarProviderKind } from "./types";
import { decryptConnectionKey } from "./crypto.server";
import { googleCalendarProvider } from "./google.server";
import { microsoftCalendarProvider } from "./microsoft.server";
import { appleCalendarProvider } from "./apple.server";

export const noopProvider: CalendarProvider = {
  kind: "none",
  async listBusy() { return []; },
  async listCalendars() { return []; },
  async createEvent() { return { external_id: "" }; },
  async updateEvent() { /* noop */ },
  async deleteEvent() { /* noop */ },
};

export function providerForKind(kind: string): CalendarProvider {
  switch (kind) {
    case "google": return googleCalendarProvider;
    case "microsoft":
    case "microsoft365":
    case "outlook":
      return microsoftCalendarProvider;
    case "apple":
    case "ics":
      return appleCalendarProvider;
    default:
      return noopProvider;
  }
}

export type CalendarAccountRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  provider: string;
  calendar_id: string | null;
  connection_key_ciphertext: string | null;
  ics_url: string | null;
  enabled: boolean;
  status: string;
};

export function contextFor(account: CalendarAccountRow, hostId?: string): ProviderContext {
  let key: string | null = null;
  if (account.connection_key_ciphertext) {
    try { key = decryptConnectionKey(account.connection_key_ciphertext); }
    catch { key = null; }
  }
  return {
    accountId: account.id,
    workspaceId: account.workspace_id,
    hostId: hostId ?? account.user_id,
    calendarId: account.calendar_id,
    connectionKey: key,
    icsUrl: account.ics_url,
  };
}

export function providerKindsSupported(): { kind: CalendarProviderKind; label: string; auth: "oauth" | "ics" }[] {
  return [
    { kind: "google", label: "Google Calendar", auth: "oauth" },
    { kind: "microsoft", label: "Microsoft Outlook / 365", auth: "oauth" },
    { kind: "apple", label: "Apple Calendar (ICS)", auth: "ics" },
  ];
}
