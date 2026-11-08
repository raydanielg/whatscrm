/**
 * Meeting Provider Layer — abstraction over conferencing providers.
 *
 * Every provider implements the same 3-step contract so the booking engine
 * can swap providers without touching business logic:
 *   1. createMeeting(appointment) -> { join_url, external_ids }
 *   2. updateMeeting(external_ids, appointment) -> { join_url? }
 *   3. cancelMeeting(external_ids)
 *
 * Providers that don't need a real API call (e.g. `custom`, `in_person`,
 * `phone`, `whatsapp`) return a synthetic join URL / phone hint.
 *
 * Real Zoom / Google Meet / Teams integrations plug in behind these
 * interfaces via connectors — the abstraction keeps the booking engine
 * production-ready today while allowing incremental rollout later.
 */

export type MeetingLocationKind =
  | "in_person"
  | "zoom"
  | "google_meet"
  | "microsoft_teams"
  | "jitsi"
  | "livekit"
  | "phone"
  | "whatsapp"
  | "custom";


export type AppointmentDraft = {
  workspace_id: string;
  event_type_id: string;
  host_id: string;
  customer_name: string;
  customer_email?: string | null;
  customer_phone?: string | null;
  start_at: string;
  end_at: string;
  location_kind: MeetingLocationKind;
  location_details?: Record<string, unknown>;
  title?: string;
};

export type MeetingArtifact = {
  join_url: string | null;
  external_ids: Record<string, string>;
  location_kind: MeetingLocationKind;
  location_details: Record<string, unknown>;
};

export interface MeetingProvider {
  kind: MeetingLocationKind;
  createMeeting(a: AppointmentDraft): Promise<MeetingArtifact>;
  cancelMeeting?(external_ids: Record<string, string>): Promise<void>;
}

/* ─── Built-in providers (no external API needed) ─────────────────── */

const inPersonProvider: MeetingProvider = {
  kind: "in_person",
  async createMeeting(a) {
    return {
      join_url: null,
      external_ids: {},
      location_kind: "in_person",
      location_details: a.location_details ?? {},
    };
  },
};

const phoneProvider: MeetingProvider = {
  kind: "phone",
  async createMeeting(a) {
    const number = String(a.location_details?.phone ?? a.customer_phone ?? "");
    return {
      join_url: number ? `tel:${number}` : null,
      external_ids: {},
      location_kind: "phone",
      location_details: { phone: number },
    };
  },
};

const whatsappProvider: MeetingProvider = {
  kind: "whatsapp",
  async createMeeting(a) {
    const number = String(a.location_details?.phone ?? a.customer_phone ?? "").replace(/\D/g, "");
    return {
      join_url: number ? `https://wa.me/${number}` : null,
      external_ids: {},
      location_kind: "whatsapp",
      location_details: { phone: number },
    };
  },
};

const customProvider: MeetingProvider = {
  kind: "custom",
  async createMeeting(a) {
    const url = a.location_details?.url;
    return {
      join_url: typeof url === "string" ? url : null,
      external_ids: {},
      location_kind: "custom",
      location_details: a.location_details ?? {},
    };
  },
};

/* ─── Real conferencing providers (delegated to meeting/*.server.ts) ─── */

async function provisionViaProvider(
  kind: "zoom" | "google_meet" | "microsoft_teams" | "jitsi" | "livekit",
  a: AppointmentDraft,
): Promise<MeetingArtifact> {
  const { supabaseAdmin } = await import("@/lib/demo/admin-write-guard.server");
  const { provisionMeetingForAppointment } = await import("./providers/meeting.server");
  const artifact = await provisionMeetingForAppointment({
    supabaseAdmin: supabaseAdmin as never,
    kind,
    req: {
      workspace_id: a.workspace_id,
      appointment_id: `${a.event_type_id}-${a.start_at}`,
      event_type_id: a.event_type_id,
      host_id: a.host_id,
      customer_name: a.customer_name,
      customer_email: a.customer_email,
      title: a.title ?? `Meeting with ${a.customer_name}`,
      start_at: a.start_at,
      end_at: a.end_at,
    },
  });
  return {
    join_url: artifact.join_url,
    external_ids: artifact.external_meeting_id
      ? { [`${kind}_meeting_id`]: artifact.external_meeting_id }
      : {},
    location_kind: kind,
    location_details: {
      provider: kind,
      password: artifact.password,
      waiting_room_enabled: artifact.waiting_room_enabled,
      recording_enabled: artifact.recording_enabled,
      host_url: artifact.host_url,
    },
  };
}

const REGISTRY: Record<MeetingLocationKind, MeetingProvider> = {
  in_person: inPersonProvider,
  phone: phoneProvider,
  whatsapp: whatsappProvider,
  custom: customProvider,
  zoom: { kind: "zoom", createMeeting: (a: AppointmentDraft) => provisionViaProvider("zoom", a) },
  google_meet: { kind: "google_meet", createMeeting: (a: AppointmentDraft) => provisionViaProvider("google_meet", a) },
  microsoft_teams: { kind: "microsoft_teams", createMeeting: (a: AppointmentDraft) => provisionViaProvider("microsoft_teams", a) },
  jitsi: { kind: "jitsi", createMeeting: (a: AppointmentDraft) => provisionViaProvider("jitsi", a) },
  livekit: { kind: "livekit", createMeeting: (a: AppointmentDraft) => provisionViaProvider("livekit", a) },
};

export function getMeetingProvider(kind: string): MeetingProvider {
  return REGISTRY[(kind as MeetingLocationKind)] ?? customProvider;
}

export async function provisionMeeting(a: AppointmentDraft): Promise<MeetingArtifact> {
  return getMeetingProvider(a.location_kind).createMeeting(a);
}

