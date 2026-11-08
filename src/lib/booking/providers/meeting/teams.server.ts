/**
 * Microsoft Teams provider (Graph API onlineMeetings).
 *
 * Uses the `microsoft_outlook` App User Connector when available (the same
 * gateway credentials also cover Teams onlineMeetings scope). When no
 * account is connected, falls back to a deterministic meetup-join link.
 */
import type { MeetingProvider, MeetingAccount, MeetingRequest, MeetingArtifact } from "./types";

const GRAPH = "https://graph.microsoft.com/v1.0";

export const teamsProvider: MeetingProvider = {
  kind: "microsoft_teams",

  async createMeeting(account, req): Promise<MeetingArtifact> {
    if (!account || !account.credentials.access_token) {
      return {
        provider: "microsoft_teams",
        join_url: `https://teams.microsoft.com/l/meetup-join/19%3ameeting_${req.appointment_id.replace(/-/g, "")}%40thread.v2/0`,
        waiting_room_enabled: !!req.options?.waiting_room,
        recording_enabled: !!req.options?.recording,
      };
    }
    const body = {
      subject: req.title,
      startDateTime: req.start_at,
      endDateTime: req.end_at,
      lobbyBypassSettings: {
        scope: req.options?.waiting_room ?? true ? "organizer" : "everyone",
        isDialInBypassEnabled: false,
      },
      recordAutomatically: !!req.options?.recording,
    };
    const res = await fetch(`${GRAPH}/me/onlineMeetings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.credentials.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Teams createMeeting failed: ${res.status} ${await res.text()}`);
    const j = (await res.json()) as { id: string; joinWebUrl: string };
    return {
      provider: "microsoft_teams",
      join_url: j.joinWebUrl,
      external_meeting_id: j.id,
      waiting_room_enabled: !!req.options?.waiting_room,
      recording_enabled: !!req.options?.recording,
      raw: j as unknown as Record<string, unknown>,
    };
  },

  async cancelMeeting(account, externalId) {
    if (!account?.credentials.access_token) return;
    await fetch(`${GRAPH}/me/onlineMeetings/${externalId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${account.credentials.access_token}` },
    });
  },
};
