/**
 * Microsoft Outlook / Microsoft 365 provider.
 *
 * Uses direct Microsoft OAuth refresh tokens against Microsoft Graph v1.0.
 * Required scopes: Calendars.ReadWrite, offline_access, User.Read.
 */
import type { CalendarProvider, ProviderContext, ExternalEvent, BusyBlock, CalendarListItem } from "./types";
import { microsoftGraphFetch } from "@/lib/integrations/microsoft-calendar-oauth.server";

async function mfetch(ctx: ProviderContext, path: string, init?: RequestInit) {
  if (!ctx.connectionKey) throw new Error("Microsoft calendar not connected");
  const res = await microsoftGraphFetch(ctx.connectionKey, path, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Microsoft Graph ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

export const microsoftCalendarProvider: CalendarProvider = {
  kind: "microsoft",

  async listCalendars(ctx) {
    const data = await mfetch(ctx, "/me/calendars?$select=id,name,isDefaultCalendar,color,canEdit");
    return ((data.value ?? []) as Array<Record<string, unknown>>).map<CalendarListItem>((c) => ({
      id: String(c.id),
      name: String(c.name),
      primary: Boolean(c.isDefaultCalendar),
      color: (c.color as string | undefined) ?? null,
      read_only: c.canEdit === false,
    }));
  },

  async listBusy(ctx, fromISO, toISO) {
    const calSeg = ctx.calendarId ? `/me/calendars/${encodeURIComponent(ctx.calendarId)}` : "/me";
    const params = new URLSearchParams({
      startDateTime: fromISO,
      endDateTime: toISO,
      $top: "500",
      $select: "id,subject,start,end,showAs,isCancelled",
    });
    const data = await mfetch(ctx, `${calSeg}/calendarView?${params.toString()}`);
    return ((data.value ?? []) as Array<Record<string, unknown>>)
      .filter((e) => !e.isCancelled && e.showAs !== "free")
      .map<BusyBlock>((e) => ({
        start_at: (e.start as { dateTime: string }).dateTime + "Z",
        end_at: (e.end as { dateTime: string }).dateTime + "Z",
        external_id: String(e.id),
        title: (e.subject as string | undefined) ?? "Busy",
      }));
  },

  async createEvent(ctx, event) {
    const calSeg = ctx.calendarId ? `/me/calendars/${encodeURIComponent(ctx.calendarId)}` : "/me";
    const data = await mfetch(ctx, `${calSeg}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildOutlookEvent(event)),
    });
    return { external_id: String(data.id) };
  },

  async updateEvent(ctx, externalId, event) {
    await mfetch(ctx, `/me/events/${encodeURIComponent(externalId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildOutlookEvent(event)),
    });
  },

  async deleteEvent(ctx, externalId) {
    if (!ctx.connectionKey) return;
    const response = await microsoftGraphFetch(ctx.connectionKey, `/me/events/${encodeURIComponent(externalId)}`, { method: "DELETE" });
    if (!response.ok) throw new Error(`Microsoft Graph ${response.status}`);
  },
};

function buildOutlookEvent(event: ExternalEvent) {
  const tz = event.timezone ?? "UTC";
  return {
    subject: event.title,
    body: {
      contentType: "HTML",
      content: [event.description, event.join_url ? `<p><a href="${event.join_url}">Join meeting</a></p>` : ""]
        .filter(Boolean)
        .join(""),
    },
    location: event.location ? { displayName: event.location } : undefined,
    start: { dateTime: event.start_at.replace(/Z$/, ""), timeZone: tz },
    end: { dateTime: event.end_at.replace(/Z$/, ""), timeZone: tz },
    attendees: (event.attendees ?? []).map((email) => ({
      emailAddress: { address: email },
      type: "required",
    })),
  };
}
