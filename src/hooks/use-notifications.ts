import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sbAny } from "@/lib/supabase/untyped";

export type NotificationCategory =
  | "system" | "workspace" | "invitation" | "security" | "subscription"
  | "mention" | "assignment" | "task" | "deal" | "campaign" | "workflow" | "usage_alert" | "ai" | "info"
  | "ticket_mention" | "livechat_handoff" | "birthday" | "communication" | "crm" | "marketing"
  | "automation" | "project" | "insights" | "api_configuration" | "settings" | "platform";

export type NotificationStatus = "unread" | "read" | "archived";
export type NotificationChannel = "in_app" | "email" | "push" | "sms";

export type NotificationRow = {
  id: string;
  user_id: string;
  organization_id: string | null;
  title: string;
  body: string | null;
  category: NotificationCategory | null;
  channel: NotificationChannel;
  status: NotificationStatus;
  action_url: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export function useNotifications(filter: {
  status?: NotificationStatus | "all" | "active";
  category?: NotificationCategory | "all";
} = {}) {
  return useQuery({
    queryKey: ["notifications", filter],
    queryFn: async (): Promise<NotificationRow[]> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      let q = supabase
        .from("notifications")
        .select("*")
        .eq("user_id", u.user.id)
        .order("created_at", { ascending: false })
        .limit(500);
      if (filter.status === "active") q = q.neq("status", "archived");
      else if (filter.status && filter.status !== "all") q = q.eq("status", filter.status);
      if (filter.category && filter.category !== "all") q = q.eq("category", filter.category);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as NotificationRow[];
    },
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: async (): Promise<number> => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return 0;
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", u.user.id)
        .eq("status", "unread");
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ status: "read", read_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { error } = await supabase
        .from("notifications")
        .update({ status: "read", read_at: new Date().toISOString() })
        .eq("user_id", u.user.id)
        .eq("status", "unread");
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useArchiveNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ status: "archived" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useUnarchiveNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ status: "read" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useDeleteNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sbAny(supabase).from("notifications").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useCreateNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      body?: string;
      category?: NotificationCategory;
      action_url?: string;
      data?: Record<string, unknown>;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not authenticated");
      const { error } = await sbAny(supabase).from("notifications").insert({
        user_id: u.user.id,
        title: input.title,
        body: input.body ?? null,
        category: input.category ?? "info",
        channel: "in_app",
        status: "unread",
        action_url: input.action_url ?? null,
        data: (input.data ?? {}) as never,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

/** Subscribe to realtime notification changes for the current user. */
export function useNotificationsRealtime(onEvent?: (row: NotificationRow) => void) {
  const qc = useQueryClient();
  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || cancelled) return;
      channel = supabase
        .channel(`notifications:${u.user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${u.user.id}`,
          },
          (payload) => {
            qc.invalidateQueries({ queryKey: ["notifications"] });
            if (onEvent && payload.eventType === "INSERT") {
              onEvent(payload.new as unknown as NotificationRow);
            }
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
