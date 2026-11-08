import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { useAuth } from "@/hooks/use-auth";
import { sanitizeSearchTerm } from "@/lib/api/postgrest-filters";
import { sbAny } from "@/lib/supabase/untyped";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;

export type ActivityType =
  | "call" | "meeting" | "task" | "email" | "whatsapp" | "note" | "demo" | "follow_up";
export type ActivityStatus =
  | "planned" | "in_progress" | "completed" | "cancelled" | "no_show" | "overdue";
export type ActivityPriority = "low" | "normal" | "high" | "urgent";
export type EntityType = "contact" | "company" | "lead" | "deal" | "customer";
export type CalendarProvider = "google" | "outlook" | "ical" | "apple";

export type RecurrenceRule = {
  freq: "daily" | "weekly" | "monthly" | "yearly";
  interval?: number;
  count?: number;
  until?: string | null;
  byweekday?: number[];
};

export type SalesActivity = {
  id: string;
  workspace_id: string;
  organization_id: string | null;
  type: ActivityType;
  title: string;
  description: string | null;
  location: string | null;
  meeting_url: string | null;
  start_at: string | null;
  end_at: string | null;
  all_day: boolean;
  duration_minutes: number | null;
  status: ActivityStatus;
  priority: ActivityPriority;
  outcome: string | null;
  notes: string | null;
  entity_type: EntityType | null;
  entity_id: string | null;
  owner_id: string | null;
  assigned_to: string | null;
  created_by: string | null;
  participants: string[];
  reminder_at: string | null;
  reminder_sent: boolean;
  recurrence: RecurrenceRule | null;
  parent_activity_id: string | null;
  external_provider: CalendarProvider | null;
  external_calendar_id: string | null;
  external_event_id: string | null;
  external_synced_at: string | null;
  tags: string[];
  custom_fields: Record<string, unknown>;
  completed_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ActivityFilters = {
  types?: ActivityType[];
  statuses?: ActivityStatus[];
  assignee?: string | "me" | "all";
  entityType?: EntityType;
  entityId?: string;
  from?: string;
  to?: string;
  search?: string;
};

export const ACTIVITY_TYPE_META: Record<ActivityType, { label: string; icon: string; tone: string }> = {
  call:      { label: "Call",      icon: "phone",       tone: "bg-blue-500/15 text-blue-600 dark:text-blue-300" },
  meeting:   { label: "Meeting",   icon: "users",       tone: "bg-purple-500/15 text-purple-600 dark:text-purple-300" },
  task:      { label: "Task",      icon: "check-square",tone: "bg-amber-500/15 text-amber-600 dark:text-amber-300" },
  email:     { label: "Email",     icon: "mail",        tone: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-300" },
  whatsapp:  { label: "WhatsApp",  icon: "message-circle",tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" },
  note:      { label: "Note",      icon: "sticky-note", tone: "bg-slate-500/15 text-slate-600 dark:text-slate-300" },
  demo:      { label: "Demo",      icon: "monitor",     tone: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300" },
  follow_up: { label: "Follow-up", icon: "corner-up-right", tone: "bg-orange-500/15 text-orange-600 dark:text-orange-300" },
};

export const ACTIVITY_STATUS_META: Record<ActivityStatus, { label: string; tone: string }> = {
  planned:     { label: "Planned",     tone: "bg-muted text-muted-foreground" },
  in_progress: { label: "In progress", tone: "bg-blue-500/15 text-blue-600 dark:text-blue-300" },
  completed:   { label: "Completed",   tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" },
  cancelled:   { label: "Cancelled",   tone: "bg-muted text-muted-foreground line-through" },
  no_show:     { label: "No show",     tone: "bg-red-500/15 text-red-600 dark:text-red-300" },
  overdue:     { label: "Overdue",     tone: "bg-red-500/15 text-red-600 dark:text-red-300" },
};

export function useSalesActivities(filters: ActivityFilters = {}) {
  const { active } = useCurrentWorkspace();
  const { user } = useAuth();
  const wsId = active?.id;
  return useQuery({
    queryKey: ["sales_activities", wsId, filters],
    enabled: !!wsId,
    queryFn: async (): Promise<SalesActivity[]> => {
      let q = sbAny(db).from("sales_activities").select("*").eq("workspace_id", wsId).is("deleted_at", null);
      if (filters.types?.length) q = q.in("type", filters.types);
      if (filters.statuses?.length) q = q.in("status", filters.statuses);
      if (filters.assignee === "me" && user?.id) q = q.eq("assigned_to", user.id);
      else if (filters.assignee && filters.assignee !== "all") q = q.eq("assigned_to", filters.assignee);
      if (filters.entityType) q = q.eq("entity_type", filters.entityType);
      if (filters.entityId) q = q.eq("entity_id", filters.entityId);
      if (filters.from) q = q.gte("start_at", filters.from);
      if (filters.to) q = q.lte("start_at", filters.to);
      if (filters.search) q = q.ilike("title", `%${sanitizeSearchTerm(filters.search)}%`);
      const { data, error } = await q.order("start_at", { ascending: true, nullsFirst: false }).limit(1000);
      if (error) throw error;
      return (data ?? []) as SalesActivity[];
    },
  });
}

export function useSalesActivity(id: string | undefined) {
  return useQuery({
    queryKey: ["sales_activity", id],
    enabled: !!id,
    queryFn: async (): Promise<SalesActivity | null> => {
      const { data, error } = await sbAny(db).from("sales_activities").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data ?? null) as SalesActivity | null;
    },
  });
}

export function useRealtimeActivities() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  const wsId = active?.id;
  useEffect(() => {
    if (!wsId) return;
    const channel = supabase
      .channel(`sales_activities:${wsId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "sales_activities", filter: `workspace_id=eq.${wsId}` }, () => {
        qc.invalidateQueries({ queryKey: ["sales_activities"] });
        qc.invalidateQueries({ queryKey: ["sales_activity"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [wsId, qc]);
}

export function useCreateActivity() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<SalesActivity>) => {
      if (!active?.id || !user?.id) throw new Error("No workspace");
      const payload = {
        workspace_id: active.id,
        organization_id: active.organization_id,
        type: input.type ?? "task",
        title: input.title ?? "Untitled activity",
        description: input.description ?? null,
        location: input.location ?? null,
        meeting_url: input.meeting_url ?? null,
        start_at: input.start_at ?? null,
        end_at: input.end_at ?? null,
        all_day: input.all_day ?? false,
        duration_minutes: input.duration_minutes ?? null,
        status: input.status ?? "planned",
        priority: input.priority ?? "normal",
        outcome: input.outcome ?? null,
        notes: input.notes ?? null,
        entity_type: input.entity_type ?? null,
        entity_id: input.entity_id ?? null,
        owner_id: input.owner_id ?? user.id,
        assigned_to: input.assigned_to ?? user.id,
        created_by: user.id,
        participants: input.participants ?? [],
        reminder_at: input.reminder_at ?? null,
        recurrence: input.recurrence ?? null,
        tags: input.tags ?? [],
        custom_fields: input.custom_fields ?? {},
      };
      const { data, error } = await sbAny(db).from("sales_activities").insert(payload).select().single();
      if (error) throw error;
      return data as SalesActivity;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sales_activities"] }),
  });
}

export function useUpdateActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<SalesActivity> }) => {
      const { data, error } = await sbAny(db).from("sales_activities").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data as SalesActivity;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["sales_activities"] });
      qc.invalidateQueries({ queryKey: ["sales_activity", vars.id] });
    },
  });
}

export function useCompleteActivity() {
  const update = useUpdateActivity();
  return (id: string, outcome?: string) =>
    update.mutateAsync({ id, patch: { status: "completed", completed_at: new Date().toISOString(), outcome: outcome ?? null } });
}

export function useDeleteActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sbAny(db).from("sales_activities").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sales_activities"] }),
  });
}

// ---------- Recurrence expansion (client-side, within visible range) ----------

export function expandRecurring(activities: SalesActivity[], rangeStart: Date, rangeEnd: Date): SalesActivity[] {
  const result: SalesActivity[] = [];
  for (const a of activities) {
    if (!a.recurrence || !a.start_at) { result.push(a); continue; }
    const startMs = new Date(a.start_at).getTime();
    const endMs = a.end_at ? new Date(a.end_at).getTime() : startMs;
    const durMs = endMs - startMs;
    const rule = a.recurrence;
    const interval = rule.interval ?? 1;
    const untilMs = rule.until ? new Date(rule.until).getTime() : rangeEnd.getTime();
    const stopMs = Math.min(untilMs, rangeEnd.getTime());
    let occ = 0;
    const maxOcc = rule.count ?? 500;
    const stepMs = (() => {
      switch (rule.freq) {
        case "daily":   return interval * 86400000;
        case "weekly":  return interval * 7 * 86400000;
        case "monthly": return interval * 30 * 86400000;
        case "yearly":  return interval * 365 * 86400000;
      }
    })();
    let cur = startMs;
    while (cur <= stopMs && occ < maxOcc) {
      if (cur >= rangeStart.getTime() - durMs) {
        result.push({
          ...a,
          id: `${a.id}::${cur}`,
          start_at: new Date(cur).toISOString(),
          end_at: new Date(cur + durMs).toISOString(),
          parent_activity_id: a.id,
        });
      }
      cur += stepMs;
      occ++;
    }
  }
  return result;
}

// ---------- Calendar accounts ----------

export type CalendarAccount = {
  id: string;
  workspace_id: string;
  user_id: string;
  provider: CalendarProvider;
  account_email: string;
  display_name: string | null;
  calendar_id: string | null;
  sync_direction: "none" | "pull" | "push" | "both";
  sync_token: string | null;
  last_synced_at: string | null;
  is_primary: boolean;
  enabled: boolean;
  color: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export function useCalendarAccounts() {
  const { active } = useCurrentWorkspace();
  const { user } = useAuth();
  return useQuery({
    queryKey: ["calendar_accounts", active?.id, user?.id],
    enabled: !!active?.id && !!user?.id,
    queryFn: async (): Promise<CalendarAccount[]> => {
      const { data, error } = await sbAny(db).from("calendar_accounts")
        .select("*").eq("workspace_id", active!.id).eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CalendarAccount[];
    },
  });
}

export function useConnectCalendarAccount() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<CalendarAccount>) => {
      if (!active?.id || !user?.id) throw new Error("No workspace");
      const payload = {
        workspace_id: active.id,
        user_id: user.id,
        provider: input.provider ?? "google",
        account_email: input.account_email ?? "",
        display_name: input.display_name ?? null,
        calendar_id: input.calendar_id ?? null,
        sync_direction: input.sync_direction ?? "both",
        is_primary: input.is_primary ?? false,
        enabled: input.enabled ?? true,
        color: input.color ?? null,
      };
      const { data, error } = await sbAny(db).from("calendar_accounts").insert(payload).select().single();
      if (error) throw error;
      return data as CalendarAccount;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calendar_accounts"] }),
  });
}

export function useUpdateCalendarAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<CalendarAccount> }) => {
      const { data, error } = await sbAny(db).from("calendar_accounts").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data as CalendarAccount;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calendar_accounts"] }),
  });
}

export function useDisconnectCalendarAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sbAny(db).from("calendar_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calendar_accounts"] }),
  });
}
