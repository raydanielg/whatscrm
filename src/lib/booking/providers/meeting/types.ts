/**
 * Meeting Provider Layer — provider-agnostic contract for conferencing.
 *
 * Every real provider (Zoom, Google Meet, Microsoft Teams, Jitsi, LiveKit)
 * implements the same three methods so the booking engine can swap
 * providers without touching business logic.
 */

export type MeetingProviderKind =
  | "zoom"
  | "google_meet"
  | "microsoft_teams"
  | "jitsi"
  | "livekit";

export type MeetingLocationKind =
  | "in_person"
  | "phone"
  | "whatsapp"
  | "custom"
  | MeetingProviderKind;

export interface MeetingAccount {
  id: string;
  workspace_id: string;
  provider: MeetingProviderKind;
  display_name: string;
  status: "active" | "disabled" | "error";
  credentials: Record<string, string>; // decrypted secrets (server-only)
  config: MeetingAccountConfig;
}

export interface MeetingAccountConfig {
  waiting_room_default?: boolean;
  password_required?: boolean;
  auto_recording?: "none" | "cloud" | "local";
  domain?: string; // Jitsi: meet.jit.si or a self-hosted domain
  livekit_url?: string; // wss://... for LiveKit
  livekit_api_key?: string; // stored plaintext-ok (public key part)
  default_host_email?: string;
}

export interface MeetingRequest {
  workspace_id: string;
  appointment_id: string;
  event_type_id: string | null;
  host_id: string;
  host_email?: string | null;
  customer_name: string;
  customer_email?: string | null;
  title: string;
  agenda?: string;
  start_at: string; // ISO
  end_at: string; // ISO
  timezone?: string;
  options?: {
    password?: string;
    waiting_room?: boolean;
    recording?: boolean;
  };
}

export interface MeetingArtifact {
  provider: MeetingProviderKind;
  join_url: string;
  host_url?: string;
  external_meeting_id?: string;
  password?: string;
  waiting_room_enabled: boolean;
  recording_enabled: boolean;
  raw?: Record<string, unknown>;
}

export interface MeetingProvider {
  kind: MeetingProviderKind;
  createMeeting(account: MeetingAccount | null, req: MeetingRequest): Promise<MeetingArtifact>;
  updateMeeting?(
    account: MeetingAccount | null,
    externalId: string,
    req: MeetingRequest,
  ): Promise<MeetingArtifact>;
  cancelMeeting?(account: MeetingAccount | null, externalId: string): Promise<void>;
  fetchAttendance?(
    account: MeetingAccount | null,
    externalId: string,
  ): Promise<MeetingAttendee[]>;
  fetchRecordingUrl?(
    account: MeetingAccount | null,
    externalId: string,
  ): Promise<string | null>;
}

export interface MeetingAttendee {
  external_participant_id?: string;
  name: string | null;
  email: string | null;
  role: "host" | "co_host" | "guest";
  joined_at: string | null;
  left_at: string | null;
  duration_seconds: number | null;
}
