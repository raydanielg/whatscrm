/**
 * LiveKit Cloud / self-hosted provider.
 *
 * Rooms are ephemeral — we generate a room name at booking time and mint
 * short-lived participant JWTs on demand when someone opens the join page.
 *
 * Account credentials: { api_key, api_secret }, plus config.livekit_url
 * (wss://<project>.livekit.cloud).
 */
import { createHmac } from "node:crypto";
import type { MeetingProvider, MeetingAccount, MeetingRequest, MeetingArtifact } from "./types";

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/** Mint a LiveKit-compatible room-grant JWT (HS256). */
export function mintLiveKitToken(opts: {
  apiKey: string;
  apiSecret: string;
  identity: string;
  name?: string;
  room: string;
  ttlSeconds?: number;
  canPublish?: boolean;
}): string {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: opts.apiKey,
    sub: opts.identity,
    name: opts.name ?? opts.identity,
    nbf: now,
    exp: now + (opts.ttlSeconds ?? 60 * 60 * 6),
    video: {
      room: opts.room,
      roomJoin: true,
      canPublish: opts.canPublish ?? true,
      canSubscribe: true,
      canPublishData: true,
    },
  };
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac("sha256", opts.apiSecret).update(`${h}.${p}`).digest());
  return `${h}.${p}.${sig}`;
}

function randomRoom(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(36))
    .join("")
    .slice(0, 12);
}

export const livekitProvider: MeetingProvider = {
  kind: "livekit",
  async createMeeting(account: MeetingAccount | null, req: MeetingRequest): Promise<MeetingArtifact> {
    const room = `booking-${req.appointment_id.slice(0, 8)}-${randomRoom()}`;
    const url = account?.config.livekit_url ?? "";
    // The join URL is the app's own LiveKit stage page; the page mints a
    // per-user JWT via a server function when the guest opens the link.
    const joinUrl = `/livekit/room/${room}`;
    return {
      provider: "livekit",
      join_url: joinUrl,
      external_meeting_id: room,
      waiting_room_enabled: !!(req.options?.waiting_room ?? account?.config.waiting_room_default),
      recording_enabled: !!req.options?.recording,
      raw: { livekit_url: url, room },
    };
  },
};
