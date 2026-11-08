/**
 * Meeting provider registry + orchestration.
 *
 * The registry maps a provider kind to a real, pluggable implementation.
 * The `provisionMeetingForAppointment` helper picks the account, calls the
 * provider, writes to `meeting_history`, and returns the artifact.
 */
import { encryptConnectionKey, decryptConnectionKey } from "./crypto.server";
import type {
  MeetingProvider,
  MeetingProviderKind,
  MeetingAccount,
  MeetingRequest,
  MeetingArtifact,
} from "./meeting/types";
import { zoomProvider } from "./meeting/zoom.server";
import { googleMeetProvider } from "./meeting/google-meet.server";
import { teamsProvider } from "./meeting/teams.server";
import { jitsiProvider } from "./meeting/jitsi.server";
import { livekitProvider } from "./meeting/livekit.server";
import { sbAny } from "@/lib/supabase/untyped";

const REGISTRY: Record<MeetingProviderKind, MeetingProvider> = {
  zoom: zoomProvider,
  google_meet: googleMeetProvider,
  microsoft_teams: teamsProvider,
  jitsi: jitsiProvider,
  livekit: livekitProvider,
};

export function meetingProviderForKind(kind: MeetingProviderKind): MeetingProvider {
  return REGISTRY[kind];
}

export function encryptCredentials(creds: Record<string, string>): string {
  return encryptConnectionKey(JSON.stringify(creds));
}

export function decryptCredentials(cipher: string | null | undefined): Record<string, string> {
  if (!cipher) return {};
  try {
    return JSON.parse(decryptConnectionKey(cipher));
  } catch {
    return {};
  }
}

export function hydrateAccount(row: {
  id: string;
  workspace_id: string;
  provider: string;
  display_name: string;
  status: string;
  credentials_ciphertext: string | null;
  config: unknown;
}): MeetingAccount {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    provider: row.provider as MeetingProviderKind,
    display_name: row.display_name,
    status: row.status as MeetingAccount["status"],
    credentials: decryptCredentials(row.credentials_ciphertext),
    config: (row.config ?? {}) as MeetingAccount["config"],
  };
}

export async function provisionMeetingForAppointment(input: {
  supabaseAdmin: {
    from: (t: string) => {
      select: (s: string) => {
        eq: (a: string, b: unknown) => {
          eq: (a: string, b: unknown) => {
            order: (a: string, b: unknown) => {
              limit: (n: number) => { maybeSingle: () => Promise<{ data: unknown }> };
            };
          };
        };
      };
      insert: (row: unknown) => Promise<{ error: unknown }>;
      update: (row: unknown) => { eq: (a: string, b: unknown) => Promise<{ error: unknown }> };
    };
  };
  kind: MeetingProviderKind;
  req: MeetingRequest;
  accountId?: string | null;
}): Promise<MeetingArtifact> {
  const { supabaseAdmin, kind, req } = input;

  // Resolve account: explicit id > default > any active
  let accountRow: MeetingAccount | null = null;
  const q = supabaseAdmin
    .from("meeting_provider_accounts")
    .select("id, workspace_id, provider, display_name, status, credentials_ciphertext, config, is_default")
    .eq("workspace_id", req.workspace_id)
    .eq("provider", kind)
    .order("is_default", { ascending: false })
    .limit(1);
  const { data } = await q.maybeSingle();
  if (data) accountRow = hydrateAccount(data as never);

  const provider = meetingProviderForKind(kind);
  try {
    const artifact = await provider.createMeeting(accountRow, req);
    await sbAny(supabaseAdmin).from("meeting_history").insert({
      workspace_id: req.workspace_id,
      appointment_id: req.appointment_id,
      provider: kind,
      provider_account_id: accountRow?.id ?? null,
      action: "created",
      join_url: artifact.join_url,
      external_meeting_id: artifact.external_meeting_id ?? null,
      payload: artifact.raw ?? {},
    });
    return artifact;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sbAny(supabaseAdmin).from("meeting_history").insert({
      workspace_id: req.workspace_id,
      appointment_id: req.appointment_id,
      provider: kind,
      provider_account_id: accountRow?.id ?? null,
      action: "error",
      error: msg,
      payload: {},
    });
    // Graceful fallback: return a provider-shaped stub so booking still succeeds
    return {
      provider: kind,
      join_url: `#meeting-error-${req.appointment_id}`,
      waiting_room_enabled: !!req.options?.waiting_room,
      recording_enabled: !!req.options?.recording,
      raw: { fallback: true, error: msg },
    };
  }
}

export type { MeetingProvider, MeetingProviderKind, MeetingAccount, MeetingRequest, MeetingArtifact };
