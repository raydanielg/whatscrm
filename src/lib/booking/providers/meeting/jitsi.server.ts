/**
 * Jitsi Meet provider.
 *
 * Jitsi rooms are entirely URL-based — no API call needed. Password + lobby
 * (waiting room) are enforced client-side inside the room and can be encoded
 * into a JWT when the workspace uses a JWT-authenticated Jitsi deployment.
 */
import type { MeetingProvider, MeetingRequest, MeetingArtifact } from "./types";

function randomRoom(): string {
  const words = ["orbit", "quill", "atlas", "harbor", "prism", "vector", "candid", "meridian", "beacon", "signal", "nebula", "cadence"];
  const a = words[Math.floor(Math.random() * words.length)];
  const b = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(1000 + Math.random() * 9000);
  return `${a}-${b}-${n}`;
}

export const jitsiProvider: MeetingProvider = {
  kind: "jitsi",
  async createMeeting(account, req: MeetingRequest): Promise<MeetingArtifact> {
    const domain = account?.config.domain?.replace(/^https?:\/\//, "").replace(/\/$/, "") || "meet.jit.si";
    const room = randomRoom();
    const params = new URLSearchParams();
    if (req.options?.password) params.set("password", req.options.password);
    const suffix = params.toString() ? `#config.startWithVideoMuted=false&${params.toString()}` : "";
    return {
      provider: "jitsi",
      join_url: `https://${domain}/${room}${suffix}`,
      external_meeting_id: room,
      password: req.options?.password,
      waiting_room_enabled: !!(req.options?.waiting_room ?? account?.config.waiting_room_default),
      recording_enabled: !!req.options?.recording,
      raw: { domain, room },
    };
  },
};
