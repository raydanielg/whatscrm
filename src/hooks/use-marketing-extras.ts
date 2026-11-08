import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentWorkspace } from "@/hooks/use-workspace";

/* eslint-disable @typescript-eslint/no-explicit-any */

/* ---------- Types ---------- */
export type ContactListRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  type: "static" | "dynamic";
  segment_id: string | null;
  color: string | null;
  icon: string | null;
  member_count: number;
  last_computed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignTemplateRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  category: string | null;
  channel: string;
  message_body: string | null;
  media_url: string | null;
  wa_template_id: string | null;
  variables: Record<string, unknown>;
  tags: string[];
  is_shared: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
};

export type CampaignAbVariantRow = {
  id: string;
  campaign_id: string;
  workspace_id: string;
  name: string;
  weight: number;
  message_body: string | null;
  media_url: string | null;
  template_id: string | null;
  template_variables: Record<string, unknown>;
  is_winner: boolean;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  replied_count: number;
  clicked_count: number;
  failed_count: number;
};

export type DispatchQueueStats = {
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  skipped: number;
  cancelled: number;
};

/* ---------- Contact Lists ---------- */

export function useContactLists() {
  const { active } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["contact-lists", active?.id],
    enabled: !!active?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("contact_lists")
        .select("*")
        .eq("workspace_id", active!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContactListRow[];
    },
  });
}

export function useUpsertContactList() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: Partial<ContactListRow> & { id?: string }) => {
      const payload = { ...input, workspace_id: input.workspace_id ?? active!.id };
      const { data, error } = await (supabase as any)
        .from("contact_lists")
        .upsert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as ContactListRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contact-lists"] }),
  });
}

/* ---------- Contact List Members ---------- */

export type ContactListMemberRow = {
  contact_id: string;
  added_at: string;
  contact: {
    id: string;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    avatar_url: string | null;
  } | null;
};

export function useContactListMembers(listId?: string) {
  return useQuery({
    queryKey: ["contact-list-members", listId],
    enabled: !!listId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("contact_list_members")
        .select(
          "contact_id, added_at, contact:contacts(id, display_name, first_name, last_name, email, phone, avatar_url)",
        )
        .eq("list_id", listId!)
        .is("contacts.deleted_at", null)
        .order("added_at", { ascending: false });
      if (error) throw error;
      // Archived (soft-deleted) contacts are excluded from lists and member_count
      return ((data ?? []) as ContactListMemberRow[]).filter((r) => r.contact);
    },
  });
}

export function useAddContactListMembers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ listId, contactIds }: { listId: string; contactIds: string[] }) => {
      if (!contactIds.length) return;
      const { data: auth } = await supabase.auth.getUser();
      const rows = contactIds.map((contact_id) => ({
        list_id: listId,
        contact_id,
        added_by: auth.user?.id ?? null,
      }));
      const { error } = await (supabase as any)
        .from("contact_list_members")
        .upsert(rows, { onConflict: "list_id,contact_id" });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["contact-list-members", vars.listId] });
      qc.invalidateQueries({ queryKey: ["contact-lists"] });
    },
  });
}

export function useRemoveContactListMembers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ listId, contactIds }: { listId: string; contactIds: string[] }) => {
      if (!contactIds.length) return;
      const { error } = await (supabase as any)
        .from("contact_list_members")
        .delete()
        .eq("list_id", listId)
        .in("contact_id", contactIds);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["contact-list-members", vars.listId] });
      qc.invalidateQueries({ queryKey: ["contact-lists"] });
    },
  });
}

export function useDeleteContactList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("contact_lists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contact-lists"] }),
  });
}

/* ---------- Campaign Templates ---------- */

export function useCampaignTemplates() {
  const { active } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["campaign-templates", active?.id],
    enabled: !!active?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("campaign_templates")
        .select("*")
        .eq("workspace_id", active!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CampaignTemplateRow[];
    },
  });
}

export function useUpsertCampaignTemplate() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  return useMutation({
    mutationFn: async (input: Partial<CampaignTemplateRow> & { id?: string }) => {
      const payload = { ...input, workspace_id: input.workspace_id ?? active!.id };
      const { data, error } = await (supabase as any)
        .from("campaign_templates")
        .upsert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as CampaignTemplateRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaign-templates"] }),
  });
}

export function useDeleteCampaignTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("campaign_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaign-templates"] }),
  });
}

/* ---------- A/B Variants ---------- */

export function useAbVariants(campaignId: string | undefined) {
  return useQuery({
    queryKey: ["ab-variants", campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("campaign_ab_variants")
        .select("*")
        .eq("campaign_id", campaignId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as CampaignAbVariantRow[];
    },
  });
}

export function useUpsertAbVariant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<CampaignAbVariantRow> & { id?: string }) => {
      const { data, error } = await (supabase as any)
        .from("campaign_ab_variants")
        .upsert(input)
        .select()
        .single();
      if (error) throw error;
      return data as CampaignAbVariantRow;
    },
    onSuccess: (v) => qc.invalidateQueries({ queryKey: ["ab-variants", v.campaign_id] }),
  });
}

export function useDeleteAbVariant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; campaignId: string }) => {
      const { error } = await (supabase as any).from("campaign_ab_variants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ["ab-variants", v.campaignId] }),
  });
}

/* ---------- Dispatch Queue Stats ---------- */

export function useDispatchStats(campaignId: string | undefined) {
  return useQuery({
    queryKey: ["dispatch-stats", campaignId],
    enabled: !!campaignId,
    refetchInterval: 5000,
    queryFn: async (): Promise<DispatchQueueStats> => {
      const statuses = ["pending", "processing", "sent", "failed", "skipped", "cancelled"] as const;
      const out: DispatchQueueStats = {
        pending: 0,
        processing: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        cancelled: 0,
      };
      await Promise.all(
        statuses.map(async (s) => {
          const { count, error } = await (supabase as any)
            .from("campaign_dispatch_queue")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", campaignId!)
            .eq("status", s);
          if (error) throw error;
          out[s] = count ?? 0;
        }),
      );
      return out;
    },
  });
}

/* ---------- Marketing dashboard KPIs ---------- */

export function useMarketingDashboard() {
  const { active } = useCurrentWorkspace();
  return useQuery({
    queryKey: ["marketing-dashboard", active?.id],
    enabled: !!active?.id,
    queryFn: async () => {
      const [campaignsRes, segmentsRes, listsRes, templatesRes, consentRes, dripRes] =
        await Promise.all([
          (supabase as any)
            .from("campaigns")
            .select("id,status,total_recipients,sent_count,delivered_count,read_count,replied_count,failed_count,created_at")
            .eq("workspace_id", active!.id)
            .order("created_at", { ascending: false })
            .limit(500),
          (supabase as any)
            .from("customer_segments")
            .select("id,member_count")
            .eq("workspace_id", active!.id),
          (supabase as any)
            .from("contact_lists")
            .select("id,member_count")
            .eq("workspace_id", active!.id),
          (supabase as any)
            .from("campaign_templates")
            .select("id")
            .eq("workspace_id", active!.id),
          (supabase as any)
            .from("consent_records")
            .select("status")
            .eq("workspace_id", active!.id),
          (supabase as any)
            .from("drip_sequences")
            .select("id,status,enrolled_count,completed_count")
            .eq("workspace_id", active!.id),
        ]);

      const campaigns = (campaignsRes.data ?? []) as any[];
      const sent = campaigns.reduce((s, c) => s + Number(c.sent_count ?? 0), 0);
      const delivered = campaigns.reduce((s, c) => s + Number(c.delivered_count ?? 0), 0);
      const read = campaigns.reduce((s, c) => s + Number(c.read_count ?? 0), 0);
      const replied = campaigns.reduce((s, c) => s + Number(c.replied_count ?? 0), 0);
      const failed = campaigns.reduce((s, c) => s + Number(c.failed_count ?? 0), 0);

      const consent = (consentRes.data ?? []) as any[];
      const optedIn = consent.filter((r) => r.status === "opted_in").length;
      const optedOut = consent.filter((r) => r.status === "opted_out" || r.status === "unsubscribed").length;

      return {
        campaigns,
        counts: {
          campaigns: campaigns.length,
          running: campaigns.filter((c) => c.status === "running").length,
          scheduled: campaigns.filter((c) => c.status === "scheduled").length,
          segments: (segmentsRes.data ?? []).length,
          lists: (listsRes.data ?? []).length,
          templates: (templatesRes.data ?? []).length,
          drips: (dripRes.data ?? []).length,
          activeDrips: ((dripRes.data ?? []) as any[]).filter((d) => d.status === "active").length,
          optedIn,
          optedOut,
        },
        totals: {
          sent,
          delivered,
          read,
          replied,
          failed,
          deliveryRate: sent ? delivered / sent : 0,
          readRate: delivered ? read / delivered : 0,
          replyRate: delivered ? replied / delivered : 0,
        },
      };
    },
  });
}

/* ---------- Realtime for extras ---------- */

export function useMarketingExtrasRealtime() {
  const qc = useQueryClient();
  const { active } = useCurrentWorkspace();
  useEffect(() => {
    if (!active?.id) return;
    const ch = supabase
      .channel(`marketing-extras-${active.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "contact_lists" }, () =>
        qc.invalidateQueries({ queryKey: ["contact-lists"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "contact_list_members" },
        (payload) => {
          const listId =
            (payload.new as { list_id?: string } | null)?.list_id ??
            (payload.old as { list_id?: string } | null)?.list_id;
          qc.invalidateQueries({ queryKey: ["contact-lists"] });
          qc.invalidateQueries({
            queryKey: listId ? ["contact-list-members", listId] : ["contact-list-members"],
          });
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_templates" }, () =>
        qc.invalidateQueries({ queryKey: ["campaign-templates"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_ab_variants" }, () =>
        qc.invalidateQueries({ queryKey: ["ab-variants"] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "campaign_dispatch_queue" },
        () => qc.invalidateQueries({ queryKey: ["dispatch-stats"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [active?.id, qc]);
}
