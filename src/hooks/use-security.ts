import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrandName } from "@/hooks/use-brand-name";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const anyClient = supabase as any;

export type LoginEvent =
  | "success" | "failed" | "logout" | "locked"
  | "password_reset" | "mfa_challenge" | "mfa_success" | "mfa_failed";

export type LoginHistoryRow = {
  id: string;
  user_id: string;
  event: LoginEvent;
  ip_address: string | null;
  user_agent: string | null;
  device: string | null;
  location: string | null;
  failure_reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type PersonalAccessToken = {
  id: string;
  user_id: string;
  name: string;
  prefix: string;
  scopes: string[];
  last_used_at: string | null;
  last_used_ip: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type User2FA = {
  user_id: string;
  enabled: boolean;
  method: "totp" | "sms" | "email";
  secret: string | null;
  recovery_codes: string[];
  verified_at: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AccountLockout = {
  user_id: string;
  failed_attempts: number;
  last_failed_at: string | null;
  locked_until: string | null;
  updated_at: string;
};

export type PasswordPolicy = {
  organization_id: string;
  min_length: number;
  require_uppercase: boolean;
  require_lowercase: boolean;
  require_number: boolean;
  require_symbol: boolean;
  disallow_common: boolean;
  rotation_days: number;
  history_count: number;
  max_failed_attempts: number;
  lockout_minutes: number;
  session_idle_minutes: number;
  session_absolute_hours: number;
  require_2fa: boolean;
  created_at: string;
  updated_at: string;
};

/* ---------- Login history ---------- */
export function useLoginHistory(limit = 100) {
  return useQuery({
    queryKey: ["login_history", limit],
    queryFn: async (): Promise<LoginHistoryRow[]> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data, error } = await anyClient
        .from("login_history")
        .select("*")
        .eq("user_id", u.user.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as LoginHistoryRow[];
    },
  });
}

/* ---------- Personal Access Tokens ---------- */
export function usePersonalAccessTokens() {
  return useQuery({
    queryKey: ["pat", "mine"],
    queryFn: async (): Promise<PersonalAccessToken[]> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data, error } = await anyClient
        .from("personal_access_tokens")
        .select("*")
        .eq("user_id", u.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PersonalAccessToken[];
    },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function useCreatePAT() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      scopes?: string[];
      expiresInDays?: number | null;
    }): Promise<{ token: string; row: PersonalAccessToken }> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not authenticated");
      const raw = randomToken(24);
      const prefix = "pat_" + raw.slice(0, 8);
      const token = `${prefix}.${raw}`;
      const hashed = await sha256Hex(token);
      const expires_at = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 86400_000).toISOString()
        : null;
      const { data, error } = await anyClient
        .from("personal_access_tokens")
        .insert({
          user_id: u.user.id,
          name: input.name,
          prefix,
          hashed_token: hashed,
          scopes: input.scopes ?? [],
          expires_at,
        })
        .select("*")
        .single();
      if (error) throw error;
      return { token, row: data as PersonalAccessToken };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pat", "mine"] }),
  });
}

export function useRevokePAT() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await anyClient
        .from("personal_access_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pat", "mine"] }),
  });
}

export function useDeletePAT() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await anyClient.from("personal_access_tokens").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pat", "mine"] }),
  });
}

/* ---------- 2FA ---------- */
export function useMy2FA() {
  return useQuery({
    queryKey: ["2fa", "mine"],
    queryFn: async (): Promise<User2FA | null> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data, error } = await anyClient
        .from("user_2fa")
        .select("*")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as User2FA | null;
    },
  });
}

function base32Secret(length = 32): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => alphabet[b % 32]).join("");
}

export function useEnable2FA() {
  const qc = useQueryClient();
  const brandName = useBrandName();
  return useMutation({
    mutationFn: async (): Promise<{ secret: string; otpauthUrl: string }> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not authenticated");
      const secret = base32Secret(32);
      const email = u.user.email ?? "user";
      const issuer = brandName;
      const otpauthUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
      const { error } = await anyClient.from("user_2fa").upsert({
        user_id: u.user.id,
        method: "totp",
        secret,
        enabled: false,
      });
      if (error) throw error;
      return { secret, otpauthUrl };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["2fa", "mine"] }),
  });
}

export function useConfirm2FA() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (_code: string) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not authenticated");
      // NOTE: verification of TOTP code happens client-side in demo; production
      // should verify via edge function using the stored secret.
      const { error } = await anyClient
        .from("user_2fa")
        .update({ enabled: true, verified_at: new Date().toISOString() })
        .eq("user_id", u.user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["2fa", "mine"] }),
  });
}

export function useDisable2FA() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not authenticated");
      const { error } = await anyClient
        .from("user_2fa")
        .update({ enabled: false, secret: null, recovery_codes: [] })
        .eq("user_id", u.user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["2fa", "mine"] }),
  });
}

export function useRegenerateRecoveryCodes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<string[]> => {
      const { data, error } = await anyClient.rpc("regenerate_recovery_codes");
      if (error) throw error;
      return (data ?? []) as string[];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["2fa", "mine"] }),
  });
}

/* ---------- Lockout ---------- */
export function useMyLockout() {
  return useQuery({
    queryKey: ["lockout", "mine"],
    queryFn: async (): Promise<AccountLockout | null> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data, error } = await anyClient
        .from("account_lockouts")
        .select("*")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as AccountLockout | null;
    },
  });
}

// No client-side lockout reset: account_lockouts has no write grant for
// users (letting users clear their own counter would defeat brute-force
// protection). Counters reset on successful login / expiry server-side.

/* ---------- Password policy ---------- */
export function usePasswordPolicy(orgId: string | undefined) {
  return useQuery({
    queryKey: ["password_policy", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<PasswordPolicy | null> => {
      if (!orgId) return null;
      const { data, error } = await anyClient
        .from("password_policy")
        .select("*")
        .eq("organization_id", orgId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as PasswordPolicy | null;
    },
  });
}

export function useSavePasswordPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<PasswordPolicy> & { organization_id: string }) => {
      const { error } = await anyClient.from("password_policy").upsert(input);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["password_policy", v.organization_id] }),
  });
}

/* ---------- Revoke other sessions ---------- */
export function useRevokeOtherSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (currentSessionId?: string) => {
      const { data, error } = await anyClient.rpc("revoke_all_other_sessions", {
        _current_session: currentSessionId ?? null,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions", "mine"] }),
  });
}

/* ---------- Record login event (best effort, called after sign-in) ---------- */
export async function recordLoginEvent(event: LoginEvent, extra?: {
  failure_reason?: string;
  device?: string;
}) {
  try {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : null;
    await anyClient.rpc("record_login_attempt", {
      _user_id: u.user.id,
      _event: event,
      _ip: null,
      _user_agent: ua,
      _device: extra?.device ?? null,
      _failure_reason: extra?.failure_reason ?? null,
    });
  } catch {
    // best effort
  }
}
