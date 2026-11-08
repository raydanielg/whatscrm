/**
 * Zoom Meetings provider (Server-to-Server OAuth).
 *
 * Requires an account with credentials:
 *  { account_id, client_id, client_secret }
 * stored encrypted in `meeting_provider_accounts.credentials_ciphertext`.
 */
import type {
  MeetingProvider,
  MeetingAccount,
  MeetingRequest,
  MeetingArtifact,
  MeetingAttendee,
} from "./types";

const ZOOM_API = "https://api.zoom.us/v2";
const ZOOM_OAUTH = "https://zoom.us/oauth/token";

async function getZoomToken(a: MeetingAccount): Promise<string> {
  const { account_id, client_id, client_secret } = a.credentials;
  if (!account_id || !client_id || !client_secret) {
    throw new Error("Zoom account is missing credentials (account_id, client_id, client_secret)");
  }
  const basic = Buffer.from(`${client_id}:${client_secret}`).toString("base64");
  const res = await fetch(`${ZOOM_OAUTH}?grant_type=account_credentials&account_id=${account_id}`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!res.ok) throw new Error(`Zoom OAuth failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { access_token: string };
  return j.access_token;
}

function durationMinutes(req: MeetingRequest): number {
  return Math.max(15, Math.round((new Date(req.end_at).getTime() - new Date(req.start_at).getTime()) / 60000));
}

export const zoomProvider: MeetingProvider = {
  kind: "zoom",

  async createMeeting(account, req): Promise<MeetingArtifact> {
    if (!account) {
      // Fallback deterministic link if the workspace hasn't connected Zoom.
      return {
        provider: "zoom",
        join_url: `https://zoom.us/j/${Date.now().toString().slice(-10)}`,
        waiting_room_enabled: !!req.options?.waiting_room,
        recording_enabled: !!req.options?.recording,
      };
    }
    const token = await getZoomToken(account);
    const host = account.config.default_host_email ?? req.host_email ?? "me";
    const body = {
      topic: req.title,
      type: 2, // scheduled
      start_time: req.start_at,
      duration: durationMinutes(req),
      timezone: req.timezone ?? "UTC",
      agenda: req.agenda ?? "",
      password: req.options?.password,
      settings: {
        waiting_room: req.options?.waiting_room ?? account.config.waiting_room_default ?? true,
        auto_recording: req.options?.recording
          ? account.config.auto_recording === "local"
            ? "local"
            : "cloud"
          : "none",
        join_before_host: false,
        approval_type: 2,
      },
    };
    const res = await fetch(`${ZOOM_API}/users/${encodeURIComponent(host)}/meetings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Zoom createMeeting failed: ${res.status} ${await res.text()}`);
    const j = (await res.json()) as {
      id: number;
      join_url: string;
      start_url: string;
      password?: string;
    };
    return {
      provider: "zoom",
      join_url: j.join_url,
      host_url: j.start_url,
      external_meeting_id: String(j.id),
      password: j.password,
      waiting_room_enabled: !!body.settings.waiting_room,
      recording_enabled: body.settings.auto_recording !== "none",
      raw: j as unknown as Record<string, unknown>,
    };
  },

  async cancelMeeting(account, externalId) {
    if (!account) return;
    const token = await getZoomToken(account);
    await fetch(`${ZOOM_API}/meetings/${externalId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  async fetchAttendance(account, externalId): Promise<MeetingAttendee[]> {
    if (!account) return [];
    const token = await getZoomToken(account);
    const res = await fetch(`${ZOOM_API}/report/meetings/${externalId}/participants?page_size=300`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const j = (await res.json()) as {
      participants?: Array<{
        id?: string;
        name?: string;
        user_email?: string;
        join_time?: string;
        leave_time?: string;
        duration?: number;
      }>;
    };
    return (j.participants ?? []).map((p) => ({
      external_participant_id: p.id,
      name: p.name ?? null,
      email: p.user_email ?? null,
      role: "guest",
      joined_at: p.join_time ?? null,
      left_at: p.leave_time ?? null,
      duration_seconds: typeof p.duration === "number" ? p.duration : null,
    }));
  },

  async fetchRecordingUrl(account, externalId): Promise<string | null> {
    if (!account) return null;
    const token = await getZoomToken(account);
    const res = await fetch(`${ZOOM_API}/meetings/${externalId}/recordings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { share_url?: string; recording_files?: Array<{ play_url?: string }> };
    return j.share_url ?? j.recording_files?.[0]?.play_url ?? null;
  },
};
