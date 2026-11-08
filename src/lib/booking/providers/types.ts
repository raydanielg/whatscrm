/**
 * Calendar Provider Abstraction Layer
 * ─────────────────────────────────────
 * Every provider (Google, Microsoft Outlook / 365, Apple ICS, CalDAV)
 * implements this identical contract so the availability engine and
 * booking flows never touch provider-specific code.
 */

export type CalendarProviderKind = "google" | "microsoft" | "apple" | "caldav" | "none";

export type BusyBlock = {
  start_at: string;
  end_at: string;
  external_id?: string;
  title?: string;
};

export type CalendarListItem = {
  id: string;
  name: string;
  primary: boolean;
  color?: string | null;
  read_only?: boolean;
};

export type ExternalEvent = {
  title: string;
  description?: string;
  location?: string | null;
  start_at: string;
  end_at: string;
  attendees?: string[];
  organizer_email?: string;
  timezone?: string;
  join_url?: string | null;
};

export type ProviderContext = {
  accountId: string;
  workspaceId: string;
  hostId: string;
  calendarId?: string | null;
  /** Decrypted OAuth refresh token, or null for public providers */
  connectionKey?: string | null;
  /** Apple / CalDAV public ICS feed URL */
  icsUrl?: string | null;
};

export interface CalendarProvider {
  kind: CalendarProviderKind;

  /** Two-way: read events from the provider to detect conflicts. */
  listBusy(ctx: ProviderContext, fromISO: string, toISO: string): Promise<BusyBlock[]>;

  /** Two-way: list all calendars available for this account (calendar selection UI). */
  listCalendars(ctx: ProviderContext): Promise<CalendarListItem[]>;

  /** Push a new appointment to the external calendar. */
  createEvent(ctx: ProviderContext, event: ExternalEvent): Promise<{ external_id: string }>;

  /** Reschedule / edit sync — update an existing external event. */
  updateEvent(ctx: ProviderContext, externalId: string, event: ExternalEvent): Promise<void>;

  /** Cancellation sync — remove the event from the external calendar. */
  deleteEvent(ctx: ProviderContext, externalId: string): Promise<void>;
}
