import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { sbAny } from "@/lib/supabase/untyped";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type DripPreset =
  | "welcome"
  | "followup"
  | "abandoned"
  | "promotional"
  | "birthday"
  | "anniversary";

export const DRIP_PRESETS: Array<{
  id: DripPreset;
  label: string;
  description: string;
  triggerType: string;
  steps: Array<{ delayHours: number; message: string; name: string }>;
}> = [
  {
    id: "welcome",
    label: "Welcome Series",
    description: "Greet new contacts across 3 touch points during their first week.",
    triggerType: "contact_created",
    steps: [
      { delayHours: 0, name: "Welcome", message: "👋 Welcome {{first_name}}! Thanks for joining us." },
      { delayHours: 24, name: "Get Started", message: "Here's how to get the most out of your account." },
      { delayHours: 96, name: "Check-in", message: "How is it going? Reply if you need any help." },
    ],
  },
  {
    id: "followup",
    label: "Follow-up Series",
    description: "Automated nudges after a conversation goes quiet.",
    triggerType: "no_reply",
    steps: [
      { delayHours: 24, name: "First follow-up", message: "Hi {{first_name}}, just checking in on our last chat." },
      { delayHours: 72, name: "Second follow-up", message: "Wanted to make sure this didn't get lost — let me know if you have questions." },
      { delayHours: 168, name: "Last touch", message: "Closing this out for now — reach out anytime." },
    ],
  },
  {
    id: "abandoned",
    label: "Abandoned Lead Series",
    description: "Re-engage leads that never converted.",
    triggerType: "lead_stalled",
    steps: [
      { delayHours: 48, name: "Reminder", message: "Still interested? Happy to answer any questions." },
      { delayHours: 168, name: "Offer", message: "Here's 10% off if you'd like to pick things back up." },
      { delayHours: 336, name: "Final", message: "Last chance — the offer expires soon." },
    ],
  },
  {
    id: "promotional",
    label: "Promotional Series",
    description: "Launch a multi-day promo cadence to a segment.",
    triggerType: "manual",
    steps: [
      { delayHours: 0, name: "Announcement", message: "🎉 Big news — our new offer is live!" },
      { delayHours: 48, name: "Reminder", message: "Don't miss out — the promo ends soon." },
      { delayHours: 120, name: "Last call", message: "Final hours to grab the deal." },
    ],
  },
  {
    id: "birthday",
    label: "Birthday Messages",
    description: "Automatically wish contacts on their birthday.",
    triggerType: "birthday",
    steps: [
      { delayHours: 0, name: "Birthday wish", message: "🎂 Happy birthday {{first_name}}! Enjoy your day." },
    ],
  },
  {
    id: "anniversary",
    label: "Anniversary Messages",
    description: "Celebrate customer anniversaries every year.",
    triggerType: "anniversary",
    steps: [
      { delayHours: 0, name: "Anniversary wish", message: "🎊 It's been another great year with you, {{first_name}}!" },
    ],
  },
];

/* -------- Queries -------- */

export function useScheduledCampaigns() {
  const { data: ws } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["scheduled-campaigns", ws?.id],
    enabled: !!ws?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .eq("workspace_id", ws!.id)
        .in("status", ["scheduled", "running", "paused"])
        .order("scheduled_at", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRecurringCampaigns() {
  const { data: ws } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["recurring-campaigns", ws?.id],
    enabled: !!ws?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .eq("workspace_id", ws!.id)
        .eq("is_recurring", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useQueueHealth() {
  const { data: ws } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["queue-health", ws?.id],
    enabled: !!ws?.id,
    refetchInterval: 15_000,
    queryFn: async () => {
      const statuses = ["pending", "processing", "sent", "failed", "skipped"] as const;
      const results = await Promise.all(
        statuses.map(async (s) => {
          const { count } = await supabase
            .from("campaign_dispatch_queue")
            .select("id", { count: "exact", head: true })
            .eq("workspace_id", ws!.id)
            .eq("status", s);
          return [s, count ?? 0] as const;
        }),
      );
      const map = Object.fromEntries(results) as Record<(typeof statuses)[number], number>;
      const oldestPending = await supabase
        .from("campaign_dispatch_queue")
        .select("run_at")
        .eq("workspace_id", ws!.id)
        .eq("status", "pending")
        .order("run_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return { ...map, oldestPending: oldestPending.data?.run_at ?? null };
    },
  });
}

export function useSchedulingRealtime() {
  const qc = useQueryClient();
  const { data: ws } = useCurrentWorkspace();
  useEffect(() => {
    if (!ws?.id) return;
    const ch = supabase
      .channel(`sched-${ws.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "campaigns", filter: `workspace_id=eq.${ws.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["scheduled-campaigns", ws.id] });
          qc.invalidateQueries({ queryKey: ["recurring-campaigns", ws.id] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "campaign_dispatch_queue", filter: `workspace_id=eq.${ws.id}` },
        () => qc.invalidateQueries({ queryKey: ["queue-health", ws.id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc, ws?.id]);
}

/* -------- Mutations -------- */

export type ScheduleInput = {
  campaignId: string;
  scheduledAt: string; // ISO
  timezone: string;
  sendWindow?: {
    startHour: number;
    endHour: number;
    days: number[]; // 0=Sun..6=Sat
    respect: boolean;
  } | null;
  throttlePerMinute?: number;
  isRecurring?: boolean;
  recurrenceRule?: {
    freq: "DAILY" | "WEEKLY" | "MONTHLY";
    interval: number;
    endDate?: string | null;
  } | null;
};

export function useScheduleCampaign() {
  const qc = useQueryClient();
  const { data: ws } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: ScheduleInput) => {
      const { data, error } = await supabase
        .from("campaigns")
        .update({
          status: "scheduled",
          scheduled_at: input.scheduledAt,
          timezone: input.timezone,
          send_window: input.sendWindow ?? null,
          throttle_per_minute: input.throttlePerMinute ?? 60,
          is_recurring: !!input.isRecurring,
          recurrence_rule: input.recurrenceRule ?? null,
        })
        .eq("id", input.campaignId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduled-campaigns", ws?.id] });
      qc.invalidateQueries({ queryKey: ["recurring-campaigns", ws?.id] });
      qc.invalidateQueries({ queryKey: ["campaigns", ws?.id] });
    },
  });
}

export function useCampaignAction() {
  const qc = useQueryClient();
  const { data: ws } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async ({
      campaignId,
      action,
    }: {
      campaignId: string;
      action: "pause" | "resume" | "cancel";
    }) => {
      const nextStatus =
        action === "pause" ? "paused" : action === "resume" ? "scheduled" : "draft";
      const { error } = await supabase
        .from("campaigns")
        .update({ status: nextStatus })
        .eq("id", campaignId);
      if (error) throw error;
      if (action === "cancel") {
        await supabase
          .from("campaign_dispatch_queue")
          .update({ status: "skipped", processed_at: new Date().toISOString() })
          .eq("campaign_id", campaignId)
          .eq("status", "pending");
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scheduled-campaigns", ws?.id] });
      qc.invalidateQueries({ queryKey: ["queue-health", ws?.id] });
    },
  });
}

export function useCreateDripFromPreset() {
  const qc = useQueryClient();
  const { data: ws } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async ({ preset, name }: { preset: DripPreset; name?: string }) => {
      const cfg = DRIP_PRESETS.find((p) => p.id === preset);
      if (!cfg || !ws?.id) throw new Error("Invalid preset");
      const { data: seq, error } = await supabase
        .from("drip_sequences")
        .insert({
          workspace_id: ws.id,
          name: name ?? cfg.label,
          description: cfg.description,
          status: "draft",
          trigger_type: cfg.triggerType,
          trigger_config: {},
          respect_opt_out: true,
        })
        .select()
        .single();
      if (error) throw error;
      const stepsPayload = cfg.steps.map((s, i) => ({
        sequence_id: seq.id,
        step_order: i + 1,
        step_type: "message",
        name: s.name,
        delay_seconds: s.delayHours * 3600,
        message_body: s.message,
      }));
      const { error: stepsErr } = await sbAny(supabase).from("drip_steps").insert(stepsPayload);
      if (stepsErr) throw stepsErr;
      return seq;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drip-sequences", ws?.id] });
    },
  });
}

export function useAllCampaigns() {
  const { data: ws } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["all-campaigns-brief", ws?.id],
    enabled: !!ws?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name, status, scheduled_at, is_recurring")
        .eq("workspace_id", ws!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
