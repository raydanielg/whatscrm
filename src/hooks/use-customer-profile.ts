import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchContactAttachments,
  fetchContactConversationIds,
} from "@/lib/crm/contact-attachments";
import { sbAny } from "@/lib/supabase/untyped";
import { useCurrentWorkspace } from "@/hooks/use-workspace";
import { invalidateContactCaches } from "@/lib/crm/contact-identity";

export type CustomerProfile = {
  id: string;
  workspace_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  name: string | null;
  avatar_url: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  job_title: string | null;
  department: string | null;
  timezone: string | null;
  locale: string | null;
  status: string;
  customer_status: string | null;
  lead_status: string | null;
  lifecycle_stage: string;
  customer_lifetime_value: number | null;
  customer_health_score: number | null;
  tags: string[];
  last_seen_at: string | null;
  address: Record<string, unknown> | null;
  do_not_contact: boolean;
  created_at: string;
  updated_at: string;
  owner_id: string | null;
  assigned_agent_id: string | null;
  company_id: string | null;
  company?: {
    id: string;
    name: string | null;
    logo_url?: string | null;
    website?: string | null;
    industry?: string | null;
  } | null;
  owner?: { id: string; display_name: string | null; avatar_url: string | null } | null;
  agent?: { id: string; display_name: string | null; avatar_url: string | null } | null;
};

export type ConversationStats = {
  total: number;
  open: number;
  resolved: number;
  last_message_at: string | null;
  avg_response_seconds: number | null;
};

export function useCustomerProfile(contactId: string | undefined) {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["customer-profile", contactId],
    enabled: !!contactId && !!workspaceId,
    queryFn: async (): Promise<CustomerProfile | null> => {
      const { data, error } = await supabase
        .from("contacts")
        .select(
          `id, workspace_id, first_name, last_name, display_name, name, avatar_url,
           email, phone, whatsapp, job_title, department, timezone, locale, status,
           customer_status, lead_status, lifecycle_stage, customer_lifetime_value,
           customer_health_score, tags, last_seen_at, address, do_not_contact,
           created_at, updated_at, owner_id, assigned_agent_id, company_id,
           company:companies!contacts_company_id_fkey(id, name, logo_url, website, industry)`,
        )
        .eq("id", contactId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const profileIds = Array.from(
        new Set(
          [data.owner_id, data.assigned_agent_id].filter(
            (v): v is string => typeof v === "string" && v.length > 0,
          ),
        ),
      );
      let profilesById: Record<
        string,
        { id: string; display_name: string | null; avatar_url: string | null }
      > = {};
      if (profileIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", profileIds);
        profilesById = Object.fromEntries((profs ?? []).map((p) => [p.id, p]));
      }
      return {
        ...(data as any),
        owner: data.owner_id ? (profilesById[data.owner_id] ?? null) : null,
        agent: data.assigned_agent_id ? (profilesById[data.assigned_agent_id] ?? null) : null,
      } as CustomerProfile;
    },

    // Cache resolved profile for 60s; keep in memory for 30m so header
    // renders instantly on re-open and re-navigation.
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    // Background refresh — silent refetch when the user returns / reconnects,
    // plus a slow poll so headers pick up server-side enrichment (e.g. name
    // resolution from CRM sync) even without a realtime event.
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
    placeholderData: (prev) => prev,
  });

  // Realtime updates for this contact
  useEffect(() => {
    if (!contactId) return;
    const channel = supabase
      .channel(`contact:${contactId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "contacts",
          filter: `id=eq.${contactId}`,
        },
        () => invalidateContactCaches(qc, contactId),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [contactId, qc]);

  return q;
}

export function useConversationStats(contactId: string | undefined) {
  const { active } = useCurrentWorkspace();
  const workspaceId = active?.id;
  return useQuery({
    queryKey: ["conversation-stats", contactId],
    enabled: !!contactId && !!workspaceId,
    queryFn: async (): Promise<ConversationStats> => {
      const base = () =>
        supabase
          .from("conversations")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId!)
          .eq("contact_id", contactId!)
          .is("deleted_at", null);
      const [total, open, resolved, latest] = await Promise.all([
        base(),
        base().eq("status", "open"),
        base().eq("status", "resolved"),
        supabase
          .from("conversations")
          .select("last_message_at, first_response_at, created_at")
          .eq("workspace_id", workspaceId!)
          .eq("contact_id", contactId!)
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle(),
      ]);
      return {
        total: total.count ?? 0,
        open: open.count ?? 0,
        resolved: resolved.count ?? 0,
        last_message_at: latest.data?.last_message_at ?? null,
        avg_response_seconds: null,
      };
    },
  });
}

export function useContactDeals(contactId: string | undefined) {
  const { active } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["contact-deals", contactId],
    enabled: !!contactId && !!active?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deals")
        .select("id, title, amount, currency, status, stage_id, expected_close_date, created_at")
        .eq("workspace_id", active!.id)
        .eq("contact_id", contactId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type ContactOpenTask =
  | {
      kind: "crm";
      id: string;
      title: string;
      due_at: string | null;
      priority: string | null;
      status: string;
    }
  | {
      kind: "project";
      id: string;
      title: string;
      due_date: string | null;
      priority: string | null;
      status: string;
      projectId: string;
      projectName: string;
    };

export function useContactOpenTasks(contactId: string | undefined) {
  const { active } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["contact-tasks", contactId],
    enabled: !!contactId && !!active?.id,
    queryFn: async (): Promise<ContactOpenTask[]> => {
      // Tasks created from the inbox hang off the conversation, not the
      // contact, so the profile must include the contact's conversations too
      // (the conversation list already counts those).
      const convIds = await fetchContactConversationIds(active!.id, contactId!);
      const scope = [`and(entity_type.eq.contact,entity_id.eq.${contactId})`];
      if (convIds.length) {
        scope.push(`and(entity_type.eq.conversation,entity_id.in.(${convIds.join(",")}))`);
      }
      const pmScope = [`contact_id.eq.${contactId}`];
      if (convIds.length) {
        pmScope.push(`conversation_id.in.(${convIds.join(",")})`);
      }

      const [crmRes, pmRes] = await Promise.all([
        sbAny(supabase)
          .from("tasks")
          .select("id, title, due_at, priority, status, assigned_to")
          .eq("workspace_id", active!.id)
          .or(scope.join(","))
          .in("status", ["open", "in_progress"])
          .is("deleted_at", null)
          .order("due_at", { ascending: true, nullsFirst: false })
          .limit(10),
        sbAny(supabase)
          .from("pm_tasks")
          .select("id, title, due_date, priority, status, project_id")
          .eq("workspace_id", active!.id)
          .or(pmScope.join(","))
          .in("status", ["backlog", "todo", "in_progress", "review"])
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(10),
      ]);
      if (crmRes.error) throw crmRes.error;
      if (pmRes.error) throw pmRes.error;

      const pmRows = (pmRes.data ?? []) as {
        id: string;
        title: string;
        due_date: string | null;
        priority: string | null;
        status: string;
        project_id: string;
      }[];
      const projectIds = [...new Set(pmRows.map((t) => t.project_id))];
      const projectNameById = new Map<string, string>();
      if (projectIds.length) {
        const { data: projectRows, error: projectErr } = await sbAny(supabase)
          .from("pm_projects")
          .select("id, name")
          .in("id", projectIds);
        if (projectErr) throw projectErr;
        for (const p of (projectRows ?? []) as { id: string; name: string }[]) {
          projectNameById.set(p.id, p.name);
        }
      }

      const crmTasks: ContactOpenTask[] = (crmRes.data ?? []).map(
        (t: {
          id: string;
          title: string;
          due_at: string | null;
          priority: string | null;
          status: string;
        }) => ({
          kind: "crm" as const,
          id: t.id,
          title: t.title,
          due_at: t.due_at,
          priority: t.priority,
          status: t.status,
        }),
      );
      const projectTasks: ContactOpenTask[] = pmRows.map((t) => ({
        kind: "project" as const,
        id: t.id,
        title: t.title,
        due_date: t.due_date,
        priority: t.priority,
        status: t.status,
        projectId: t.project_id,
        projectName: projectNameById.get(t.project_id) ?? "Project",
      }));

      const dueOf = (t: ContactOpenTask) => (t.kind === "crm" ? t.due_at : t.due_date);
      return [...crmTasks, ...projectTasks]
        .sort((a, b) => {
          const ad = dueOf(a);
          const bd = dueOf(b);
          if (!ad && !bd) return 0;
          if (!ad) return 1;
          if (!bd) return -1;
          return ad < bd ? -1 : 1;
        })
        .slice(0, 10);
    },
  });
}

export type ContactProfileNote = {
  id: string;
  body: string;
  is_pinned: boolean;
  created_at: string;
  /** "contact" = CRM note on the contact; "conversation" = internal note from a chat. */
  source: "contact" | "conversation";
};

export function useContactNotes(contactId: string | undefined) {
  const { active } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["contact-notes", contactId],
    enabled: !!contactId && !!active?.id,
    queryFn: async (): Promise<ContactProfileNote[]> => {
      const LIMIT = 20;
      const { data, error } = await supabase
        .from("notes")
        .select("id, body, is_pinned, author_id, created_at, updated_at")
        .eq("workspace_id", active!.id)
        .eq("entity_type", "contact")
        .eq("entity_id", contactId!)
        .is("deleted_at", null)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(LIMIT);
      if (error) throw error;
      const contactNotes: ContactProfileNote[] = (data ?? []).map((n) => ({
        id: n.id,
        body: n.body,
        is_pinned: !!n.is_pinned,
        created_at: n.created_at,
        source: "contact",
      }));

      // Internal notes written inside the contact's conversations: the inbox
      // collaboration panel (conversation_notes) and internal-note messages.
      const convIds = await fetchContactConversationIds(active!.id, contactId!);
      const chatNotes: ContactProfileNote[] = [];
      if (convIds.length) {
        const [convNotes, internalMsgs] = await Promise.all([
          sbAny(supabase)
            .from("conversation_notes")
            .select("id, body, created_at")
            .eq("workspace_id", active!.id)
            .in("conversation_id", convIds)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(LIMIT),
          supabase
            .from("messages")
            .select("id, body, created_at")
            .eq("workspace_id", active!.id)
            .in("conversation_id", convIds)
            .eq("is_internal", true)
            .not("body", "is", null)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(LIMIT),
        ]);
        if (convNotes.error) throw convNotes.error;
        if (internalMsgs.error) throw internalMsgs.error;
        for (const n of (convNotes.data ?? []) as Array<{
          id: string;
          body: string | null;
          created_at: string;
        }>) {
          if (!n.body) continue;
          chatNotes.push({
            id: `cn:${n.id}`,
            body: n.body,
            is_pinned: false,
            created_at: n.created_at,
            source: "conversation",
          });
        }
        for (const m of internalMsgs.data ?? []) {
          if (!m.body) continue;
          chatNotes.push({
            id: `msg:${m.id}`,
            body: m.body,
            is_pinned: false,
            created_at: m.created_at,
            source: "conversation",
          });
        }
      }

      // Pinned contact notes first, then everything newest first.
      const pinned = contactNotes.filter((n) => n.is_pinned);
      const rest = [...contactNotes.filter((n) => !n.is_pinned), ...chatNotes].sort((a, b) =>
        a.created_at < b.created_at ? 1 : -1,
      );
      return [...pinned, ...rest].slice(0, LIMIT);
    },
  });
}

export function useContactAttachments(contactId: string | undefined) {
  const { active } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["contact-attachments", active?.id, contactId],
    enabled: !!contactId && !!active?.id,
    queryFn: () => fetchContactAttachments(active!.id, contactId!, 20),
  });
}

export function useContactCampaigns(contactId: string | undefined) {
  const { active } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["contact-campaigns", contactId],
    enabled: !!contactId && !!active?.id,
    queryFn: async () => {
      // Only campaigns this contact actually received. Listing the workspace's
      // latest campaigns showed every customer the same unrelated history.
      const { data, error } = await (supabase.from("campaign_recipients") as any)
        .select("id, status, sent_at, created_at, campaign:campaigns!inner(id, name, workspace_id)")
        .eq("contact_id", contactId!)
        .eq("campaign.workspace_id", active!.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) return [];
      return ((data ?? []) as any[]).map((r) => ({
        id: r.id as string,
        name: (r.campaign?.name as string) ?? "Campaign",
        status: r.status as string,
        channel: null as string | null,
        sent_at: (r.sent_at as string | null) ?? null,
      }));
    },
  });
}

export function useContactActivity(contactId: string | undefined) {
  const { active } = useCurrentWorkspace();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["contact-activity", contactId],
    enabled: !!contactId && !!active?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("id, verb, summary, data, actor_id, created_at, object_type, target_type")
        .eq("workspace_id", active!.id)
        .or(
          `and(object_type.eq.contact,object_id.eq.${contactId}),and(target_type.eq.contact,target_id.eq.${contactId})`,
        )
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!contactId || !active?.id) return;
    const channel = supabase
      .channel(`contact-activity:${contactId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activities",
          filter: `workspace_id=eq.${active.id}`,
        },
        () => qc.invalidateQueries({ queryKey: ["contact-activity", contactId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [contactId, active?.id, qc]);

  return q;
}

export function customerDisplayName(c: CustomerProfile) {
  return (
    c.display_name ||
    [c.first_name, c.last_name].filter(Boolean).join(" ") ||
    c.name ||
    c.email ||
    c.phone ||
    "Unknown"
  );
}

export function customerLocation(c: CustomerProfile) {
  const addr = (c.address ?? {}) as Record<string, unknown>;
  const parts = [addr.city, addr.state, addr.country].filter(
    (p) => typeof p === "string" && p.length > 0,
  ) as string[];
  return parts.join(", ") || null;
}

export function useCustomerBundle(contactId: string | undefined) {
  const profile = useCustomerProfile(contactId);
  const stats = useConversationStats(contactId);
  const deals = useContactDeals(contactId);
  const tasks = useContactOpenTasks(contactId);
  const notes = useContactNotes(contactId);
  const attachments = useContactAttachments(contactId);
  const campaigns = useContactCampaigns(contactId);
  const activity = useContactActivity(contactId);

  return useMemo(
    () => ({ profile, stats, deals, tasks, notes, attachments, campaigns, activity }),
    [profile, stats, deals, tasks, notes, attachments, campaigns, activity],
  );
}
