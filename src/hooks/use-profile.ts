import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sbAny } from "@/lib/supabase/untyped";

export type NotificationPrefs = {
  email_marketing: boolean;
  email_product: boolean;
  email_security: boolean;
  push_new_message: boolean;
  push_mentions: boolean;
  push_assignments: boolean;
  digest_frequency: "daily" | "weekly" | "monthly" | "never";
};

export type ProfileRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  job_title: string | null;
  department: string | null;
  bio: string | null;
  language: string;
  timezone: string;
  date_format: string;
  time_format: string;
  theme: string;
  notification_preferences: NotificationPrefs;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SessionRow = {
  id: string;
  user_id: string;
  device: string | null;
  user_agent: string | null;
  ip_address: string | null;
  location: string | null;
  last_seen_at: string;
  revoked_at: string | null;
  created_at: string;
};

export function useMyProfile() {
  return useQuery({
    queryKey: ["profile", "me"],
    queryFn: async (): Promise<ProfileRow | null> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data, error } = await supabase
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("*" as any)
        .eq("id", u.user.id)
        .maybeSingle();
      if (error) throw error;
      const row = (data ?? { id: u.user.id }) as unknown as ProfileRow;
      // Merge in email from auth if profiles.email is null
      return { ...row, email: row.email ?? u.user.email ?? null };
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<ProfileRow>) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(patch as any)
        .eq("id", u.user.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile", "me"] }),
  });
}

export function useUploadAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: File | Blob) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not authenticated");
      const type = input.type || "image/jpeg";
      const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
      const path = `${u.user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, input, { upsert: true, contentType: type });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage
        .from("avatars")
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (sErr) throw sErr;
      const url = signed.signedUrl;
      const { error } = await sbAny(supabase).from("profiles").update({ avatar_url: url }).eq("id", u.user.id);
      if (error) throw error;
      return url;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile", "me"] }),
  });
}

export function useMySessions() {
  return useQuery({
    queryKey: ["sessions", "mine"],
    queryFn: async (): Promise<SessionRow[]> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data, error } = await supabase
        .from("sessions")
        .select("*")
        .eq("user_id", u.user.id)
        .order("last_seen_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SessionRow[];
    },
  });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions", "mine"] }),
  });
}

/**
 * Records the current browser as a session row (best effort). Called once
 * after sign-in so the "Connected devices" list stays fresh.
 */
export function useRegisterCurrentSession() {
  return useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const ua = typeof navigator !== "undefined" ? navigator.userAgent : null;
      const device = detectDevice(ua ?? "");
      await sbAny(supabase).from("sessions").insert({
        user_id: u.user.id,
        device,
        user_agent: ua,
        last_seen_at: new Date().toISOString(),
      });
    },
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not authenticated");
      // Soft delete: mark profile, sign out. Hard delete of auth user
      // requires admin — we do the safe user-initiated flow.
      const { error } = await supabase
        .from("profiles")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ display_name: "Deleted user", bio: null, phone: null, full_name: null } as any)
        .eq("id", u.user.id);
      if (error) throw error;
      await supabase.auth.signOut({ scope: "global" });
    },
  });
}

function detectDevice(ua: string): string {
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Unknown device";
}
