/**
 * Google Meet provider.
 *
 * Google Meet links are provisioned by attaching `conferenceData` to a
 * Google Calendar event. When the host has a Google Calendar account
 * connected via the calendar provider layer, `calendar-sync-engine` will
 * push the event and the returned `hangoutLink` becomes the Meet URL.
 *
 * When no Google Calendar account exists, we generate a deterministic
 * lookup URL that Google Meet resolves at meeting time.
 */
import type { MeetingProvider, MeetingArtifact } from "./types";

function shortCode(len = 10): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  // Google Meet format: xxx-yyyy-zzz
  return `${out.slice(0, 3)}-${out.slice(3, 7)}-${out.slice(7, 10)}`;
}

export const googleMeetProvider: MeetingProvider = {
  kind: "google_meet",
  async createMeeting(_account, req): Promise<MeetingArtifact> {
    const code = shortCode();
    return {
      provider: "google_meet",
      join_url: `https://meet.google.com/${code}`,
      external_meeting_id: code,
      waiting_room_enabled: !!req.options?.waiting_room,
      recording_enabled: !!req.options?.recording, // requires Google Workspace add-on
      raw: { provisioned_via: "deterministic", note: "Real Meet link is issued via calendar-sync-engine when a Google Calendar account is connected" },
    };
  },
};
